import { Bot } from 'mineflayer'
import { PathProducer, AStar } from '../../mineflayer-specific/algs'
import * as goals from '../goals'
import { Move } from '../move'
import type { ExecutorMap, MovementOptions } from '../movements'
import { MovementHandler } from '../movements'
import { World } from '../world/worldInterface'
import { AdvanceRes } from '.'

const debug = require('debug')
const log = debug('minecraft-pathfindng:pathProducer')

export class PartialPathProducer implements PathProducer {
  private readonly start: Move
  private readonly goal: goals.Goal
  private readonly settings: MovementOptions
  private readonly bot: Bot
  private readonly world: World
  private readonly movements: ExecutorMap
  private latestMove: Move | undefined
  private readonly latestMoves: Move[] = []

  private latestCost: number = 0
  private lastPath: Move[] = []

  private readonly startTime = performance.now()
  private lastStartTime = performance.now()
  consideredNodeCount: number = 0
  latestClosedNodeCount: number = 0
  latestMoveCount: number = 0

  private _lastContext: AStar | undefined

  public get maxPathLength (): number {
    return Math.min(this.bot.pathfinder.pathfinderSettings.partialPathLength, this.goal.distHeuristic(this.start))
  }

  public get lastAstarContext (): AStar | undefined {
    return this._lastContext
  }

  constructor (
    start: Move,
    goal: goals.Goal,
    settings: MovementOptions,
    bot: Bot,
    world: World,
    movements: ExecutorMap
  ) {
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

  getCurrentPath (): Move[] {
    return this.lastPath
  }

  private getSliceLen (orgLen: number): number {
    return Math.min(orgLen - 1, Math.floor(orgLen * 0.9))
  }

  private handleAstarContext (foundPathLen: number, maxPathLen = this.maxPathLength): AStar | undefined {
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

    const ret = new AStar(start, moveHandler, this.goal, -1, 40, -1, 0)
    return ret
  }

  advance (): AdvanceRes {
    if (this._lastContext == null) this._lastContext = this.generateAstarContext()

    const result = this._lastContext.compute()
    let status = result.status

    log('AStar compute returned status: %s, Path length: %d (Max: %d)', status, result.path.length, this.maxPathLength)

    if (result.status === 'noPath') {
      log('No path found. Popping latest move.')
      this.latestMoves.pop()

      if (this.latestMoves.length === 0) {
        log('Latest moves empty, returning noPath definitively.')
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
      log('Threshold met! Upgrading status to: %s', status)

      const val = result.status === 'success' ? result.path.length : this.getSliceLen(result.path.length)
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

      const time1 = performance.now() - this.lastStartTime
      const totalTime = performance.now() - this.startTime
      
      log('Partial Path cost increased by %d to %d. Target Vec: %O', cost, this.latestCost, this.latestMove?.vec)
      log('ITERATION METRICS | Time: %dms | Nodes: %d (%d n/s) | Seen: %d (%d s/s) | Moves: %d (%d m/s)', 
          time1.toFixed(2), nodecount, Math.round((nodecount / time1) * 1000), 
          seensize, Math.round((seensize / time1) * 1000), 
          movecount, Math.round((movecount / time1) * 1000))
      log('TOTAL METRICS     | Time: %dms | Nodes: %d (%d n/s) | Seen: %d (%d s/s) | Moves: %d (%d m/s)', 
          totalTime.toFixed(2), this.consideredNodeCount, Math.round((this.consideredNodeCount / totalTime) * 1000), 
          this.latestClosedNodeCount, Math.round((this.latestClosedNodeCount / totalTime) * 1000), 
          this.latestMoveCount, Math.round((this.latestMoveCount / totalTime) * 1000))

      this.lastStartTime = performance.now()
    } else {
      log('Threshold NOT met. Remaining in status: %s', status)
    }

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
