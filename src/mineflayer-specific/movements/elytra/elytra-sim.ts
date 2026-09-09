import { Vec3 } from 'vec3'
import {
  getPhysicsConstants,
  fireworkDuration,
  ElytraPhysicsConstants
} from './physics-constants'
import {
  activateFirework,
  createElytraState,
  tickElytra
} from './glide-physics'
import {
  shouldDeployFirework,
  FireworkPolicyOptions,
  DEFAULT_FIREWORK_POLICY
} from './firework-policy'
import { solvePitchTowards, solvePitchTowardsFast } from './pitch-solver'
import {
  CollisionResolver,
  ElytraStateInput,
  GlideSimulationResult
} from './types'
import type { PhysicsUtilElytraAdapter } from './physics-util-elytra'

export interface GlideSimulationOptions {
  maxTicks: number
  arrivalTolerance?: number
  fireworkFlightDuration?: number
  fireworkPolicy?: FireworkPolicyOptions
  collisionResolver?: CollisionResolver
  physicsUtil?: PhysicsUtilElytraAdapter
  constants?: ElytraPhysicsConstants
  pitchMode?: 'precise' | 'fast'
  maxYawStep?: number
  maxPitchStep?: number
}

function wrapRadians(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2
  while (angle <= -Math.PI) angle += Math.PI * 2
  return angle
}

function slewAngle(from: number, to: number, maxStep: number): number {
  const delta = wrapRadians(to - from)
  return Math.abs(delta) <= maxStep ? to : from + Math.sign(delta) * maxStep
}

function slewValue(from: number, to: number, maxStep: number): number {
  const delta = to - from
  return Math.abs(delta) <= maxStep ? to : from + Math.sign(delta) * maxStep
}

export function simulateGlideTo(
  input: ElytraStateInput,
  target: Vec3,
  options: GlideSimulationOptions
): GlideSimulationResult {
  if (!Number.isInteger(options.maxTicks) || options.maxTicks < 0)
    throw new RangeError('maxTicks must be a non-negative integer')
  const constants = options.constants ?? getPhysicsConstants()
  const tolerance = options.arrivalTolerance ?? 1
  const state = createElytraState(input, constants)
  const trajectory = [state.pos.clone()]
  let fireworksUsed = 0
  let pitchHint: number | undefined
  const maxYawStep = options.maxYawStep ?? 0.14
  const maxPitchStep = options.maxPitchStep ?? 0.1
  const policy = options.fireworkPolicy ?? DEFAULT_FIREWORK_POLICY
  const policyWithOrigin =
    policy.intendedOrigin == null
      ? { ...policy, intendedOrigin: input.pos }
      : policy

  for (let tick = 1; tick <= options.maxTicks; tick++) {
    const direction = target.minus(state.pos)
    const targetYaw = Math.atan2(-direction.x, -direction.z)
    const targetPitch =
      options.pitchMode === 'fast'
        ? solvePitchTowardsFast(state, target, constants, pitchHint)
        : solvePitchTowards(
            state,
            target,
            Math.min(20, options.maxTicks - tick + 1),
            constants
          )
    state.yaw = slewAngle(state.yaw, targetYaw, maxYawStep)
    state.pitch = slewValue(state.pitch, targetPitch, maxPitchStep)
    pitchHint = state.pitch

    if (shouldDeployFirework(state, target, policyWithOrigin, constants)) {
      activateFirework(
        state,
        options.fireworkFlightDuration ??
          constants.defaultFireworkFlightDuration,
        constants
      )
      fireworksUsed++
      pitchHint = undefined
    }

    const result = tickElytra(
      state,
      options.physicsUtil != null ? undefined : options.collisionResolver,
      constants,
      options.physicsUtil
    )
    Object.assign(state, result.state)
    trajectory.push(state.pos.clone())

    if (result.collided) {
      return {
        collided: true,
        reachedIntended: false,
        ticksUsed: tick,
        trajectory,
        fireworksUsed,
        finalState: state
      }
    }
    if (state.pos.distanceTo(target) <= tolerance) {
      return {
        collided: false,
        reachedIntended: true,
        ticksUsed: tick,
        trajectory,
        fireworksUsed,
        finalState: state
      }
    }
  }

  return {
    collided: false,
    reachedIntended: false,
    ticksUsed: options.maxTicks,
    trajectory,
    fireworksUsed,
    finalState: state
  }
}

export { fireworkDuration }
