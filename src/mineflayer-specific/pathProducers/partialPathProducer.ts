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
  private latestCost: number = 0
  private lastPath: Move[] = []

  private readonly gcInterval: number = 10
  private readonly lastGc: number = 0

  private readonly maxPathLen: number = 50

  private lastAstarContext: AStar | undefined
  constructor (start: Move, goal: goals.Goal, settings: MovementOptions, bot: Bot, world: World, movements: ExecutorMap) {
    this.start = start
    this.goal = goal
    this.settings = settings
    this.bot = bot
    this.world = world
    this.movements = movements
  }

  getAstarContext (): AStar | undefined {
    return this.lastAstarContext
  }

  private handleAstarContext (foundPathLen: number, maxPathLen = this.maxPathLen): AStar | undefined {
    // if the path length is less than 50, return the previous astar context.
    // otherwise, return a new one.

    if (this.lastAstarContext != null && foundPathLen <= maxPathLen) {
      return this.lastAstarContext
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

    const lastClosedSet = this.lastAstarContext != null ? this.lastAstarContext.closedDataSet : new Set<string>()
    const ret = new AStar(start, moveHandler, this.goal, -1, 45, -1, 0)

    ret.closedDataSet = lastClosedSet
    return ret
  }

  advance (): AdvanceRes {
    if (this.lastAstarContext == null) this.lastAstarContext = this.generateAstarContext()

    const result = this.lastAstarContext.compute()

    const lastNode = result.path[result.path.length - 1]
    if (lastNode != null) {
      this.latestCost = this.latestCost + result.cost
      console.info('Partial Path cost increased by', lastNode.cost, 'to', this.latestCost, 'total')
    }

    if (result.status === 'noPath') {
      this.latestMoves.pop()

      if (this.latestMoves.length === 0) {
        const astarContext = this.lastAstarContext
        delete this.lastAstarContext
        return {
          result: {
            ...result,
            cost: this.latestCost,
            path: this.lastPath
          },
          astarContext
        }
      }
    } else {
      this.latestMove = result.path[result.path.length - 1]
      this.latestMoves.push(this.latestMove)
    }
    this.lastPath = [...this.lastPath, ...result.path]

    // console.log(result.path.length, 'found path length', this.lastPath.length, 'total length', this.lastPath.map(p => p.entryPos.toString()), this.lastPath[this.lastPath.length - 1].entryPos)
    const ret = {
      result: {
        ...result,
        cost: this.latestCost,
        path: this.lastPath
      },
      astarContext: this.lastAstarContext
    }

    this.lastAstarContext = this.handleAstarContext(result.path.length)

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
