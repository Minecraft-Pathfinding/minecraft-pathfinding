import { IEntityState } from '@nxg-org/mineflayer-physics-util'
import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'

const debug = require('debug')
const logStrafe = debug('minecraft-pathfinding:controls:strafe')

// const ZERO = (0 * Math.PI) / 12
// const PI_OVER_TWELVE = (1 * Math.PI) / 12
const TWO_PI_OVER_TWELVE = (2 * Math.PI) / 12
// const THREE_PI_OVER_TWELVE = (3 * Math.PI) / 12
const FOUR_PI_OVER_TWELVE = (4 * Math.PI) / 12
// const FIVE_PI_OVER_TWELVE = (5 * Math.PI) / 12
// const SIX_PI_OVER_TWELVE = (6 * Math.PI) / 12
// const SEVEN_PI_OVER_TWELVE = (7 * Math.PI) / 12
const EIGHT_PI_OVER_TWELVE = (8 * Math.PI) / 12
// const NINE_PI_OVER_TWELVE = (9 * Math.PI) / 12
const TEN_PI_OVER_TWELVE = (10 * Math.PI) / 12
// const ELEVEN_PI_OVER_TWELVE = (11 * Math.PI) / 12
// const TWELVE_PI_OVER_TWELVE = (12 * Math.PI) / 12
// const THIRTEEN_PI_OVER_TWELVE = (13 * Math.PI) / 12
const FOURTEEN_PI_OVER_TWELVE = (14 * Math.PI) / 12
// const FIFTEEN_PI_OVER_TWELVE = (15 * Math.PI) / 12
const SIXTEEN_PI_OVER_TWELVE = (16 * Math.PI) / 12
// const SEVENTEEN_PI_OVER_TWELVE = (17 * Math.PI) / 12
// const EIGHTEEN_PI_OVER_TWELVE = (18 * Math.PI) / 12
// const NINETEEN_PI_OVER_TWELVE = (19 * Math.PI) / 12
const TWENTY_PI_OVER_TWELVE = (20 * Math.PI) / 12
// const TWENTY_ONE_PI_OVER_TWELVE = (21 * Math.PI) / 12
const TWENTY_TWO_PI_OVER_TWELVE = (22 * Math.PI) / 12
// const TWENTY_THREE_PI_OVER_TWELVE = (23 * Math.PI) / 12
// const TWENTY_FOUR_PI_OVER_TWELVE = (24 * Math.PI) / 12
const TWO_PI = 2 * Math.PI

// TODO: move to utils
export function wrapDegrees (degrees: number): number {
  const tmp = degrees % 360
  return tmp < 0 ? tmp + 360 : tmp
}

export function wrapRadians (radians: number): number {
  const tmp = radians % TWO_PI
  // console.log('radians', radians, 'tmp', tmp, tmp < 0 ? tmp + Math.PI : tmp - Math.PI);
  return tmp < 0 ? tmp + TWO_PI : tmp
  // return tmp < 0 ? tmp + Math.PI : tmp > 0 ? tmp - Math.PI : tmp;
}

