import { Bot, BotEvents } from 'mineflayer'
import { AStar as AAStar } from './abstract/algorithms/astar'
import { AStar, Path, PathProducer } from './mineflayer-specific/algs'
import * as goals from './mineflayer-specific/goals'
import { Vec3 } from 'vec3'
import { Move } from './mineflayer-specific/move'
import { BlockInfo, CacheSyncWorld } from './mineflayer-specific/world/cacheWorld'
import { AbortError, CancelError, ResetError } from './mineflayer-specific/exceptions'
import {
  BuildableMoveExecutor,
  BuildableMoveProvider,
  MovementHandler,
  MovementOptions,
  MovementSetup,
  ExecutorMap,
  MovementExecutor,
  DEFAULT_MOVEMENT_OPTS
} from './mineflayer-specific/movements'

import {
  ParkourForward,
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
  ForwardDropDownExecutor,
  NewForwardExecutor,
  NewForwardJumpExecutor,
  StraightDownExecutor,
  StraightUpExecutor,
  IdleMovementExecutor
} from './mineflayer-specific/movements/movementExecutors'
import { DropDownOpt, ForwardJumpUpOpt, StraightAheadOpt } from './mineflayer-specific/post/optimizers'
import { BuildableOptimizer, OptimizationSetup, MovementOptimizer, OptimizationMap, Optimizer } from './mineflayer-specific/post'
import { ContinuousPathProducer, PartialPathProducer } from './mineflayer-specific/pathProducers'
import { Block, ResetReason } from './types'
import { Task } from '@nxg-org/mineflayer-util-plugin'

import { reconstructPath } from './abstract/algorithms'
import { closestPointOnLineSegment, getScaffoldCount } from './utils'
import { World } from './mineflayer-specific/world/worldInterface'
import { InteractType } from './mineflayer-specific/movements/interactionUtils'

export interface PathfinderOptions {
  partialPathProducer: boolean
  partialPathLength: number
}

const DEFAULT_PATHFINDER_OPTS: PathfinderOptions = {
  partialPathProducer: false,
  partialPathLength: 50
}

const EMPTY_VEC = new Vec3(0, 0, 0)

/**
 * These are the default movement types and their respective executors.
 */
const DEFAULT_PROVIDER_EXECUTORS = [
  [Forward, NewForwardExecutor],
  [ForwardJump, NewForwardJumpExecutor],
  [ForwardDropDown, ForwardDropDownExecutor],
  [Diagonal, NewForwardExecutor],
  [StraightDown, StraightDownExecutor],
  [StraightUp, StraightUpExecutor],
  [ParkourForward, ParkourForwardExecutor]
] as Array<[BuildableMoveProvider, BuildableMoveExecutor]>

/**
 * Due to locality caching of blocks being implemented,
 * We want the most complicated movements to be called first,
 * as they load more blocks.
 *
 * Human logic keeps simple at front, complicated at back,
 * So for simplicity I reverse the array.
 */
DEFAULT_PROVIDER_EXECUTORS.reverse()

/**
 * This is the default optimization setup.
 *
 * Optimizers are used to optimize the path produced by the A* algorithm.
 *
 * They can reveal patterns at calculation time otherwise not noticeable at execution time.
 */
const DEFAULT_OPTIMIZERS = [
  [Forward, StraightAheadOpt],
  [Diagonal, StraightAheadOpt],
  [ForwardDropDown, DropDownOpt],
  [ForwardJump, ForwardJumpUpOpt]
] as Array<[BuildableMoveProvider, BuildableOptimizer]>

const DEFAULT_SETUP = new Map(DEFAULT_PROVIDER_EXECUTORS)

const DEFAULT_OPTIMIZATION = new Map(DEFAULT_OPTIMIZERS)

// Temp typing.
type PathInfo = Path
type PathGenerator = AsyncGenerator<PathGeneratorResult, PathGeneratorResult | null, unknown>
interface PathGeneratorResult {
  result: PathInfo
  astarContext: AAStar<Move>
}

interface PerformOpts {
  errorOnReset?: boolean
  errorOnAbort?: boolean
}

interface HandlerOpts {
  world?: CacheSyncWorld
  movements?: MovementSetup
  optimizers?: OptimizationSetup
  moveSettings?: MovementOptions
  pathfinderSettings?: PathfinderOptions
}

/**
 * Per-bot specific pathfinder handling.
 */
export class PathfinderHandler {
  astar: AStar | null
  world: World
  movements: ExecutorMap
  optimizers: OptimizationMap
  defaultMoveSettings: MovementOptions
  pathfinderSettings: PathfinderOptions

