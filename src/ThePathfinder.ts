import { Bot, BotEvents } from 'mineflayer'
import { AStarBackOff as AAStar } from './abstract/algorithms/astar'
import { AStar, Path, PathProducer } from './mineflayer-specific/algs'
import * as goals from './mineflayer-specific/goals'
import { Vec3 } from 'vec3'
import { Move } from './mineflayer-specific/move'
import { BlockInfo, CacheSyncWorld } from './mineflayer-specific/world/cacheWorld'
import { AbortError, CancelError, ManualResetError, ResetError, TickAdvanceError } from './mineflayer-specific/exceptions'
import type {
  BuildableMoveExecutor,
  BuildableMoveProvider,
  MovementOptions,
  ExecutorMap,
} from './mineflayer-specific/movements'
import {
  MovementHandler,
  MovementExecutor,
  DEFAULT_MOVEMENT_OPTS,
  MovementProvider
} from './mineflayer-specific/movements'

import {
  ParkourForward,
  ParkourDiagonal,
  Diagonal,
  Forward,
  ForwardDropDown,
  ForwardJump,
  IdleMovement,
  StraightDown,
  StraightUp
} from './mineflayer-specific/movements/movementProviders'

import {
  ParkourForwardExecutor,
  ParkourDiagonalExecutor,
  ForwardDropDownExecutor,
  NewForwardExecutor,
  NewForwardJumpExecutor,
  StraightDownExecutor,
  StraightUpExecutor,
  IdleMovementExecutor
} from './mineflayer-specific/movements/movementExecutors'
import { DropDownOpt, ForwardJumpUpOpt, LandStraightAheadOpt } from './mineflayer-specific/post/optimizers'
import type { BuildableMoveOptimizer, OptimizationMap } from './mineflayer-specific/post'
import { MovementOptimizer, OptimizationRegistry, Optimizer } from './mineflayer-specific/post'
import { ContinuousPathProducer, PartialPathProducer } from './mineflayer-specific/pathProducers'
import type { Block, ResetReason } from './types'
import { HandlerOpts } from './types'
import { Task } from '@nxg-org/mineflayer-util-plugin'

import { reconstructPath } from './abstract/algorithms'
import { closestPointOnLineSegment, getScaffoldCount, getNormalizedPos } from './utils'
import { World } from './mineflayer-specific/world/worldInterface'
import { handleBlockEvent, handleSettledBlockEvent } from './customBlockEvents'

const debug = require('debug')
const log = debug('minecraft-pathfinding:main')

export interface PathfinderOptions {
  partialPathProducer: boolean
  partialPathLength: number
}

const DEFAULT_PATHFINDER_OPTS: PathfinderOptions = {
  partialPathProducer: false,
  partialPathLength: 50
}

const EMPTY_VEC = new Vec3(0, 0, 0)

const DEFAULT_PROVIDER_EXECUTORS = [
  [Forward, NewForwardExecutor],
  [ForwardJump, NewForwardJumpExecutor],
  [ForwardDropDown, ForwardDropDownExecutor],
  [Diagonal, NewForwardExecutor],
  [StraightDown, StraightDownExecutor],
  [StraightUp, StraightUpExecutor],
  [ParkourForward, ParkourForwardExecutor],
  [ParkourDiagonal, ParkourDiagonalExecutor]
] as Array<[BuildableMoveProvider, BuildableMoveExecutor]>

DEFAULT_PROVIDER_EXECUTORS.reverse()

const DEFAULT_OPTIMIZERS = [
  [Forward, LandStraightAheadOpt],
  [Diagonal, LandStraightAheadOpt],
  [ForwardDropDown, DropDownOpt],
  [ForwardJump, ForwardJumpUpOpt]
] as Array<[BuildableMoveProvider, BuildableMoveOptimizer]>

const DEFAULT_SETUP = new Map(DEFAULT_PROVIDER_EXECUTORS)
const DEFAULT_OPTIMIZATION = new Map(DEFAULT_OPTIMIZERS)

type PathInfo = Path
type PathGenerator = AsyncGenerator<PathGeneratorResult, PathGeneratorResult | null, unknown>
interface PathGeneratorResult {
  result: PathInfo
  astarContext: AAStar<Move, MovementHandler>
}

