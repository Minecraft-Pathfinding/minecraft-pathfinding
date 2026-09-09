import { Vec3 } from 'vec3'
import {
  getPhysicsConstants,
  ElytraPhysicsConstants
} from './physics-constants'
import { cloneElytraState, tickElytra } from './glide-physics'
import { CollisionResolver, ElytraState } from './types'
import type { PhysicsUtilElytraAdapter } from './physics-util-elytra'

export interface LandingMpcOptions {
  horizonTicks?: number
  yawSamples?: number
  pitchSamples?: number
  collisionResolver?: CollisionResolver
  physicsUtil?: PhysicsUtilElytraAdapter
  constants?: ElytraPhysicsConstants
  supportY?: number
  padRadius?: number
  maxComputeMs?: number
}

export interface LandingMpcControl {
  yaw: number
  pitch: number
  score: number
  predictedError: number
  predictedSpeed: number
  predictedVerticalSpeed: number
  predictedTouchdown: boolean
  predictedCollision: boolean
  predictedTicks: number
  predictedBrakeTicks: number
}

const DEG = Math.PI / 180
const MAX_YAW_STEP = 0.24
const MAX_PITCH_STEP = 0.12
const TOUCHDOWN_VERTICAL_TOLERANCE = 0.28
const TOUCHDOWN_HORIZONTAL_SPEED = 0.22
const TOUCHDOWN_VERTICAL_SPEED = 0.22

function wrapRadians(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2
  while (angle <= -Math.PI) angle += Math.PI * 2
  return angle
}

function slewAngle(from: number, to: number): number {
  const delta = wrapRadians(to - from)
  return Math.abs(delta) <= MAX_YAW_STEP
    ? to
    : from + Math.sign(delta) * MAX_YAW_STEP
}

function slewPitch(from: number, to: number): number {
  const delta = to - from
  return Math.abs(delta) <= MAX_PITCH_STEP
    ? to
    : from + Math.sign(delta) * MAX_PITCH_STEP
}

function sampleOffsets(maxDegrees: number, count: number): number[] {
  const samples = Math.max(1, Math.floor(count))
  if (samples === 1) return [0]
  return Array.from(
    { length: samples },
    (_, index) => (-maxDegrees + (2 * maxDegrees * index) / (samples - 1)) * DEG
  )
}

function touchdown(
  state: ElytraState,
  target: Vec3,
  supportY: number,
  padRadius: number
): boolean {
  return (
    state.pos.xzDistanceTo(target) <= padRadius &&
    Math.abs(state.pos.y - supportY) <= TOUCHDOWN_VERTICAL_TOLERANCE &&
    Math.hypot(state.vel.x, state.vel.z) <= TOUCHDOWN_HORIZONTAL_SPEED &&
    Math.abs(state.vel.y) <= TOUCHDOWN_VERTICAL_SPEED
  )
}

