import { Vec3 } from 'vec3'

const DEG = Math.PI / 180

export const LANDING_ENGAGE_XZ = 72
export const LANDING_BRAKE_SPEED = 0.62
export const LANDING_FLARE_SPEED = 0.12
export const LANDING_TOUCHDOWN_HORIZONTAL = 0.14
export const LANDING_TOUCHDOWN_VERTICAL = 0.16
export const LANDING_FLARE_RANGE = 1.25
export const LANDING_FLARE_HEIGHT = 1.25
export const LANDING_SETTLE_RANGE = 0.45
export const LANDING_SETTLE_HEIGHT = 1.0
export const LANDING_GO_AROUND_RANGE = 1.75
export const LANDING_GO_AROUND_SPEED = 0.48
export const LANDING_GO_AROUND_PITCH = 22 * DEG
export const LANDING_BRAKE_PITCH = 7 * DEG
export const LANDING_FLARE_PITCH = 20 * DEG
export const LANDING_MAX_APPROACH_PITCH = 16 * DEG
const BRAKE_HEADING_MIN_SPEED = 0.12

export type LandingControlMode =
  | 'line'
  | 'brake'
  | 'flare'
  | 'settle'
  | 'go-around'

export interface LandingControl {
  yaw: number
  pitch: number
  mode: LandingControlMode
  horizontalDistance: number
  horizontalSpeed: number
  verticalSpeed: number
  speed: number
  predictedStopDistance: number
  touchdownFeasible: boolean
}

function bearing(from: Vec3, to: Vec3): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

function velocityYaw(velocity: Vec3, fallback: number): number {
  const speed = Math.hypot(velocity.x, velocity.z)
  return speed > 1e-4 ? Math.atan2(-velocity.x, -velocity.z) : fallback
}

function yawTowardBrakingPoint(
  position: Vec3,
  velocity: Vec3,
  target: Vec3,
  stopDistance: number
): number {
  const speed = Math.hypot(velocity.x, velocity.z)
  if (speed < BRAKE_HEADING_MIN_SPEED) return bearing(position, target)
  const vx = velocity.x / speed
  const vz = velocity.z / speed
  const toTargetX = target.x - position.x
  const toTargetZ = target.z - position.z
  const targetLen = Math.hypot(toTargetX, toTargetZ)
  const targetWeight =
    targetLen > 1e-4
      ? Math.min(0.3, (targetLen / Math.max(1, stopDistance)) * 0.3)
      : 0
  const brakeWeight = 1 - targetWeight
  const dx =
    -vx * brakeWeight +
    (targetLen > 1e-4 ? toTargetX / targetLen : 0) * targetWeight
  const dz =
    -vz * brakeWeight +
    (targetLen > 1e-4 ? toTargetZ / targetLen : 0) * targetWeight
  return bearing(position, new Vec3(position.x + dx, target.y, position.z + dz))
}

export function computeLandingControl(
  position: Vec3,
  velocity: Vec3,
  target: Vec3,
  fallbackYaw: number,
  previousMode?: LandingControlMode,
  supportY = target.y
): LandingControl {
  const horizontalDistance = position.xzDistanceTo(target)
  const horizontalSpeed = Math.hypot(velocity.x, velocity.z)
  const verticalSpeed = Math.abs(velocity.y)
  const speed = velocity.norm()
  const height = position.y - supportY
  const predictedStopDistance = Math.max(
    0.5,
    horizontalSpeed * 1.75 + (horizontalSpeed * horizontalSpeed) / 0.11
  )
  const nearGround = height <= 3.5
  const unsafeToCommit =
    nearGround &&
    horizontalSpeed > LANDING_GO_AROUND_SPEED &&
    horizontalDistance <
      Math.max(LANDING_GO_AROUND_RANGE, predictedStopDistance * 0.5)
  if (unsafeToCommit && horizontalDistance > 2.5 && previousMode !== 'settle') {
    const awayYaw =
      horizontalSpeed > 0.02
        ? velocityYaw(velocity, bearing(position, target))
        : bearing(position, target)
    const lateralYaw = awayYaw + Math.PI
    return {
      yaw: lateralYaw,
      pitch: LANDING_GO_AROUND_PITCH,
      mode: 'go-around',
      horizontalDistance,
      horizontalSpeed,
      verticalSpeed,
      speed,
      predictedStopDistance,
      touchdownFeasible: false
    }
  }

  if (
    (previousMode === 'settle' || horizontalDistance <= LANDING_SETTLE_RANGE) &&
    height <= LANDING_SETTLE_HEIGHT &&
    horizontalSpeed <= LANDING_TOUCHDOWN_HORIZONTAL &&
    verticalSpeed <= LANDING_TOUCHDOWN_VERTICAL
  ) {
    return {
      yaw: horizontalDistance > 0.18 ? bearing(position, target) : fallbackYaw,
      pitch: LANDING_FLARE_PITCH,
      mode: 'settle',
      horizontalDistance,
      horizontalSpeed,
      verticalSpeed,
      speed,
      predictedStopDistance,
      touchdownFeasible: true
    }
  }

  if (
    horizontalDistance <= LANDING_FLARE_RANGE &&
    height <= LANDING_FLARE_HEIGHT &&
    horizontalSpeed <= LANDING_FLARE_SPEED &&
    verticalSpeed <= 0.34
  ) {
    return {
      yaw: horizontalDistance > 1.5 ? bearing(position, target) : fallbackYaw,
      pitch: LANDING_FLARE_PITCH,
      mode: 'flare',
      horizontalDistance,
      horizontalSpeed,
      verticalSpeed,
      speed,
      predictedStopDistance,
      touchdownFeasible: true
    }
  }

  if (
    predictedStopDistance + 0.35 > Math.max(horizontalDistance, 0.25) ||
    (previousMode === 'brake' && horizontalSpeed > LANDING_FLARE_SPEED) ||
    (horizontalSpeed > LANDING_BRAKE_SPEED &&
      horizontalDistance < Math.max(12, predictedStopDistance * 1.5))
  ) {
    return {
      yaw: yawTowardBrakingPoint(
        position,
        velocity,
        target,
        predictedStopDistance
      ),
      pitch: height <= 5 ? LANDING_BRAKE_PITCH : 0,
      mode: 'brake',
      horizontalDistance,
      horizontalSpeed,
      verticalSpeed,
      speed,
      predictedStopDistance,
      touchdownFeasible: horizontalSpeed <= LANDING_BRAKE_SPEED
    }
  }

  const desiredPitch = Math.max(
    -10 * DEG,
    Math.min(
      LANDING_MAX_APPROACH_PITCH,
      Math.atan2(supportY - position.y, Math.max(horizontalDistance, 1))
    )
  )

  return {
    yaw: horizontalDistance > 0.3 ? bearing(position, target) : fallbackYaw,
    pitch: desiredPitch,
    mode: 'line',
    horizontalDistance,
    horizontalSpeed,
    verticalSpeed,
    speed,
    predictedStopDistance,
    touchdownFeasible: horizontalSpeed <= LANDING_BRAKE_SPEED
  }
}