  private readonly currentIndex = 0
  private readonly executeTask: Task<void, void> = Task.createDoneTask()
  private readonly wantedGoal?: goals.Goal
  public abortCalculation = false
  private userAborted = false

  private currentGotoGoal?: goals.Goal
  private curPath?: Move[]
  private currentMove?: Move
  private currentExecutor?: MovementExecutor

  private resetReason?: ResetReason
  private _currentProducer?: PathProducer

  public get currentAStar (): AStar | undefined {
    return this._currentProducer?.getAstarContext()
  }

  public get currentProducer (): PathProducer | undefined {
    return this._currentProducer
  }

  public get isPathing (): boolean {
    return this.executeTask.done
  }

  reconstructPath = reconstructPath

  constructor (private readonly bot: Bot, opts: HandlerOpts = {}) {
    this.world = opts.world ?? new CacheSyncWorld(bot, bot.world)
    const moveSettings = opts.moveSettings ?? DEFAULT_MOVEMENT_OPTS
    const pathfinderSettings = opts.pathfinderSettings ?? DEFAULT_PATHFINDER_OPTS

    const optimizers = opts.optimizers ?? DEFAULT_OPTIMIZATION
    const moveSetup = opts.movements ?? DEFAULT_SETUP

    this.world = new CacheSyncWorld(bot, this.bot.world)

    // set up executors, map them to providers.
    const moves = new Map<BuildableMoveProvider, MovementExecutor>()
    for (const [providerType, ExecutorType] of moveSetup) {
      moves.set(providerType, new ExecutorType(bot, this.world, moveSettings))
    }

    // set up optimizers, map them to providers.
    const opts2 = new Map<BuildableMoveProvider, MovementOptimizer>()
    for (const [providerType, ExecutorType] of optimizers) {
      opts2.set(providerType, new ExecutorType(bot, this.world))
    }
    this.movements = moves
    this.optimizers = opts2
    this.defaultMoveSettings = moveSettings
    this.pathfinderSettings = pathfinderSettings
    this.astar = null

    this.setupListeners()
  }

  // setters

  setExecutor (provider: BuildableMoveProvider, Executor: BuildableMoveExecutor | MovementExecutor): void {
    if (Executor instanceof MovementExecutor) {
      this.movements.set(provider, Executor)
    } else {
      this.movements.set(provider, new Executor(this.bot, this.world, this.defaultMoveSettings))
    }
  }

  setOptimizer (provider: BuildableMoveProvider, Optimizer: BuildableOptimizer | MovementOptimizer): void {
    if (Optimizer instanceof MovementOptimizer) {
      this.optimizers.set(provider, Optimizer)
    } else {
      this.optimizers.set(provider, new Optimizer(this.bot, this.world))
    }
  }

  setMoveOptions (settings: Partial<MovementOptions>): void {
    this.defaultMoveSettings = Object.assign({}, DEFAULT_MOVEMENT_OPTS, settings)
    for (const [, executor] of this.movements) {
      executor.settings = this.defaultMoveSettings
    }
  }

  setOptions (settings: Partial<PathfinderOptions>): void {
    this.pathfinderSettings = Object.assign({}, DEFAULT_PATHFINDER_OPTS, settings)
  }

  dropMovment (provider: BuildableMoveProvider): void {
    this.movements.delete(provider)

    // will keep in optimizers as that has no effect.
    // this.optimizers.delete(provider);
  }

  dropAllMovements (): void {
    this.movements.clear()
  }

  // util functions

  async cancel (): Promise<void> {
    this.userAborted = true
    await this.interrupt(1000, true)
  }

  async interrupt (timeout = 1000, cancelCalculation = true, reasonStr?: ResetReason): Promise<void> {
  console.log('INTERRUPT CALLED')
    if (this._currentProducer == null) return console.log('no producer')
    this.abortCalculation = cancelCalculation

    if (this.currentExecutor == null) return console.log('no executor')
    // if (this.currentExecutor.aborted) return console.trace('already aborted')
    if (this.currentMove == null) throw new Error('No current move, but there is a current executor.')

    let reason
    if (reasonStr != null) {
      switch (reasonStr) {
        case 'blockUpdate':
          reason = new ResetError('blockUpdate')
          break
        case 'chunkLoad':
          reason = new ResetError('chunkLoad')
          break
        case 'goalUpdated':
          reason = new ResetError('goalUpdated')
          break
      }
    }
    this.resetReason = reasonStr
    await this.currentExecutor.abort(this.currentMove, { timeout, reason })

    // calling cleanupAll is not necessary as the end of goto already calls it.
  }

  async reset (reason: ResetReason, cancelTimeout = 1000): Promise<void> {
    this.bot.emit('resetPath', reason)
    await this.interrupt(cancelTimeout, true, reason)
  }

  // Listener setup