interface PerformOpts {
  errorOnReset?: boolean
  errorOnAbort?: boolean
}

export class ThePathfinder {
  astar: AStar | null
  world: World
  movements: ExecutorMap
  defaultMoveSettings: MovementOptions
  pathfinderSettings: PathfinderOptions
  private readonly optimizerRegistry: OptimizationRegistry

  public currentExecutionId = 0
  private currentTick = 0
  private currentIndex = 0
  private executeTask: Task<void, void> = Task.createDoneTask()
  private wantedGoal?: goals.Goal
  public abortCalculation = false

  private currentGotoGoal?: goals.Goal
  private curPath?: Move[]
  private currentMove?: Move
  private currentExecutor?: MovementExecutor

  private resetReason?: ResetReason
  private _currentProducer?: PathProducer

  private _gotoMappings?: {
    movements: ExecutorMap
    optimizers: OptimizationMap
  }

  public get currentAStar(): AStar | undefined {
    return this._currentProducer?.getAstarContext()
  }

  public get currentProducer(): PathProducer | undefined {
    return this._currentProducer
  }

  private snapshotMappings(): {
    movements: ExecutorMap
    optimizers: OptimizationMap
  } {
    return {
      movements: new Map(this.movements),
      optimizers: this.optimizerRegistry.snapshot()
    }
  }

  private get activeMappings(): {
    movements: ExecutorMap
    optimizers: OptimizationMap
  } {
    return this._gotoMappings ?? this.snapshotMappings()
  }

  public get isPathing(): boolean {
    return this.executeTask.done
  }

  public get currentGoal(): Readonly<goals.Goal> | undefined {
    return this.currentGotoGoal;
  }

  reconstructPath = reconstructPath

  constructor(private readonly bot: Bot, opts: HandlerOpts = {}) {
    this.world = opts.world ?? new CacheSyncWorld(bot, bot.world)
    const moveSettings: MovementOptions = {} as MovementOptions
    const pathfinderSettings: PathfinderOptions = {} as PathfinderOptions
    const optimizers = opts.optimizers ?? DEFAULT_OPTIMIZATION
    const moveSetup = opts.movements ?? DEFAULT_SETUP

    Object.assign(moveSettings, { ...DEFAULT_MOVEMENT_OPTS, ...opts.moveSettings })
    Object.assign(pathfinderSettings, { ...DEFAULT_PATHFINDER_OPTS, ...opts.pathfinderSettings })

    const moves = new Map<BuildableMoveProvider, MovementExecutor>()
    for (const [providerType, ExecutorType] of moveSetup) {
      moves.set(providerType, new ExecutorType(bot, this.world, moveSettings))
    }

    this.optimizerRegistry = new OptimizationRegistry(bot, this.world, moveSettings)
    for (const [providerType, ExecutorType] of optimizers) {
      this.optimizerRegistry.setOptimizer(providerType, new ExecutorType(bot, this.world, moveSettings))
    }
    this.movements = moves
    this.defaultMoveSettings = moveSettings
    this.pathfinderSettings = pathfinderSettings
    this.astar = null

    this.setupListeners()
    log('Pathfinder initialized.')
  }

  setExecutor(provider: BuildableMoveProvider, Executor: BuildableMoveExecutor | MovementExecutor): void {
    if (Executor instanceof MovementExecutor) {
      this.movements.set(provider, Executor)
    } else {
      this.movements.set(provider, new Executor(this.bot, this.world, this.defaultMoveSettings))
    }
  }


  setOptimizer(
    provider: BuildableMoveProvider,
    Optimizer: BuildableMoveOptimizer | MovementOptimizer,
    Executor?: BuildableMoveExecutor | MovementExecutor,
    priority = 100
  ): void {
    const optimizer = Optimizer instanceof MovementOptimizer
      ? Optimizer
      : new Optimizer(this.bot, this.world, this.defaultMoveSettings)

    const optimizedExecutor = Executor == null
      ? undefined
      : Executor instanceof MovementExecutor
        ? Executor
        : new Executor(this.bot, this.world, this.defaultMoveSettings)

    this.optimizerRegistry.setOptimizer(provider, optimizer, optimizedExecutor, priority)
  }

