import { IEntityState } from '@nxg-org/mineflayer-physics-util'
import { Vec3 } from 'vec3'

const TWO_PI = 2 * Math.PI

export function wrapRadians (radians: number): number {
  const tmp = radians % TWO_PI
  return tmp < 0 ? tmp + TWO_PI : tmp
}

export function signedRadians (radians: number): number {
  const wrapped = wrapRadians(radians)
  return wrapped > Math.PI ? wrapped - TWO_PI : wrapped
}

export function desiredYawTo (from: Vec3, target: Vec3): number {
  const dx = target.x - from.x
  const dz = target.z - from.z
  return wrapRadians(Math.atan2(-dx, -dz))
}

export function desiredPitchTo (from: Vec3, target: Vec3): number {
  const delta = target.minus(from)
  const groundDistance = Math.sqrt(delta.x * delta.x + delta.z * delta.z)
  return Math.atan2(delta.y, groundDistance)
}

export function stepYawTowards (currentYaw: number, targetYaw: number, maxStepRad: number): number {
  const delta = signedRadians(targetYaw - currentYaw)
  const step = Math.max(-maxStepRad, Math.min(maxStepRad, delta))
  return wrapRadians(currentYaw + step)
}

export function applyNeoLook (state: IEntityState, target: Vec3, maxYawStepRad = Math.PI / 12): void {
  const eyePos = state.pos.offset(0, state.height - 0.18, 0)
  const targetYaw = desiredYawTo(eyePos, target)
  state.yaw = stepYawTowards(state.yaw, targetYaw, maxYawStepRad)
  state.pitch = desiredPitchTo(eyePos, target)
}