export function computeLandingMpc(
  state: ElytraState,
  target: Vec3,
  options: LandingMpcOptions = {}
): LandingMpcControl {
  const constants = options.constants ?? getPhysicsConstants()
  const supportY = options.supportY ?? target.y
  const padRadius = options.padRadius ?? 0.18
  const deadline =
    options.maxComputeMs == null
      ? Infinity
      : performance.now() + options.maxComputeMs
  const startDistance = state.pos.xzDistanceTo(target)
  const horizontalSpeed = Math.hypot(state.vel.x, state.vel.z)
  const horizon = Math.max(
    10,
    Math.min(
      28,
      Math.floor(
        options.horizonTicks ??
          14 +
            Math.ceil(Math.min(7, startDistance)) +
            Math.ceil(horizontalSpeed * 3)
      )
    )
  )
  const targetYaw = Math.atan2(
    -(target.x - state.pos.x),
    -(target.z - state.pos.z)
  )
  const velocityYaw =
    horizontalSpeed > 0.04 ? Math.atan2(-state.vel.x, -state.vel.z) : targetYaw
  const brakeYaw = velocityYaw + Math.PI
  const directPitch = Math.max(
    -16 * DEG,
    Math.min(
      18 * DEG,
      Math.atan2(supportY - state.pos.y, Math.max(startDistance, 1))
    )
  )

  const targetYawOffsets = sampleOffsets(30, options.yawSamples ?? 5)
  const brakeYawOffsets = sampleOffsets(30, options.yawSamples ?? 5)
  const pitchOffsets = sampleOffsets(12, options.pitchSamples ?? 6)
  const targetYaws = targetYawOffsets.map((offset) => targetYaw + offset)
  const brakeYaws =
    horizontalSpeed > 0.04
      ? brakeYawOffsets.map((offset) => brakeYaw + offset)
      : [targetYaw]
  const pitches = Array.from(
    new Set(
      pitchOffsets.map((offset) =>
        Math.max(-30 * DEG, Math.min(20 * DEG, directPitch + offset))
      )
    )
  )

  let best: LandingMpcControl = {
    yaw: targetYaw,
    pitch: directPitch,
    score: Infinity,
    predictedError: Infinity,
    predictedSpeed: Infinity,
    predictedVerticalSpeed: Infinity,
    predictedTouchdown: false,
    predictedCollision: true,
    predictedTicks: horizon,
    predictedBrakeTicks: 0
  }

  const candidates = [...targetYaws, ...brakeYaws]
  for (const desiredYaw of candidates) {
    for (const desiredPitch of pitches) {
      if (performance.now() >= deadline) return best
      const candidate = cloneElytraState(state)
      let collided = false
      let landed = false
      let ticks = horizon
      let closestDistance = Infinity
      let closestSpeed = Infinity
      let closestVerticalSpeed = Infinity
      let speedAtFourBlocks = Infinity

      for (let tick = 1; tick <= horizon; tick++) {
        if (performance.now() >= deadline) return best
        candidate.yaw = slewAngle(candidate.yaw, desiredYaw)
        candidate.pitch = slewPitch(candidate.pitch, desiredPitch)
        const result = tickElytra(
          candidate,
          options.physicsUtil != null ? undefined : options.collisionResolver,
          constants,
          options.physicsUtil
        )
        Object.assign(candidate, result.state)
        ticks = tick

        const d = candidate.pos.xzDistanceTo(target)
        if (d < closestDistance) {
          closestDistance = d
          closestSpeed = Math.hypot(candidate.vel.x, candidate.vel.z)
          closestVerticalSpeed = Math.abs(candidate.vel.y)
        }
        if (d <= 4 && speedAtFourBlocks === Infinity) {
          speedAtFourBlocks = Math.hypot(candidate.vel.x, candidate.vel.z)
        }

        if (result.collidedHorizontally) {
          collided = true
          break
        }
        if (result.collidedVertically) {
          landed = touchdown(candidate, target, supportY, padRadius)
          collided = !landed
          break
        }
        if (touchdown(candidate, target, supportY, padRadius)) {
          landed = true
          break
        }
      }

      const endDistance = candidate.pos.xzDistanceTo(target)
      const endHeightError = Math.abs(candidate.pos.y - supportY)
      const endHorizontalSpeed = Math.hypot(candidate.vel.x, candidate.vel.z)
      const endVerticalSpeed = Math.abs(candidate.vel.y)
      const lowAltitudeWeight = Math.max(
        0,
        1 - Math.min(1, Math.max(0, candidate.pos.y - supportY) / 5)
      )
      const distancePenalty = closestDistance * 900 + endDistance * 650
      const speedPenalty =
        closestSpeed * 280 +
        endHorizontalSpeed * (360 + lowAltitudeWeight * 520)
      const brakingEnvelopePenalty =
        speedAtFourBlocks === Infinity
          ? 0
          : Math.max(0, speedAtFourBlocks - TOUCHDOWN_HORIZONTAL_SPEED) ** 2 *
            1_000_000
      const terminalRadiusPenalty = Math.max(0, endDistance - padRadius) * 3_500
      const terminalSpeedPenalty =
        Math.max(0, endHorizontalSpeed - TOUCHDOWN_HORIZONTAL_SPEED) ** 2 *
        800_000
      const verticalPenalty =
        closestVerticalSpeed * 180 +
        endVerticalSpeed * 180 +
        endHeightError * 320
      const touchdownPositionPenalty = landed
        ? 0
        : Math.max(0, closestDistance - padRadius) * 1800
      const belowPenalty = Math.max(0, supportY - candidate.pos.y) * 12000
      const collisionPenalty = collided ? 1e8 : 0
      const touchdownReward = landed ? -2e8 : 0
      const controlPenalty =
        Math.abs(wrapRadians(desiredYaw - state.yaw)) * 0.2 +
        Math.abs(desiredPitch - state.pitch) * 0.1
      const score =
        collisionPenalty +
        touchdownReward +
        distancePenalty +
        speedPenalty +
        brakingEnvelopePenalty +
        terminalRadiusPenalty +
        terminalSpeedPenalty +
        verticalPenalty +
        touchdownPositionPenalty +
        belowPenalty +
        controlPenalty +
        ticks * 0.03

      if (score < best.score) {
        best = {
          yaw: slewAngle(state.yaw, desiredYaw),
          pitch: slewPitch(state.pitch, desiredPitch),
          score,
          predictedError: endDistance,
          predictedSpeed: candidate.vel.norm(),
          predictedVerticalSpeed: endVerticalSpeed,
          predictedTouchdown: landed,
          predictedCollision: collided,
          predictedTicks: ticks,
          predictedBrakeTicks: 0
        }
      }
    }
  }

  return best
}
