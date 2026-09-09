import { Vec3 } from 'vec3'
import { World } from '../../world/worldInterface'
import { CollisionResolver } from './types'
import {
  ElytraPhysicsConstants,
  getPhysicsConstants
} from './physics-constants'
type Box = [number, number, number, number, number, number]
export type SampleBlock = 'unloaded' | 'solid' | null
function boxesForBlock(block: any): Box[] {
  if (
    Array.isArray(block?.boxes) &&
    block.boxes.every((x: any) => Array.isArray(x) && x.length === 6)
  )
    return block.boxes
  if (
    Array.isArray(block?.boundingBoxes) &&
    block.boundingBoxes.every((x: any) => Array.isArray(x) && x.length === 6)
  )
    return block.boundingBoxes
  if (block?.boundingBox === 'empty' || block?.physical !== true) return []
  const h = Number.isFinite(block?.height) ? block.height : 1
  return [[0, 0, 0, 1, h, 1]]
}
function intersects(
  block: any,
  bx: number,
  by: number,
  bz: number,
  p: Vec3,
  c: ElytraPhysicsConstants
) {
  const half = c.playerWidth / 2 + c.contactEpsilon
  const p0x = p.x - half
  const p1x = p.x + half
  const p0y = p.y
  const p1y = p.y + c.playerHeight
  const p0z = p.z - half
  const p1z = p.z + half
  for (const b of boxesForBlock(block)) {
    const [x0, y0, z0, x1, y1, z1] = b
    if (
      p1x > bx + x0 - c.contactEpsilon &&
      p0x < bx + x1 + c.contactEpsilon &&
      p1y > by + y0 &&
      p0y < by + y1 &&
      p1z > bz + z0 - c.contactEpsilon &&
      p0z < bz + z1 + c.contactEpsilon
    )
      return true
  }
  return false
}
export function classifySample(
  world: World,
  pos: Vec3,
  c = getPhysicsConstants()
): SampleBlock {
  const half = c.playerWidth / 2 + c.contactEpsilon
  const minX = Math.floor(pos.x - half)
  const maxX = Math.floor(pos.x + half)
  const minY = Math.floor(pos.y) - 1
  const maxY = Math.floor(pos.y + c.playerHeight) + 1
  const minZ = Math.floor(pos.z - half)
  const maxZ = Math.floor(pos.z + half)
  let unknown = false
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++)
      for (let z = minZ; z <= maxZ; z++) {
        const b = world.getBlockInfo(new Vec3(x, y, z))
        if (b?.isInvalid) {
          unknown = true
          continue
        }
        if (intersects(b, x, y, z, pos, c)) return 'solid'
      }
  return unknown ? 'unloaded' : null
}
function resolveAxis(
  world: World,
  pos: Vec3,
  delta: number,
  axis: 'x' | 'y' | 'z',
  c: ElytraPhysicsConstants
) {
  if (Math.abs(delta) < 1e-12) return { position: pos, collided: false }
  const n = Math.max(2, Math.ceil(Math.abs(delta) / 0.125))
  let lo = 0
  let hi = 1
  let prev = 0
  let hit = false
  for (let i = 1; i <= n; i++) {
    const f = i / n
    const p = pos.clone()
    p[axis] += delta * f
    if (classifySample(world, p, c) === 'solid') {
      lo = prev
      hi = f
      hit = true
      break
    }
    prev = f
  }
  if (!hit) {
    const p = pos.clone()
    p[axis] += delta
    return { position: p, collided: false }
  }
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    const p = pos.clone()
    p[axis] += delta * mid
    if (classifySample(world, p, c) === 'solid') hi = mid
    else lo = mid
  }
  const p = pos.clone()
  p[axis] += delta * lo
  p[axis] -=
    Math.sign(delta) * Math.min(Math.abs(delta) * 1e-3, c.contactEpsilon * 8)
  return { position: p, collided: true }
}
export function createBlockCollisionResolver(
  world: World,
  c: ElytraPhysicsConstants = getPhysicsConstants()
): CollisionResolver {
  return (position, velocity) => {
    let p = position.clone()
    const x = resolveAxis(world, p, velocity.x, 'x', c)
    p = x.position
    const z = resolveAxis(world, p, velocity.z, 'z', c)
    p = z.position
    const y = resolveAxis(world, p, velocity.y, 'y', c)
    const resolvedVelocity = velocity.clone()
    if (x.collided) resolvedVelocity.x = 0
    if (z.collided) resolvedVelocity.z = 0
    if (y.collided) resolvedVelocity.y = 0
    return {
      position: y.position,
      collidedHorizontally: x.collided || z.collided,
      collidedVertically: y.collided,
      velocity: resolvedVelocity
    }
  }
}
