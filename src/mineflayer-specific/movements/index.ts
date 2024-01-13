import { BaseSimulator, EPhysicsCtx, EntityPhysics } from "@nxg-org/mineflayer-physics-util";
import { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { Move } from "../move";
import { goals } from "../goals";
import { World } from "../world/WorldInterface";

export abstract class Movement {
  /**
   * Simulation-time calculation.
   *
   * Decide whether or not movement is possible.
   * If possible, append to provided storage.
   */
  abstract doable(start: Move, dir: Vec3, storage: Move[], goal: goals.Goal): void;

  /**
   * Runtime calculation.
   *
   * Perform initial setup upon movement start.
   * Can be sync or async.
   */
  abstract performInit: (thisMove: Move, goal: goals.Goal) => void | Promise<void>;

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot per-tick.
   * Return whether or not bot has reached the goal.
   *
   */
  abstract performPerTick: (thisMove: Move, tickCount: number, goal: goals.Goal) => boolean | Promise<boolean>;

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot BEFORE attempting the move.
   * This can be used to align to the center of blocks, etc.
   * Align IS allowed to throw exceptions, it will revert to recovery.
   */
  align = (thisMove: Move, tickCount: number, goal: goals.Goal) => {
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
}

export abstract class SimMovement extends BaseSimulator {
  stateCtx: EPhysicsCtx;
  world: World;
  constructor(protected bot: Bot, world: World) {
    super(new EntityPhysics(bot.registry));
    this.stateCtx = EPhysicsCtx.FROM_BOT(this.ctx, bot);
    this.world = world;
  }

  /**
   * Simulation-time calculation.
   *
   * Decide whether or not movement is possible.
   * If possible, append to provided storage.
   */
  abstract doable(start: Move, dir: Vec3, storage: Move[], goal: goals.Goal): void;

  /**
   * Runtime calculation.
   *
   * Perform initial setup upon movement start.
   * Can be sync or async.
   */
  abstract performInit: (thisMove: Move, goal: goals.Goal) => void | Promise<void>;

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot per-tick.
   * Return whether or not bot has reached the goal.
   */
  abstract performPerTick: (thisMove: Move, tickCount: number, goal: goals.Goal) => boolean | Promise<boolean>;

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot BEFORE attempting the move.
   * This can be used to align to the center of blocks, etc.
   * Align IS allowed to throw exceptions, it will revert to recovery.
   */
  align = (thisMove: Move, tickCount: number, goal: goals.Goal) => {
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
}

export * from "./movements";
// export * from './pp'
