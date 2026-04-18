import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
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
import { ThePathfinder } from './ThePathfinder'

const debug = require('debug')
const log = debug('minecraft-pathfinding:PathExecutor')

const EMPTY_VEC = new Vec3(0, 0, 0)

export interface ExecutionMappings {
  movements: ExecutorMap
  optimizers: OptimizationMap
}

export interface PathfinderExecutionHost {
  getBot(): Bot
  getWorld(): World
  getActiveMappings(): ExecutionMappings
  cleanupBot(): Promise<void>
  getPathFromToRaw(startPos: Vec3, startVel: Vec3, goal: goals.Goal): Promise<Path | null>
}

type RunnerStage = 'idle' | 'align' | 'perform'

export class PathExecutor {
  private currentExecutionId = 0
  private currentIndex = 0
  private currentPath?: Move[]
  private currentMove?: Move
  private currentExecutor?: MovementExecutor
  private resetReason?: ResetReason

  public constructor(private readonly bot: Bot, private readonly host: ThePathfinder) {}

  public bumpExecutionId(): number {
    this.currentExecutionId++
    return this.currentExecutionId
  }

  public getCurrentExecutionId(): number {
    return this.currentExecutionId
  }

  public getCurrentIndex(): number {
    return this.currentIndex
  }

  public setCurrentIndex(index: number): void {
    this.currentIndex = index
  }

  public getCurrentPath(): Move[] | undefined {
    return this.currentPath
  }

  public setCurrentPath(path?: Move[]): void {
    this.currentPath = path
  }

  public getCurrentMove(): Move | undefined {
    return this.currentMove
  }

  public setCurrentMove(move?: Move): void {
    this.currentMove = move
  }

  public getCurrentExecutor(): MovementExecutor | undefined {
    return this.currentExecutor
  }

  public setCurrentExecutor(executor?: MovementExecutor): void {
    this.currentExecutor = executor
  }

  public getResetReason(): ResetReason | undefined {
    return this.resetReason
  }

  public setResetReason(reason?: ResetReason): void {
    this.resetReason = reason
  }

  public clearResetReason(): void {
    delete this.resetReason
  }

  private findNextCurrentIdx(move: Move, localPath: Move[], currentIndex: number, adding?: boolean | number): number {
    const endIdx = localPath.findIndex(
      (m, i) => i >= currentIndex && m.exitPos.distanceTo(move.exitPos) < 0.1
    )

    if (typeof adding === 'number') {
      if (Number.isFinite(adding) && adding > 0) currentIndex += adding
    } else {
      currentIndex = endIdx !== -1 ? endIdx + 1 : currentIndex + 1
    }

    return currentIndex
  }

  private waitForPromiseSync<T>(promise: Promise<T>): T {
    let settled = false
    let value: T | undefined
    let error: unknown

    promise.then(
      (result) => {
        value = result
        settled = true
      },
      (err) => {
        error = err
        settled = true
      }
    )

    const waitArray = new Int32Array(new SharedArrayBuffer(4))
    const tickCallback = (process as NodeJS.Process & { _tickCallback?: () => void })._tickCallback

    while (!settled) {
      Atomics.wait(waitArray, 0, 0, 1)
      tickCallback?.call(process)
    }

    if (error != null) throw error
    return value as T
  }

