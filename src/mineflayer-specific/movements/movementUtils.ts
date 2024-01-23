import { BaseSimulator, EPhysicsCtx, EntityState } from "@nxg-org/mineflayer-physics-util";
import { EntityPhysics, IPhysics } from "@nxg-org/mineflayer-physics-util/dist/physics/engines";
import { Bot } from "mineflayer";
import { World } from "../world/worldInterface";
import { Vec3 } from "vec3";

type JumpInfo = { jumpTick: number; sprintTick: number };

export class JumpCalculator {
  readonly engine: BaseSimulator;
  readonly bot: Bot;
  readonly ctx: EPhysicsCtx;
  readonly world: World;

  constructor(sim: EntityPhysics, bot: Bot, world: World, ctx: EPhysicsCtx) {
    this.engine = new BaseSimulator(sim);
    this.bot = bot;
    this.ctx = ctx;
    this.world = world;
  }

  public findJumpPoint(goal: Vec3, maxTicks = 1000): JumpInfo | null {
    this.resetState();
    if (this.checkImmediateSprintJump(goal)) {
      return { jumpTick: 0, sprintTick: 0 };
    }

    let firstTick = 1;
    let secondTick = 0;

    // if less than zero, then we need to sprint before jumping.
    // we didn't cover enough distance to jump immediately.
    // if vel was up and we collided, we moved too far forward, so only sprint after jumping.
    let sprintAfterJump = this.ctx.state.vel.y > 0;

    while (firstTick < 20) {
      while (secondTick < firstTick) {
        const res = this.checkSprintJump(goal, firstTick, secondTick, sprintAfterJump);
        if (res) return sprintAfterJump ? { jumpTick: secondTick, sprintTick: firstTick } : { jumpTick: firstTick, sprintTick: secondTick };
        secondTick++;
      }
      firstTick++;
    }
    return null;
  }

  protected resetState() {
    this.ctx.state.updateFromBot(this.bot);
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
    if (state.isCollidedHorizontally) return false;
    if (state.onGround) return true;
    return false;
  }

  protected checkSprintJump(goal: Vec3, firstTicks = 0, secondTicks = 0, sprintAfterJump = false) {
    const state = this.resetState();
    this.stateLookAt(state, goal);
    this.simJumpAdvanced(state, {
      firstTicks,
      secondTicks,
      sprintAfterJump,
      maxTicks: 1000,
    });
    if (state.isCollidedHorizontally) return false;
    if (state.onGround) return true;
    return false;
  }

  protected simJump(state: EntityState, maxTicks = 1000) {
    state.control.set("forward", true);
    state.control.set("jump", true);
    state.control.set("sprint", true);
    this.engine.simulateUntil(
      (state) => state.onGround || state.isCollidedHorizontally,
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
    maxTicks = maxTicks ?? 1000;

    this.engine.simulateUntil(
      (state) => state.onGround || state.isCollidedHorizontally,
      () => {},
      (state, ticks) => {
        state.control.set("forward", true);
        if (ticks >= firstTicks) {
          state.control.set(sprintAfterJump ? "jump" : "sprint", true);
          if (ticks >= firstTicks + secondTicks) {
            state.control.set(sprintAfterJump ? "sprint" : "jump", true);
          }
        }
      },
      this.ctx,
      this.world,
      maxTicks
    );

    return state;
  }
}
