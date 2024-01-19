import { BaseSimulator, EPhysicsCtx, EntityPhysics } from "@nxg-org/mineflayer-physics-util";
import { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { Move } from "../move";
import { goals } from "../goals";
import { World } from "../world/worldInterface";
import { MovementProvider } from "../../abstract";
import { BlockInfo, BlockInfoGroup } from "../world/cacheWorld";
import * as nbt from "prismarine-nbt";
import { AABB } from "@nxg-org/mineflayer-util-plugin";
import { BreakHandler, InteractHandler, InteractOpts, PlaceHandler } from "./utils";
import { CancelError } from "./exceptions";

export interface MovementOptions {
  canOpenDoors: boolean;
  canDig: boolean;
  dontCreateFlow: boolean;
  dontMineUnderFallingBlock: boolean;
}

const DefaultOpts: MovementOptions = {
  canOpenDoors: true,
  canDig: true,
  dontCreateFlow: true,
  dontMineUnderFallingBlock: true,
};

const cardinalVec3s: Vec3[] = [
  // { x: -1, z: 0 }, // West
  // { x: 1, z: 0 }, // East
  // { x: 0, z: -1 }, // North
  // { x: 0, z: 1 }, // South
  new Vec3(-1, 0, 0),
  new Vec3(1, 0, 0),
  new Vec3(0, 0, -1),
  new Vec3(0, 0, 1),
];

Object.freeze(cardinalVec3s);
cardinalVec3s.forEach(Object.freeze);

const diagonalVec3s: Vec3[] = [
  // { x: -1, z: -1 },
  // { x: -1, z: 1 },
  // { x: 1, z: -1 },
  // { x: 1, z: 1 },
  new Vec3(-1, 0, -1),
  new Vec3(-1, 0, 1),
  new Vec3(1, 0, -1),
  new Vec3(1, 0, 1),
];

Object.freeze(diagonalVec3s);
diagonalVec3s.forEach(Object.freeze);

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
  new Vec3(3, 0, 0),
];

Object.freeze(jumpVec3s);
jumpVec3s.forEach(Object.freeze);

/**
 * TODO: Separate calculation time from runtime.
 *
 * Calculation time is when the bot is deciding what to do.
 * Runtime is when the bot is actually doing it.
 *
 * This class is currently bloated by providing two functions.
 * It should be broken up.
 */

export abstract class Movement {
  static readonly cardinalDirs = cardinalVec3s;
  static readonly diagonalDirs = diagonalVec3s;
  static readonly jumpDirs = jumpVec3s;

  protected readonly bot: Bot;
  protected readonly world: World;
  protected readonly settings: MovementOptions;


  protected currentMove!: Move;
  /**
   * Current interaction.
   */
  protected cI?: InteractHandler;

  public constructor(bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    this.bot = bot;
    this.world = world;
    this.settings = Object.assign({}, DefaultOpts, settings);
  }

  /**
   * Simulation-time calculation.
   *
   * Decide whether or not movement is possible.
   * If possible, append to provided storage.
   */
  abstract provideMovements(start: Move, storage: Move[], goal: goals.Goal): void;

  /**
   * Runtime calculation.
   *
   * Perform initial setup upon movement start.
   * Can be sync or async.
   */
  abstract performInit(thisMove: Move, goal: goals.Goal): void | Promise<void>;

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot per-tick.
   * Return whether or not bot has reached the goal.
   *
   */
  abstract performPerTick(thisMove: Move, tickCount: number, goal: goals.Goal): boolean | Promise<boolean>;

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot BEFORE attempting the move.
   * This can be used to align to the center of blocks, etc.
   * Align IS allowed to throw exceptions, it will revert to recovery.
   */
  align(thisMove: Move, tickCount: number, goal: goals.Goal) {
    return true;
  };

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


  loadMove(move: Move) {
    this.currentMove = move;
  }

  performInteraction(interaction: PlaceHandler | BreakHandler, opts: InteractOpts = {}) {
    this.cI = interaction;
    if (interaction instanceof PlaceHandler) {
      return this.performPlace(interaction, opts);
    } else if (interaction instanceof BreakHandler) {
      return this.performBreak(interaction, opts);
    }
  }

  private async performPlace(place: PlaceHandler, opts: InteractOpts = {}) {
    const item = place.getItem(this.bot, BlockInfo);
    if (!item) throw new CancelError("ForwardJumpMove: no item");
    await place.perform(this.bot, item, opts);
    delete this.cI
  }

