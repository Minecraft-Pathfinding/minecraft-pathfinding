import { EntityPhysics, IPhysics } from "@nxg-org/mineflayer-physics-util/dist/physics/engines";
import { EntityState, PlayerState } from "@nxg-org/mineflayer-physics-util/dist/physics/states";
import { AABB, AABBUtils, MathUtils } from "@nxg-org/mineflayer-util-plugin";
import { stat } from "fs/promises";
import { Bot } from "mineflayer";
import { Block } from "prismarine-block";
import { promisify } from "util";
import { Vec3 } from "vec3";
import { World } from "../../world/worldInterface";
import { BaseSimulator, Controller, EPhysicsCtx, OnGoalReachFunction, SimulationGoal } from "@nxg-org/mineflayer-physics-util";
import { wrapDegrees, wrapRadians } from "../controls";

const ZERO = (0 * Math.PI) / 12;
const PI_OVER_TWELVE = (1 * Math.PI) / 12;
const TWO_PI_OVER_TWELVE = (2 * Math.PI) / 12;
const THREE_PI_OVER_TWELVE = (3 * Math.PI) / 12;
const FOUR_PI_OVER_TWELVE = (4 * Math.PI) / 12;
const FIVE_PI_OVER_TWELVE = (5 * Math.PI) / 12;
const SIX_PI_OVER_TWELVE = (6 * Math.PI) / 12;
const SEVEN_PI_OVER_TWELVE = (7 * Math.PI) / 12;
const EIGHT_PI_OVER_TWELVE = (8 * Math.PI) / 12;
const NINE_PI_OVER_TWELVE = (9 * Math.PI) / 12;
const TEN_PI_OVER_TWELVE = (10 * Math.PI) / 12;
const ELEVEN_PI_OVER_TWELVE = (11 * Math.PI) / 12;
const TWELVE_PI_OVER_TWELVE = (12 * Math.PI) / 12;
const THIRTEEN_PI_OVER_TWELVE = (13 * Math.PI) / 12;
const FOURTEEN_PI_OVER_TWELVE = (14 * Math.PI) / 12;
const FIFTEEN_PI_OVER_TWELVE = (15 * Math.PI) / 12;
const SIXTEEN_PI_OVER_TWELVE = (16 * Math.PI) / 12;
const SEVENTEEN_PI_OVER_TWELVE = (17 * Math.PI) / 12;
const EIGHTEEN_PI_OVER_TWELVE = (18 * Math.PI) / 12;
const NINETEEN_PI_OVER_TWELVE = (19 * Math.PI) / 12;
const TWENTY_PI_OVER_TWELVE = (20 * Math.PI) / 12;
const TWENTY_ONE_PI_OVER_TWELVE = (21 * Math.PI) / 12;
const TWENTY_TWO_PI_OVER_TWELVE = (22 * Math.PI) / 12;
const TWENTY_THREE_PI_OVER_TWELVE = (23 * Math.PI) / 12;
const TWENTY_FOUR_PI_OVER_TWELVE = (24 * Math.PI) / 12;

/**
 * To be used once per movement.
 *
 * Provide state that will serve as a base. The state itself will not be modified/consumed unless called for.
 */
export class JumpSim extends BaseSimulator {
  public readonly world: World;

  constructor(public readonly physics: EntityPhysics, world: World) {
    super(physics);
    this.world = world;
  }

  public clone(): JumpSim {
    return new JumpSim(this.physics, this.world);
  }

  async simulateUntilNextTick(ctx: EPhysicsCtx) {
    return await this.simulateUntil(
      () => false,
      () => {},
      () => {},
      ctx,
      this.world,
      1
    );
  }

  simulateUntilOnGround(ctx: EPhysicsCtx, ticks = 5, goal: SimulationGoal = () => false) {
    // const orgPos = ctx.state.pos.clone();
    let print = false;
    const state = this.simulateUntil(
      JumpSim.buildAnyGoal(goal, (state, ticks) => {
        if (state.pos.y > 70 && state.pos.z > 6.8 && state.vel.y > -0.1) print = true;
        if (print) {
        //   console.log(state.onGround, state.pos, state.vel);
          // print = false;
        }
        return ticks > 0 && state.onGround;
      }),
      () => {},
      () => {},
      ctx,
      this.world,
      ticks
    );

    // if (print) {
    //   console.log("potentially good", state.pos, state.vel, goal(state, 0));
    //   console.log();
    // }
    return state;
  }

  simulateSmartAim(goal: Vec3, ctx: EPhysicsCtx, sprint: boolean, jump: boolean, jumpAfter = 0, ticks = 20) {
    return this.simulateUntil(
      JumpSim.getReached(goal),
      JumpSim.getCleanupPosition(goal),
      JumpSim.buildFullController(
        JumpSim.getControllerStraightAim(goal),
        // JumpSim.getControllerStrafeAim(goal),
        // JumpSim.getControllerSmartMovement(goal, sprint),
        JumpSim.getControllerJumpSprint(jump, sprint, jumpAfter)
      ),
      ctx,
      this.world,
      ticks
    );
  }

  /**
   * Assume we know the correct back-up position.
   */
  simulateBackUpBeforeJump(ctx: EPhysicsCtx, goal: Vec3, sprint: boolean, strafe = true, ticks = 20) {
    const aim = strafe ? JumpSim.getControllerStrafeAim(goal) : JumpSim.getControllerStraightAim(goal);
    return this.simulateUntil(
      (state) => state.pos.xzDistanceTo(goal) < 0.1,
      JumpSim.getCleanupPosition(goal),
      JumpSim.buildFullController(aim, JumpSim.getControllerSmartMovement(goal, sprint), (state, ticks) => {
        state.control.sprint = false;
        state.control.sneak = true;
      }),
      ctx,
      this.world,
      ticks
    );
  }

