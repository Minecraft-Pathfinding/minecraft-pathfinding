import { Bot } from 'mineflayer'
import { PathProducer } from '../../abstract/pathProducer'
import * as goals from '../goals'
import { Move } from '../move'
import { ExecutorMap, MovementHandler, MovementOptions } from '../movements'
import { World } from '../world/worldInterface'
import { AStar } from '../../abstract/algorithms/astar'
import { Path } from '../../abstract'

// temp typing
interface AdvanceRes {
  result: Path<Move, AStar<Move>>
  astarContext: AStar<Move>
}

export class ContinuousPathProducer implements PathProducer<Move> {
  private readonly start: Move
  private readonly goal: goals.Goal
  private readonly settings: MovementOptions
  private readonly bot: Bot
  private readonly world: World
  private readonly movements: ExecutorMap
  private astarContext: AStar<Move> | undefined

  private readonly gcInterval: number = 10
  private lastGc: number = 0
  constructor (start: Move, goal: goals.Goal, settings: MovementOptions, bot: Bot, world: World, movements: ExecutorMap) {
    this.start = start
    this.goal = goal
    this.settings = settings
    this.bot = bot
    this.world = world
    this.movements = movements
  }

  advance (): AdvanceRes {
    if (this.astarContext == null) {
      const moveHandler = MovementHandler.create(this.bot, this.world, this.movements, this.settings)
      moveHandler.loadGoal(this.goal)

      this.astarContext = new AStar(this.start, moveHandler, this.goal, 30000, 45, -1, 0)
    }

    const result = this.astarContext.compute()

    if ((global.gc != null) && ++this.lastGc % this.gcInterval === 0) {
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

    return { result, astarContext: this.astarContext }
  }
}