  setupListeners (): void {
    // this can be done once.
    this.bot.on('blockUpdate', (oldblock, newBlock: Block | null) => {
      if (oldblock == null || newBlock == null) return

      // TODO: sync to calculation phase as well. Not just execution time.
      if (this.curPath == null) return

      if (this.updateMatchesWanted(newBlock)) return // ignore due to matching

      if (this.isPositionNearPath(oldblock.position) && oldblock.type !== newBlock.type) {
        void this.reset('blockUpdate')
      }
    })

    this.bot.on('chunkColumnLoad', (chunk) => {
      const astarContext = this.currentAStar
      if (astarContext == null) return
      const cx = chunk.x >> 4
      const cz = chunk.z >> 4
      if (
        astarContext.visitedChunks.has(`${cx - 1},${cz}`) ||
        astarContext.visitedChunks.has(`${cx},${cz - 1}`) ||
        astarContext.visitedChunks.has(`${cx + 1},${cz}`) ||
        astarContext.visitedChunks.has(`${cx},${cz + 1}`)
      ) {
        void this.reset('chunkLoad')
      }
    })
  }

  public updateMatchesWanted (block: Block | null, path: Move[] | undefined = this.curPath): boolean {
    if (block == null || path == null) return false

    const pos = block.position.floored()
    for (let i = this.currentIndex; i < path.length; i++) {
      const move = path[i]
      for (const place of move.toPlace) {
        if (place.vec.equals(pos)) {
          switch (place.type) {
            case 'solid':
              return block.boundingBox === 'block'
            case 'water':
              return BlockInfo.waters.has(block.type)
            case 'replaceable':
              // should never happen.
              return BlockInfo.replaceables.has(block.type)
          }
        }
      }

      for (const br of move.toBreak) {
        if (br.vec.equals(pos)) {
          return block.boundingBox === 'empty' && !BlockInfo.liquids.has(block.type)
        }
      }
    }

    return false
  }

  /**
   * Gen here, I don't like this code. this is temporary.
   * Taken from: https://github.com/PrismarineJS/mineflayer-pathfinder/blob/d69a02904bc83f4c36598ae90d470a009a130105/index.js#L237
   */
  isPositionNearPath (pos: Vec3 | undefined, path: Move[] | undefined = this.curPath): boolean {
    // console.log('pos:', pos, 'path:', path?.length)

    if (pos == null || path == null) return false

    for (const move of path) {
      let comparisonPoint: Vec3 | null = null

      comparisonPoint = closestPointOnLineSegment(pos, move.entryPos, move.exitPos)

      const dx = Math.abs(comparisonPoint.x - pos.x - 0.5)
      const dy = Math.abs(comparisonPoint.y - pos.y - 0.5)
      const dz = Math.abs(comparisonPoint.z - pos.z - 0.5)

      // console.log(comparisonPoint, dx, dy, dz, pos)
      if (dx <= 1 && dy <= 2 && dz <= 1) {
        return true
      }
    }

    return false
  }

  // register all appropiate listeners for a dynamic goal.

