import { Vec3 } from 'vec3'
import {
  getPhysicsConstants,
  ElytraPhysicsConstants
} from './physics-constants'
import {
  createElytraState,
  cloneElytraState,
  tickElytra
} from './glide-physics'
import { CollisionResolver, ElytraState } from './types'
import type { PhysicsUtilElytraAdapter } from './physics-util-elytra'

export interface AvoidancePlan {
  yaw: number
  pitch: number
  score: number
  clearTicks: number
  predictedDistance: number
  predictedAltitudeChange: number
  collided: boolean
}

const DEG = Math.PI / 180
const YAW_OFFSETS = [
  0, 15, -15, 30, -30, 45, -45, 60, -60, 90, -90, 120, -120, 150, -150, 180
].map((v) => v * DEG)
const PITCH_OFFSETS = [-25, -15, -5, 0, 8, 15, 22, 30, 38, 45, 55].map(
  (v) => v * DEG
)
const DEFAULT_HORIZON = 18
const MAX_YAW_STEP = 0.2
const MAX_PITCH_STEP = 0.12
const TARGET_PLANE_RADIUS = 0.75
const TARGET_PLANE_SPEED = 0.12
const NO_FIREWORKS = Object.freeze({
  speedThreshold: Number.POSITIVE_INFINITY,
  verticalTrigger: Number.POSITIVE_INFINITY,
  offCourseDistance: Number.POSITIVE_INFINITY,
  intendedOrigin: new Vec3(0, Number.NEGATIVE_INFINITY, 0)
})

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

