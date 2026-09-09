import { Vec3 } from 'vec3'
import {
  getPhysicsConstants,
  ElytraPhysicsConstants
} from './physics-constants'
import { applyGlideUpdate, cloneElytraState } from './glide-physics'
import { ElytraState } from './types'

const MIN_PITCH = -Math.PI / 2
const MAX_PITCH = Math.PI / 2

function projectedVerticalDisplacement(
  state: ElytraState,
  pitch: number,
  ticks: number,
  constants: ElytraPhysicsConstants
): number {
  const probe = cloneElytraState(state)
  probe.pitch = pitch
  probe.fallFlying = true
  for (let tick = 0; tick < ticks; tick++) {
    applyGlideUpdate(probe, constants)
    probe.pos.y += probe.vel.y
  }
  return probe.pos.y - state.pos.y
}
const COARSE_SAMPLES = 36
const REFINEMENT_ITERATIONS = 20
function solvePitchCore(
  state: ElytraState,
  target: Vec3,
  horizonTicks: number,
  constants: ElytraPhysicsConstants,
  coarseSamples: number,
  refinementIterations: number,
  hintPitch?: number,
  hintBracket = 0
): number {
  const horizontalDistance = Math.hypot(
    target.x - state.pos.x,
    target.z - state.pos.z
  )
  if (horizontalDistance < 1e-9)
    return target.y >= state.pos.y ? MAX_PITCH : MIN_PITCH

  const desiredVertical = target.y - state.pos.y

  let low: number
  let high: number
  if (hintPitch != null) {
    low = Math.max(MIN_PITCH, hintPitch - hintBracket)
    high = Math.min(MAX_PITCH, hintPitch + hintBracket)
  } else {
    let bestPitch = MIN_PITCH
    let bestError = Infinity
    for (let i = 0; i <= coarseSamples; i++) {
      const pitch = MIN_PITCH + (MAX_PITCH - MIN_PITCH) * (i / coarseSamples)
      const vertical = projectedVerticalDisplacement(
        state,
        pitch,
        horizonTicks,
        constants
      )
      const error = Math.abs(vertical - desiredVertical)
      if (error < bestError) {
        bestError = error
        bestPitch = pitch
      }
    }
    const step = (MAX_PITCH - MIN_PITCH) / coarseSamples
    low = Math.max(MIN_PITCH, bestPitch - step)
    high = Math.min(MAX_PITCH, bestPitch + step)
  }

  for (let iteration = 0; iteration < refinementIterations; iteration++) {
    const firstThird = low + (high - low) / 3
    const secondThird = high - (high - low) / 3
    const errorAtFirst = Math.abs(
      projectedVerticalDisplacement(
        state,
        firstThird,
        horizonTicks,
        constants
      ) - desiredVertical
    )
    const errorAtSecond = Math.abs(
      projectedVerticalDisplacement(
        state,
        secondThird,
        horizonTicks,
        constants
      ) - desiredVertical
    )
    if (errorAtFirst < errorAtSecond) high = secondThird
    else low = firstThird
  }
  return (low + high) / 2
}

export function solvePitchTowards(
  state: ElytraState,
  target: Vec3,
  horizonTicks = 20,
  constants: ElytraPhysicsConstants = getPhysicsConstants()
): number {
  return solvePitchCore(
    state,
    target,
    horizonTicks,
    constants,
    COARSE_SAMPLES,
    REFINEMENT_ITERATIONS
  )
}

export function closedFormGlideRatio(
  pitch: number,
  constants: ElytraPhysicsConstants = getPhysicsConstants()
): number {
  const state: ElytraState = {
    pos: new Vec3(0, 0, 0),
    vel: new Vec3(0, 0, 0),
    yaw: 0,
    pitch,
    onGround: false,
    lastOnGround: false,
    fallFlying: true,
    validElytraEquipped: true,
    fireworkRocketDuration: 0,
    fireworkCooldown: 0,
    levitation: 0,
    gravity: constants.gravity
  }
  for (let tick = 0; tick < 200; tick++) applyGlideUpdate(state, constants)
  const horizontalSpeed = Math.hypot(state.vel.x, state.vel.z)
  return horizontalSpeed === 0 ? 0 : Math.abs(state.vel.y) / horizontalSpeed
}
const FAST_HORIZON_TICKS = 3
const FAST_COARSE_SAMPLES = 8
const FAST_REFINEMENT_ITERATIONS = 6
const FAST_HINT_BRACKET = 0.25

export function solvePitchTowardsFast(
  state: ElytraState,
  target: Vec3,
  constants: ElytraPhysicsConstants = getPhysicsConstants(),
  hintPitch?: number
): number {
  return solvePitchCore(
    state,
    target,
    FAST_HORIZON_TICKS,
    constants,
    FAST_COARSE_SAMPLES,
    FAST_REFINEMENT_ITERATIONS,
    hintPitch,
    FAST_HINT_BRACKET
  )
}
