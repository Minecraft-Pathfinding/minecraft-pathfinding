import { Bot, BotEvents } from 'mineflayer'
import { AStarBackOff as AAStar } from './abstract/algorithms/astar'
import { AStar, OptPath, Path, PathProducer } from './mineflayer-specific/algs'
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
import { DropDownOpt, ForwardJumpUpOpt, LandStraightAheadOpt } from './mineflayer-specific/post/optimizers'
import { BuildableOptimizer, MovementOptimizer, OptimizationMap, Optimizer } from './mineflayer-specific/post'
import { ContinuousPathProducer, PartialPathProducer } from './mineflayer-specific/pathProducers'
import { Block, HandlerOpts, ResetReason } from './types'
import { Task } from '@nxg-org/mineflayer-util-plugin'

import { reconstructPath } from './abstract/algorithms'
import { closestPointOnLineSegment, getScaffoldCount, getNormalizedPos } from './utils'
import { World } from './mineflayer-specific/world/worldInterface'

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
  [Forward, LandStraightAheadOpt],
  [Diagonal, LandStraightAheadOpt],
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

/**
 * Eventually, I want all pathfinder logic entirely off thread.
 *
 * This means that the pathfinder will be able to calculate paths while the bot is doing other things.
 *
 * However, this is not the case right now, as prismarine-world needs a rewrite
 * and eventually, this pathfinder code will too.
 *
 * That will be a while, but remember to code this with that in mind.
 */
export class ThePathfinder {
  astar: AStar | null
  world: World
  movements: ExecutorMap
  optimizers: OptimizationMap
  defaultMoveSettings: MovementOptions
  pathfinderSettings: PathfinderOptions

