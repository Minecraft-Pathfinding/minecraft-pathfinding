import { Controller, EntityState } from "@nxg-org/mineflayer-physics-util";
import { Bot } from "mineflayer";
import { Vec3 } from "vec3";

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
const TWO_PI = 2 * Math.PI;

// TODO: move to utils
export function wrapDegrees(degrees: number): number {
  const tmp = degrees % 360;
  return tmp < 0 ? tmp + TWO_PI : tmp;
}

export function wrapRadians(radians: number): number {
  const tmp = radians % TWO_PI;
  // console.log('radians', radians, 'tmp', tmp, tmp < 0 ? tmp + Math.PI : tmp - Math.PI);
  return tmp < 0 ? tmp + Math.PI : tmp > 0 ? tmp - Math.PI : tmp;
}


/**
 * control strafing left-to-right dependent on offset to current goal.
 * @param nextPoint
 * @returns
 */
export function strafeMovement(state: EntityState, nextPoint: Vec3) {
  const offset = state.pos.plus(state.vel);
  const dx = nextPoint.x - offset.x;
  const dz = nextPoint.z - offset.z;
  const wantedYaw = wrapDegrees(Math.atan2(-dx, -dz));
  const diff = wrapDegrees(wantedYaw - state.yaw);
  if (PI_OVER_TWELVE < diff && diff < ELEVEN_PI_OVER_TWELVE) {
    state.control.set("left", true); // are these reversed? tf
    state.control.set("right", false);
  } else if (THIRTEEN_PI_OVER_TWELVE < diff && diff < TWENTY_THREE_PI_OVER_TWELVE) {
    state.control.set("left", false);
    state.control.set("right", true);
  } else {
    state.control.set("left", false);
    state.control.set("right", false);

    // console.log("rotate neither, left:", state.control.movements.left, "right:", state.control.movements.right);
  }
}

/**
 * control strafing left-to-right dependent on offset to current goal.
 * @param nextPoint
 * @returns
 */
export function botStrafeMovement(bot: Bot, nextPoint: Vec3) {
  const offset = bot.entity.position.plus(bot.entity.velocity);
  const dx = nextPoint.x - offset.x;
  const dz = nextPoint.z - offset.z;
  const wantedYaw = wrapDegrees(Math.atan2(-dx, -dz));
  const diff = wrapDegrees(wantedYaw - bot.entity.yaw);
  if (PI_OVER_TWELVE < diff && diff < ELEVEN_PI_OVER_TWELVE) {
    bot.setControlState("left", true); // are these reversed? tf
    bot.setControlState("right", false);
  } else if (THIRTEEN_PI_OVER_TWELVE < diff && diff < TWENTY_THREE_PI_OVER_TWELVE) {
    bot.setControlState("left", false);
    bot.setControlState("right", true);
  } else {
    bot.setControlState("left", false);
    bot.setControlState("right", false);
  }
}

/**
 * Dependent on offset to current goal, control forward/backward movement.
 * Used in tandem with strafe aim.
 * @param goal
 * @param sprint
 * @returns
 */
export function smartMovement(state: EntityState, goal: Vec3, sprint: boolean) {
  // if (state.vel.x === 0 && state.vel.z === 0) return;
  const offset = state.pos.plus(state.onGround ? state.vel : state.vel.scaled(1));

  const dx = goal.x - offset.x;
  const dz = goal.z - offset.z;
  const wantedYaw = wrapDegrees(Math.atan2(-dx, -dz));
  const diff = wrapDegrees(wantedYaw - state.yaw);

  if (SEVEN_PI_OVER_TWELVE < diff && diff < SEVENTEEN_PI_OVER_TWELVE) {
    state.control.set("forward", false);
    state.control.set("sprint", false);
    state.control.set("back", true);

    // console.log("back");
  } else if (NINETEEN_PI_OVER_TWELVE < diff || diff < FIVE_PI_OVER_TWELVE) {
    state.control.set("forward", true);
    state.control.set("sprint", sprint);
    state.control.set("back", false);
  } else {
    state.control.set("forward", false);
    state.control.set("sprint", false);
    state.control.set("back", false);
  }
}

/**
 *
 * @param bot
 * @param goal
 * @param sprint
 * @returns
 */
export function botSmartMovement(bot: Bot, goal: Vec3, sprint: boolean) {
  const offset = bot.entity.position.plus(bot.entity.velocity);
  const dx = goal.x - offset.x;
  const dz = goal.z - offset.z;
  const wantedYaw = wrapDegrees(Math.atan2(-dx, -dz));
  const diff = wrapDegrees(wantedYaw - bot.entity.yaw);
  // console.log(diff / Math.PI * 12)
  if (SEVEN_PI_OVER_TWELVE < diff && diff < SEVENTEEN_PI_OVER_TWELVE) {
    bot.setControlState("forward", false);
    bot.setControlState("sprint", false);
    bot.setControlState("back", true);

    // console.log("back");
  } else if (NINETEEN_PI_OVER_TWELVE < diff || diff < FIVE_PI_OVER_TWELVE) {
    bot.setControlState("forward", true);
    bot.setControlState("sprint", sprint);
    bot.setControlState("back", false);
  } else {
    bot.setControlState("forward", false);
    bot.setControlState("sprint", false);
    bot.setControlState("back", false);
  }
}