// currentPoint: Vec3
function findDiff (position: Vec3, velocity: Vec3, yaw: number, pitch: number, nextPoint: Vec3, onGround: boolean): number {
  const xzVel = velocity.offset(0, -velocity.y, 0)
  // const dir1 = getViewDir({ yaw, pitch })

  const amt = xzVel.norm()

  // if we're traveling fast enough, account ahead of time for the velocity.
  // 0.15 is about full speed for sprinting. Anything above that and we're jumping.
  // another method of doing this is vel.y > 0 ? 2 : 1
  // const offset = bot.entity.position.plus(bot.entity.velocity.scaled(amt > 0.15 ? 2 : 1));
  let scale = onGround ? 0 : 1
  if (amt > 0.17) scale = 2
  if (position.distanceTo(nextPoint) < 0.3) scale = 0
  if (amt < 0.02) scale = 0
  const offset = position.plus(velocity.scaled(scale))
  const lookDiff = wrapRadians(wrapRadians(yaw))
  if (xzVel.norm() < 0.03) {
    // console.log("no vel, so different calc.", currentPoint, nextPoint, position);
    // return 0;

    const dir = nextPoint.minus(offset)
    const dx = dir.x
    const dz = dir.z

    // const dir1 = nextPoint.minus(bot.entity.position)
    // const dx1 = dir1.x
    // const dz1 = dir1.z

    const wantedYaw = wrapRadians(Math.atan2(-dx, -dz))
    // const moveYaw = wrapRadians(Math.atan2(-dx1, -dz1))

    const diff = wrapRadians(wantedYaw - lookDiff)
    // console.log('diff', diff)
    // // diff = wrapRadians(diff - lookDiff)

    // console.log('wantedYaw', wantedYaw)
    // console.log('moveYaw', moveYaw)
    // console.log('look diff', lookDiff)

    // console.log('entity yaw', bot.entity.yaw, lookDiff)
    // console.log('return', diff)
    // console.log("ratio", diff / Math.PI * 12, '\n\n')
    return diff
  }

  // const dx = nextPoint.x - currentPoint.x;
  // const dz = nextPoint.z - currentPoint.z;

  const dir = nextPoint.minus(offset)
  const dx = dir.x
  const dz = dir.z

  // const dir1 = bot.entity.velocity;
  // const dx1 = dir1.x
  // const dz1 = dir1.z

  const wantedYaw = wrapRadians(Math.atan2(-dx, -dz))

  // console.log(nextPoint, currentPoint, dx, dz, dx1, dz1)

  // const moveYaw = wrapRadians(Math.atan2(-dx1, -dz1));
  // const moveYaw = wrapRadians(Math.atan2(-dx1, -dz1))

  const diff = wrapRadians(wantedYaw - lookDiff)
  // console.log('diff', diff)
  // // diff = wrapRadians(diff - lookDiff)

  // console.log('diff', diff)
  // diff = wrapRadians(diff + lookDiff)

  // console.log('wantedYaw', wantedYaw)
  // console.log('moveYaw', moveYaw)
  // console.log('look diff', lookDiff)
  // console.log('entity yaw', bot.entity.yaw, lookDiff)
  // console.log('return', diff)
  // console.log("ratio", diff / Math.PI * 12, '\n\n')
  return diff
}

/**
 * control strafing left-to-right dependent on offset to current goal.
 * @param nextPoint
 * @returns
 */
// currentPoint: Vec3
export function strafeMovement (ctx: IEntityState, nextPoint: Vec3, strict = false, minDist = 0.1): void {
  applyStrafeMovement(
    {
      pos: ctx.pos,
      vel: ctx.vel,
      yaw: ctx.yaw,
      onGround: ctx.onGround
    },
    nextPoint,
    strict,
    (name, value) => ctx.control.set(name, value),
    (name) => ctx.control.get(name),
    minDist
  )
}

/**
 * control strafing left-to-right dependent on offset to current goal.
 * @param nextPoint
 * @returns
 */
// currentPoint,
export function botStrafeMovement (bot: Bot, nextPoint: Vec3, strict = false, minDist = 0.1): void {
  applyStrafeMovement(
    {
      pos: bot.entity.position,
      vel: bot.entity.velocity,
      yaw: bot.entity.yaw,
      onGround: bot.entity.onGround
    },
    nextPoint,
    strict,
    (name, value) => bot.setControlState(name, value),
    (name) => bot.getControlState(name),
    minDist
  )
}

/**
 * Dependent on offset to current goal, control forward/backward movement.
 * Used in tandem with strafe aim.
 * @param goal
 * @param sprint
 * @returns
 */
// currentPoint,
export function smartMovement (ctx: IEntityState, nextPoint: Vec3, sprint = true, minDist = 0.1): void {
  // console.log('hey!')
  const diff = findDiff(ctx.pos, ctx.vel, ctx.yaw, ctx.pitch, nextPoint, ctx.onGround)

  // console.log(diff)

  if (ctx.pos.distanceTo(nextPoint) < minDist) {
    console.log('stopping since near goal')
    ctx.control.set('forward', false)
    ctx.control.set('back', false)
    return
  }

  // const lookDiff = wrapRadians(wrapRadians(ctx.yaw))

  // diff = wrapRadians(diff + lookDiff)

  // console.log('forward/back diff', diff, diff / Math.PI * 12)

  if (EIGHT_PI_OVER_TWELVE < diff && diff < SIXTEEN_PI_OVER_TWELVE) {
    // console.log('going back')
    ctx.control.set('forward', false)
    ctx.control.set('sprint', false)
    ctx.control.set('back', true)

    // console.log("back");
  } else if (TWENTY_PI_OVER_TWELVE < diff || diff < FOUR_PI_OVER_TWELVE) {
    // console.log('going forward')
    ctx.control.set('forward', true)
    ctx.control.set('sprint', sprint)
    ctx.control.set('back', false)
  } else {
    // console.log('going neither')
    ctx.control.set('forward', false)
    ctx.control.set('sprint', false)
    ctx.control.set('back', false)
  }
}