  addOptimizer(
    provider: BuildableMoveProvider,
    Optimizer: BuildableMoveOptimizer | MovementOptimizer,
    Executor?: BuildableMoveExecutor | MovementExecutor,
    priority = 100
  ): void {
    const optimizer = Optimizer instanceof MovementOptimizer
      ? Optimizer
      : new Optimizer(this.bot, this.world, this.defaultMoveSettings)

    const optimizedExecutor = Executor == null
      ? undefined
      : Executor instanceof MovementExecutor
        ? Executor
        : new Executor(this.bot, this.world, this.defaultMoveSettings)

    this.optimizerRegistry.addOptimizer(provider, optimizer, optimizedExecutor, priority)
  }

  setMoveOptions(settings: Partial<MovementOptions>): void {
    this.defaultMoveSettings = Object.assign({}, DEFAULT_MOVEMENT_OPTS, settings)
    this.optimizerRegistry.setSettings(this.defaultMoveSettings)
    for (const [, executor] of this.movements) {
      executor.settings = this.defaultMoveSettings
    }
  }

  setOptions(settings: Partial<PathfinderOptions>): void {
    this.pathfinderSettings = Object.assign({}, DEFAULT_PATHFINDER_OPTS, settings)
  }

  dropMovment(provider: BuildableMoveProvider): void {
    this.movements.delete(provider)
  }

  dropAllMovements(): void {
    this.movements.clear()
  }

  async cancel(): Promise<void> {
    log('User cancelled pathfinding.')
    await this.interrupt(this.defaultMoveSettings.movementTimeoutMs, true, 'goalReassignment')
  }

  async interrupt(timeout = this.defaultMoveSettings.movementTimeoutMs, cancelCalculation = true, reasonStr?: ResetReason): Promise<void> {
    log('Interrupt called. Cancel Calculation: %s. %s', cancelCalculation, reasonStr)
    if (this._currentProducer == null) return log('Interrupt ignored: no producer')
    this.abortCalculation = cancelCalculation

    if (this.currentExecutor == null) return log('Interrupt ignored: no executor')
    if (this.currentMove == null) throw new Error('No current move, but there is a current executor.')

    const reason = reasonStr ? ResetError.fromReason(reasonStr) : undefined;
    this.resetReason = reasonStr;
    await this.currentExecutor.abort(this.currentMove, { timeout, reason })
  }

  async reset(reason: ResetReason, cancelTimeout = this.defaultMoveSettings.movementTimeoutMs): Promise<void> {
    log('Reset triggered due to: %s', reason)
    this.bot.emit('resetPath', reason)
    await this.interrupt(cancelTimeout, true, reason)
  }

  setupListeners(): void {
    const disposeBlockUpdateListener = handleSettledBlockEvent(
      this.bot,
      async (oldBlock: Block | null, newBlock: Block | null, settledBlock: Block | null) => {
        log(
          'settled block update',
          oldBlock?.name,
          oldBlock?.position,
          newBlock?.name,
          newBlock?.position,
          settledBlock?.name,
          settledBlock?.position
        )

        if (oldBlock == null || settledBlock == null) return
        if (this.curPath == null) return
        if (oldBlock.type === settledBlock.type) return // break in progress.
        if (!this.isPositionNearPath(oldBlock.position)) return
        if (settledBlock == null) return
        if (this.updateMatchesWanted(settledBlock, this.curPath)) return

        log('Block update near path detected, resetting...')
        await this.reset('blockUpdate')
      },
      {
        settleMs: 75,
        timeoutMs: 250
      }
    )

    this.bot.on('chunkColumnLoad', (chunk) => {
      const astarContext = this.currentAStar
      if (astarContext == null) return
      const cx = chunk.x >> 4 // can confirm, they need to be shifted.
      const cz = chunk.z >> 4
      if (
        astarContext.visitedChunks.has(`${cx - 1},${cz}`) ||
        astarContext.visitedChunks.has(`${cx},${cz - 1}`) ||
        astarContext.visitedChunks.has(`${cx + 1},${cz}`) ||
        astarContext.visitedChunks.has(`${cx},${cz + 1}`)
      ) {
        log('Chunk column loaded near path, resetting...')
        void this.reset('chunkLoad')
      }
    })

    this.bot.on("physicsTick", () => {
      this.currentTick++;
    })
  }

