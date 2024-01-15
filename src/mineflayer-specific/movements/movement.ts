import { BaseSimulator, EPhysicsCtx, EntityPhysics } from '@nxg-org/mineflayer-physics-util'
import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Move } from '../move'
import { goals } from '../goals'
import { World } from '../world/worldInterface'
import { MovementProvider } from '../../abstract'


export interface MovementOptions {
  canOpenDoors: boolean,
}

const DefaultOpts: MovementOptions = {
  canOpenDoors: true,
}

export abstract class Movement {
  protected readonly bot: Bot
  protected readonly world: World
  protected readonly settings: MovementOptions

  public constructor (bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    this.bot = bot
    this.world = world
    this.settings = Object.assign({}, DefaultOpts, settings);
  }

  /**
   * Simulation-time calculation.
   *
   * Decide whether or not movement is possible.
   * If possible, append to provided storage.
   */
  abstract doable (start: Move, dir: Vec3, storage: Move[], goal: goals.Goal): void

  /**
   * Runtime calculation.
   *
   * Perform initial setup upon movement start.
   * Can be sync or async.
   */
  abstract performInit: (thisMove: Move, goal: goals.Goal) => void | Promise<void>

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot per-tick.
   * Return whether or not bot has reached the goal.
   *
   */
  abstract performPerTick: (thisMove: Move, tickCount: number, goal: goals.Goal) => boolean | Promise<boolean>

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot BEFORE attempting the move.
   * This can be used to align to the center of blocks, etc.
   * Align IS allowed to throw exceptions, it will revert to recovery.
   */
  align = (thisMove: Move, tickCount: number, goal: goals.Goal) => {
    return true
  }

  // /**
  //  * Runtime calculation.
  //  *
  //  * Check whether or not movement should be canceled.
  //  * This is called basically whenever you'd expect it to be.
  //  *
  //  * @param preMove Whether or not this cancel check was called BEFORE performInit was called, or afterward.
  //  * @param thisMove the move to execute
  //  * @param tickCount the current ticks in execution. This starts on zero BOTH for alignment AND performPerTick init.
  //  * @param goal The goal the bot is executing towards.
  //  */
  // shouldCancel = (preMove: boolean, thisMove: Move, tickCount: number, goal: goals.Goal) => {
  //   return tickCount > 50;
  // };

  getBlock(pos: Vec3Properties, dx: number, dy: number, dz: number) {
    return this.world.getBlock(new Vec3(pos.x+dx, pos.y+dy, pos.z+dz))
  }

  getBlockInfo(pos: Vec3Properties, dx: number, dy: number, dz: number) {
    return this.world.getBlockInfo(new Vec3(pos.x+dx, pos.y+dy, pos.z+dz))
  }

  /**
   * Returns if a block is safe or not
   * @param pos 
   * @returns 
   */
  safe(pos: Vec3Properties): number {
    const block = this.world.getBlockInfo(new Vec3(pos.x, pos.y, pos.z))
    return block.physical ? 0 : 100
  }
}

export abstract class SimMovement extends Movement {
  stateCtx: EPhysicsCtx
  sim: BaseSimulator
  constructor (protected readonly bot: Bot, world: World, settings: Partial<MovementOptions>) {
    super(bot, world, settings)
    this.sim = new BaseSimulator(new EntityPhysics(bot.registry))
    this.stateCtx = EPhysicsCtx.FROM_BOT(this.sim.ctx, bot)
  }

  simulateUntil (...args: Parameters<BaseSimulator['simulateUntil']>): ReturnType<BaseSimulator['simulateUntil']> {
    return this.sim.simulateUntil(...args)
  }
}

type BuildableMove = new (bot: Bot, world: World, settings: Partial<MovementOptions>) => Movement
const cardinalVec3s: Vec3[] = [
  // { x: -1, z: 0 }, // West
  // { x: 1, z: 0 }, // East
  // { x: 0, z: -1 }, // North
  // { x: 0, z: 1 }, // South
  new Vec3(-1, 0, 0),
  new Vec3(1, 0, 0),
  new Vec3(0, 0, -1),
  new Vec3(0, 0, 1)
]