  private registerAll (
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

      // clear other listeners as well.
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

      // clear other listeners as well.
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
        if (this.userAborted) return cleanup()
        if (boundEvent(key, ...args)) newOnHasUpdate()
      }
      this.bot.on(key, listener)
      fuckEvent.push([key, listener])
    }

    for (const key of goal._validKeys) {
      const listener1 = (...args: Parameters<BotEvents[keyof BotEvents]>): void => {
        if (this.userAborted) return cleanup()
        if (boundValid(key, ...args)) newOnInvalid()
      }
      this.bot.on(key, listener1)
      fuckValid.push([key, listener1])
    }

    // potential bug fixed with this.
    goal.cleanup = cleanup

    return cleanup
  }

  // utility for identifying where partial paths merge

  async perform () {}

  // path getting utilities

  getPathTo (goal: goals.Goal, settings = this.defaultMoveSettings): PathGenerator {
    return this.getPathFromTo(this.bot.entity.position, this.bot.entity.velocity, goal, settings)
  }

  async * getPathFromTo (startPos: Vec3, startVel: Vec3, goal: goals.Goal, settings = this.defaultMoveSettings): PathGenerator {
    this.abortCalculation = false
    delete this.resetReason

    this.currentMove = Move.startMove(
      new IdleMovement(this.bot, this.world),
      startPos.clone(),
      startVel.clone(),
      getScaffoldCount(this.bot)
    )
    this.currentExecutor = new IdleMovementExecutor(this.bot, this.world, this.defaultMoveSettings)

    // technically introducing a bug here, where resetting the pathingUtil fucks up.
    this.bot.pathingUtil.refresh()

    if (this.pathfinderSettings.partialPathProducer) {
      this._currentProducer = new PartialPathProducer(this.currentMove, goal, settings, this.bot, this.world, this.movements)
    } else {
      this._currentProducer = new ContinuousPathProducer(this.currentMove, goal, settings, this.bot, this.world, this.movements)
    }

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
      console.log('locality %', (MovementHandler.count / MovementHandler.totCount) * 100)
        MovementHandler.count = 0
        MovementHandler.totCount = 0
        yield { result, astarContext }
        return { result, astarContext }
      }

      if (this.abortCalculation) {
        cleanup()
        result.status === 'canceled'
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
    return {
      result,
      astarContext
    }
  }

  async getPathFromToRaw (startPos: Vec3, startVel: Vec3, goal: goals.Goal): Promise<PathInfo | null> {
    for await (const res of this.getPathFromTo(startPos, startVel, goal)) {
      if (res.result.status !== 'success') {
        if (res.result.status === 'noPath' || res.result.status === 'timeout') return null
      } else {
        return res.result
      }
    }
    return null
  }

  private async postProcess (pathInfo: Path): Promise<Path> {
    const optimizer = new Optimizer(this.bot, this.world, this.optimizers)

    optimizer.loadPath(pathInfo.path)

    const res = await optimizer.compute()

    const ret = { ...pathInfo }

    ret.path = res
    return ret
  }

  async cleanupBot (): Promise<void> {
    this.bot.clearControlStates()

    for (const [, executor] of this.movements) {
      executor.reset()
    }
    // await this.bot.waitForTicks(1);
  }

  cleanupClient (): void {
    this.abortCalculation = false
    this.userAborted = false

    delete this.resetReason

    delete this.currentGotoGoal
    delete this.curPath
    delete this.currentMove
    delete this.currentExecutor
  }

  async cleanupAll (goal: goals.Goal, lastMove?: MovementExecutor): Promise<void> {
    if (goal instanceof goals.GoalDynamic && goal.dynamic) {
      goal.cleanup?.()
    }

    await this.cleanupBot()
    if (lastMove != null && !this.abortCalculation) await goal.onFinish(lastMove)
    await this.cleanupBot()
    this.world.cleanup?.()

  console.log('CLEANUP CALLED')

    if (this.userAborted) this.bot.emit('goalAborted', goal)
    else this.bot.emit('goalFinished', goal)

    this.abortCalculation = false
    this.userAborted = false
    this.executeTask.finish()

    this.cleanupClient()
  }
}

class Perform {
  public currentIndex = 0
  public curPath: Move[] = [];

  constructor (private readonly bot: Bot, private readonly handler: PathfinderHandler, public readonly goal: goals.Goal) {}

  async perform (): Promise<void> {
    while (this.currentIndex < this.curPath.length) {
        const move = this.curPath[this.currentIndex]
        const executor = this.handler.movements.get(move.moveType.constructor as BuildableMoveProvider)
        if (executor == null) throw new Error('No executor for move type.')

        // this.handler.currentMove = move
        // this.handler.currentExecutor = executor

        try {
          await executor.perform(move, this.currentIndex, this.curPath);
        } catch (err) {
          if (err instanceof AbortError) {
            return
          } else if (err instanceof ResetError) {
            return
          }else if (err instanceof CancelError) {
            this.identRecover();
            return
          } else {
            throw err
          }
        }
    }



  }

  async identRecover (): Promise<void> {}

  /**
   * Given that the current path is partial and not a whole path,
   * We may want to extend said path to have better execution.
   * However, the overlap may not be clean.
   *
   * This function must update the global path and the current index to match the new path.
   */
  updatePerformPath (newPath: Move[]): void {
    if (this.curPath == null) return

    // due to the nature of our partial paths, all new paths must be longer than the current path.
    if (newPath.length < this.curPath.length) throw new Error('new path is shorter than current path')
 



    for (let i = this.curPath.length - 1; i >= 0; i--) {
      const move = this.curPath[i]

      // we want the overlap to be the first move of the new path.
      if (!move.entryPos.equals(newPath[0].entryPos)) continue

      // if i is greater than current index, then merge is clean as we have not passed the overlap index.
      if (i > this.currentIndex) {
        // include current node 
        this.curPath = this.curPath.slice(0, i+1).concat(newPath.slice(1))
      }
      // we are already perfoming the move where overlap occurs.
      else if (i == this.currentIndex) {
        if (this.curPath[i].exitPos.equals(newPath[0].entryPos)) this.curPath = this.curPath.slice(0, i).concat(newPath)
        else throw new Error('overlap is not clean')
      }
      // TODO: handle
      else if (i < this.currentIndex) throw new Error('overlap is not clean')
    }
  }
}
