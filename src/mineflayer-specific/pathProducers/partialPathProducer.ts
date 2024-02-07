import { Bot } from 'mineflayer'
import { PathProducer } from '../../abstract/pathProducer'
import { goals } from '../goals'
import { Move } from '../move'
import { ExecutorMap, MovementHandler, MovementOptions } from '../movements'
import { World } from '../world/worldInterface'
import { AStar } from '../../abstract/algorithms/astar'
import { PathData } from '../../abstract/node'
import { Path } from '../../abstract'

export class PartialPathProducer implements PathProducer<Move> {
  private readonly start: Move
  private readonly goal: goals.Goal
  private readonly settings: MovementOptions
  private readonly bot: Bot
  private readonly world: World
  private readonly movements: ExecutorMap
  private latestMove: Move | undefined
  private lastPath: Move[] = []
  constructor (start: Move, goal: goals.Goal, settings: MovementOptions, bot: Bot, world: World, movements: ExecutorMap) {
    this.start = start
    this.goal = goal
    this.settings = settings
    this.bot = bot
    this.world = world
    this.movements = movements
  }

  advance (): { result: Path<Move, AStar<Move>>, astarContext: AStar<Move> } {
    const moveHandler = MovementHandler.create(this.bot, this.world, this.movements, this.settings)
    moveHandler.loadGoal(this.goal)

    const astarContext = new AStar<Move>((this.latestMove != null) || this.start, moveHandler, this.goal, -1, 45, -1, 0)

    const result = astarContext.compute()!
    this.latestMove = result.path[result.path.length - 1]
    this.lastPath = [...this.lastPath, ...result.path]
    return {
      result: {
        ...result,
        path: this.lastPath
      },
      astarContext
    }
  }

  private mergePathspath (path1: Move[], path2: Move[]) {
    const last: Move = path1[0]
  }
}
