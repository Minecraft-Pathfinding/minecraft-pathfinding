import { Vec3 } from 'vec3'
import { World } from '../../world/worldInterface'
import { ElytraPhysicsConstants } from './physics-constants'
import { classifySample } from './block-collision'
export interface UnsafeSample {
  position: Vec3
  index: number
  reason: 'solid' | 'unloaded'
}
export function findFirstUnsafeSample(
  world: World,
  traj: Vec3[],
  c: ElytraPhysicsConstants,
  maxStep = 0.125
): UnsafeSample | null {
  if (traj.length === 0) return null
  const first = classifySample(world, traj[0], c)
  if (first) return { position: traj[0].clone(), index: 0, reason: first }
  for (let i = 1; i < traj.length; i++) {
    const a = traj[i - 1]
    const b = traj[i]
    const d = a.distanceTo(b)
    const n = Math.max(1, Math.ceil(d / maxStep))
    for (let j = 1; j <= n; j++) {
      const p = a.plus(b.minus(a).scaled(j / n))
      const s = classifySample(world, p, c)
      if (s) return { position: p, index: i, reason: s }
    }
  }
  return null
}
