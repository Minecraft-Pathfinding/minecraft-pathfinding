import { Bot } from 'mineflayer'
import { AStar as AAStar } from './abstract/algorithms/astar'
import { AStar } from './mineflayer-specific/algs'
import * as goals from './mineflayer-specific/goals'
import { Vec3 } from 'vec3'
import { Move } from './mineflayer-specific/move'
import { Path, Algorithm } from './abstract'
import { BlockInfo, CacheSyncWorld } from './mineflayer-specific/world/cacheWorld'
import { AbortError, CancelError } from './mineflayer-specific/movements/exceptions'
import {
  BuildableMoveExecutor,
  BuildableMoveProvider,
  MovementHandler,
  MovementOptions,
  MovementSetup,
  ExecutorMap,
  ParkourForward,
  ParkourForwardExecutor,
  MovementExecutor,
  Diagonal,
  Forward,
  ForwardDropDown,
  ForwardJump,
  IdleMovement,
  StraightDown,
  StraightUp,
  ForwardDropDownExecutor,
  ForwardExecutor,
  ForwardJumpExecutor,
  StraightDownExecutor,
  StraightUpExecutor,
  DEFAULT_MOVEMENT_OPTS
} from './mineflayer-specific/movements'
import { DropDownOpt, ForwardJumpUpOpt, StraightAheadOpt } from './mineflayer-specific/post/optimizers'
import { BuildableOptimizer, OptimizationSetup, MovementOptimizer, OptimizationMap, Optimizer } from './mineflayer-specific/post'
import { ContinuousPathProducer, PartialPathProducer } from './mineflayer-specific/pathProducers'

export interface PathfinderOptions {
  partialPathProducer: boolean
}

const DEFAULT_PATHFINDER_OPTS: PathfinderOptions = {
  partialPathProducer: false
}

const EMPTY_VEC = new Vec3(0, 0, 0)

/**
 * These are the default movement types and their respective executors.
 */