const diagonalVec3s: Vec3[] = [
  // { x: -1, z: -1 },
  // { x: -1, z: 1 },
  // { x: 1, z: -1 },
  // { x: 1, z: 1 },
  new Vec3(-1, 0, -1),
  new Vec3(-1, 0, 1),
  new Vec3(1, 0, -1),
  new Vec3(1, 0, 1)
]

const jumpVec3s: Vec3[] = [
  new Vec3(-3, 0, 0),
  new Vec3(-2, 0, 1),
  new Vec3(-2, 0, -1),
  new Vec3(-1, 0, 2),
  new Vec3(-1, 0, -2),
  new Vec3(0, 0, 3),
  new Vec3(0, 0, -3),
  new Vec3(1, 0, 2),
  new Vec3(1, 0, -2),
  new Vec3(2, 0, 1),
  new Vec3(2, 0, -1),
  new Vec3(3, 0, 0)
]

export class MovementHandler implements MovementProvider<Move> {
  recognizedMovements: Movement[]
  goal!: goals.Goal
  world: World

  constructor (private readonly bot: Bot, world: World, recMovement: Movement[]) {
    this.world = world
    this.recognizedMovements = recMovement
  }

  static create (bot: Bot, world: World, recMovement: BuildableMove[], settings: Partial<MovementOptions> = {}): MovementHandler {
    const opts = Object.assign({}, DefaultOpts, settings)
    return new MovementHandler(bot, world, recMovement.map((m) => new m(bot, world, opts)))
  }

  sanitize (): boolean {
    return !!this.goal
  }

  loadGoal (goal: goals.Goal) {
    this.goal = goal
  }

  getNeighbors (currentMove: Move): Move[] {
    const moves: Move[] = []

    const straight = new Vec3(this.goal.x - currentMove.x, this.goal.y - currentMove.y, this.goal.z - currentMove.z).normalize()

    for (const newMove of this.recognizedMovements) {
      newMove.doable(currentMove, straight, moves, this.goal)
    }

    for (const dir of cardinalVec3s) {
      for (const newMove of this.recognizedMovements) {
        newMove.doable(currentMove, dir, moves, this.goal)
      }
    }

    // for (const dir of diagonalVec3s) {
    //   for (const newMove of this.recognizedMovements) {
    //     // if (!(newMove instanceof ForwardJumpMovement))
    //     newMove.doable(currentMove, dir, moves, this.goal)
    //   }
    // }

    // for (const dir of jumpVec3s) {
    //   for (const newMove of this.recognizedMovements) {
    //     newMove.doable(currentMove, dir, moves, this.goal)
    //   }
    // }

    return moves;

    // for differences less than 1 block, we only supply best movement to said block.

    if (moves.length === 0) return moves

    const visited = new Set()
    for (const move of moves) {
      visited.add(move.hash)
    }

    // console.log(visited)

    const goalVec = this.goal.toVec()
    const ret = []
    for (const visit of visited) {
      const tmp = moves.filter((m) => m.hash === visit)
      const wantedCost = stableSort1(tmp, (a, b) => a.cost - b.cost)[0].cost
      const wanted = tmp
        .filter((m) => m.cost === wantedCost)
        .sort((a, b) => a.exitPos.distanceTo(goalVec) - b.exitPos.distanceTo(goalVec))[0]!
      ret.push(wanted)
    }

    // for (const move of moves) {
    //   (move as any).cost = Math.round(move.cost);
    // }

    return ret
  }
}

type Comparator<T> = (a: T, b: T) => number

const defaultCmp: Comparator<any> = (a, b) => {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function stableSort1<T> (arr: T[], cmp: Comparator<T> = defaultCmp): T[] {
  const stabilized = arr.map((el, index) => [el, index] as [T, number])
  const stableCmp: Comparator<[T, number]> = (a, b) => {
    const order = cmp(a[0], b[0])
    if (order != 0) return order
    return a[1] - b[1]
  }

  stabilized.sort(stableCmp)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = stabilized[i][0]
  }

  return arr
}