  private currentIndex = 0
  private executeTask: Task<void, void> = Task.createDoneTask()
  private wantedGoal?: goals.Goal
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
    await this.interrupt(this.defaultMoveSettings.movementTimeoutMs, true)
  }

  async interrupt (timeout = this.defaultMoveSettings.movementTimeoutMs, cancelCalculation = true, reasonStr?: ResetReason): Promise<void> {
    // console.log('INTERRUPT CALLED')
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

  async reset (reason: ResetReason, cancelTimeout = this.defaultMoveSettings.movementTimeoutMs): Promise<void> {
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

    for (let i = this.currentIndex; i < path.length; i++) {
      const move = path[i]
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

  // path getting utilities

  getPathTo (goal: goals.Goal, settings = this.defaultMoveSettings): PathGenerator {
    return this.getPathFromTo(this.bot.entity.position, this.bot.entity.velocity, goal, settings)
  }

  async * getPathFromTo (startPos: Vec3, startVel: Vec3, goal: goals.Goal, settings = this.defaultMoveSettings): PathGenerator {
    this.abortCalculation = false
    delete this.resetReason

    startPos = getNormalizedPos(this.bot, startPos)

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
        // console.log('locality %', (MovementHandler.count / MovementHandler.totCount) * 100)
        MovementHandler.count = 0
        MovementHandler.totCount = 0
        yield { result, astarContext }
        return { result, astarContext }
      }

      if (this.abortCalculation) {
        cleanup()
        result.status = 'canceled'
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

  /**
   * @param {goals.Goal | null} goal
   */
  async goto (goal: goals.Goal, performOpts: PerformOpts = {}): Promise<void> {
    // console.log('GOTO CALLED')
    if (goal == null) {
      await this.cancel()
      await this.executeTask.promise
      await this.cleanupAll(goal)
      return
    }

    if (!this.executeTask.done) {
      // console.log('cancelling others')
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

    await this._goto(goal, performOpts)

    await this.cleanupAll(goal)
  }

 /**
   * Internal call.
   */
  private async _goto (goal: goals.Goal, performOpts: PerformOpts = {}): Promise<void> {
    const doForever = !!(goal instanceof goals.GoalDynamic && goal.neverfinish && goal.dynamic)

    let toWaitOn = Promise.resolve()
    let manualCleanup = (): void => {}

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
        let res1: OptPath | null = null

        for await (const res of this.getPathTo(goal)) {
          if (res.result.status !== 'success') {
            if (res.result.status === 'noPath' || res.result.status === 'timeout' || res.result.status === 'canceled') {
              if (task !== null && res1 !== null) res1.path.length = 0
              break
            }

            if (res.result.status === 'partialSuccess') {
              if (res1 === null) {
                res1 = await this.postProcess(res.result)
                task = this.perform(res1, goal).then(() => {
                  task = null
                  res1 = null
                })
              } else {
                // Splicing UNOPTIMIZED paths in place
                res1.path.length = res.result.path.length
                for (let i = 0; i < res.result.path.length; i++) {
                  res1.path[i] = res.result.path[i]
                }
                
                // Re-optimize only the remaining unoptimized path from the end of the executing move
                let sliceIdx = this.currentIndex
                if (this.currentMove) {
                  const endIdx = res1.path.findIndex((m, i) => i >= this.currentIndex && m.exitPos.equals(this.currentMove!.exitPos))
                  if (endIdx !== -1) {
                    sliceIdx = endIdx + 1
                  }
                }
                
                const optimizer = new Optimizer(this.bot, this.world, this.optimizers)
                optimizer.loadPath(res1.path.slice(sliceIdx))
                const resOpt = await optimizer.compute()
                
                // Replace the optimized array. The perform loop dynamically picks up the next correct entryPos.
                res1.optPath = resOpt
              }
            }
          } else {
            if (task === null) {
              const newPath = await this.postProcess(res.result)
              await this.perform(newPath, goal)
            } else {
              // Splicing final unoptimized path
              const res2 = res1 as OptPath
              res2.path.length = res.result.path.length
              for (let i = 0; i < res.result.path.length; i++) {
                res2.path[i] = res.result.path[i]
              }
              
              let sliceIdx = this.currentIndex
              if (this.currentMove) {
                const endIdx = res2.path.findIndex((m, i) => i >= this.currentIndex && m.exitPos.equals(this.currentMove!.exitPos))
                if (endIdx !== -1) {
                  sliceIdx = endIdx + 1
                }
              }
              
              const optimizer = new Optimizer(this.bot, this.world, this.optimizers)
              optimizer.loadPath(res2.path.slice(sliceIdx))
              const resOpt = await optimizer.compute()
              res2.optPath = resOpt

              await task
              task = null
            }

            if (performOpts.errorOnAbort != null && performOpts.errorOnAbort && this.abortCalculation) {
              throw new Error('Goto: Goal was canceled.')
            }

            if (performOpts.errorOnReset != null && performOpts.errorOnReset && this.resetReason != null) {
              throw new Error('Goto: Purposefully cancelled due to recalculation of path occurring.')
            }

            if (this.resetReason == null) {
              await this.cleanupBot()
              manualCleanup()
              setupWait()

              madeIt = true
              break
            }

            await this.cleanupBot()
            manualCleanup()
          }
        }
      } while (!this.userAborted && madeIt === false)

      await this.cleanupBot()
      if (doForever) {
        if (this.resetReason == null && !this.userAborted) {
          await toWaitOn
        }
      }
    } while (doForever && !this.userAborted)
  }

  /**
   * Performs the generated path while strictly tracking indexing via the unoptimized path. 
   */
  async perform (path: Path | OptPath, goal: goals.Goal, entry = 0): Promise<void> {
    if (entry > 10) throw new Error('Too many failures, exiting performing.')

    this.currentIndex = 0
    this.curPath = path.path
    const movementHandler = path.context.movementProvider as MovementHandler
    const movements = movementHandler.getMovements()

    while (this.currentIndex < this.curPath.length) {
      const pathEx = Object.hasOwnProperty.call(path, 'optPath') ? (path as OptPath).optPath : path.path
      
      // Select the optimized move matching the start of our current unoptimized move segment
      let move = pathEx.find(m => m.entryPos.equals(this.curPath![this.currentIndex].entryPos))
      if (!move) {
        move = this.curPath[this.currentIndex] // Fallback to unoptimized
      }

      const executor = movements.get(move.moveType.constructor as BuildableMoveProvider)
      if (executor == null) throw new Error('No executor for movement type ' + move.moveType.constructor.name)

      this.currentMove = move
      this.currentExecutor = executor

      let tickCount = 0

      await this.cleanupBot()

      executor.loadMove(move)

      if (executor.isAlreadyCompleted(move, tickCount, goal)) {
        const endIdx = this.curPath.findIndex((m, i) => i >= this.currentIndex && m.exitPos.equals(move!.exitPos))
        if (endIdx !== -1) {
          this.currentIndex = endIdx + 1
        } else {
          this.currentIndex++
        }
        continue
      }

      try {
        while (!(await executor.align(move, tickCount++, goal)) && tickCount < 999) {
          this.check()
          await this.bot.waitForTicks(1)
        }

        tickCount = 0

        await executor._performInit(move, this.currentIndex, this.curPath)

        this.check()
        let adding = await executor._performPerTick(move, tickCount++, this.currentIndex, this.curPath)

        while (!(adding as boolean) && tickCount < 999) {
          this.check()
          await this.bot.waitForTicks(1)
          adding = await executor._performPerTick(move, tickCount++, this.currentIndex, this.curPath)
        }

        // Accurately jump currentIndex to the end of the unoptimized move segments this execution consumed
        const endIdx = this.curPath.findIndex((m, i) => i >= this.currentIndex && m.exitPos.equals(move!.exitPos))
        if (endIdx !== -1) {
          this.currentIndex = endIdx + 1
        } else {
          this.currentIndex += adding as number
        }
      } catch (err) {
        if (err instanceof AbortError) {
          executor.reset()
          delete this.resetReason
          break
        } else if (err instanceof ResetError) {
          executor.reset()
          break
        } else if (err instanceof CancelError) {
          await this.recovery(move, path as Path, goal, entry)
          break
        } else throw err
      }
    }

    await this.cleanupBot()
  }

  async recovery (move: Move, path: Path, goal: goals.Goal, entry = 0): Promise<void> {
    this.bot.emit('enteredRecovery', entry)
    await this.cleanupBot()
    this.cleanupClient()

    // Using `findIndex` mapping `entryPos` fixes a bug where indexOf evaluates to -1 due to an optimized Move object mapping.
    const ind = path.path.findIndex(m => m.entryPos.equals(move.entryPos))
    if (ind === -1) {
      return // done
    }

    let newGoal

    const pos = this.bot.entity.position
    let bad = false
    // Destructured array copy avoids mutating `path.path` with `.sort()`
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

    let path1 = await this.getPathFromToRaw(this.bot.entity.position, EMPTY_VEC, newGoal)

    if (path1 === null) {
      this.bot.emit('exitedRecovery', entry)
    } else if (no) {
      const optPath1 = await this.postProcess(path1)

      this.bot.emit('exitedRecovery', entry)
      await this.perform(optPath1, goal, entry + 1)
    } else {
      const optPath1 = await this.postProcess(path1)
      await this.perform(optPath1, newGoal, entry + 1)
      path.path.splice(0, ind + 1)

      this.bot.emit('exitedRecovery', entry)
      await this.perform(path, goal, 0)
    }
  }

  private async postProcess (pathInfo: Path): Promise<OptPath> {
    const optimizer = new Optimizer(this.bot, this.world, this.optimizers)

    optimizer.loadPath(pathInfo.path)

    const res = await optimizer.compute()

    const ret = { ...pathInfo, optPath: res }

    return ret
  }

  private check (): void {
    if (this.userAborted) {
      throw new AbortError('User cancelled.')
    }

    if (this.resetReason != null) {
      throw new ResetError(this.resetReason)
    }
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

  async cleanupAll (goal: goals.Goal, executor = this.currentExecutor): Promise<void> {
    if (goal instanceof goals.GoalDynamic && goal.dynamic) {
      goal.cleanup?.()
    }

    await this.cleanupBot()
    if (executor != null) {
      await goal.onFinish(executor)
      await this.cleanupBot()
    }
    // this.bot.chat(this.world.getCacheSize())
    this.world.cleanup?.()

    // console.log('CLEANUP CALLED')

    if (this.userAborted) this.bot.emit('goalAborted', goal)
    else this.bot.emit('goalFinished', goal)

    this.abortCalculation = false
    this.userAborted = false
    this.executeTask.finish()

    this.cleanupClient()
  }
}