  private async performBreak(breakTarget: BreakHandler, opts: InteractOpts = {}) {
    const block = breakTarget.getBlock(this.bot.pathfinder.world);
    if (!block) throw new CancelError("ForwardJumpMove: no block");
    const item = breakTarget.getItem(this.bot, BlockInfo, block,);
    if (!item) throw new CancelError("ForwardJumpMove: no item");
    await breakTarget.perform(this.bot, item, opts);
    delete this.cI
  }

  getBlock(pos: Vec3Properties, dx: number, dy: number, dz: number) {
    return this.world.getBlock(new Vec3(pos.x + dx, pos.y + dy, pos.z + dz));
  }

  getBlockInfo(pos: Vec3Properties, dx: number, dy: number, dz: number) {
    const yes = new Vec3(pos.x + dx, pos.y + dy, pos.z + dz);
    let move: Move | undefined = this.currentMove;
    while (move !== undefined) {
      const test = move.toPlace.find((p) => p.x === yes.x && p.y === yes.y && p.z === yes.z)
      if (test !== undefined) {
        return test.toBlockInfo();
      }
      const test1 = move.toBreak.find((p) => p.x === yes.x && p.y === yes.y && p.z === yes.z)
      if (test1 !== undefined) {
        return test1.toBlockInfo();
      }
      move = move.parent;
    }
    

    // if (move) {
    //   const key = yes.toString();
    //   if (move.interactMap.has(key)) {
    //     const handler = move.interactMap.get(key)!;
    //     return handler.toBlockInfo();
    //   }
    // }
    return this.world.getBlockInfo(yes);
  }

  /**
   * To be as performant as possible, BlockInfoGroup should also be cached.
   * Right now, this is significantly slower than getBlockInfo due to the extra allocations.
   * @param pos
   * @param dx
   * @param dy
   * @param dz
   * @param halfwidth
   * @param height
   * @returns
   */
  getBlockInfoBB(pos: Vec3Properties, dx: number, dy: number, dz: number, halfwidth: number = 0.3, height: number = 1.8) {
    const vertices = new AABB(
      pos.x + dx - halfwidth,
      pos.y + dy,
      pos.z + dz - halfwidth,
      pos.x + dx + halfwidth,
      pos.y + dy + height,
      pos.z + dz + halfwidth
    ).toVecs();
    return new BlockInfoGroup(...vertices.map((v) => this.world.getBlockInfo(v)));
    // return this.world.getBlockInfo(new Vec3(pos.x+dx, pos.y+dy, pos.z+dz))
  }

  /**
   * Same logic as getBlockInfoBB.
   * @param pos
   * @param dx
   * @param dy
   * @param dz
   * @param halfwidth
   * @returns
   */
  getBlockInfoPlane(pos: Vec3Properties, dx: number, dy: number, dz: number, halfwidth: number = 0.3) {
    const vertices = [
      new Vec3(pos.x + dx - halfwidth, pos.y + dy, pos.z + dz - halfwidth),
      new Vec3(pos.x + dx + halfwidth, pos.y + dy, pos.z + dz + halfwidth),
      new Vec3(pos.x + dx - halfwidth, pos.y + dy, pos.z + dz + halfwidth),
      new Vec3(pos.x + dx + halfwidth, pos.y + dy, pos.z + dz - halfwidth),
    ];
    return new BlockInfoGroup(...vertices.map((v) => this.world.getBlockInfo(v)));
    // return this.world.getBlockInfo(new Vec3(pos.x+dx, pos.y+dy, pos.z+dz))
  }

  /**
   * Returns if a block is safe or not
   * @param pos
   * @returns
   */
  safe(pos: Vec3Properties): number {
    const block = this.world.getBlockInfo(new Vec3(pos.x, pos.y, pos.z));
    return block.physical ? 0 : 100;
  }

  /**
   * Takes into account if the block is within a break exclusion area.
   * @param {import('prismarine-block').Block} block
   * @returns
   */
  safeToBreak(block: BlockInfo) {
    if (!this.settings.canDig) {
      return false;
    }

    if (this.settings.dontCreateFlow) {
      // false if next to liquid
      if (this.getBlockInfo(block.position, 0, 1, 0).liquid) return false;
      if (this.getBlockInfo(block.position, -1, 0, 0).liquid) return false;
      if (this.getBlockInfo(block.position, 1, 0, 0).liquid) return false;
      if (this.getBlockInfo(block.position, 0, 0, -1).liquid) return false;
      if (this.getBlockInfo(block.position, 0, 0, 1).liquid) return false;
    }

    if (this.settings.dontMineUnderFallingBlock) {
      // TODO: Determine if there are other blocks holding the entity up
      if (this.getBlockInfo(block.position, 0, 1, 0).canFall) {
        // || (this.getNumEntitiesAt(block.position, 0, 1, 0) > 0)
        return false;
      }
    }

    return !BlockInfo.blocksCantBreak.has(block.type); //&& this.exclusionBreak(block) < 100
  }

