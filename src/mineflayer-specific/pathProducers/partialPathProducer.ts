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

  advance (): AdvanceRes {
    const moveHandler = MovementHandler.create(this.bot, this.world, this.movements, this.settings)
    moveHandler.loadGoal(this.goal)

    let start
    if (this.latestMove != null) {
      start = this.latestMove
    } else {
      start = this.start
    }
    const lastClosedSet = (this.lastAstarContext != null) ? this.lastAstarContext.closedDataSet : new Set<string>()
    this.lastAstarContext = new AStar(start, moveHandler, this.goal, -1, 45, -1, 0)
    this.lastAstarContext.closedDataSet = lastClosedSet

    const result = this.lastAstarContext.compute()

    const lastNode = result.path[result.path.length - 1]
    if (lastNode != null) {
      this.latestCost = this.latestCost + result.cost
      console.info('Partial Path cost increased by', lastNode.cost, 'to', this.latestCost, 'total')
    }

    // This probably does not work lol
    // someone needs to think about this more
    if (result.status === 'noPath') {
      this.latestMoves.pop()

      if (this.latestMoves.length === 0) {
        return {
          result: {
            ...result,
            cost: this.latestCost,
            path: this.lastPath
          },
          astarContext: this.lastAstarContext
        }
      }
    } else {
      this.latestMove = result.path[result.path.length - 1]
      this.latestMoves.push(this.latestMove)
    }
    this.lastPath = [...this.lastPath, ...result.path]

    // console.log(result.path.length, 'found path length', this.lastPath.length, 'total length', this.lastPath.map(p => p.entryPos.toString()), this.lastPath[this.lastPath.length - 1].entryPos)
    return {
      result: {
        ...result,
        cost: this.latestCost,
        path: this.lastPath
      },
      astarContext: this.lastAstarContext
    }
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
