import { Bot } from 'mineflayer'
import { PathProducer, AStar } from '../../mineflayer-specific/algs'
import * as goals from '../goals'
import { Move } from '../move'
import { ExecutorMap, MovementHandler, MovementOptions } from '../movements'
import { World } from '../world/worldInterface'
import { AdvanceRes } from '.'

export class ContinuousPathProducer implements PathProducer {
  private readonly start: Move
  private readonly goal: goals.Goal
  private readonly settings: MovementOptions
  private readonly bot: Bot
  private readonly world: World
  private readonly movements: ExecutorMap
  private astarContext: AStar | undefined
  private _currentPath: Move[] = []

  private readonly gcInterval: number = 10
  private lastGc: number = 0
  private readonly lastStartTime = performance.now()
  constructor (start: Move, goal: goals.Goal, settings: MovementOptions, bot: Bot, world: World, movements: ExecutorMap) {
    this.start = start
    this.goal = goal
    this.settings = settings
    this.bot = bot
    this.world = world
    this.movements = movements
  }

  getAstarContext (): AStar | undefined {
    return this.astarContext
  }

  getCurrentPath (): Move[] {
    return this._currentPath
  }

  advance (): AdvanceRes {
    if (this.astarContext == null) {
      const moveHandler = MovementHandler.create(this.bot, this.world, this.movements, this.settings)
      moveHandler.loadGoal(this.goal)

      this.astarContext = new AStar(this.start, moveHandler, this.goal, -1, 40, -1, 0)
    }

    const result = this.astarContext.compute()
    this._currentPath = result.path

    // console.log('advancing!')

    if (global.gc != null && ++this.lastGc % this.gcInterval === 0) {
      // const starttime = performance.now()

      if (this.lastGc % (this.gcInterval * 10) === 0) {
        // global.gc();
      } else {
        (global as any).gc(true)
      }

      // console.log('Garbage collection took', performance.now() - starttime, 'ms')
    } else {
      // console.log('Garbage collection unavailable.  Pass --expose-gc '
      //   + 'when launching node to enable forced garbage collection.');
    }

    // debug all same info in partialPathProducer

    const cost = this.astarContext?.bestNode?.g ?? 0
    const nodecount = this.astarContext?.nodeConsiderCount ?? 0
    const seensize = this.astarContext?.closedDataSet.size ?? 0
    const movecount = this.astarContext?.moveConsiderCount ?? 0

    const time1 = performance.now() - this.lastStartTime

    // console.log('\nthis iter:', time1)
    // console.log('itered considered nodes', nodecount, 'nodes/s', (nodecount / time1) * 1000)
    // console.log('itered seen size', seensize, 'nodes/s', (seensize / time1) * 1000)
    // console.log('itered move considered', movecount, 'nodes/s', (movecount / time1) * 1000)

    // console.log('locality %', (MovementHandler.count / MovementHandler.totCount) * 100)
    // console.log('cost', cost)
    // console.log('path length', result.path.length)
    // this.lastStartTime = performance.now()
    // const time = performance.now() - this.startTime
    // console.log('\ntotal', time, 'ms')
    // console.log('total considered nodes', this.consideredNodeCount, time, (this.consideredNodeCount / time) * 1000, 'nodes/s')
    // console.log('total seen size', this.latestClosedNodeCount, time, (this.latestClosedNodeCount / time) * 1000, 'nodes/s')
    // console.log('total move considered', this.latestMoveCount, time, (this.latestMoveCount / time) * 1000, 'nodes/s')

    return { result, astarContext: this.astarContext }
  }
}