  /**
   * Takes into account if the block is within the stepExclusionAreas. And returns 100 if a block to be broken is within break exclusion areas.
   * @param {import('prismarine-block').Block} block block
   * @param {[]} toBreak
   * @returns {number}
   */
  safeOrBreak(block: BlockInfo, toBreak: BreakHandler[]) {
    let cost = 0;
    // cost += this.exclusionStep(block) // Is excluded so can't move or break
    // cost += this.getNumEntitiesAt(block.position, 0, 0, 0) * this.entityCost
    if (block.safe) return cost;
    if (!this.safeToBreak(block)) return 100; // Can't break, so can't move
    toBreak.push(BreakHandler.fromVec(block.position, "solid"));

    // if (block.physical) cost += this.getNumEntitiesAt(block.position, 0, 1, 0) * this.entityCost // Add entity cost if there is an entity above (a breakable block) that will fall

    // const tool = this.bot.pathfinder.bestHarvestTool(block)
    // const tool = null as any;
    // const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : []
    // const effects = this.bot.entity.effects
    // const digTime = block.digTime(tool ? tool.type : null, false, false, false, enchants, effects)
    // const laborCost = (1 + 3 * digTime / 1000) * this.digCost
    const laborCost = 1;
    cost += laborCost;
    return cost;
  }
}

export abstract class SimMovement extends Movement {
  stateCtx: EPhysicsCtx;
  sim: BaseSimulator;
  constructor(protected readonly bot: Bot, world: World, settings: Partial<MovementOptions>) {
    super(bot, world, settings);
    this.sim = new BaseSimulator(new EntityPhysics(bot.registry));
    this.stateCtx = EPhysicsCtx.FROM_BOT(this.sim.ctx, bot);
  }

  simulateUntil(...args: Parameters<BaseSimulator["simulateUntil"]>): ReturnType<BaseSimulator["simulateUntil"]> {
    return this.sim.simulateUntil(...args);
  }
}

type BuildableMove = new (bot: Bot, world: World, settings: Partial<MovementOptions>) => Movement;

export class MovementHandler implements MovementProvider<Move> {
  recognizedMovements: Movement[];
  goal!: goals.Goal;
  world: World;

  constructor(private readonly bot: Bot, world: World, recMovement: Movement[]) {
    this.world = world;
    this.recognizedMovements = recMovement;
  }

  static create(bot: Bot, world: World, recMovement: BuildableMove[], settings: Partial<MovementOptions> = {}): MovementHandler {
    const opts = Object.assign({}, DefaultOpts, settings);
    return new MovementHandler(
      bot,
      world,
      recMovement.map((m) => new m(bot, world, opts))
    );
  }

  sanitize(): boolean {
    return !!this.goal;
  }

  loadGoal(goal: goals.Goal) {
    this.goal = goal;
  }

  getNeighbors(currentMove: Move): Move[] {
    const moves: Move[] = [];

    for (const newMove of this.recognizedMovements) {
      newMove.provideMovements(currentMove, moves, this.goal);
    }

    return moves;

    // for differences less than 1 block, we only supply best movement to said block.

    if (moves.length === 0) return moves;

    const visited = new Set();
    for (const move of moves) {
      visited.add(move.hash);
    }

    // console.log(visited)

    const goalVec = this.goal.toVec();
    const ret = [];
    for (const visit of visited) {
      const tmp = moves.filter((m) => m.hash === visit);
      const wantedCost = stableSort1(tmp, (a, b) => a.cost - b.cost)[0].cost;
      const wanted = tmp
        .filter((m) => m.cost === wantedCost)
        .sort((a, b) => a.exitPos.distanceTo(goalVec) - b.exitPos.distanceTo(goalVec))[0]!;
      ret.push(wanted);
    }

    // for (const move of moves) {
    //   (move as any).cost = Math.round(move.cost);
    // }

    return ret;
  }
}

type Comparator<T> = (a: T, b: T) => number;

const defaultCmp: Comparator<any> = (a, b) => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

function stableSort1<T>(arr: T[], cmp: Comparator<T> = defaultCmp): T[] {
  const stabilized = arr.map((el, index) => [el, index] as [T, number]);
  const stableCmp: Comparator<[T, number]> = (a, b) => {
    const order = cmp(a[0], b[0]);
    if (order != 0) return order;
    return a[1] - b[1];
  };

  stabilized.sort(stableCmp);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = stabilized[i][0];
  }

  return arr;
}