  public async perform(path: Path, goal: goals.Goal, entry = 0): Promise<void> {
    const MAX_RECOVERY_DEPTH = 0

    if (entry > MAX_RECOVERY_DEPTH) {
      throw new Error('Too many failures, exiting performing.')
    }

    const bot = this.bot;
    const myExecutionId = this.bumpExecutionId()
    const localPath = path.path
    let currentIndex = 0

    this.setCurrentIndex(currentIndex)
    this.setCurrentPath(localPath)

    const { movements, optimizers } = this.host.getActiveMappings()

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
      if (this.getCurrentExecutionId() === myExecutionId) {
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

    const prepareNextMove = async (): Promise<boolean> => {
      while (currentIndex < localPath.length) {
        if (localPath.length !== lastPathLength) {
          const optimizer = new Optimizer(bot, this.host.world, optimizers)
          optimizer.loadPath(localPath.slice(currentIndex))
          optSequence = await optimizer.compute()
          lastPathLength = localPath.length
        }

        const rawMove = localPath[currentIndex]
        const move = optSequence.find((m) => m.hash === rawMove.hash) ?? rawMove
        let executor: MovementExecutor | undefined

        if (rawMove !== move) {
          executor = move.optimizedExecutor
        }
        if (executor == null) {
          executor = movements.get(move.moveType.constructor as BuildableMoveProvider)
        }
        if (executor == null) {
          throw new Error('No executor for movement type ' + move.moveType.constructor.name)
        }

        this.setCurrentMove(move)
        this.setCurrentExecutor(executor)
        this.setCurrentIndex(currentIndex)
        this.setCurrentPath(localPath)
        tickCount = 0

        await this.host.cleanupBot()
        executor.loadMove(move)

        if (executor.isAlreadyCompleted(move, tickCount, goal)) {
          currentIndex = this.findNextCurrentIdx(move, localPath, currentIndex)
          this.setCurrentIndex(currentIndex)
          continue
        }

        runnerStage = 'align'
        return true
      }

      return false
    }

    const runMovementTick = async (): Promise<void> => {
      if (settled) return
      if (this.getCurrentExecutionId() !== myExecutionId) {
        await finish()
        return
      }

      try {
        while (!settled) {
          if (this.getCurrentExecutionId() !== myExecutionId) {
            await finish()
            return
          }

          if (runnerStage === 'idle') {
            const hasWork = await prepareNextMove()
            if (!hasWork) {
              log(`[pathfinder] execution ${myExecutionId} completed at ${bot.entity.position}`)
              await finish()
              return
            }
            continue
          }

          const move = this.getCurrentMove()
          const executor = this.getCurrentExecutor()

          if (move == null || executor == null) {
            throw new Error('Movement runner lost its current move or executor.')
          }

          if (runnerStage === 'align') {
            this.check()

            const aligned = await executor.align(move, tickCount, goal)
            tickCount++

            if (aligned) {
              await executor._performInit(move, currentIndex, localPath)
              runnerStage = 'perform'
              tickCount = 0
              continue
            }

            return
          }

          if (runnerStage === 'perform') {
            this.check()

            const adding = await executor._performPerTick(move, tickCount, currentIndex, localPath)
            tickCount++

            if (adding) {
              currentIndex = this.findNextCurrentIdx(move, localPath, currentIndex, adding)
              this.setCurrentIndex(currentIndex)
              runnerStage = 'idle'
              this.setCurrentMove(undefined)
              this.setCurrentExecutor(undefined)
              tickCount = 0
              continue
            }

            return
          }
        }
      } catch (err) {
        if (err instanceof AbortError) {
          executorSafeReset(this.getCurrentExecutor())
          this.clearResetReason()
          await finish()
          return
        }

        if (err instanceof ManualResetError) {
          executorSafeReset(this.getCurrentExecutor())
          this.clearResetReason()
          await finish()
          return
        }

        if (err instanceof ResetError) {
          executorSafeReset(this.getCurrentExecutor())
          await finish()
          return
        }

        if (err instanceof CancelError) {
          executorSafeReset(this.getCurrentExecutor())

          if (err.message.includes('superseded')) {
            await finish()
            return
          }

          const rawMove = localPath[currentIndex]
          if (rawMove == null) {
            throw err
          }

          await this.recovery(rawMove, path, goal, entry)
          await finish()
          return
        }

        await fail(err)
        throw err
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
      try {
        this.waitForPromiseSync(drainMovementTicks())
      } catch (err) {
        void fail(err)
      }
    }

    bot.prependListener('physicsTick', moveListener)

    try {
      void drainMovementTicks().catch((err) => {
        void fail(err)
      })
      await completion
    } finally {
      bot.off('physicsTick', moveListener)
    }
  }

  public async recovery(move: Move, path: Path, goal: goals.Goal, entry = 0): Promise<void> {
    const bot = this.bot;
    log(`[pathfinder] recovery ${entry} for ${move.moveType.constructor.name}`)
    bot.emit('enteredRecovery', entry)
    await this.host.cleanupBot()

    const ind = path.path.findIndex((m) => m.entryPos.distanceTo(move.entryPos) < 0.1)
    if (ind === -1) {
      log('[pathfinder] recovery failed: could not find move in path')
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
      newGoal = goal
    } else {
      newGoal = goals.GoalBlock.fromVec(nextMove.vec)
    }

    const path1 = await this.host.getPathFromToRaw(bot.entity.position, EMPTY_VEC, newGoal)

    if (path1 === null) {
      log('[pathfinder] recovery pathfinding returned null')
      bot.emit('exitedRecovery', entry)
    } else if (no) {
      log('[pathfinder] executing full recovery path')
      bot.emit('exitedRecovery', entry)
      await this.perform(path1, goal, entry + 1)
    } else {
      log('[pathfinder] executing partial recovery path')
      await this.perform(path1, newGoal, entry + 1)

      // We only need to splice the unoptimized path directly!
      path.path.splice(0, ind + 1)

      log('[pathfinder] continuing original goal after partial recovery')
      bot.emit('exitedRecovery', entry)
      await this.perform(path, goal, 0)
    }
  }

  private check(): void {
    const resetReason = this.getResetReason()
    if (resetReason != null) {
      throw new ResetError(resetReason)
    }
  }
}
