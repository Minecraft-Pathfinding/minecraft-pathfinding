import { Vec3 } from 'vec3'
import {
  getPhysicsConstants,
  ElytraPhysicsConstants
} from './physics-constants'
import { ElytraState } from './types'

export interface FireworkPolicyOptions {
  speedThreshold: number
  verticalTrigger: number
  offCourseDistance: number
  intendedOrigin?: Vec3
}

export const DEFAULT_FIREWORK_POLICY: Readonly<FireworkPolicyOptions> =
  Object.freeze({
    speedThreshold: 0.55,
    verticalTrigger: 3,
    offCourseDistance: 12
  })

function horizontalDistanceFromLine(
  position: Vec3,
  origin: Vec3,
  target: Vec3
): number {
  const dx = target.x - origin.x
  const dz = target.z - origin.z
  const length = Math.hypot(dx, dz)
  if (length < 1e-9)
    return Math.hypot(position.x - origin.x, position.z - origin.z)
  return (
    Math.abs(dz * (position.x - origin.x) - dx * (position.z - origin.z)) /
    length
  )
}

export function shouldDeployFirework(
  state: ElytraState,
  target: Vec3,
  options: FireworkPolicyOptions = DEFAULT_FIREWORK_POLICY,
  constants: ElytraPhysicsConstants = getPhysicsConstants()
): boolean {
  if (
    !state.fallFlying ||
    state.fireworkRocketDuration > 0 ||
    state.fireworkCooldown > 0
  )
    return false

  const origin = options.intendedOrigin ?? state.pos
  const horizontalSpeed = Math.hypot(state.vel.x, state.vel.z)

  const verticalDeficit = Math.max(0, origin.y - state.pos.y)
  if (verticalDeficit >= options.verticalTrigger) return true
  if (state.vel.y < -0.05 && verticalDeficit >= 1 && horizontalSpeed < 1.25)
    return true
  if (horizontalSpeed < options.speedThreshold) return true

  const offCourse =
    options.intendedOrigin != null &&
    horizontalDistanceFromLine(state.pos, options.intendedOrigin, target) >
      options.offCourseDistance
  if (offCourse && horizontalSpeed < 1.0) return true

  return false
}