const DEFAULT_PROVIDER_EXECUTORS = [
  [Forward, ForwardExecutor],
  [ForwardJump, ForwardJumpExecutor],
  [ForwardDropDown, ForwardDropDownExecutor],
  [Diagonal, ForwardExecutor],
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
type PathInfo = Path<Move, AAStar<Move>>
type PathGenerator = AsyncGenerator<
{
  result: PathInfo
  astarContext: AAStar<Move>
},
void,
unknown
>

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
  world: CacheSyncWorld
  movements: ExecutorMap
  optimizers: OptimizationMap
  defaultMoveSettings: MovementOptions
  pathfinderSettings: PathfinderOptions

  public executing = false
  public cancelCalculation = false
  private currentMove?: Move
  public currentExecutor?: MovementExecutor

  constructor (
    private readonly bot: Bot,
    movements?: MovementSetup,
    optimizers?: OptimizationSetup,
    moveSettings: MovementOptions = DEFAULT_MOVEMENT_OPTS,
    pathfinderSettings: PathfinderOptions = DEFAULT_PATHFINDER_OPTS
  ) {
    this.world = new CacheSyncWorld(bot, this.bot.world)

    // set up executors, map them to providers.
    const moves = new Map<BuildableMoveProvider, MovementExecutor>()
    for (const [providerType, ExecutorType] of movements ?? DEFAULT_SETUP) {
      moves.set(providerType, new ExecutorType(bot, this.world, moveSettings))
    }

    // set up optimizers, map them to providers.
    const opts = new Map<BuildableMoveProvider, MovementOptimizer>()
    for (const [providerType, ExecutorType] of optimizers ?? DEFAULT_OPTIMIZATION) {
      opts.set(providerType, new ExecutorType(bot, this.world))
    }
    this.movements = moves
    this.optimizers = opts
    this.defaultMoveSettings = moveSettings
    this.pathfinderSettings = pathfinderSettings
    this.astar = null
  }

  async cancel (timeout = 1000): Promise<void> {
    this.cancelCalculation = true

    if (this.currentExecutor == null) return
    if (this.currentMove == null) throw new Error('No current move, but there is a current executor.')

    await this.currentExecutor.abort(this.currentMove, timeout)
  }

  getCacheSize (): string {
    return this.world.getCacheSize()
  }

  setCacheEnabled (enabled: boolean): void {
    this.world.setEnabled(enabled)
  }

  isCacheEnabled (): boolean {
    return this.world.enabled
  }

  dropMovment (provider: BuildableMoveProvider): void {
    this.movements.delete(provider)

    // will keep in optimizers as that has no effect.
    // this.optimizers.delete(provider);
  }

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

  setDefaultMoveOptions (settings: Partial<MovementOptions>): void {
    this.defaultMoveSettings = Object.assign({}, DEFAULT_MOVEMENT_OPTS, settings)
    for (const [, executor] of this.movements) {
      executor.settings = this.defaultMoveSettings
    }
  }

  setPathfinderOptions (settings: Partial<PathfinderOptions>): void {
    this.pathfinderSettings = Object.assign({}, DEFAULT_PATHFINDER_OPTS, settings)
  }

  getPathTo (goal: goals.Goal, settings = this.defaultMoveSettings): PathGenerator {
    return this.getPathFromTo(this.bot.entity.position, this.bot.entity.velocity, goal, settings)
  }

  getScaffoldCount (): number {
    const amt = this.bot.inventory
      .items()
      .reduce((acc, item) => (BlockInfo.scaffoldingBlockItems.has(item.type) ? item.count + acc : acc), 0)
    if (this.bot.game.gameMode === 'creative') {
      return amt > 0 ? Infinity : 0
    }
    return amt
  }

  async * getPathFromTo (startPos: Vec3, startVel: Vec3, goal: goals.Goal, settings = this.defaultMoveSettings): PathGenerator {
    this.cancelCalculation = false
    const move = Move.startMove(new IdleMovement(this.bot, this.world), startPos.clone(), startVel.clone(), this.getScaffoldCount())

    // technically introducing a bug here, where resetting the pathingUtil fucks up.
    this.bot.pathingUtil.refresh()

    let foo

    if (this.pathfinderSettings.partialPathProducer) {
      foo = new PartialPathProducer(move, goal, settings, this.bot, this.world, this.movements)
    } else {
      foo = new ContinuousPathProducer(move, goal, settings, this.bot, this.world, this.movements)
    }

    let { result, astarContext } = foo.advance()

    yield { result, astarContext }

    let ticked = false
    const listener = (): void => {
      ticked = true
    }
    this.bot.on('physicsTick', listener)

    while (result.status === 'partial') {
      if (this.cancelCalculation) {
        console.log('cancelling!')
        return
      }

      const { result: result2, astarContext } = foo.advance()
      result = result2

      if (result.status === 'success') {
        yield { result, astarContext }
        break
      }
      yield { result, astarContext }

      // allow bot to function even while calculating.
      // Note: if we already ticked, there is no point in waiting. Our packets are already desynced.
      if (!ticked) {
        await this.bot.waitForTicks(1)
        ticked = false
      }
    }
    this.bot.off('physicsTick', listener)
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

  async goto (goal: goals.Goal): Promise<void> {
    // if (this.executing) throw new Error('Already executing!')
    if (this.executing) {
      await this.cancel()
    }
    this.executing = true

    for await (const res of this.getPathTo(goal)) {
      if (res.result.status !== 'success') {
        if (res.result.status === 'noPath' || res.result.status === 'timeout') break
      } else {
        const newPath = await this.postProcess(res.result)
        await this.perform(newPath, goal)
      }
    }
    await this.cleanupAll(goal)
  }

  private async postProcess (pathInfo: Path<Move, Algorithm<Move>>): Promise<Path<Move, Algorithm<Move>>> {
    const optimizer = new Optimizer(this.bot, this.world, this.optimizers)

    optimizer.loadPath(pathInfo.path)

    const res = await optimizer.compute()

    const ret = { ...pathInfo }

    ret.path = res
    return ret
  }

  /**
   * Do not mind the absolutely horrendous code here right now.
   * It will be fixed, just very busy right now.
   * @param path
   * @param goal
   * @param entry
   */
  async perform (path: Path<Move, Algorithm<Move>>, goal: goals.Goal, entry = 0): Promise<void> {
    if (entry > 10) throw new Error('Too many failures, exiting performing.')

    let currentIndex = 0
    const movementHandler = path.context.movementProvider as MovementHandler
    const movements = movementHandler.getMovements()

    // eslint-disable-next-line no-labels
    outer: while (currentIndex < path.path.length) {
      const move = path.path[currentIndex]
      const executor = movements.get(move.moveType.constructor as BuildableMoveProvider)
      if (executor == null) throw new Error('No executor for movement type ' + move.moveType.constructor.name)

      this.currentMove = move
      this.currentExecutor = executor

      let tickCount = 0

      // TODO: could move this to physicsTick to be performant, but meh who cares.

      // reset bot.
      await this.cleanupBot()

      // provide current move to executor as a reference.
      executor.loadMove(move)

      // if the movement has already been completed (another movement has already completed it), skip it.
      if (executor.isAlreadyCompleted(move, tickCount, goal)) {
        currentIndex++
        continue
      }

      console.log('performing', move.moveType.constructor.name, 'at index', currentIndex, 'of', path.path.length, goal)
      console.log('toPlace', move.toPlace, 'toBreak', move.toBreak, 'entryPos', move.entryPos, 'asVec', move.asVec(), 'exitPos', move.exitPos)

      // wrap this code in a try-catch as we intentionally throw errors.
      try {
        while (!(await executor._align(move, tickCount++, goal)) && tickCount < 999) {
          await this.bot.waitForTicks(1)
        }

        tickCount = 0

        // allow the initial execution of this code.
        await executor._performInit(move, currentIndex, path.path)

        let adding = await executor._performPerTick(move, tickCount++, currentIndex, path.path)

        while (!(adding as boolean) && tickCount < 999) {
          await this.bot.waitForTicks(1)
          adding = await executor._performPerTick(move, tickCount++, currentIndex, path.path)
        }

        currentIndex += adding as number
      } catch (err) {
        // immediately exit since we want to abort the entire path.
        if (err instanceof AbortError) {
          this.currentExecutor.reset()

          // eslint-disable-next-line no-labels
          break outer
        } else if (err instanceof CancelError) {
          // allow recovery if movement intentionall canceled.
          await this.recovery(move, path, goal, entry)

          // eslint-disable-next-line no-labels
          break outer
        } else throw err
      }
    }
  }

  // TODO: implement recovery for any movement and goal.
  async recovery (move: Move, path: Path<Move, Algorithm<Move>>, goal: goals.Goal, entry = 0): Promise<void> {
    await this.cleanupBot()

    const ind = path.path.indexOf(move)
    if (ind === -1) {
      return // done
    }

    let newGoal

    const pos = this.bot.entity.position
    let bad = false
    let nextMove = path.path.sort((a, b) => a.entryPos.distanceTo(pos) - b.entryPos.distanceTo(pos))[0] as Move | undefined
    if ((nextMove == null) || path.path.indexOf(nextMove) < ind) { bad = true } else if (path.path.indexOf(nextMove) === ind) {
      nextMove = path.path[ind + 1]
    }

    const no = entry > 0 || bad
    if (no || nextMove == null) {
      newGoal = goal
    } else {
      newGoal = goals.GoalBlock.fromVec(nextMove.asVec())
    }

    const path1 = await this.getPathFromToRaw(this.bot.entity.position, EMPTY_VEC, newGoal)
    if (path1 === null) {
      // done
    } else if (no) {
      // execution of past recoveries failed or not easily saveable, so full recovery needed.
      await this.perform(path1, goal, entry + 1)
    } else {
      // attempt recovery to nearby node.
      await this.perform(path1, newGoal, entry + 1)
      path.path.splice(0, ind+1)
      await this.perform(path, goal, 0)
    }
  }

  async cleanupBot (): Promise<void> {
    this.bot.clearControlStates()
    // await this.bot.waitForTicks(1);
  }

  async cleanupAll (goal: goals.Goal): Promise<void> {
    await this.cleanupBot()
    await goal.onFinish(this.bot)
    this.bot.chat(this.world.getCacheSize())
    this.world.clearCache()
    this.executing = false

    delete this.currentMove
    delete this.currentExecutor
  }
}