  public updateMatchesWanted(block: Block | null, path: Move[] | undefined = this.curPath): boolean {
    log(`block: ${block?.name} pos: ${block?.position}, path: ${path?.length}, index: ${this.currentIndex}`)
    if (block == null || path == null) return false

    const pos = block.position.floored()
    for (let i = Math.max(0, this.currentIndex - 2); i < path.length; i++) {
      const move = path[i]
      for (const place of move.toPlace) {
        if (place.vec.equals(pos)) {
          switch (place.type) {
            case 'solid':
              return block.boundingBox === 'block'
            case 'water':
              return BlockInfo.waters.has(block.type)
            case 'replaceable':
              return BlockInfo.replaceables.has(block.type)
          }
        }
      }

      for (const br of move.toBreak) {
        log(`[debug] check break position: ${br.vec}, ${pos}, ${block.boundingBox}`)
        if (br.vec.equals(pos)) {
          return block.boundingBox === 'empty' && !BlockInfo.liquids.has(block.type)
        }
      }
    }

    return false
  }

  isPositionNearPath(pos: Vec3 | undefined, path: Move[] | undefined = this.curPath): boolean {
    if (pos == null || path == null) return false

    for (let i = this.currentIndex; i < path.length; i++) {
      const move = path[i]
      let comparisonPoint: Vec3 | null = null

      comparisonPoint = closestPointOnLineSegment(pos, move.entryPos, move.exitPos)

      const dx = Math.abs(comparisonPoint.x - pos.x - 0.5)
      const dy = Math.abs(comparisonPoint.y - pos.y - 0.5)
      const dz = Math.abs(comparisonPoint.z - pos.z - 0.5)

      if (dx <= 1 && dy <= 2 && dz <= 1) {
        return true
      }
    }

    return false
  }

  private registerAll(
    goal: goals.GoalDynamic,
    opts: { onHasUpdate?: () => void, onInvalid?: () => void, onCleanup?: () => void, forAll?: () => void }
  ): () => void {
    const boundEvent = goal._hasChanged.bind(goal)
    const boundValid = goal.isValid.bind(goal)

    const fuckEvent: Array<[keyof BotEvents, (...args: Parameters<BotEvents[keyof BotEvents]>) => void]> = []
    const fuckValid: Array<[keyof BotEvents, (...args: Parameters<BotEvents[keyof BotEvents]>) => void]> = []

    const newOnHasUpdate = (): void => {
      if (opts.onHasUpdate != null) opts.onHasUpdate()
      if (opts.forAll != null) opts.forAll()
      for (const [key, val] of fuckEvent) {
        this.bot.off(key, val)
      }
      for (const [key, val] of fuckValid) {
        this.bot.off(key, val)
      }
    }
    const newOnInvalid = (): void => {
      if (opts.onInvalid != null) opts.onInvalid()
      if (opts.forAll != null) opts.forAll()
      for (const [key, val] of fuckValid) {
        this.bot.off(key, val)
      }
      for (const [key, val] of fuckEvent) {
        this.bot.off(key, val)
      }
    }

    const cleanup = (): void => {
      if (opts.onCleanup != null) opts.onCleanup()
      if (opts.forAll != null) opts.forAll()
      for (const [key, val] of fuckValid) {
        this.bot.off(key, val)
      }
      for (const [key, val] of fuckEvent) {
        this.bot.off(key, val)
      }
    }

    for (const key of goal._eventKeys) {
      const listener = (...args: Parameters<BotEvents[keyof BotEvents]>): void => {
        if (this.resetReason === "goalReassignment") return cleanup()
        if (boundEvent(key, ...args)) newOnHasUpdate()
      }
      this.bot.on(key, listener)
      fuckEvent.push([key, listener])
    }

    for (const key of goal._validKeys) {
      const listener1 = (...args: Parameters<BotEvents[keyof BotEvents]>): void => {
        if ((this.resetReason === "goalReassignment")) return cleanup()
        if (boundValid(key, ...args)) newOnInvalid()
      }
      this.bot.on(key, listener1)
      fuckValid.push([key, listener1])
    }

    goal.cleanup = cleanup

    return cleanup
  }

  getPathTo(goal: goals.Goal, settings = this.defaultMoveSettings): PathGenerator {
    const { movements } = this.activeMappings
    return this.getPathFromTo(this.bot.entity.position, this.bot.entity.velocity, goal, settings, movements)
  }