export function planPhysicsAvoidance(
  state: ElytraState,
  target: Vec3,
  physicsUtil: PhysicsUtilElytraAdapter,
  constants: ElytraPhysicsConstants = getPhysicsConstants(),
  horizonTicks = DEFAULT_HORIZON,
  collisionResolver?: CollisionResolver,
  preferredYaw?: number
): AvoidancePlan {
  const horizon = Math.max(6, Math.floor(horizonTicks))
  const targetYaw = Math.atan2(
    -(target.x - state.pos.x),
    -(target.z - state.pos.z)
  )
  const baseYaw = targetYaw
  const startDistance = state.pos.xzDistanceTo(target)
  const startHorizontalSpeed = Math.hypot(state.vel.x, state.vel.z)
  let best: AvoidancePlan | undefined

  for (const yawOffset of YAW_OFFSETS) {
    for (const pitchOffset of PITCH_OFFSETS) {
      const desiredYaw = baseYaw + yawOffset
      const desiredPitch = pitchOffset
      const candidate = cloneElytraState(state)
      let clearTicks = 0
      let collided = false
      let minY = candidate.pos.y
      let closestDistance = Infinity
      let speedAtFourBlocks = Infinity
      let radiusAtTargetPlane =
        state.pos.y <= target.y ? startDistance : Infinity
      let speedAtTargetPlane =
        state.pos.y <= target.y ? startHorizontalSpeed : Infinity

      for (let tick = 0; tick < horizon; tick++) {
        candidate.yaw = slewAngle(candidate.yaw, desiredYaw, MAX_YAW_STEP)
        candidate.pitch = slewValue(
          candidate.pitch,
          desiredPitch,
          MAX_PITCH_STEP
        )
        const result = tickElytra(
          candidate,
          collisionResolver,
          constants,
          collisionResolver == null ? physicsUtil : undefined
        )
        Object.assign(candidate, result.state)
        minY = Math.min(minY, candidate.pos.y)
        const candidateDistance = candidate.pos.xzDistanceTo(target)
        const candidateSpeed = Math.hypot(candidate.vel.x, candidate.vel.z)
        closestDistance = Math.min(closestDistance, candidateDistance)
        if (candidateDistance <= 4 && speedAtFourBlocks === Infinity)
          speedAtFourBlocks = candidateSpeed
        if (candidate.pos.y <= target.y && radiusAtTargetPlane === Infinity) {
          radiusAtTargetPlane = candidateDistance
          speedAtTargetPlane = candidateSpeed
        }
        if (result.collided) {
          collided = true
          break
        }
        clearTicks++
      }

      const finalDistance = candidate.pos.xzDistanceTo(target)
      const altitudeLoss = Math.max(0, state.pos.y - minY)
      const netAltitude = candidate.pos.y - state.pos.y
      const turnCost =
        Math.abs(wrapRadians(desiredYaw - state.yaw)) * 0.25 +
        Math.abs(desiredPitch - state.pitch) * 0.2
      const headingOffset = Math.abs(wrapRadians(desiredYaw - targetYaw))
      const isBelowTargetPlane = radiusAtTargetPlane !== Infinity
      const isOrbitHeading =
        !isBelowTargetPlane &&
        headingOffset >= 60 * DEG &&
        headingOffset <= 120 * DEG
      const targetAlignmentCost = isOrbitHeading
        ? headingOffset * 1.5
        : headingOffset * 8
      const collisionPenalty = collided ? 100000 : 0
      const clearReward = clearTicks * 6000
      const progressDelta = startDistance - finalDistance
      const progressReward = progressDelta * 400
      const radialRegressionPenalty = Math.max(0, -progressDelta) * 3000
      const altitudeReward = netAltitude * 18 - altitudeLoss * 8
      const altitudeSafetyPenalty =
        netAltitude < 0 ? Math.abs(netAltitude) * 20000 : 0
      const finalHorizontalSpeed = Math.hypot(candidate.vel.x, candidate.vel.z)
      const brakingReward =
        (startHorizontalSpeed - finalHorizontalSpeed) *
        (isOrbitHeading ? 180 : 30)
      const brakingEnvelopePenalty =
        speedAtFourBlocks === Infinity
          ? 0
          : Math.max(0, speedAtFourBlocks - 0.12) ** 2 * 1_000_000
      const targetPlaneRadiusPenalty =
        radiusAtTargetPlane === Infinity
          ? 0
          : Math.max(0, radiusAtTargetPlane - TARGET_PLANE_RADIUS) ** 2 * 10_000
      const targetPlaneSpeedPenalty =
        speedAtTargetPlane === Infinity
          ? 0
          : Math.max(0, speedAtTargetPlane - TARGET_PLANE_SPEED) ** 2 *
            1_000_000
      const belowTargetConvergencePenalty = isBelowTargetPlane
        ? finalDistance * 25_000 + finalHorizontalSpeed * 12_000
        : 0
      const nearTargetSpeedPenalty =
        speedAtFourBlocks === Infinity && closestDistance <= 6
          ? Math.max(0, finalHorizontalSpeed - 0.12) * 125000
          : 0
      const continuityReference = preferredYaw ?? state.yaw
      const continuityCost = isOrbitHeading
        ? Math.abs(wrapRadians(desiredYaw - continuityReference)) * 180
        : isBelowTargetPlane
          ? Math.abs(wrapRadians(desiredYaw - continuityReference)) * 400
          : 0
      const score =
        clearReward +
        progressReward +
        altitudeReward +
        brakingReward -
        brakingEnvelopePenalty -
        targetPlaneRadiusPenalty -
        targetPlaneSpeedPenalty -
        belowTargetConvergencePenalty -
        nearTargetSpeedPenalty -
        radialRegressionPenalty -
        altitudeSafetyPenalty -
        (isOrbitHeading ? 0 : finalDistance * 4) -
        turnCost -
        targetAlignmentCost -
        continuityCost -
        collisionPenalty

      if (best == null || score > best.score) {
        best = {
          yaw: desiredYaw,
          pitch: desiredPitch,
          score,
          clearTicks,
          predictedDistance: finalDistance,
          predictedAltitudeChange: netAltitude,
          collided
        }
      }
    }
  }

  return (
    best ?? {
      yaw: targetYaw,
      pitch: 15 * DEG,
      score: -Infinity,
      clearTicks: 0,
      predictedDistance: startDistance,
      predictedAltitudeChange: 0,
      collided: true
    }
  )
}

export function simulateAvoidancePlan(
  state: ElytraState,
  plan: AvoidancePlan,
  physicsUtil: PhysicsUtilElytraAdapter,
  constants: ElytraPhysicsConstants = getPhysicsConstants(),
  horizonTicks = DEFAULT_HORIZON,
  collisionResolver?: CollisionResolver
): ElytraState {
  const candidate = createElytraState(state, constants)
  for (let tick = 0; tick < horizonTicks; tick++) {
    candidate.yaw = slewAngle(candidate.yaw, plan.yaw, MAX_YAW_STEP)
    candidate.pitch = slewValue(candidate.pitch, plan.pitch, MAX_PITCH_STEP)
    const result = tickElytra(
      candidate,
      collisionResolver,
      constants,
      collisionResolver == null ? physicsUtil : undefined
    )
    Object.assign(candidate, result.state)
    if (result.collided) break
  }
  return candidate
}

export {
  MAX_YAW_STEP as AVOIDANCE_MAX_YAW_STEP,
  MAX_PITCH_STEP as AVOIDANCE_MAX_PITCH_STEP,
  NO_FIREWORKS
}
