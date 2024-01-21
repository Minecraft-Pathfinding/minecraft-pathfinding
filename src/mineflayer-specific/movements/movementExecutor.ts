import { BaseSimulator, EPhysicsCtx, EntityPhysics } from "@nxg-org/mineflayer-physics-util";
import { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { Move } from "../move";
import { goals } from "../goals";
import { World } from "../world/worldInterface";
import { MovementProvider as AMovementProvider} from "../../abstract";
import { BlockInfo, BlockInfoGroup } from "../world/cacheWorld";
import * as nbt from "prismarine-nbt";
import { AABB } from "@nxg-org/mineflayer-util-plugin";
import { BreakHandler, InteractHandler, InteractOpts, PlaceHandler } from "./utils";
import { CancelError } from "./exceptions";
import { Movement, MovementOptions } from "./movement";
import { MovementProvider } from "./movementProvider";


/**
 * TODO: Separate calculation time from runtime.
 *
 * Calculation time is when the bot is deciding what to do.
 * Runtime is when the bot is actually doing it.
 *
 * This class is currently bloated by providing two functions.
 * It should be broken up.
 */

export abstract class MovementExecutor extends Movement {
  protected currentMove!: Move;

  /**
   * Current interaction.
   */
  protected cI?: InteractHandler;

  public constructor(bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world, settings);
  }

  /**
   * Runtime calculation.
   *
   * Perform initial setup upon movement start.
   * Can be sync or async.
   */
  abstract performInit(thisMove: Move, currentIndex: number, path: Move[]): void | Promise<void>;

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot per-tick.
   * Return whether or not bot has reached the goal.
   *
   */
  abstract performPerTick(thisMove: Move, tickCount: number,currentIndex: number, path: Move[]): boolean | number | Promise<boolean | number>;

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

  /**
   * Runtime calculation.
   * 
   * Check whether or not the move is already currently completed. This is checked once, before alignment.
   */
  isAlreadyCompleted(thisMove: Move, tickCount: number, goal: goals.Goal) {
    return this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && 
    this.bot.entity.position.y === thisMove.exitPos.y
    && this.bot.entity.onGround;
  }

  performInteraction(interaction: PlaceHandler | BreakHandler, opts: InteractOpts = {}) {
    this.cI = interaction;
    if (interaction instanceof PlaceHandler) {
      return this.performPlace(interaction, opts);
    } else if (interaction instanceof BreakHandler) {
      return this.performBreak(interaction, opts);
    }
  }

  protected async performPlace(place: PlaceHandler, opts: InteractOpts = {}) {
    const item = place.getItem(this.bot, BlockInfo);
    if (!item) throw new CancelError("ForwardJumpMove: no item to place");
    await place.perform(this.bot, item, opts);
    delete this.cI
  }

  protected async performBreak(breakTarget: BreakHandler, opts: InteractOpts = {}) {
    const block = breakTarget.getBlock(this.bot.pathfinder.world);
    if (!block) throw new CancelError("ForwardJumpMove: no block");
    const item = breakTarget.getItem(this.bot, BlockInfo, block);
    await breakTarget.perform(this.bot, item, opts);
    delete this.cI
  }

  lookAtPathPos(vec3: Vec3) {
    const dx = vec3.x - this.bot.entity.position.x
    const dz = vec3.z - this.bot.entity.position.z

    this.bot.look(Math.atan2(-dx, -dz), 0, true)
  }
}