  async * getPathFromTo(
    startPos: Vec3,
    startVel: Vec3,
    goal: goals.Goal,
    settings = this.defaultMoveSettings,
    movements = this.activeMappings.movements
  ): PathGenerator {
    this.abortCalculation = false
    delete this.resetReason

    startPos = getNormalizedPos(this.bot, startPos)
    log('Generating path from %O to %O', startPos, goal)

    this.currentMove = Move.startMove(
      new IdleMovement(this.bot, this.world),
      startPos.clone(),
      startVel.clone(),
      getScaffoldCount(this.bot)
    )
    this.currentExecutor = new IdleMovementExecutor(this.bot, this.world, this.defaultMoveSettings)

    this.bot.pathingUtil.refresh()

    if (this.pathfinderSettings.partialPathProducer) {
      this._currentProducer = new PartialPathProducer(
        this.currentMove,
        goal,
        settings,
        this.bot,
        this.world,
        movements
      )
    } else {
      this._currentProducer = new ContinuousPathProducer(
        this.currentMove,
        goal,
        settings,
        this.bot,
        this.world,
        movements
      )
    }
    log('Path producer initialized: %s', this._currentProducer.constructor.name)

    let ticked = false

    const listener = (): void => {
      ticked = true
    }

    const cleanup = (): void => {
      this.bot.off('physicsTick', listener)
    }

    let result, astarContext

    do {
      const res = this._currentProducer.advance()
      result = res.result
      astarContext = res.astarContext

      if (result.status === 'success') {
        cleanup()
        this.bot.emit('pathGenerated', result)
        MovementHandler.count = 0
        MovementHandler.totCount = 0
        log('Path generation successful. Length: %d', result.path.length)
        yield { result, astarContext }
        return { result, astarContext }
      }

      if (this.abortCalculation) {
        cleanup()
        result.status = 'canceled'
        log('Path generation canceled.')
        yield { result, astarContext }
        return { result, astarContext }
      }

      yield { result, astarContext }

      if (!ticked) {
        await this.bot.waitForTicks(1)
        ticked = false
      }
    } while (result.status === 'partial' || result.status === 'partialSuccess')

    cleanup()
    log('Path generation ended with status: %s', result.status)
    return {
      result,
      astarContext
    }
  }

  async getPathFromToRaw(startPos: Vec3, startVel: Vec3, goal: goals.Goal): Promise<PathInfo | null> {
    for await (const res of this.getPathFromTo(startPos, startVel, goal)) {
      if (res.result.status !== 'success') {
        if (res.result.status === 'noPath' || res.result.status === 'timeout') return null
      } else {
        return res.result
      }
    }
    return null
  }

  async goto(goal: goals.Goal, performOpts: PerformOpts = {}): Promise<void> {
    log('goto called')
    if (goal == null) {
      await this.cancel()
      await this.executeTask.promise
      await this.cleanupAll(goal)
      return
    }

    if (!this.executeTask.done) {
      log('Canceling previous goto task to start new one.')
      this.wantedGoal = goal
      await this.cancel()
      await this.executeTask.promise
      if (this.wantedGoal !== goal) return
      delete this.wantedGoal
    }

    this.cleanupClient()
    this.executeTask = new Task()
    this.currentGotoGoal = goal
    this.bot.emit('goalSet', goal)

    this._gotoMappings = this.snapshotMappings()

    try {
      await this._goto(goal, performOpts)
      await this.cleanupAll(goal)
    } finally {
      delete this._gotoMappings
    }
  }

