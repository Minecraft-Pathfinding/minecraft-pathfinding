import { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { Move } from "../move";
import { goals } from "../goals";
import { World } from "../world/worldInterface";
import { BlockInfo, BlockInfoGroup } from "../world/cacheWorld";
import { BreakHandler, InteractHandler, InteractOpts, PlaceHandler } from "./interactionUtils";
import { CancelError } from "./exceptions";
import { Movement, MovementOptions } from "./movement";
import { AABB, AABBUtils } from "@nxg-org/mineflayer-util-plugin";
import { BaseSimulator, Controller, EPhysicsCtx, EntityPhysics, SimulationGoal } from "@nxg-org/mineflayer-physics-util";
import { botStrafeMovement, botSmartMovement, smartMovement, strafeMovement } from "./controls";

export abstract class MovementExecutor extends Movement {
  protected currentMove!: Move;

  /**
   * Current interaction.
   */
  protected cI?: InteractHandler;

  /**
   * Physics engine, baby.
   */
  protected sim: BaseSimulator;

  /**
   * Entity state of bot
   */
  protected simCtx: EPhysicsCtx;

  /** */
  protected engine: EntityPhysics;

  public constructor(bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world, settings);
    this.engine = new EntityPhysics(bot.registry);
    this.sim = new BaseSimulator(this.engine);
    this.simCtx = EPhysicsCtx.FROM_BOT(this.engine, bot);
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
  abstract performPerTick(
    thisMove: Move,
    tickCount: number,
    currentIndex: number,
    path: Move[]
  ): boolean | number | Promise<boolean | number>;

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot BEFORE attempting the move.
   * This can be used to align to the center of blocks, etc.
   * Align IS allowed to throw exceptions, it will revert to recovery.
   */
  align(thisMove: Move, tickCount: number, goal: goals.Goal) {
    return true;
  }

  /**
   * Runtime calculation.
   *
   * Check whether or not the move is already currently completed. This is checked once, before alignment.
   */
  isAlreadyCompleted(thisMove: Move, tickCount: number, goal: goals.Goal) {
    if (goal.isEnd(thisMove)) {
      return this.isComplete(thisMove, thisMove);
    }

    const offset = thisMove.exitPos.minus(this.bot.entity.position);
    const dir = thisMove.exitPos.minus(thisMove.entryPos);

    const similarDirection = offset.normalize().dot(dir.normalize()) > 0.9;

    const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 });
    bb0.extend(0, -0.251, 0);
    bb0.expand(-0.0001, 0, -0.0001);
    const bb1 = AABB.fromBlock(thisMove.exitPos.floored().translate(0, -1, 0));

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
    const xzVelDir = xzVel.normalize();

    const headingThatWay = xzVelDir.dot(dir.normalize()) > 0.9;

    const bbsTouching = bb0.collides(bb1);
    if (bbsTouching && similarDirection && headingThatWay) return true;

    return (
      this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 &&
      this.bot.entity.position.y === thisMove.exitPos.y &&
      this.bot.entity.onGround
    );
  }

  /**
   * Default implementation of isComplete.
   *
   * Checks whether or not the bot hitting the target block is unavoidable.
   *
   * Does so via velocity direction check (heading towards the block)
   * and bounding box check (touching OR slightly above block).
   */
  protected isComplete(startMove: Move, endMove: Move = startMove) {
    // if (this.toBreakLen() > 0) return false;
    // if (this.toPlaceLen() > 0) return false;

    if (this.cI !== undefined) {
      if (!this.cI.allowExit) return false;
    }

    const offset = endMove.exitPos.minus(this.bot.entity.position);
    const dir = endMove.exitPos.minus(startMove.entryPos);

    offset.translate(0, -offset.y, 0); // xz only
    dir.translate(0, -dir.y, 0); // xz only

    const similarDirection = offset.normalize().dot(dir.normalize()) > 0.5;

    const ectx = EPhysicsCtx.FROM_BOT(this.bot.physicsUtil.engine, this.bot);
    const state = this.bot.physicsUtil.engine.simulate(ectx, this.world);
    const bb0 = AABBUtils.getPlayerAABB({ position: state.pos, width: 0.6, height: 1.8 });
    bb0.extend(0, 0, 0);
    bb0.expand(-0.0001, 0, -0.0001);

    const bb1 = AABB.fromBlock(startMove.exitPos.floored().translate(0, -1, 0));
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
    const xzVelDir = xzVel.normalize();

    const headingThatWay = xzVelDir.dot(dir.normalize()) > -2;

    const bbsVertTouching = bb0.collides(bb1); //&& !(this.bot.entity as any).isCollidedHorizontally;
    // console.log(bbsVertTouching, similarDirection, bb0, bb1)
    if (bbsVertTouching && similarDirection && headingThatWay && offset.y <= 0) return true;

    // default implementation of being at the center of the block.
    // Technically, this may be true when the bot overshoots, which is fine.
    return (
      this.bot.entity.position.xzDistanceTo(endMove.exitPos) < 0.2 &&
      this.bot.entity.position.y === endMove.exitPos.y &&
      this.bot.entity.onGround
    );
  }

  /**
   * Lazy code.
   */
  public safeToCancel(startMove: Move, endMove: Move): boolean {
    return this.bot.entity.onGround;
  }

  /**
   * Provide information about the current move.
   *
   * Return breaks first as they will not interfere with placements,
   * whereas placements will almost always interfere with breaks (LOS failure).
   */
  async interactPossible(ticks = 1): Promise<PlaceHandler | BreakHandler | undefined> {
    for (const breakTarget of this.currentMove.toBreak) {
      if (breakTarget !== this.cI && !breakTarget.done) {
        if (await breakTarget.performInfo(this.bot, ticks)) return breakTarget;
      }
    }

    for (const place of this.currentMove.toPlace) {
      if (place !== this.cI && !place.done) {
        if (await place.performInfo(this.bot, ticks)) return place;
      }
    }
  }

  /**
   * Generalized function to perform an interaction.
   */
  async performInteraction(interaction: PlaceHandler | BreakHandler, opts: InteractOpts = {}) {
    this.cI = interaction;
    if (interaction instanceof PlaceHandler) {
      await this.performPlace(interaction, opts);
    } else if (interaction instanceof BreakHandler) {
      await this.performBreak(interaction, opts);
    }
  }

  protected async performPlace(place: PlaceHandler, opts: InteractOpts = {}) {
    const item = place.getItem(this.bot, BlockInfo);
    if (!item) throw new CancelError("ForwardJumpMove: no item to place");
    await place.perform(this.bot, item, opts);
    this.cI = undefined;
  }

  protected async performBreak(breakTarget: BreakHandler, opts: InteractOpts = {}) {
    const block = breakTarget.getBlock(this.bot.pathfinder.world);
    if (!block) throw new CancelError("ForwardJumpMove: no block");
    const item = breakTarget.getItem(this.bot, BlockInfo, block);
    await breakTarget.perform(this.bot, item, opts);
    this.cI = undefined;
  }

  /**
   * Utility function to have the bot look in the direction of the target, but only on the xz plane.
   */
  protected lookAtPathPos(vec3: Vec3, force = true) {
    const dx = vec3.x - this.bot.entity.position.x;
    const dz = vec3.z - this.bot.entity.position.z;

    this.lookAt(vec3.offset(0, -vec3.y + this.bot.entity.position.y + 1.62, 0), force);
  }

  protected lookAt(vec3: Vec3, force = true) {
    const dx = vec3.x - this.bot.entity.position.x;
    const dy = vec3.y - this.bot.entity.position.y;
    const dz = vec3.z - this.bot.entity.position.z;

    // console.log("lookAt", Math.atan2(-dx, -dz), Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)))

    this.bot.lookAt(vec3, force);
  }

  protected resetState() {
    this.simCtx.state.updateFromBot(this.bot);
    return this.simCtx.state;
  }

  protected simUntil(...args: Parameters<BaseSimulator["simulateUntil"]>): ReturnType<BaseSimulator["simulateUntil"]> {
    this.simCtx.state.updateFromBot(this.bot);
    return this.sim.simulateUntil(...args);
  }

  protected simUntilGrounded(controller: Controller, maxTicks = 1000) {
    this.simCtx.state.updateFromBot(this.bot);
    return this.sim.simulateUntil(
      (state) => state.onGround,
      () => {},
      controller,
      this.simCtx,
      this.world,
      maxTicks
    );
  }

  protected simJump({ goal, controller }: { goal?: SimulationGoal; controller?: Controller } = {}, maxTicks = 1000) {
    this.simCtx.state.updateFromBot(this.bot);
    goal = goal ?? ((state) => state.onGround);
    controller =
      controller ??
      ((state) => {
        state.control.set("jump", true);
      });
    return this.sim.simulateUntil(goal, () => {}, controller, this.simCtx, this.world, maxTicks);
  }

  protected alignToPath(startMove: Move, endMove: Move = startMove, handleBack = false) {
    const offset = endMove.exitPos.minus(this.bot.entity.position);
    const dir = endMove.exitPos.minus(startMove.entryPos);
    const similarDirection = offset.normalize().dot(dir.normalize()) > 0.9;

    // if (similarDirection) {
    //   this.bot.setControlState('left', false);
    //   this.bot.setControlState('right', false);
    //   if (handleBack) botSmartMovement(this.bot, endMove.exitPos, true);
    //   else this.lookAtPathPos(endMove.exitPos);
    // } else {
    // botStrafeMovement(this.bot, endMove.exitPos);
    if (handleBack) botSmartMovement(this.bot, endMove.exitPos, true);
    else this.bot.setControlState("forward", true);
    this.lookAtPathPos(endMove.exitPos);
    // }

    this.simCtx.state.updateFromBot(this.bot);
    const state = this.bot.physicsUtil.engine.simulate(this.simCtx, this.world);
    // const bb0 = AABBUtils.getPlayerAABB({ position: state.pos, width: 0.6, height: 1.8 });

    if (state.pos.y < startMove.entryPos.y && state.pos.y < endMove.exitPos.y) {
      this.bot.setControlState("sprint", false);
      this.bot.setControlState("jump", false);
      this.bot.setControlState("sneak", true);
    }
  }
}