/**
 *
 * @param bot
 * @param goal
 * @param sprint
 * @returns
 */
// currentPoint,
export function botSmartMovement (bot: Bot, nextPoint: Vec3, sprint: boolean, minDist = 0.1): void {
  const stateLike = {
    pos: bot.entity.position,
    vel: bot.entity.velocity,
    yaw: bot.entity.yaw,
    pitch: bot.entity.pitch,
    onGround: bot.entity.onGround,
    control: { set: (name: string, value: boolean) => bot.setControlState(name as any, value) }
  } as IEntityState

  smartMovement(stateLike, nextPoint, sprint, minDist)
}

type StrafeState = {
  pos: Vec3
  vel: Vec3
  yaw: number
  onGround: boolean
}

type StrafeSetter = (name: 'left' | 'right', value: boolean) => void
type StrafeGetter = (name: 'left' | 'right') => boolean

function applyStrafeMovement (state: StrafeState, nextPoint: Vec3, strict: boolean, set: StrafeSetter, get?: StrafeGetter, minDist = 0.1): void {
  if (strict) {
    const dx = nextPoint.x - state.pos.x
    const dz = nextPoint.z - state.pos.z

    const sin = Math.sin(state.yaw)
    const cos = Math.cos(state.yaw)

    const forwardError = -(dx * sin + dz * cos)
    const sideError = dx * cos - dz * sin
    const sideVel = state.vel.x * cos - state.vel.z * sin

    const dist = state.pos.distanceTo(nextPoint)
    if (dist < minDist) {
      set('left', false)
      set('right', false)
      return
    }

    if (forwardError <= 0) {
      set('left', false)
      set('right', false)
      return
    }

    const startThresh = state.onGround ? 0.08 : 0.04
    const stopThresh = state.onGround ? 0.03 : 0.02

    const predictedSideError = sideError - sideVel * 3.0

    // If we are already strafing, keep going until we are close to centered.
    // This avoids rapid oscillation at the threshold.
    const currentlyLeft = get?.('left') ?? false
    const currentlyRight = get?.('right') ?? false

    logStrafe(
      'strict state pos=%O vel=%O yaw=%d target=%O dist=%d forwardError=%d sideError=%d sideVel=%d predictedSideError=%d onGround=%s left=%s right=%s',
      state.pos,
      state.vel,
      state.yaw,
      nextPoint,
      dist,
      forwardError,
      sideError,
      sideVel,
      predictedSideError,
      state.onGround,
      currentlyLeft,
      currentlyRight
    )

    if (currentlyLeft) {
      if (predictedSideError >= -stopThresh) {
        set('left', false)
        logStrafe('strict branch: clear left at stopThresh=%d', stopThresh)
      }
      set('right', false)
      logStrafe('strict branch: hold left=false right=false from left latch')
      return
    }

    if (currentlyRight) {
      if (predictedSideError <= stopThresh) {
        set('right', false)
        logStrafe('strict branch: clear right at stopThresh=%d', stopThresh)
      }
      set('left', false)
      logStrafe('strict branch: hold left=false %s from right latch', predictedSideError > stopThresh ? 'right=true' : 'right=false')
      return
    }

    if (predictedSideError > startThresh) {
      set('left', false)
      set('right', true)
      logStrafe('strict branch: set right=true startThresh=%d', startThresh)
    } else if (predictedSideError < -startThresh) {
      set('left', true)
      set('right', false)
      logStrafe('strict branch: set left=true startThresh=%d', startThresh)
    } else {
      set('left', false)
      set('right', false)
      logStrafe('strict branch: clear lateral controls startThresh=%d', startThresh)
    }
    return
  }

  const diff = findDiff(state.pos, state.vel, state.yaw, 0, nextPoint, state.onGround)

  console.log('left/right diff:', diff, diff / Math.PI * 12)

  if (state.pos.distanceTo(nextPoint) < minDist) {
    set('left', false)
    set('right', false)
    return
  }

  if (FOURTEEN_PI_OVER_TWELVE < diff && diff < TWENTY_TWO_PI_OVER_TWELVE) {
    set('left', false)
    set('right', true)
  } else if (TWO_PI_OVER_TWELVE < diff && diff < TEN_PI_OVER_TWELVE) {
    set('left', true)
    set('right', false)
  } else {
    set('left', false)
    set('right', false)
  }
}
