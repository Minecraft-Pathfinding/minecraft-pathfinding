import { BaseSimulator, ControlStateHandler, EPhysicsCtx, EntityState } from "@nxg-org/mineflayer-physics-util";
import { EntityPhysics, IPhysics } from "@nxg-org/mineflayer-physics-util/dist/physics/engines";
import { Bot } from "mineflayer";
import { World } from "../world/worldInterface";
import { Vec3 } from "vec3";

type JumpInfo = { jumpTick: number; sprintTick: number };

export class JumpCalculator {
  readonly engine: BaseSimulator;
  readonly bot: Bot;
  ctx: EPhysicsCtx;
  readonly world: World;

  constructor(sim: BaseSimulator, bot: Bot, world: World, ctx: EPhysicsCtx) {
    this.engine = sim;
    this.bot = bot;
    this.ctx = ctx;
    this.world = world;
  }

  public findJumpPoint(goal: Vec3, maxTicks = 20): JumpInfo | null {
    this.resetState();
    if (this.checkImmediateSprintJump(goal)) {
      console.log('lfg')
      return { jumpTick: 0, sprintTick: 0 };
    }

    let firstTick = 0;
    let secondTick = 1;

    // if less than zero, then we need to sprint before jumping.
    // we didn't cover enough distance to jump immediately.
    // if vel was up and we collided, we moved too far forward, so only sprint after jumping.
    let sprintAfterJump = this.ctx.state.vel.y > 0;

    while (firstTick < 10) {
      while (secondTick < 10) {
        const res = this.checkSprintJump(goal, firstTick, secondTick, sprintAfterJump);
        if (res)
          return sprintAfterJump
            ? { jumpTick: firstTick, sprintTick: firstTick + secondTick }
            : { jumpTick: firstTick + secondTick, sprintTick: firstTick };
        secondTick++;
      }
      secondTick = 0;
      firstTick++;
    }
    return null;
  }

  protected resetState() {
    this.ctx = EPhysicsCtx.FROM_BOT(this.engine.ctx, this.bot)
    this.ctx.state.age = 0;
    this.ctx.state.control = ControlStateHandler.DEFAULT();
    return this.ctx.state;
  }

  protected stateLookAt(state: EntityState, point: Vec3) {
    const delta = point.minus(state.pos.offset(0, state.height - 0.18, 0));
    const yaw = Math.atan2(-delta.x, -delta.z);
    const groundDistance = Math.sqrt(delta.x * delta.x + delta.z * delta.z);
    const pitch = Math.atan2(delta.y, groundDistance);
    state.yaw = yaw;
    state.pitch = pitch;
  }

  protected checkImmediateSprintJump(goal: Vec3) {
    const state = this.resetState();
    this.stateLookAt(state, goal);
    this.simJump(state);
    console.log('immediate jump', state.pos, state.vel, goal)
    if (state.isCollidedHorizontally) return false;
    if (state.onGround && state.pos.y === goal.y) return true;
    return false;
  }

  protected checkSprintJump(goal: Vec3, firstTicks = 0, secondTicks = 0, sprintAfterJump = false) {
    const state = this.resetState();
    this.stateLookAt(state, goal);
    this.simJumpAdvanced(state, {
      firstTicks,
      secondTicks,
      sprintAfterJump,
      maxTicks: 20,
    });
    // console.log('sim jump',firstTicks, secondTicks, sprintAfterJump, state.pos, state.control, state.age, goal)
    if (state.isCollidedHorizontally) return false;
    if (state.onGround && state.pos.y === goal.y) return true;
    return false;
  }

  protected simJump(state: EntityState, maxTicks = 20) {
    state.control.set("forward", true);
    state.control.set("jump", true);
    state.control.set("sprint", true);
    this.engine.simulateUntil(
      (state, ticks) => ticks > 0 && (state.onGround || state.isCollidedHorizontally),
      () => {},
      () => {},
      this.ctx,
      this.world,
      maxTicks
    );
    return state;
  }

  protected simJumpAdvanced(
    state: EntityState,
    opts: {
      firstTicks?: number;
      secondTicks?: number;
      sprintAfterJump?: boolean;
      maxTicks?: number;
    } = {}
  ) {
    let { firstTicks, secondTicks, sprintAfterJump, maxTicks } = opts;
    firstTicks = firstTicks ?? 0;
    secondTicks = secondTicks ?? 0;
    sprintAfterJump = sprintAfterJump ?? false;
    maxTicks = maxTicks ?? 20;

    // console.log("in sim:", firstTicks, secondTicks, sprintAfterJump, maxTicks, state.control)
    this.engine.simulateUntil(
      (state, ticks) => {
        console.log(firstTicks, secondTicks, 'checking goal', state.control.get('jump'), state.onGround, state.isCollidedVertically, state.isCollidedHorizontally)
        return state.control.get('jump') && (state.onGround || state.isCollidedHorizontally)
      },
      () => {},
      (state, ticks) => {
        console.log(firstTicks, secondTicks, sprintAfterJump, ticks, state.pos)
        state.control.set("forward", false);
        if (ticks >= firstTicks!) {
          if (sprintAfterJump) state.control.set("jump", true);
          else {
            state.control.set("sprint", true);
            state.control.set("forward", true);
          }
          if (ticks >= firstTicks! + secondTicks!) {
            if (sprintAfterJump) {
              state.control.set("sprint", true);
              state.control.set("forward", true);
            } else {
              state.control.set("jump", true);
            }
          }
        }
        // console.log('sim jump',firstTicks, secondTicks, sprintAfterJump, ticks, state.pos, state.control)
      },
      this.ctx,
      this.world,
      maxTicks
    );

    return state;
  }
}
