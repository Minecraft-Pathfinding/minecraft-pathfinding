import { Vec3 } from 'vec3'
import {
  getPhysicsConstants,
  ElytraPhysicsConstants
} from './physics-constants'
import {
  cloneElytraState,
  createElytraState,
  tickElytra
} from './glide-physics'
import { CollisionResolver, ElytraState } from './types'
import type { PhysicsUtilElytraAdapter } from './physics-util-elytra'

export interface FlightObservation {
  pos: Vec3
  vel: Vec3
  yaw: number
  pitch: number
  onGround: boolean
  fallFlying: boolean
}
export interface FlightStateEstimate {
  observed: ElytraState
  predicted: ElytraState
  positionError: Vec3
  velocityError: Vec3
  positionErrorDistance: number
  velocityErrorDistance: number
  anomalous: boolean
}
export interface FlightStateErrorThresholds {
  position: number
  velocity: number
}
export const DEFAULT_FLIGHT_ERROR_THRESHOLDS: Readonly<FlightStateErrorThresholds> =
  Object.freeze({ position: 1.5, velocity: 0.75 })

export function observeFlightState(
  observation: FlightObservation,
  constants: ElytraPhysicsConstants = getPhysicsConstants()
): ElytraState {
  return createElytraState(
    {
      pos: observation.pos,
      vel: observation.vel,
      yaw: observation.yaw,
      pitch: observation.pitch,
      onGround: observation.onGround,
      fallFlying: observation.fallFlying,
      validElytraEquipped: true
    },
    constants
  )
}

export function estimateFlightState(
  observation: FlightObservation,
  previousPrediction?: ElytraState,
  thresholds: FlightStateErrorThresholds = DEFAULT_FLIGHT_ERROR_THRESHOLDS,
  constants: ElytraPhysicsConstants = getPhysicsConstants()
): FlightStateEstimate {
  const observed = observeFlightState(observation, constants)
  const predicted =
    previousPrediction == null ? observed : cloneElytraState(previousPrediction)
  const positionError = observed.pos.minus(predicted.pos)
  const velocityError = observed.vel.minus(predicted.vel)
  const positionErrorDistance = positionError.norm()
  const velocityErrorDistance = velocityError.norm()
  return {
    observed,
    predicted,
    positionError,
    velocityError,
    positionErrorDistance,
    velocityErrorDistance,
    anomalous:
      positionErrorDistance > thresholds.position ||
      velocityErrorDistance > thresholds.velocity
  }
}

export function predictNextFlightState(
  state: ElytraState,
  collisionResolver?: CollisionResolver,
  physicsUtil?: PhysicsUtilElytraAdapter,
  constants: ElytraPhysicsConstants = getPhysicsConstants()
): ElytraState {
  return tickElytra(
    state,
    physicsUtil != null ? undefined : collisionResolver,
    constants,
    physicsUtil
  ).state
}
