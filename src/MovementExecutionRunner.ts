import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { performance } from 'perf_hooks'
import { Path } from './mineflayer-specific/algs'
import * as goals from './mineflayer-specific/goals'
import { Move } from './mineflayer-specific/move'
import { AbortError, CancelError, ManualResetError, ResetError } from './mineflayer-specific/exceptions'
import type {
  BuildableMoveProvider,
  ExecutorMap,
  MovementExecutor,
} from './mineflayer-specific/movements'
import type { OptimizationMap } from './mineflayer-specific/post'
import { Optimizer } from './mineflayer-specific/post'
import { World } from './mineflayer-specific/world/worldInterface'
import type { ResetReason } from './types'

const debug = require('debug')
const log = debug('minecraft-pathfinding:executionRunner')

const EMPTY_VEC = new Vec3(0, 0, 0)

export interface ExecutionMappings {
  movements: ExecutorMap
  optimizers: OptimizationMap
}

export interface PathfinderExecutionHost {
  getBot(): Bot
  getWorld(): World
  getActiveMappings(): ExecutionMappings
  bumpExecutionId(): number
  getCurrentExecutionId(): number
  getCurrentIndex(): number
  setCurrentIndex(index: number): void
  getCurrentPath(): Move[] | undefined
  setCurrentPath(path?: Move[]): void
  getCurrentMove(): Move | undefined
  setCurrentMove(move?: Move): void
  getCurrentExecutor(): MovementExecutor | undefined
  setCurrentExecutor(executor?: MovementExecutor): void
  getResetReason(): ResetReason | undefined
  setResetReason(reason?: ResetReason): void
  clearResetReason(): void
  cleanupBot(): Promise<void>
  getPathFromToRaw(startPos: Vec3, startVel: Vec3, goal: goals.Goal): Promise<Path | null>
}

type RunnerStage = 'idle' | 'align' | 'perform'

interface RunnerSnapshot {
  executionId: number
  stage: RunnerStage
  tickCount: number
  currentIndex: number
  moveName?: string
  executorName?: string
}

export class MovementExecutionRunner {
  public constructor(private readonly host: PathfinderExecutionHost) {}

  private logDuration(execId: number, label: string, startMs: number, details?: string): void {
    const elapsedMs = (performance.now() - startMs).toFixed(2)
    if (details == null) {
      log('[ExecID: %d] %s took %sms', execId, label, elapsedMs)
      return
    }

    log('[ExecID: %d] %s took %sms (%s)', execId, label, elapsedMs, details)
  }

  private findNextCurrentIdx(execId: number, move: Move, localPath: Move[], currentIndex: number, adding?: boolean | number): number {
    const endIdx = localPath.findIndex(
      (m, i) => i >= currentIndex && m.exitPos.distanceTo(move.exitPos) < 0.1
    )
    log(`[ExecID ${execId}] Finish info. start: ${currentIndex}. endIdx: ${endIdx}, info: ${adding}, path len: ${localPath.length}`)

    if (typeof adding === 'number') {
      if (Number.isFinite(adding) && adding > 0) currentIndex += adding
    } else {
      currentIndex = endIdx !== -1 ? endIdx + 1 : currentIndex + 1
    }

    return currentIndex
  }

  private describeRunnerSnapshot(snapshot: RunnerSnapshot): string {
    const parts = [
      `ExecID=${snapshot.executionId}`,
      `stage=${snapshot.stage}`,
      `tick=${snapshot.tickCount}`,
      `index=${snapshot.currentIndex}`,
    ]

    if (snapshot.moveName != null) parts.push(`move=${snapshot.moveName}`)
    if (snapshot.executorName != null) parts.push(`executor=${snapshot.executorName}`)

    return parts.join(', ')
  }

  private describeMove(move?: Move): string {
    if (move == null) return 'none'
    return `${move.moveType.constructor.name} entry=${move.entryPos} exit=${move.exitPos}`
  }