  simulateJumpFromEdgeOfBlock(ctx: EPhysicsCtx, srcAABBs: AABB[], goalCorner: Vec3, goalBlock: Vec3, sprint: boolean, ticks = 20) {
    let jump = false;
    let changed = false;
    const goalBlockTop = goalBlock.floored().translate(0.5, 0, 0.5)
    return this.simulateUntil(
      JumpSim.getReached(goalBlock),
      JumpSim.getCleanupPosition(goalCorner),
      JumpSim.buildFullController(
        JumpSim.getControllerStraightAim(goalCorner),
        // JumpSim.getControllerStrafeAim(goalCorner),
        // JumpSim.getControllerSmartMovement(goalCorner, sprint),
        (state, ticks) => {
          state.control.sneak = false;
          // check if player is leaving src block collision
          const playerBB = state.getAABB();
          playerBB.expand(0, 1e-1, 0);
          if (jump && state.pos.xzDistanceTo(goalCorner) < 0.5 && !changed) {
            goalCorner.set(goalBlockTop.x, goalBlockTop.y, goalBlockTop.z);
            changed = true;
          }
          if (ticks > 0 && srcAABBs.every((src) => !src.intersects(playerBB)) && !jump) {
            state.control.jump = true;
            jump = true;
          } else {
            state.control.jump = false;
          }
        }
      ),
      ctx,
      this.world,
      ticks
    );
  }

  static getReachedOld(...path: Vec3[]): SimulationGoal {
    return (state) => {
      const delta = path[0].minus(state.pos);
      return Math.abs(delta.x) <= 0.35 && Math.abs(delta.z) <= 0.35 && Math.abs(delta.y) < 1 && (state.onGround || state.isInWater);
    };
  }

  static getReached(...path: Vec3[]): (state: EntityState, age: number) => boolean {
    const pathGoal = AABB.fromBlockPos(path[0]);
    // console.log(pathGoal, path[0]);
    return (state) => {
      // console.log(state.getAABB(), state.pos, pathGoal, state.getAABB().collides(pathGoal))
      return state.pos.y >= pathGoal.maxY && AABBUtils.getPlayerAABB({ position: state.pos, width: 0.599, height: 1.8 }).collides(pathGoal);
    };
  }

  static getCleanupPosition(...path: Vec3[]): OnGoalReachFunction {
    return (state) => {
      state.clearControlStates();
    };
  }

  static getControllerStraightAim(nextPoint: Vec3): Controller {
    return (state, ticks) => {
      const dx = nextPoint.x - state.pos.x;
      const dz = nextPoint.z - state.pos.z;
      state.yaw = Math.atan2(-dx, -dz);
    };
  }

  // right should be positiive,
  // left should be negative.
  static getControllerStrafeAim(nextPoint: Vec3): Controller {
    return (state, ticks) => {
      const offset = state.pos.plus(state.onGround ? state.vel : state.vel.scaled(1));
      const dx = nextPoint.x - offset.x;
      const dz = nextPoint.z - offset.z;
      const wantedYaw = wrapRadians(Math.atan2(-dx, -dz));
      const diff = wrapRadians(wantedYaw - state.yaw);


      if (PI_OVER_TWELVE < diff && diff < ELEVEN_PI_OVER_TWELVE) {
        state.control.left = true; // are these reversed? tf
        state.control.right = false;
        // console.log("left");
      } else if (THIRTEEN_PI_OVER_TWELVE < diff && diff < TWENTY_THREE_PI_OVER_TWELVE) {
        state.control.left = false;
        state.control.right = true;
        // console.log("right");
      } else {
        state.control.left = false;
        state.control.right = false;
        // console.log("rotate neither, left:", state.control.movements.left, "right:", state.control.movements.right);
      }
    };
  }

  static getControllerJumpSprint(jump: boolean, sprint: boolean, jumpAfter = 0): Controller {
    return (state, ticks) => {
      state.control.jump = state.onGround && jump && ticks >= jumpAfter;
      state.control.sprint = sprint;
    };
  }

  // forward should be any value that abs. val to below pi / 2
  // backward is any value that abs. val to above pi / 2
  static getControllerSmartMovement(goal: Vec3, sprint: boolean): Controller {
    return (state, ticks) => {
      const offset = state.pos.plus(state.onGround ? state.vel : state.vel.scaled(1));
      const dx = goal.x - offset.x;
      const dz = goal.z - offset.z;
      const wantedYaw = wrapRadians(Math.atan2(-dx, -dz));
      const diff = wrapRadians(wantedYaw - state.yaw);
      // console.log(diff / Math.PI * 12)
      if (SEVEN_PI_OVER_TWELVE < diff && diff < SEVENTEEN_PI_OVER_TWELVE) {
        state.control.forward = false;
        state.control.sprint = false;
        state.control.back = true;
        // console.log("back");
      } else if (NINETEEN_PI_OVER_TWELVE < diff || diff < FIVE_PI_OVER_TWELVE) {
        state.control.forward = true;
        state.control.sprint = sprint;
        state.control.back = false;
      } else {
        state.control.forward = false;
        state.control.back = false;
        state.control.sprint = false;
      }
    };
  }

  static buildFullController(...controllers: Controller[]): Controller {
    return (state, ticks) => {
      controllers.forEach((control) => control(state, ticks));
    };
  }
}