  private async _goto(goal: goals.Goal, performOpts: PerformOpts = {}): Promise<void> {
    const doForever = !!(goal instanceof goals.GoalDynamic && goal.neverfinish && goal.dynamic)

    let toWaitOn = Promise.resolve()
    let manualCleanup = (): void => { }

    const setupWait = (): void => {
      if (goal instanceof goals.GoalDynamic && goal.dynamic) {
        toWaitOn = new Promise((resolve) => {
          manualCleanup = this.registerAll(goal, {
            onHasUpdate: () => {
              void this.reset('goalUpdated')
            },
            onInvalid: () => {
              void this.cancel()
            },
            forAll: () => {
              resolve()
            }
          })
        })
      }
    }

    do {
      let madeIt = false
      do {
        setupWait()

        let task: Promise<void> | null = null
        let res1: Path | null = null // Strictly tracking unoptimized Path now!

        for await (const res of this.getPathTo(goal)) {
          if (res.result.status !== 'success') {
            if (res.result.status === 'noPath' || res.result.status === 'timeout' || res.result.status === 'canceled') {
              log('_goto path finding ended early: %s', res.result.status)
              if (task !== null && res1 !== null) res1.path.length = 0
              // think I just return? used to break before, but that's wrong.
              return
            }

            if (res.result.status === 'partialSuccess') {
              if (res1 === null) {
                res1 = res.result
                task = this.perform(res1, goal).then(() => {
                  task = null
                  res1 = null
                })
              } else {
                // Update the unoptimized path in place! 
                // perform() will automatically catch the newly added tail.
                res1.path.length = res.result.path.length
                for (let i = 0; i < res.result.path.length; i++) {
                  res1.path[i] = res.result.path[i]
                }
              }
            }
          } else {
            if (task === null) {
              await this.perform(res.result, goal)
            } else {
              const res2 = res1 as Path
              res2.path.length = res.result.path.length
              for (let i = 0; i < res.result.path.length; i++) {
                res2.path[i] = res.result.path[i]
              }

              await task
              task = null
            }

            if (performOpts.errorOnAbort != null && performOpts.errorOnAbort && this.abortCalculation) {
              log('Goto aborted internally.')
              throw new Error('Goto: Goal was canceled.')
            }

            if (performOpts.errorOnReset != null && performOpts.errorOnReset && this.resetReason != null) {
              log('Goto reset internally. Reason: %s', this.resetReason)
              throw new Error('Goto: Purposefully cancelled due to recalculation of path occurring.')
            }

            if (this.resetReason == null) {
              log('Goto reached the goal!')
              await this.cleanupBot()
              manualCleanup()
              setupWait()

              madeIt = true
              break
            }

            log('Goto reset detected. Cleaning up and retrying...')
            await this.cleanupBot()
            manualCleanup()
          }
        }
      } while (!(this.resetReason === "goalReassignment") && madeIt === false)

      await this.cleanupBot()
      if (doForever) {
        if (this.resetReason == null && !(this.resetReason === "goalReassignment")) {
          await toWaitOn
        }
      }
    } while (doForever && !(this.resetReason === "goalReassignment"))
  }

  private async awaitWithoutTickAdvance<T>(label: string, move: MovementExecutor, fn: () => Promise<T>): Promise<T> {
    const beforeTick = this.currentTick
    const result = await fn()
    const afterTick = this.currentTick

    // don't throw tick advance error if the movement was aborted, since this can happen when waiting.
    if (move.aborted) return result;

    if (afterTick !== beforeTick) {
      throw new TickAdvanceError(
        label, beforeTick, afterTick
      )
    }

    return result
  }


  private findNextCurrentIdx(execId: number, move: Move, localPath: Move[], currentIndex: number, adding?: boolean | number) {
    const endIdx = localPath.findIndex(
      (m, i) => i >= currentIndex && m.exitPos.distanceTo(move.exitPos) < 0.1
    ); // we just finished this move, so 
    log(`[ExecID ${execId}] Finish info. start: ${currentIndex}. endIdx: ${endIdx}, info: ${adding}, path len: ${localPath.length}`)
    log(`[ExecID ${execId}] extra info: ${localPath[endIdx].exitPos}`)

    // if we add, we need to override the endIdx transfer. Rough ik, but that seems correct.
    if (typeof adding === 'number') {
      if (Number.isFinite(adding) && adding > 0) currentIndex += adding
    } else {
      currentIndex = endIdx !== -1 ? endIdx + 1 : currentIndex + 1;
    }

    // however, if the path is optimized this does not work.
    return currentIndex;
  }