  private async traceAsync<T>(
    execId: number,
    label: string,
    snapshot: () => string,
    fn: () => T | Promise<T>
  ): Promise<T> {
    const start = performance.now()
    log('[ExecID: %d] %s START (%s)', execId, label, snapshot())
    try {
      const result = await fn()
      const elapsed = performance.now() - start
      if (elapsed > 50) {
        log('[ExecID: %d] %s END %sms [SLOW] (%s)', execId, label, elapsed.toFixed(2), snapshot())
      } else {
        log('[ExecID: %d] %s END %sms (%s)', execId, label, elapsed.toFixed(2), snapshot())
      }
      return result
    } catch (err) {
      const elapsed = performance.now() - start
      log('[ExecID: %d] %s ERROR after %sms (%s)', execId, label, elapsed.toFixed(2), snapshot())
      throw err
    }
  }

  public async perform(path: Path, goal: goals.Goal, entry = 0): Promise<void> {
    const MAX_RECOVERY_DEPTH = 0

    if (entry > MAX_RECOVERY_DEPTH) {
      throw new Error('Too many failures, exiting performing.')
    }

    const myExecutionId = this.host.bumpExecutionId()
    const bot = this.host.getBot()
    const localPath = path.path
    let currentIndex = 0

    this.host.setCurrentIndex(currentIndex)
    this.host.setCurrentPath(localPath)

    const { movements, optimizers } = this.host.getActiveMappings()

    log(
      '[ExecID: %d] Perform started. Entry: %d, Initial Path Length: %d',
      myExecutionId,
      entry,
      localPath.length
    )
    const executionStart = performance.now()

    let lastPathLength = -1
    let optSequence: Move[] = []
    let runnerStage: RunnerStage = 'idle'
    let tickCount = 0
    let drainRunning = false
    let pendingPhysicsTicks = 0
    let settled = false

    let resolveCompletion!: () => void
    let rejectCompletion!: (err: unknown) => void

    const completion = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve
      rejectCompletion = reject
    })

    const executorSafeReset = (executor?: MovementExecutor): void => {
      executor?.reset()
    }

    const finish = async (): Promise<void> => {
      if (settled) return
      settled = true
      bot.off('physicsTick', moveListener)
      if (this.host.getCurrentExecutionId() === myExecutionId) {
        await this.host.cleanupBot()
      }
      resolveCompletion()
    }

    const fail = async (err: unknown): Promise<void> => {
      if (settled) return
      settled = true
      bot.off('physicsTick', moveListener)
      rejectCompletion(err)
    }

    const getRunnerSnapshot = (): RunnerSnapshot => {
      const currentMove = this.host.getCurrentMove()
      const currentExecutor = this.host.getCurrentExecutor()

      return {
        executionId: myExecutionId,
        stage: runnerStage,
        tickCount,
        currentIndex,
        moveName: currentMove?.moveType.constructor.name,
        executorName: currentExecutor?.constructor.name,
      }
    }

    const prepareNextMove = async (): Promise<boolean> => {
      const prepareStart = performance.now()
      while (currentIndex < localPath.length) {
        if (localPath.length !== lastPathLength) {
          log(
            '[ExecID: %d] Path modification detected (Length %d -> %d). Optimizing remaining slice...',
            myExecutionId,
            Math.max(0, lastPathLength),
            localPath.length
          )

          const optimizer = new Optimizer(bot, this.host.getWorld(), optimizers)
          optimizer.loadPath(localPath.slice(currentIndex))
          const optimizeStart = performance.now()
          optSequence = await this.traceAsync(
            myExecutionId,
            'optimizer.compute',
            () => `remaining=${localPath.length - currentIndex}, index=${currentIndex}`,
            async () => optimizer.compute()
          )
          this.logDuration(myExecutionId, 'optimizer.compute', optimizeStart, `remaining=${localPath.length - currentIndex}`)
          lastPathLength = localPath.length
        }

        const rawMove = localPath[currentIndex]
        const move = optSequence.find((m) => m.hash === rawMove.hash) ?? rawMove
        const wasOptimized = rawMove !== move
        let executor: MovementExecutor | undefined

        if (wasOptimized) {
          executor = move.optimizedExecutor
        }
        if (executor == null) {
          log(`Unoptimized move (idx ${currentIndex}) when we have optimizer! ${optSequence.map(m => m.cachedVec)} vs ${localPath.map(m => m.cachedVec)}`)
          executor = movements.get(move.moveType.constructor as BuildableMoveProvider)
        }
        if (executor == null) {
          throw new Error('No executor for movement type ' + move.moveType.constructor.name)
        }

        this.host.setCurrentMove(move)
        this.host.setCurrentExecutor(executor)
        this.host.setCurrentIndex(currentIndex)
        this.host.setCurrentPath(localPath)
        tickCount = 0

        await this.traceAsync(
          myExecutionId,
          'cleanupBot',
          () => `stage=prepareNextMove, index=${currentIndex}, move=${this.describeMove(move)}`,
          () => this.host.cleanupBot()
        )

        const loadMoveStart = performance.now()
        executor.loadMove(move)
        this.logDuration(myExecutionId, 'executor.loadMove', loadMoveStart, `move=${move.moveType.constructor.name}`)

        const completionCheckStart = performance.now()
        if (executor.isAlreadyCompleted(move, tickCount, goal)) {
          this.logDuration(myExecutionId, 'executor.isAlreadyCompleted', completionCheckStart, `move=${move.moveType.constructor.name}, alreadyCompleted=true`)
          log(
            '[ExecID: %d] Skipping move %s with executor %s at index %d (already completed)',
            myExecutionId,
            move.moveType.constructor.name,
            executor.constructor.name,
            currentIndex
          )

          if (wasOptimized) {
            log(`This move was optimized, but was still skipped. Unlikely.`)
            log(`Move: %O to %O`, move.entryPos, move.exitPos)
          }

          currentIndex = this.findNextCurrentIdx(myExecutionId, move, localPath, currentIndex)
          this.host.setCurrentIndex(currentIndex)
          continue
        }
        this.logDuration(myExecutionId, 'executor.isAlreadyCompleted', completionCheckStart, `move=${move.moveType.constructor.name}, alreadyCompleted=false`)

        log(
          '[ExecID: %d] Executing move: %s aligned to %s index %d',
          myExecutionId,
          move.moveType.constructor.name,
          wasOptimized ? 'optimized' : 'unoptimized',
          currentIndex
        )

        runnerStage = 'align'
        this.logDuration(myExecutionId, 'prepareNextMove', prepareStart, `index=${currentIndex}, stage=align`)
        return true
      }

      this.logDuration(myExecutionId, 'prepareNextMove', prepareStart, 'no-more-moves')
      return false
    }

    const runMovementTick = async (): Promise<void> => {
      if (settled) return
      if (this.host.getCurrentExecutionId() !== myExecutionId) {
        log('[ExecID: %d] Execution superseded.', myExecutionId)
        await finish()
        return
      }

      const iterationStart = performance.now()
      log('[ExecID: %d] tick iteration START (%s)', myExecutionId, this.describeRunnerSnapshot(getRunnerSnapshot()))

      try {
        while (!settled) {
          if (this.host.getCurrentExecutionId() !== myExecutionId) {
            log('[ExecID: %d] Execution superseded during runner.', myExecutionId)
            await finish()
            return
          }

          if (runnerStage === 'idle') {
            const hasWork = await prepareNextMove()
            if (!hasWork) {
              log(`[ExecId ${myExecutionId}] End pos: ${bot.entity.position}`)
              log('[ExecID: %d] Perform loop ended naturally.', myExecutionId)
              await finish()
              return
            }
            continue
          }

          const move = this.host.getCurrentMove()
          const executor = this.host.getCurrentExecutor()

          if (move == null || executor == null) {
            throw new Error('Movement runner lost its current move or executor.')
          }

          if (runnerStage === 'align') {
            this.check()

            const aligned = await this.traceAsync(
              myExecutionId,
              'executor.align',
              () => `move=${this.describeMove(move)}, tick=${tickCount}`,
              () => executor.align(move, tickCount, goal)
            )
            tickCount++

            if (aligned) {
              log('[ExecID: %d] Alignment complete. Initializing perform loop...', myExecutionId)
              await this.traceAsync(
                myExecutionId,
                'executor._performInit',
                () => `move=${this.describeMove(move)}, index=${currentIndex}`,
                () => executor._performInit(move, currentIndex, localPath)
              )
              runnerStage = 'perform'
              tickCount = 0
              continue
            }

            if (tickCount % 20 === 0) {
              log('[ExecID: %d] ...still aligning for move %s. Entry pos: %O, (%d ticks)', myExecutionId, move.moveType.constructor.name, move.entryPos, tickCount)
            }

            return
          }

          if (runnerStage === 'perform') {
            this.check()

            const adding = await this.traceAsync(
              myExecutionId,
              'executor._performPerTick',
              () => `move=${this.describeMove(move)}, tick=${tickCount}, index=${currentIndex}`,
              () => executor._performPerTick(move, tickCount, currentIndex, localPath)
            )
            tickCount++

            if (adding) {
              log(`[ExecID: %d] Movement idx %d finished. Extra?: `, myExecutionId, currentIndex, adding)
              currentIndex = this.findNextCurrentIdx(myExecutionId, move, localPath, currentIndex, adding)
              this.host.setCurrentIndex(currentIndex)
              runnerStage = 'idle'
              this.host.setCurrentMove(undefined)
              this.host.setCurrentExecutor(undefined)
              tickCount = 0
              continue
            }

            if (tickCount % 40 === 0) {
              log('[ExecID: %d] ...still performing tick loop for move %s. Target: %O, (%d ticks)', myExecutionId, move.moveType.constructor.name, move.exitPos, tickCount)
            }

            return
          }
        }
      } catch (err) {
        if (err instanceof AbortError) {
          log('[ExecID: %d] AbortError handled. Halting executor.', myExecutionId)
          executorSafeReset(this.host.getCurrentExecutor())
          this.host.clearResetReason()
          await finish()
          return
        }

        if (err instanceof ManualResetError) {
          log(`[ExecID: %d] ManualResetError handlded. Assume player intervention.`, myExecutionId)
          executorSafeReset(this.host.getCurrentExecutor())
          this.host.clearResetReason()
          await finish()
          return
        }

        if (err instanceof ResetError) {
          log('[ExecID: %d] ResetError handled. Halting executor to restart. Reason: %s', myExecutionId, this.host.getResetReason())
          executorSafeReset(this.host.getCurrentExecutor())
          await finish()
          return
        }

        if (err instanceof CancelError) {
          executorSafeReset(this.host.getCurrentExecutor())

          if (err.message.includes('superseded')) {
            log('[ExecID: %d] Superseded CancelError handled. Executor reset cleanly.', myExecutionId)
            await finish()
            return
          }

          const rawMove = localPath[currentIndex]
          if (rawMove == null) {
            throw err
          }

          log('[ExecID: %d] CancelError handled. Triggering recovery.', myExecutionId)
          await this.recovery(rawMove, path, goal, entry)
          await finish()
          return
        }

        log('[ExecID: %d] Unknown error (type: %s) thrown! Bubble up.', myExecutionId, (err as any).constructor?.name)
        log('[ExecID: %d] Runner snapshot at failure: %s', myExecutionId, this.describeRunnerSnapshot(getRunnerSnapshot()))
        await fail(err)
        throw err
      } finally {
        const iterationElapsed = performance.now() - iterationStart
        if (iterationElapsed > 50) {
          log('[ExecID: %d] tick iteration END %sms [SLOW] (%s)', myExecutionId, iterationElapsed.toFixed(2), this.describeRunnerSnapshot(getRunnerSnapshot()))
        } else {
          log('[ExecID: %d] tick iteration END %sms (%s)', myExecutionId, iterationElapsed.toFixed(2), this.describeRunnerSnapshot(getRunnerSnapshot()))
        }
      }
    }

    const drainMovementTicks = async (): Promise<void> => {
      if (settled) return
      pendingPhysicsTicks++
      if (drainRunning) return

      drainRunning = true
      try {
        while (!settled && pendingPhysicsTicks > 0) {
          pendingPhysicsTicks--
          await runMovementTick()
        }
      } finally {
        drainRunning = false
      }
    }

    const moveListener = (): void => {
      void drainMovementTicks().catch((err) => {
        void fail(err)
      })
    }

    bot.prependListener('physicsTick', moveListener)

    try {
      void drainMovementTicks().catch((err) => {
        void fail(err)
      })
      await completion
    } finally {
      bot.off('physicsTick', moveListener)
      this.logDuration(myExecutionId, 'perform(total)', executionStart, `finalIndex=${this.host.getCurrentIndex()}`)
    }
  }

  public async recovery(move: Move, path: Path, goal: goals.Goal, entry = 0): Promise<void> {
    const bot = this.host.getBot()
    const execId = this.host.getCurrentExecutionId()
    const recoveryStart = performance.now()
    log('Entering recovery %d for move %s from %O to %O', entry, move.moveType.constructor.name, move.entryPos, move.exitPos)
    bot.emit('enteredRecovery', entry)
    await this.host.cleanupBot()
    this.logDuration(execId, 'recovery.cleanupBot', recoveryStart, `entry=${entry}`)

    const ind = path.path.findIndex((m) => m.entryPos.distanceTo(move.entryPos) < 0.1)
    if (ind === -1) {
      log('Recovery failed: could not find move in path.')
      return
    }

    let newGoal: goals.Goal
    const pos = bot.entity.position
    let bad = false

    let nextMove = [...path.path].sort((a, b) => a.entryPos.distanceTo(pos) - b.entryPos.distanceTo(pos))[0] as Move | undefined
    if (nextMove == null || path.path.indexOf(nextMove) < ind) {
      bad = true
    } else if (path.path.indexOf(nextMove) === ind) {
      nextMove = path.path[ind + 1]
    }

    const no = entry > 5 || bad
    if (no || nextMove == null) {
      log('Full recovery needed. Bad: %s, NextMove Null: %s', bad, nextMove == null)
      newGoal = goal
    } else {
      log('Partial recovery to block %O', nextMove.vec)
      newGoal = goals.GoalBlock.fromVec(nextMove.vec)
    }

    const path1 = await this.host.getPathFromToRaw(bot.entity.position, EMPTY_VEC, newGoal)
    this.logDuration(execId, 'recovery.getPathFromToRaw', recoveryStart, `entry=${entry}, foundPath=${path1 != null}`)

    if (path1 === null) {
      log('Recovery pathfinding returned null. Cannot recover. Fail.')
      bot.emit('exitedRecovery', entry)
    } else if (no) {
      log('Executing full recovery path.')
      bot.emit('exitedRecovery', entry)
      await this.perform(path1, goal, entry + 1)
    } else {
      log('Executing partial recovery path.')
      await this.perform(path1, newGoal, entry + 1)

      // We only need to splice the unoptimized path directly!
      path.path.splice(0, ind + 1)

      log('Continuing original goal after partial recovery.')
      bot.emit('exitedRecovery', entry)
      await this.perform(path, goal, 0)
    }

    this.logDuration(execId, 'recovery(total)', recoveryStart, `entry=${entry}`)
  }

  private check(): void {
    const resetReason = this.host.getResetReason()
    if (resetReason != null) {
      throw new ResetError(resetReason)
    }
  }
}
