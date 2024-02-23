import { Bot } from 'mineflayer'
import { PathProducer, AStar } from '../../mineflayer-specific/algs'
import * as goals from '../goals'
import { Move } from '../move'
import { ExecutorMap, MovementHandler, MovementOptions } from '../movements'
import { World } from '../world/worldInterface'
import { AdvanceRes } from '.'

export class PartialPathProducer implements PathProducer {
  private readonly start: Move
  private readonly goal: goals.Goal
  private readonly settings: MovementOptions
  private readonly bot: Bot
  private readonly world: World
  private readonly movements: ExecutorMap
  private latestMove: Move | undefined
  private readonly latestMoves: Move[] = []

  private latestClosedNodeCount: number = 0
  private latestCost: number = 0
  private lastPath: Move[] = []

  private readonly gcInterval: number = 10
  private readonly lastGc: number = 0

  private readonly startTime = performance.now()
  private lastStartTime = performance.now()
  consideredNodeCount: number = 0
  latestMoveCount: number = 0
  // private readonly maxPathLen: number = 30

  private _lastContext: AStar | undefined

  public get maxPathLength (): number {
    return this.bot.pathfinder.pathfinderSettings.partialPathLength
  }

  public get lastAstarContext (): AStar | undefined {
    return this._lastContext
  }

  constructor (start: Move, goal: goals.Goal, settings: MovementOptions, bot: Bot, world: World, movements: ExecutorMap) {
    this.start = start
    this.goal = goal
    this.settings = settings
    this.bot = bot
    this.world = world
    this.movements = movements
  }

  getAstarContext (): AStar | undefined {
    return this._lastContext
  }

  private getSliceLen (orgLen: number): number {
    return Math.min(orgLen - 1, Math.floor(orgLen * 0.9))
  }

  private handleAstarContext (foundPathLen: number, maxPathLen = this.maxPathLength): AStar | undefined {
    // if the path length is less than 50, return the previous astar context.
    // otherwise, return a new one.

    if (this._lastContext != null && foundPathLen <= maxPathLen) {
      return this._lastContext
    }

    return this.generateAstarContext()
  }

  private generateAstarContext (): AStar {
    const moveHandler = MovementHandler.create(this.bot, this.world, this.movements, this.settings)
    moveHandler.loadGoal(this.goal)

    let start
    if (this.latestMove != null) {
      start = this.latestMove
    } else {
      start = this.start
    }

    // const lastClosedSet = this.lastAstarContext != null ? this.lastAstarContext.closedDataSet : new Set<string>()
    const ret = new AStar(start, moveHandler, this.goal, -1, 40, -1, 0)

    // ret.closedDataSet = lastClosedSet
    return ret
  }

  advance (): AdvanceRes {
    if (this._lastContext == null) this._lastContext = this.generateAstarContext()

    const result = this._lastContext.compute()

    let status = result.status

    if (result.status === 'noPath') {
      this.latestMoves.pop()

      if (this.latestMoves.length === 0) {
        const astarContext = this._lastContext
        delete this._lastContext
        return {
          result: {
            ...result,
            status,
            cost: this.latestCost,
            path: this.lastPath
          },
          astarContext
        }
      }
    }

    if (result.path.length > this.maxPathLength || result.status === 'success') {
      status = status === 'success' ? 'success' : 'partialSuccess'

      // const val = result.path.length - 1
      const val = this.getSliceLen(result.path.length)
      this.latestMove = result.path[val]
      const toTake = result.path.slice(0, val + 1)
      this.latestMoves.push(this.latestMove)
      this.lastPath = [...this.lastPath, ...toTake]

      const cost = toTake.reduce((acc, move) => acc + move.cost, 0)
      const nodecount = this._lastContext?.nodeConsiderCount ?? 0
      const seensize = this._lastContext?.closedDataSet.size ?? 0
      const movecount = this._lastContext?.moveConsiderCount ?? 0

      this.latestCost += cost
      this.consideredNodeCount += nodecount
      this.latestClosedNodeCount += seensize
      this.latestMoveCount += movecount
      console.info('Partial Path cost increased by', cost, 'to', this.latestCost, 'total', this.latestMove?.vec)

      const time1 = performance.now() - this.lastStartTime
      console.log('\nthis iter:', time1)
      console.log('itered considered nodes', nodecount, 'nodes/s', (nodecount / time1) * 1000)
      console.log('itered seen size', seensize, 'nodes/s', (seensize / time1) * 1000)
      console.log('itered move considered', movecount, 'nodes/s', (movecount / time1) * 1000)

      this.lastStartTime = performance.now()
      const time = performance.now() - this.startTime
      console.log('\ntotal', time, 'ms')
      console.log('total considered nodes', this.consideredNodeCount, time, (this.consideredNodeCount / time) * 1000, 'nodes/s')
      console.log('total seen size', this.latestClosedNodeCount, time, (this.latestClosedNodeCount / time) * 1000, 'nodes/s')
      console.log('total move considered', this.latestMoveCount, time, (this.latestMoveCount / time) * 1000, 'nodes/s')
    }

    // console.log(result.path.length, 'found path length', this.lastPath.length, 'total length', this.lastPath.map(p => p.entryPos.toString()), this.lastPath[this.lastPath.length - 1].entryPos)
    const ret = {
      result: {
        ...result,
        status,
        cost: this.latestCost,
        path: this.lastPath
      },
      astarContext: this._lastContext
    }

    this._lastContext = this.handleAstarContext(result.path.length)

    return ret
  }

  private mergePathspath (path1: Move[], path2: Move[]): void {
    let newPath = path1
    for (let i = 0; i < path2.length; i++) {
      if (path1[i] === undefined) {
        newPath = newPath.concat(path2.slice(i))
        break
      }
      if (path1[i].exitPos.distanceTo(path2[i].entryPos) > 0.5) {
        newPath = newPath.concat(path2.slice(i))
        break
      }
    }
  }
}
