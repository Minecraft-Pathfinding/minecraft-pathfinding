import { EntityPhysics } from '@nxg-org/mineflayer-physics-util/dist/physics/engines'
import { EntityState } from '@nxg-org/mineflayer-physics-util/dist/physics/states'
import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'
import { Vec3 } from 'vec3'
import { World } from '../../world/worldInterface'
import { BaseSimulator, Controller, EPhysicsCtx, OnGoalReachFunction, SimulationGoal } from '@nxg-org/mineflayer-physics-util'
import { smartMovement, strafeMovement, wrapRadians } from '../controls'

// const ZERO = (0 * Math.PI) / 12
const PI_OVER_TWELVE = (1 * Math.PI) / 12
// const TWO_PI_OVER_TWELVE = (2 * Math.PI) / 12
// const THREE_PI_OVER_TWELVE = (3 * Math.PI) / 12
// const FOUR_PI_OVER_TWELVE = (4 * Math.PI) / 12
const FIVE_PI_OVER_TWELVE = (5 * Math.PI) / 12
// const SIX_PI_OVER_TWELVE = (6 * Math.PI) / 12
const SEVEN_PI_OVER_TWELVE = (7 * Math.PI) / 12
// const EIGHT_PI_OVER_TWELVE = (8 * Math.PI) / 12
// const NINE_PI_OVER_TWELVE = (9 * Math.PI) / 12
// const TEN_PI_OVER_TWELVE = (10 * Math.PI) / 12
const ELEVEN_PI_OVER_TWELVE = (11 * Math.PI) / 12
// const TWELVE_PI_OVER_TWELVE = (12 * Math.PI) / 12
const THIRTEEN_PI_OVER_TWELVE = (13 * Math.PI) / 12
// const FOURTEEN_PI_OVER_TWELVE = (14 * Math.PI) / 12
// const FIFTEEN_PI_OVER_TWELVE = (15 * Math.PI) / 12
// const SIXTEEN_PI_OVER_TWELVE = (16 * Math.PI) / 12
const SEVENTEEN_PI_OVER_TWELVE = (17 * Math.PI) / 12
// const EIGHTEEN_PI_OVER_TWELVE = (18 * Math.PI) / 12
const NINETEEN_PI_OVER_TWELVE = (19 * Math.PI) / 12
// const TWENTY_PI_OVER_TWELVE = (20 * Math.PI) / 12
// const TWENTY_ONE_PI_OVER_TWELVE = (21 * Math.PI) / 12
// const TWENTY_TWO_PI_OVER_TWELVE = (22 * Math.PI) / 12
const TWENTY_THREE_PI_OVER_TWELVE = (23 * Math.PI) / 12
// const TWENTY_FOUR_PI_OVER_TWELVE = (24 * Math.PI) / 12

/**
 * To be used once per movement.
 *
 * Provide state that will serve as a base. The state itself will not be modified/consumed unless called for.
 */
export class JumpSim extends BaseSimulator {
  public readonly world: World

  constructor (public readonly physics: EntityPhysics, world: World) {
    super(physics)
    this.world = world
  }

  public clone (): JumpSim {
    return new JumpSim(this.physics, this.world)
  }

  simulateUntilNextTick (ctx: EPhysicsCtx): EntityState {
    return this.simulateUntil(
      () => false,
      () => {},
      () => {},
      ctx,
      this.world,
      1
    )
  }

  simulateUntilOnGround (ctx: EPhysicsCtx, ticks = 5, goal: SimulationGoal = () => false): EntityState {
    const state = this.simulateUntil(
      JumpSim.buildAnyGoal(goal, (state, ticks) => ticks > 0 && state.onGround),
      () => {},
      () => {},
      ctx,
      this.world,
      ticks
    )

    // if (print) {
    // console.trace("potentially good", state.pos, state.vel, goal(state, 0));
    // console.trace();
    // }
    return state
  }

  simulateSmartAim (goal: AABB[], goalVec: Vec3, ctx: EPhysicsCtx, sprint: boolean, jump: boolean, jumpAfter = 0, ticks = 20): EntityState {
    return this.simulateUntil(
      JumpSim.getReachedAABB(goal),
      JumpSim.getCleanupPosition(goalVec),
      JumpSim.buildFullController(
        JumpSim.getControllerStraightAim(goalVec),
        // JumpSim.getControllerStrafeAim(goal),
        // JumpSim.getControllerSmartMovement(goal, sprint),
        JumpSim.getControllerJumpSprint(jump, sprint, jumpAfter)
      ),
      ctx,
      this.world,
      ticks
    )
  }

  /**
   * Assume we know the correct back-up position.
   */
  simulateBackUpBeforeJump (ctx: EPhysicsCtx, goal: Vec3, sprint: boolean, strafe = true, ticks = 20): EntityState {
    const aim = strafe ? JumpSim.getControllerStrafeAim(goal) : JumpSim.getControllerStraightAim(goal)
    return this.simulateUntil(
      (state) => state.pos.xzDistanceTo(goal) < 0.1,
      JumpSim.getCleanupPosition(goal),
      JumpSim.buildFullController(aim, JumpSim.getControllerSmartMovement(goal, sprint), (state, ticks) => {
        state.control.sprint = false
        state.control.sneak = true
      }),
      ctx,
      this.world,
      ticks
    )
  }

