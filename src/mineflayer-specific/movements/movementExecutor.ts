import { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { Move } from "../move";
import { goals } from "../goals";
import { World } from "../world/worldInterface";
import { BlockInfo, BlockInfoGroup } from "../world/cacheWorld";
import { BreakHandler, InteractHandler, InteractOpts, PlaceHandler, RayType } from "./interactionUtils";
import { CancelError } from "./exceptions";
import { Movement, MovementOptions } from "./movement";
import { AABB, AABBUtils } from "@nxg-org/mineflayer-util-plugin";
import { BaseSimulator, Controller, EPhysicsCtx, EntityPhysics, SimulationGoal } from "@nxg-org/mineflayer-physics-util";
import { botStrafeMovement, botSmartMovement, smartMovement, strafeMovement, wrapDegrees, wrapRadians } from "./controls";

export abstract class MovementExecutor extends Movement {
  protected currentMove!: Move;

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

  public get cI(): InteractHandler | undefined {
    // if (this._cI === undefined) return undefined;
    // if (this._cI.allowExit) return undefined;
    return this._cI;
  }

  public constructor(bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world, settings);
    this.engine = new EntityPhysics(bot.registry);
    this.sim = new BaseSimulator(this.engine);
    this.simCtx = EPhysicsCtx.FROM_BOT(this.engine, bot);
  }

  /**
   * TODO: Implement.
   */
  public async abort(timeout = 1000): Promise<void> {
    for (const breakTarget of this.currentMove.toBreak) {
      await breakTarget.abort();
    }

    for (const place of this.currentMove.toPlace) {
      await place.abort();
    }

    // default: wait until on ground and not water to abort.
    return new Promise<void>((res, rej) => {
      const listener = () => {
        if (this.bot.entity.onGround && !(this.bot.entity as any).isInWater) {
          this.bot.off("physicsTick", listener);
          res();
        }
        this.bot.on("physicsTick", listener);
        setTimeout(() => {
          this.bot.off("physicsTick", listener);
          rej(new CancelError("Movement failed to abort properly."));
        }, timeout);
      };
    });
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
  align(thisMove: Move, tickCount: number, goal: goals.Goal): boolean | Promise<boolean> {
    return true;
  }

  /**
   * Runtime calculation.
   *
   * Check whether or not the move is already currently completed. This is checked once, before alignment.
   */
  isAlreadyCompleted(thisMove: Move, tickCount: number, goal: goals.Goal) {
    return this.isComplete(thisMove);
  }

  /**
   * Default implementation of isComplete.
   *
   * Checks whether or not the bot hitting the target block is unavoidable.
   *
   * Does so via velocity direction check (heading towards the block)
   * and bounding box check (touching OR slightly above block).
   */
  protected isComplete(startMove: Move, endMove: Move = startMove, ticks = 1) {
    if (this.toBreakLen() > 0) return false;
    if (this.toPlaceLen() > 0) return false;

    if (this.cI !== undefined) {
      if (!this.cI.allowExit) return false;
    }

    const offset = endMove.exitPos.minus(this.bot.entity.position);
    const dir = endMove.exitPos.minus(startMove.entryPos);

    offset.translate(0, -offset.y, 0); // xz only
    dir.translate(0, -dir.y, 0); // xz only

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
    const xzVelDir = xzVel.normalize();

    const similarDirection = offset.normalize().dot(dir.normalize()) > 0.5;

    const ectx = EPhysicsCtx.FROM_BOT(this.bot.physicsUtil.engine, this.bot);
    for (let i = 0; i < ticks; i++) {
      this.bot.physicsUtil.engine.simulate(ectx, this.world);
    }

    const pos = ectx.state.pos.clone();

    this.bot.physicsUtil.engine.simulate(ectx, this.world); // needed for later.

    console.log(ectx.state.pos, ectx.state.isCollidedHorizontally, ectx.state.isCollidedVertically)

    // const pos = this.bot.entity.position
    const bb0 = AABBUtils.getPlayerAABB({ position: pos, width: 0.599, height: 1.8 });
    // bb0.extend(0, ticks === 0 ? -0.251 : -0.1, 0);
    // bb0.expand(-0.0001, 0, -0.0001);

    const bb1bl = this.bot.pathfinder.world.getBlockInfo(endMove.exitPos.floored().translate(0, -1, 0));

    const bb1s = bb1bl.getBBs();

    const headingThatWay = xzVelDir.dot(dir.normalize()) > -2;

    const bb1physical = bb1bl.physical || bb1bl.liquid;
    // console.log(endMove.exitPos.floored().translate(0, -1, 0), bb1physical)
    //startMove.moveType.getBlockInfo(endMove.exitPos.floored(), 0, -1, 0).physical;

    const bbsVertTouching = bb1s.some((b) => b.collides(bb0)) && bb1physical && pos.y >= bb1bl.height; //&& !(this.bot.entity as any).isCollidedHorizontally;

    // console.info('bb0', bb0, 'bb1s', bb1s)
    // console.log(bbsVertTouching, similarDirection, offset.y <= 0, this.bot.entity.position);
    // console.info('end move exit pos', endMove.exitPos.toString())
    if (bbsVertTouching && offset.y <= 0) {
      console.log(ectx.state.isCollidedHorizontally, ectx.state.isCollidedVertically)
      if (similarDirection && headingThatWay) return !ectx.state.isCollidedHorizontally;

      // console.log('finished!', this.bot.entity.position, endMove.exitPos, bbsVertTouching, similarDirection, headingThatWay, offset.y)
    }

    // console.log(
    //   "backup",
    //   this.bot.entity.position.xzDistanceTo(endMove.exitPos),
    //   this.bot.entity.position.y,
    //   endMove.exitPos.y,
    //   this.bot.entity.onGround,
    //   this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).norm()
    // );

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
      if (breakTarget !== this._cI && !breakTarget.done) {
        const res = await breakTarget.performInfo(this.bot, ticks);
        // console.log("break", res, res.raycasts.length > 0);
        if (res.ticks < Infinity) return breakTarget;
      }
    }

    for (const place of this.currentMove.toPlace) {
      if (place !== this._cI && !place.done) {
        const res = await place.performInfo(this.bot, ticks);
        // console.log("place", res, res.raycasts.length > 0);
        if (res.ticks < Infinity) return place;
      }
    }
  }

  /**
   * Generalized function to perform an interaction.
   */
  async performInteraction(interaction: PlaceHandler | BreakHandler, opts: InteractOpts = {}) {
    this._cI = interaction;
    interaction.loadMove(this);
    if (interaction instanceof PlaceHandler) {
      await this.performPlace(interaction, opts);
    } else if (interaction instanceof BreakHandler) {
      await this.performBreak(interaction, opts);
    }
  }

  protected async performPlace(place: PlaceHandler, opts: InteractOpts = {}) {
    const item = place.getItem(this.bot, BlockInfo);
    if (!item) throw new CancelError("MovementExecutor: no item to place");
    await place.perform(this.bot, item, opts);
    this._cI = undefined;
  }

  protected async performBreak(breakTarget: BreakHandler, opts: InteractOpts = {}) {
    const block = breakTarget.getBlock(this.bot.pathfinder.world);
    if (!block) throw new CancelError("MovementExecutor: no block to break");
    const item = breakTarget.getItem(this.bot, BlockInfo, block);

    await breakTarget.perform(this.bot, item, opts);
    this._cI = undefined;
  }

  /**
   * Utility function to have the bot look in the direction of the target, but only on the xz plane.
   */
  protected lookAtPathPos(vec3: Vec3, force = this.settings.forceLook) {
    const dx = vec3.x - this.bot.entity.position.x;
    const dz = vec3.z - this.bot.entity.position.z;

    return this.lookAt(vec3.offset(0, -vec3.y + this.bot.entity.position.y + 1.62, 0), force);
  }

  protected lookAt(vec3: Vec3, force = this.settings.forceLook) {
    const dx = vec3.x - this.bot.entity.position.x;
    const dy = vec3.y - this.bot.entity.position.y;
    const dz = vec3.z - this.bot.entity.position.z;

    // console.log("lookAt", Math.atan2(-dx, -dz), Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)))

    if (this.isLookingAt(vec3, 0.001)) return;
    return this.bot.lookAt(vec3, force);
  }

  public isLookingAt(vec3: Vec3, limit = 0.01) {
    if (!this.settings.careAboutLookAlignment) return true;
    const dx = this.bot.entity.position.x - vec3.x;
    const dy = this.bot.entity.position.y - vec3.y;
    const dz = this.bot.entity.position.z - vec3.z;

    const pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) - Math.PI / 2;
    const yaw = wrapRadians(Math.atan2(-dx, -dz));
    // fuck it, I'm being lazy.

    const bl = this.bot.blockAtCursor(256) as unknown as RayType;
    // console.log(bl)
    if (!bl) return false;

    const eyePos = this.bot.entity.position.offset(0, 1.62, 0);
    // console.log(bl.intersect, vec3, bl.intersect.minus(eyePos).normalize().dot(vec3.minus(eyePos).normalize()), 1 - limit);

    return bl.intersect.minus(eyePos).normalize().dot(vec3.minus(eyePos).normalize()) > 1 - limit;

    console.log(
      limit,
      pitch,
      yaw,
      "|",
      this.bot.entity.pitch,
      this.bot.entity.yaw,
      "|",
      Math.abs(pitch - this.bot.entity.pitch),
      Math.abs(yaw - this.bot.entity.yaw)
    );
    return Math.abs(pitch - this.bot.entity.pitch) < limit && Math.abs(yaw - this.bot.entity.yaw) < limit;
  }

  public isLookingAtYaw(vec3: Vec3, limit = 0.01) {
    if (!this.settings.careAboutLookAlignment) return true;
    const dx = this.bot.entity.position.x - vec3.x;
    const dy = this.bot.entity.position.y - vec3.y;
    const dz = this.bot.entity.position.z - vec3.z;

    const pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) - Math.PI / 2;
    const yaw = wrapRadians(Math.atan2(-dx, -dz));
    // fuck it, I'm being lazy.

    const bl = this.bot.blockAtCursor(256) as unknown as RayType;
    // console.log(bl)
    if (!bl) return false;

    const blPosXZ = bl.position.offset(0, -bl.position, 0);
    const vec3XZ = vec3.offset(0, -vec3.y, 0);

    const eyePos = this.bot.entity.position.offset(0, 1.62, 0);
    // console.log(blPosXZ, vec3XZ, vec3XZ.minus(eyePos).normalize().dot(blPosXZ.minus(eyePos).normalize()), 1 - limit);

    return bl.intersect.minus(eyePos).normalize().dot(vec3.minus(eyePos).normalize()) > 1 - limit;

    console.log(
      limit,
      pitch,
      yaw,
      "|",
      this.bot.entity.pitch,
      this.bot.entity.yaw,
      "|",
      Math.abs(pitch - this.bot.entity.pitch),
      Math.abs(yaw - this.bot.entity.yaw)
    );
    return Math.abs(pitch - this.bot.entity.pitch) < limit && Math.abs(yaw - this.bot.entity.yaw) < limit;
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

  protected async alignToPath(startMove: Move, opts?: { handleBack?: boolean; target?: Vec3, sprint?: boolean }): Promise<void>;
  protected async alignToPath(startMove: Move, endMove?: Move, opts?: { handleBack?: boolean; target?: Vec3, sprint?:boolean }): Promise<void>;
  protected async alignToPath(startMove: Move, endMove?: any, opts?: any) {
    if (endMove === undefined) {
      endMove = startMove;
      opts = {};
    } else if (endMove instanceof Move) {
      opts = opts ?? {};
    } else {
      opts = endMove;
      endMove = startMove;
    }

    const handleBack = opts.handleBack ?? false;
    const target = opts.target ?? endMove.exitPos;
    const offset = endMove.exitPos.minus(this.bot.entity.position);
    const dir = endMove.exitPos.minus(startMove.entryPos);
    const sprint = opts.sprint ?? true;
    const similarDirection = offset.normalize().dot(dir.normalize()) > 0.9;

    // if (similarDirection) {
    //   this.bot.setControlState('left', false);
    //   this.bot.setControlState('right', false);
    //   if (handleBack) botSmartMovement(this.bot, endMove.exitPos, true);
    //   else this.lookAtPathPos(endMove.exitPos);
    // } else {

    // console.log("target", target, opts)

    let task;
    if (target !== endMove.exitPos) task =  this.lookAt(target);
    else task = this.lookAtPathPos(target);


    this.bot.chat(`/particle flame ${endMove.exitPos.x} ${endMove.exitPos.y} ${endMove.exitPos.z} 0 0.5 0 0 10 force`);
    botStrafeMovement(this.bot, startMove.entryPos, endMove.exitPos);
    botSmartMovement(this.bot, startMove.entryPos, endMove.exitPos, sprint);

    await task;
    // if (this.bot.entity.position.xzDistanceTo(target) > 0.3)
    // // botSmartMovement(this.bot, endMove.exitPos, true);
    // this.bot.setControlState("forward", true);

    // }

    // if (handleBack) {
    //   botSmartMovement(this.bot, target, true);
    // }

    // console.log(target)

    this.simCtx.state.updateFromBot(this.bot);
    const state = this.bot.physicsUtil.engine.simulate(this.simCtx, this.world);
    // const bb0 = AABBUtils.getPlayerAABB({ position: state.pos, width: 0.6, height: 1.8 });

    // if (state.pos.y < startMove.entryPos.y && state.pos.y < endMove.exitPos.y) {
    //   this.bot.setControlState("sprint", false);
    //   this.bot.setControlState("jump", false);
    //   this.bot.setControlState("sneak", true);
    // }
  }
}
