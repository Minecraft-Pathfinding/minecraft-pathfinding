import { Controller, EPhysicsCtx, EntityState } from '@nxg-org/mineflayer-physics-util'
import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { getViewDir } from '../../utils'

const ZERO = (0 * Math.PI) / 12
const PI_OVER_TWELVE = (1 * Math.PI) / 12
const TWO_PI_OVER_TWELVE = (2 * Math.PI) / 12
const THREE_PI_OVER_TWELVE = (3 * Math.PI) / 12
const FOUR_PI_OVER_TWELVE = (4 * Math.PI) / 12
const FIVE_PI_OVER_TWELVE = (5 * Math.PI) / 12
const SIX_PI_OVER_TWELVE = (6 * Math.PI) / 12
const SEVEN_PI_OVER_TWELVE = (7 * Math.PI) / 12
const EIGHT_PI_OVER_TWELVE = (8 * Math.PI) / 12
const NINE_PI_OVER_TWELVE = (9 * Math.PI) / 12
const TEN_PI_OVER_TWELVE = (10 * Math.PI) / 12
const ELEVEN_PI_OVER_TWELVE = (11 * Math.PI) / 12
const TWELVE_PI_OVER_TWELVE = (12 * Math.PI) / 12
const THIRTEEN_PI_OVER_TWELVE = (13 * Math.PI) / 12
const FOURTEEN_PI_OVER_TWELVE = (14 * Math.PI) / 12
const FIFTEEN_PI_OVER_TWELVE = (15 * Math.PI) / 12
const SIXTEEN_PI_OVER_TWELVE = (16 * Math.PI) / 12
const SEVENTEEN_PI_OVER_TWELVE = (17 * Math.PI) / 12
const EIGHTEEN_PI_OVER_TWELVE = (18 * Math.PI) / 12
const NINETEEN_PI_OVER_TWELVE = (19 * Math.PI) / 12
const TWENTY_PI_OVER_TWELVE = (20 * Math.PI) / 12
const TWENTY_ONE_PI_OVER_TWELVE = (21 * Math.PI) / 12
const TWENTY_TWO_PI_OVER_TWELVE = (22 * Math.PI) / 12
const TWENTY_THREE_PI_OVER_TWELVE = (23 * Math.PI) / 12
const TWENTY_FOUR_PI_OVER_TWELVE = (24 * Math.PI) / 12
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
  const xzVel = velocity
  const dir1 = getViewDir({ yaw, pitch })

  const amt = xzVel.norm()

  // if we're traveling fast enough, account ahead of time for the velocity.
  // 0.15 is about full speed for sprinting. Anything above that and we're jumping.
  // another method of doing this is vel.y > 0 ? 2 : 1
  // const offset = bot.entity.position.plus(bot.entity.velocity.scaled(amt > 0.15 ? 2 : 1));
  let scale = onGround ? 0 : 1
  if (amt > 0.16) scale = 2
  const offset = position.plus(velocity.scaled(scale))
  const lookDiff = wrapRadians(wrapRadians(yaw))
  if (xzVel.norm() < 0.03) {
    // console.log("no vel, so different calc.", currentPoint, nextPoint, position);
    // return 0;

    const dir = nextPoint.minus(offset)
    const dx = dir.x
    const dz = dir.z

    // const dir1 = nextPoint.minus(bot.entity.position)
    const dx1 = dir1.x
    const dz1 = dir1.z

    const wantedYaw = wrapRadians(Math.atan2(-dx, -dz))
    const moveYaw = wrapRadians(Math.atan2(-dx1, -dz1))

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
  const dx1 = dir1.x
  const dz1 = dir1.z

  const wantedYaw = wrapRadians(Math.atan2(-dx, -dz))

  // console.log(nextPoint, currentPoint, dx, dz, dx1, dz1)

  // const moveYaw = wrapRadians(Math.atan2(-dx1, -dz1));
  const moveYaw = wrapRadians(Math.atan2(-dx1, -dz1))

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
export function strafeMovement (ctx: EntityState, nextPoint: Vec3) {
  const diff = findDiff(ctx.pos, ctx.vel, ctx.yaw, ctx.pitch, nextPoint, ctx.onGround)

  const lookDiff = wrapRadians(wrapRadians(ctx.yaw))

  if (PI_OVER_TWELVE < diff && diff < ELEVEN_PI_OVER_TWELVE) {
    // console.log('going left')
    ctx.control.set('left', false) // are these reversed? tf
    ctx.control.set('right', true)
  } else if (THIRTEEN_PI_OVER_TWELVE < diff && diff < TWENTY_THREE_PI_OVER_TWELVE) {
    // console.log('going right')
    ctx.control.set('left', true)
    ctx.control.set('right', false)
  } else {
    // console.log('going neither strafe')
    ctx.control.set('left', false)
    ctx.control.set('right', false)
  }
}

/**
 * control strafing left-to-right dependent on offset to current goal.
 * @param nextPoint
 * @returns
 */
// currentPoint,
export function botStrafeMovement (bot: Bot, currentPoint: Vec3, nextPoint: Vec3) {
  const diff = findDiff(bot.entity.position, bot.entity.velocity, bot.entity.yaw, bot.entity.pitch, nextPoint, bot.entity.onGround)

  const lookDiff = wrapRadians(wrapRadians(bot.entity.yaw))

  // diff = wrapRadians(diff + lookDiff)

  // console.log('strafe diff', diff, diff / Math.PI * 12)

  if (PI_OVER_TWELVE < diff && diff < ELEVEN_PI_OVER_TWELVE) {
    // console.log('going left')
    bot.setControlState('left', false) // are these reversed? tf
    bot.setControlState('right', true)
  } else if (THIRTEEN_PI_OVER_TWELVE < diff && diff < TWENTY_THREE_PI_OVER_TWELVE) {
    // console.log('going right')
    bot.setControlState('left', true)
    bot.setControlState('right', false)
  } else {
    // console.log('going neither strafe')
    bot.setControlState('left', false)
    bot.setControlState('right', false)
  }
}

/**
 * Dependent on offset to current goal, control forward/backward movement.
 * Used in tandem with strafe aim.
 * @param goal
 * @param sprint
 * @returns
 */
// currentPoint,
export function smartMovement (ctx: EntityState, nextPoint: Vec3, sprint = true) {
  // console.log('hey!')
  const diff = findDiff(ctx.pos, ctx.vel, ctx.yaw, ctx.pitch, nextPoint, ctx.onGround)

  const lookDiff = wrapRadians(wrapRadians(ctx.yaw))

  // diff = wrapRadians(diff + lookDiff)

  // console.log('forward/back diff', diff, diff / Math.PI * 12)

  if (SEVEN_PI_OVER_TWELVE < diff && diff < SEVENTEEN_PI_OVER_TWELVE) {
    // console.log('going back')
    ctx.control.set('forward', false)
    ctx.control.set('sprint', false)
    ctx.control.set('back', true)

    // console.log("back");
  } else if (NINETEEN_PI_OVER_TWELVE < diff || diff < FIVE_PI_OVER_TWELVE) {
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
export function botSmartMovement (bot: Bot, currentPoint: Vec3, nextPoint: Vec3, sprint: boolean) {
  const diff = findDiff(bot.entity.position, bot.entity.velocity, bot.entity.yaw, bot.entity.pitch, nextPoint, bot.entity.onGround)

  const lookDiff = wrapRadians(wrapRadians(bot.entity.yaw))

  // diff = wrapRadians(diff + lookDiff)

  // console.log('forward/back diff', diff, diff / Math.PI * 12)

  if (SEVEN_PI_OVER_TWELVE < diff && diff < SEVENTEEN_PI_OVER_TWELVE) {
    // console.log('going back')
    bot.setControlState('forward', false)
    bot.setControlState('sprint', false)
    bot.setControlState('back', true)

    // console.log("back");
  } else if (NINETEEN_PI_OVER_TWELVE < diff || diff < FIVE_PI_OVER_TWELVE) {
    // console.log('going forward')
    bot.setControlState('forward', true)
    bot.setControlState('sprint', sprint)
    bot.setControlState('back', false)
  } else {
    // console.log('going neither')
    bot.setControlState('forward', false)
    bot.setControlState('sprint', false)
    bot.setControlState('back', false)
  }
}
