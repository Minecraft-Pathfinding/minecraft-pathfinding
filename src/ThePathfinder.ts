import { Bot, BotEvents } from 'mineflayer'
import { AStarBackOff as AAStar } from './abstract/algorithms/astar'
import { AStar, Path, PathProducer } from './mineflayer-specific/algs'
import * as goals from './mineflayer-specific/goals'
import { Vec3 } from 'vec3'
import { Move } from './mineflayer-specific/move'
import { BlockInfo, CacheSyncWorld } from './mineflayer-specific/world/cacheWorld'
import { ResetError } from './mineflayer-specific/exceptions'
import type {
  BuildableMoveExecutor,
  BuildableMoveProvider,
  MovementOptions,
  ExecutorMap,
} from './mineflayer-specific/movements'
import {
  MovementHandler,
  MovementExecutor,
  DEFAULT_MOVEMENT_OPTS
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
import { closestPointOnLineSegment, getScaffoldCount, getNormalizedPos, getSupportedStartPos } from './utils'
import { World } from './mineflayer-specific/world/worldInterface'
import { handleBlockEvent, handleSettledBlockEvent } from './customBlockEvents'
import { PathExecutor, type ExecutionMappings } from './pathExecutor'
import { start } from 'node:repl'

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

  private executeTask: Task<void, void> = Task.createDoneTask()
  private wantedGoal?: goals.Goal
  public abortCalculation = false

  private currentGotoGoal?: goals.Goal
  private _currentProducer?: PathProducer
  private readonly executionRunner: PathExecutor

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

  public getActiveMappings(): ExecutionMappings {
    return this.activeMappings
  }

  public get isPathing(): boolean {
    return !this.executeTask.done
  }

  public get currentGoal(): Readonly<goals.Goal> | undefined {
    return this.currentGotoGoal;
  }

  public get resetReason(): ResetReason | undefined {
    return this.executionRunner.getResetReason()
  }

  public get currentIndex(): number {
    return this.executionRunner.getCurrentIndex();
  }

  public get currentPath(): Move[] | undefined {
    return this.executionRunner.getCurrentPath()
  }

  public set currentPath(path: Move[] | undefined) {
    this.executionRunner.setCurrentPath(path)
  }

  public get currentMove(): Move | undefined {
    return this.executionRunner.getCurrentMove()
  }

  public set currentMove(move: Move | undefined) {
    this.executionRunner.setCurrentMove(move)
  }

  public get currentExecutor(): MovementExecutor | undefined {
    return this.executionRunner.getCurrentExecutor()
  }

  public set currentExecutor(executor: MovementExecutor | undefined) {
    this.executionRunner.setCurrentExecutor(executor)
  }


  public clearResetReason(): void {
    this.executionRunner.clearResetReason()
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
    this.executionRunner = new PathExecutor(this.bot, this)

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

    const currentExecutor = this.currentExecutor;
    const currentMove = this.currentMove;
    if (currentExecutor == null) return log('Interrupt ignored: no executor')
    if (currentMove == null) throw new Error('No current move, but there is a current executor.')

    const reason = reasonStr ? ResetError.fromReason(reasonStr) : undefined;
    this.executionRunner.setResetReason(reasonStr);
    await currentExecutor.abort(currentMove, { timeout, reason })
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
        // log(
        //   'settled block update',
        //   oldBlock?.name,
        //   oldBlock?.position,
        //   newBlock?.name,
        //   newBlock?.position,
        //   settledBlock?.name,
        //   settledBlock?.position
        // )

        const currentPath = this.currentPath;
        if (oldBlock == null || settledBlock == null) return
        if (currentPath == null) return
        if (oldBlock.type === settledBlock.type) return // break in progress.
        if (!this.isPositionNearPath(oldBlock.position)) return
        if (settledBlock == null) return
        if (this.updateMatchesWanted(settledBlock, currentPath)) return

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

  }

  public updateMatchesWanted(block: Block | null, path: Move[] | undefined = this.currentPath): boolean {
    const currentIndex = this.currentIndex;
    log(`block: ${block?.name} pos: ${block?.position}, path: ${path?.length}, index: ${currentIndex}`)
    if (block == null || path == null) return false

    const pos = block.position.floored()
    for (let i = Math.max(0, currentIndex - 2); i < path.length; i++) {
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

  isPositionNearPath(pos: Vec3 | undefined, path: Move[] | undefined = this.currentPath): boolean {
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
    this.clearResetReason()

    startPos = getSupportedStartPos(this.world, getNormalizedPos(this.bot, startPos))
    log('Generating path from %O to %O', startPos, goal)


    const startMove = Move.startMove(
      new IdleMovement(this.bot, this.world),
      startPos.clone(),
      startVel.clone(),
      getScaffoldCount(this.bot)
    )

    this.executionRunner.setCurrentMove(startMove)
    this.executionRunner.setCurrentExecutor(new IdleMovementExecutor(this.bot, this.world, this.defaultMoveSettings))

    this.bot.pathingUtil.refresh()

    if (this.pathfinderSettings.partialPathProducer) {
      this._currentProducer = new PartialPathProducer(
        startMove,
        goal,
        settings,
        this.bot,
        this.world,
        movements
      )
    } else {
      this._currentProducer = new ContinuousPathProducer(
        startMove,
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
      log('Cancelling previous goto task to start new one.')
      this.wantedGoal = goal
      await this.cancel()
      await this.executeTask.promise
      log('Cancelled other goal! Beginning new one: %O', goal)
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
      this.executeTask.finish()
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
                task = this.perform(res1, goal).finally(() => {
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
      } while (this.resetReason !== "goalReassignment" && madeIt === false)

      await this.cleanupBot()
      if (doForever) {
        if (this.resetReason == null && this.resetReason !== "goalReassignment") {
          await toWaitOn
        }
      }
    } while (doForever && this.resetReason !== "goalReassignment")
  }

  perform(path: Path, goal: goals.Goal, entry = 0): Promise<void> {
    return this.executionRunner.perform(path, goal, entry)
  }

  recovery(move: Move, path: Path, goal: goals.Goal, entry = 0): Promise<void> {
    return this.executionRunner.recovery(move, path, goal, entry)
  }

  async cleanupBot(forceSafety = false): Promise<void> {
    this.bot.clearControlStates()

    // rough code. just need any of them.

    let exec;
    for (const [, executor] of this.activeMappings.movements) {
      exec ??= executor;
      executor.reset()
    }

    if (forceSafety && exec != null) {
      let normVel;
      do {
        normVel = this.bot.entity.onGround ? this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0) : this.bot.entity.velocity
        const ectx = exec.simForward({ ticks: 2 })
        if (ectx.state.isInWater || ectx.state.isInLava) return
        if (this.bot.entity.onGround && !ectx.state.onGround && ectx.position.y < this.bot.entity.position.y) {
          this.bot.setControlState('sneak', true)
        }

        console.log(normVel, normVel.norm())
        await this.bot.waitForTicks(1)
      } while (normVel.norm() > 5e-4)

      this.bot.setControlState('sneak', false)
    }
  }

  cleanupClient(): void {
    this.abortCalculation = false
    this.clearResetReason()
    delete this.currentGotoGoal
    delete this.currentPath;
    delete this.currentExecutor;
    delete this.currentMove;

  }

  async cleanupAll(goal: goals.Goal, executor = this.currentExecutor): Promise<void> {
    if (goal instanceof goals.GoalDynamic && goal.dynamic) {
      goal.cleanup?.()
    }

    await this.cleanupBot(true)

    if (executor != null) {
      await goal.onFinish(executor)
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

    log(`Task finished, cleanup client.`)
    this.cleanupClient()
  }
}