  async perform(path: Path, goal: goals.Goal, entry = 0): Promise<void> {
    const MAX_RECOVERY_DEPTH = 0
    const ALIGN_TICK_LIMIT = 40
    const PERFORM_TICK_LIMIT = 10000

    if (entry > MAX_RECOVERY_DEPTH) {
      throw new Error('Too many failures, exiting performing.')
    }

    this.currentExecutionId++
    const myExecutionId = this.currentExecutionId

    log('Entering ExecId %s', myExecutionId)


    let currentIndex = 0
    const localPath = path.path

    this.currentIndex = currentIndex
    this.curPath = localPath

    const { movements, optimizers } = this.activeMappings

    log(
      '[ExecID: %d] Perform started. Entry: %d, Initial Path Length: %d',
      myExecutionId,
      entry,
      localPath.length
    )

    let lastPathLength = -1
    let optSequence: Move[] = []

    while (currentIndex < localPath.length) {
      if (this.currentExecutionId !== myExecutionId) {
        log('[ExecID: %d] Execution superseded before move start.', myExecutionId)
        return
      }

      this.currentIndex = currentIndex
      this.curPath = localPath

      if (localPath.length !== lastPathLength) {
        log(
          '[ExecID: %d] Path modification detected (Length %d -> %d). Optimizing remaining slice...',
          myExecutionId,
          Math.max(0, lastPathLength),
          localPath.length
        )

        const optimizer = new Optimizer(this.bot, this.world, optimizers)
        optimizer.loadPath(localPath.slice(currentIndex))
        optSequence = await optimizer.compute()
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
        log(`Unoptimized move (idx ${currentIndex}) when we have optimizer! ${optSequence.map(m=>m.cachedVec)} vs ${localPath.map(m=>m.cachedVec)}`)
        executor = movements.get(move.moveType.constructor as BuildableMoveProvider)
      }
      if (executor == null) {
        throw new Error('No executor for movement type ' + move.moveType.constructor.name)
      }

      this.currentMove = move
      this.currentExecutor = executor

      let tickCount = 0

      await this.cleanupBot()
      executor.loadMove(move)

      if (executor.isAlreadyCompleted(move, tickCount, goal)) {
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
        this.currentIndex = currentIndex
        continue
      }

      log(
        '[ExecID: %d] Executing move: %s aligned to %s index %d',
        myExecutionId,
        move.moveType.constructor.name,
        wasOptimized ? "optimized" : "unoptimized",
        currentIndex
      )

      try {
        log('[ExecID: %d] Aligning for move: %s...', myExecutionId, move.moveType.constructor.name)

        while (tickCount < ALIGN_TICK_LIMIT) {
          if (this.currentExecutionId !== myExecutionId) {
            throw new CancelError('Execution superseded during align')
          }

          this.check()

          const aligned = await this.awaitWithoutTickAdvance(
            `${move.moveType.constructor.name}.align`,
            executor,
            async () => await executor.align(move, tickCount++, goal)
          )

          if (aligned) break

          if (tickCount % 20 === 0) {
            log('[ExecID: %d] ...still aligning for move %s. Entry pos: %O, (%d ticks)', myExecutionId, move.moveType.constructor.name, move.entryPos, tickCount)
          }

          await this.bot.waitForTicks(1)
        }

        if (tickCount >= ALIGN_TICK_LIMIT) {
          throw new CancelError(`Alignment timed out for ${move.moveType.constructor.name}`)
        }

        log('[ExecID: %d] Alignment complete. Initializing perform loop...', myExecutionId)

        tickCount = 0
        await executor._performInit(move, currentIndex, localPath)

        let adding: boolean | number = 0

        while (tickCount < PERFORM_TICK_LIMIT) {
          if (this.currentExecutionId !== myExecutionId) {
            throw new CancelError('Execution superseded during performTick')
          }

          this.check()

          adding = await this.awaitWithoutTickAdvance(
            `${move.moveType.constructor.name}._performPerTick`,
            executor,
            async () => await executor._performPerTick(move, tickCount++, currentIndex, localPath)
          )

          if (adding) break

          if (tickCount % 40 === 0) {
            log('[ExecID: %d] ...still performing tick loop for move %s. Target: %O, (%d ticks)', myExecutionId, move.moveType.constructor.name, move.exitPos, tickCount)
          }

          await this.bot.waitForTicks(1)
        }

        if (tickCount >= PERFORM_TICK_LIMIT) {
          throw new CancelError(`Execution tick loop timed out for ${move.moveType.constructor.name}`)
        }

        log(`[ExecID: %d] Movement idx %d finished. Extra?: `, myExecutionId, currentIndex, adding)

        currentIndex = this.findNextCurrentIdx(myExecutionId, move, localPath, currentIndex, adding)

        this.currentIndex = currentIndex

      } catch (err) {
        // log(
        //   '[ExecID: %d] Exception caught during perform at index %d: %O',
        //   myExecutionId,
        //   currentIndex,
        //   err
        // )

        if (err instanceof AbortError) {
          log('[ExecID: %d] AbortError handled. Halting executor.', myExecutionId)
          executor.reset()
          delete this.resetReason
          break
        }

        if (err instanceof ManualResetError) {
          log(`[ExecID: %d] ManualResetError handlded. Assume player intervention.`, myExecutionId)
          executor.reset()
          delete this.resetReason
          break
        }

        if (err instanceof ResetError) {
          log('[ExecID: %d] ResetError handled. Halting executor to restart. Reason: %s', myExecutionId, this.resetReason)
          executor.reset()
          break
        }

        if (err instanceof CancelError) {
          executor.reset()

          if (err.message.includes('superseded')) {
            log('[ExecID: %d] Superseded CancelError handled. Executor reset cleanly.', myExecutionId)
            return
          }

          log('[ExecID: %d] CancelError handled. Triggering recovery.', myExecutionId)
          await this.recovery(rawMove, path, goal, entry)
          break;
        }

        log('[ExecID: %d] Unknown error (type: %s) thrown! Bubble up.', myExecutionId, (err as any).constructor.name)
        throw err
      }
    }

    log(`[ExecId ${myExecutionId}] End pos: ${this.bot.entity.position}`)

    if (this.currentExecutionId === myExecutionId) {
      log('[ExecID: %d] Perform loop ended naturally.', myExecutionId)
      await this.cleanupBot()
    }
  }