  simulateJumpFromEdgeOfBlock (ctx: EPhysicsCtx, srcAABBs: AABB[], goalCorner: Vec3, goalBlock: AABB[], sprint: boolean, ticks = 20): EntityState {
    let jump = false
    let changed = false

    // console.log('edge jump init', ctx.state.pos)
    return this.simulateUntil(
      JumpSim.getReachedAABB(goalBlock),
      JumpSim.getCleanupPosition(goalCorner),
      JumpSim.buildFullController(
        JumpSim.getControllerStraightAim(goalCorner),
        JumpSim.getControllerStrafeAim(goalCorner),
        JumpSim.getControllerSmartMovement(goalCorner, sprint),
        (state, ticks) => {
          // console.log('jump edge', state.age, state.pos)
          state.control.sneak = false
          // check if player is leaving src block collision
          const playerBB = state.getAABB()
          playerBB.expand(0, 1e-6, 0)
          if (jump && state.pos.xzDistanceTo(goalCorner) < 0.5 && !changed) {
            // goalCorner.set(goalBlockTop.x, goalBlockTop.y, goalBlockTop.z)
            changed = true
          }
          if (ticks > 0 && srcAABBs.every((src) => !src.intersects(playerBB)) && !jump) {
            state.control.jump = true
            jump = true
          } else {
            state.control.jump = false
          }
        }
      ),
      ctx,
      this.world,
      ticks
    )
  }

  static getReachedAABB (bbs: AABB[]): SimulationGoal {
    if (bbs.length === 0) throw new Error('JumpSim: No AABBs for goal provided')
    const maxY = bbs.reduce((max, a) => Math.max(max, a.maxY), -Infinity)

    const lastXZVel = new Vec3(0, 0, 0)
    return (state) => {
      const bb = AABBUtils.getPlayerAABB({ position: state.pos, width: 0.5999, height: 1.8 })
      // if (state.pos.y >= maxY-0.3) console.log('hm?',state.age, state.pos, bbs)
      const xzVel = state.vel.offset(0, -state.vel.y, 0)

      // make sure bump does not occur.
      const ret = state.pos.y >= maxY && bbs.some((a) => a.collides(bb)) && lastXZVel.norm() - xzVel.norm() < 0.04

      return ret
    }
  }

  static getCleanupPosition (...path: Vec3[]): OnGoalReachFunction {
    return (state) => {
      state.clearControlStates()
    }
  }

  static getControllerStraightAim (nextPoint: Vec3): Controller {
    return (state, ticks) => {
      const dx = nextPoint.x - state.pos.x
      const dz = nextPoint.z - state.pos.z
      state.yaw = Math.atan2(-dx, -dz)
    }
  }

  // right should be positiive,
  // left should be negative.
  static getControllerStrafeAim (nextPoint: Vec3): Controller {
    return (state, ticks) => strafeMovement(state, nextPoint)

    // commented out for testing.
    // eslint-disable-next-line no-unreachable
    return (state, ticks) => {
      const offset = state.pos.plus(state.onGround ? state.vel : state.vel.scaled(1))
      const dx = nextPoint.x - offset.x
      const dz = nextPoint.z - offset.z
      const wantedYaw = wrapRadians(Math.atan2(-dx, -dz))
      const diff = wrapRadians(wantedYaw - state.yaw)

      if (PI_OVER_TWELVE < diff && diff < ELEVEN_PI_OVER_TWELVE) {
        state.control.left = true // are these reversed? tf
        state.control.right = false
        // console.log("left");
      } else if (THIRTEEN_PI_OVER_TWELVE < diff && diff < TWENTY_THREE_PI_OVER_TWELVE) {
        state.control.left = false
        state.control.right = true
        // console.log("right");
      } else {
        state.control.left = false
        state.control.right = false
        // console.log("rotate neither, left:", state.control.movements.left, "right:", state.control.movements.right);
      }
    }
  }

  static getControllerJumpSprint (jump: boolean, sprint: boolean, jumpAfter = 0): Controller {
    return (state, ticks) => {
      state.control.jump = state.onGround && jump && ticks >= jumpAfter
      state.control.sprint = sprint
    }
  }

  // forward should be any value that abs. val to below pi / 2
  // backward is any value that abs. val to above pi / 2
  static getControllerSmartMovement (goal: Vec3, sprint: boolean): Controller {
    return (state, ticks) => smartMovement(state, goal, sprint)

    // commented out for testing.
    // eslint-disable-next-line no-unreachable
    return (state, ticks) => {
      const offset = state.pos.plus(state.onGround ? state.vel : state.vel.scaled(1))
      const dx = goal.x - offset.x
      const dz = goal.z - offset.z
      const wantedYaw = wrapRadians(Math.atan2(-dx, -dz))
      const diff = wrapRadians(wantedYaw - state.yaw)
      // console.log(diff / Math.PI * 12)
      if (SEVEN_PI_OVER_TWELVE < diff && diff < SEVENTEEN_PI_OVER_TWELVE) {
        state.control.forward = false
        state.control.sprint = false
        state.control.back = true
        // console.log("back");
      } else if (NINETEEN_PI_OVER_TWELVE < diff || diff < FIVE_PI_OVER_TWELVE) {
        state.control.forward = true
        state.control.sprint = sprint
        state.control.back = false
      } else {
        state.control.forward = false
        state.control.back = false
        state.control.sprint = false
      }
    }
  }

  static buildFullController (...controllers: Controller[]): Controller {
    return (state, ticks) => {
      controllers.forEach((control) => control(state, ticks))
    }
  }
}
