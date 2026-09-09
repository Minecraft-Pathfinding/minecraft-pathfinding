import { Vec3 } from 'vec3'
import { ElytraState } from './types'

export interface ApproachControl {
  distance: number
  horizontalDistance: number
  horizontalSpeed: number
  brakingDistance: number
  finalApproach: boolean
  shouldBoost: boolean
}

export function assessFlightApproach(
  state: ElytraState,
  target: Vec3,
  reactionTicks = 3,
  minimumBrakingDistance = 4
): ApproachControl {
  const verticalDistance = Math.abs(state.pos.y - target.y)
  const horizontalDistance = state.pos.xzDistanceTo(target)
  const distance = state.pos.distanceTo(target)
  const horizontalSpeed = Math.hypot(state.vel.x, state.vel.z)
  const brakingDistance = Math.max(
    minimumBrakingDistance,
    horizontalSpeed * reactionTicks + minimumBrakingDistance
  )
  return {
    distance,
    horizontalDistance,
    horizontalSpeed,
    brakingDistance,
    finalApproach:
      horizontalDistance < brakingDistance && verticalDistance <= 8,
    shouldBoost:
      (horizontalDistance >= brakingDistance || verticalDistance > 8) &&
      horizontalSpeed < 1
  }
}