  async recovery(move: Move, path: Path, goal: goals.Goal, entry = 0): Promise<void> {
    log('Entering recovery %d for move %s from %O to %O', entry, move.moveType.constructor.name, move.entryPos, move.exitPos)
    this.bot.emit('enteredRecovery', entry)
    await this.cleanupBot()

    const ind = path.path.findIndex(m => m.entryPos.distanceTo(move.entryPos) < 0.1)
    if (ind === -1) {
      log('Recovery failed: could not find move in path.')
      return
    }

    let newGoal
    const pos = this.bot.entity.position
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

    let path1 = await this.getPathFromToRaw(this.bot.entity.position, EMPTY_VEC, newGoal)

    if (path1 === null) {
      log('Recovery pathfinding returned null. Cannot recover. Fail.')
      this.bot.emit('exitedRecovery', entry)

    } else if (no) {
      log('Executing full recovery path.')
      this.bot.emit('exitedRecovery', entry)
      await this.perform(path1, goal, entry + 1)
    } else {
      log('Executing partial recovery path.')
      await this.perform(path1, newGoal, entry + 1)

      // We only need to splice the unoptimized path directly!
      path.path.splice(0, ind + 1)

      log('Continuing original goal after partial recovery.')
      this.bot.emit('exitedRecovery', entry)
      await this.perform(path, goal, 0)
    }
  }

  private check(): void {
    if (this.resetReason != null) {
      throw new ResetError(this.resetReason)
    }
  }

  async cleanupBot(): Promise<void> {
    this.bot.clearControlStates()
    for (const [, executor] of this.activeMappings.movements) {
      executor.reset()
    }
  }

  cleanupClient(): void {
    this.abortCalculation = false
    delete this.resetReason
    delete this.currentGotoGoal
    delete this.curPath
    delete this.currentMove
    delete this.currentExecutor
  }

  async cleanupAll(goal: goals.Goal, executor = this.currentExecutor): Promise<void> {
    if (goal instanceof goals.GoalDynamic && goal.dynamic) {
      goal.cleanup?.()
    }

    await this.cleanupBot()
    if (executor != null) {
      await goal.onFinish(executor)
      await this.cleanupBot()
    }
    this.world.cleanup?.()

    if ((this.resetReason === "goalReassignment")) {
      log('Cleanup: Goal aborted.')
      this.bot.emit('goalAborted', goal)
    } else {
      log('Cleanup: Goal finished.')
      this.bot.emit('goalFinished', goal)
    }

    this.abortCalculation = false
    this.executeTask.finish()

    this.cleanupClient()
  }
}
