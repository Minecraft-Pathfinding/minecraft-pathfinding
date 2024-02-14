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
  private lastPath: Move[] = []

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
    this.lastAstarContext = new AStar(start, moveHandler, this.goal, -1, 45, -1, 0)

    const result = this.lastAstarContext.compute()

    this.latestMove = result.path[result.path.length - 1]
    this.lastPath = [...this.lastPath, ...result.path]

    console.log(result.path.length, 'found path length', this.lastPath.length, 'total length', this.lastPath.map(p => p.entryPos.toString()), this.lastPath[this.lastPath.length - 1].entryPos)
    return {
      result: {
        ...result,
        path: this.lastPath
      },
      astarContext: this.lastAstarContext
    }
  }

  // private mergePathspath (path1: Move[], path2: Move[]) {
  //   const last: Move = path1[0]
  // }
}
