import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'
import { Vec3 } from 'vec3'
import { Move } from '../../../src'

const debug = require('debug')
const logNeoAlign = debug('minecraft-pathfinding:neo:align')

const TWO_PI = 2 * Math.PI
export type NeoAlignmentSide = -1 | 1

export interface NeoAlignmentOffsets {
  major: number
  minor: number
}


export function getNeoOffset(distance: number): NeoAlignmentOffsets {
  switch (distance) {
    case 2: return { major: 0.3, minor: 0.2 }
    case 3: return { major: 0.3, minor: 0.2 }
    default: throw `Invalid distance: ${distance}`
  }
}

export function wrapRadians(radians: number): number {
  const tmp = radians % TWO_PI
  return tmp < 0 ? tmp + TWO_PI : tmp
}

export function signedRadians(radians: number): number {
  const wrapped = wrapRadians(radians)
  return wrapped > Math.PI ? wrapped - TWO_PI : wrapped
}

export function getNeoAlignmentSide(move: Move): NeoAlignmentSide | undefined {
  const side = move.metadata.neoSide
  return side === -1 || side === 1 ? side : undefined
}

export function getNeoAlignmentOffsets(move: Move): NeoAlignmentOffsets {
  const dist = move.entryPos.floored().subtract(move.exitPos.floored()).norm()
  console.log('dist', dist)
  return getNeoOffset(dist)
}

function offsetAlignedVertex(
  base: Vec3,
  delta: Vec3,
  xMajor: boolean,
  sideSign: 1 | -1,
  offsets: NeoAlignmentOffsets
): Vec3 {
  const majorSign = (xMajor ? delta.x : delta.z) >= 0 ? 1 : -1

  if (xMajor) {
    return base.clone().offset(
      -majorSign * offsets.major,
      0,
      sideSign * offsets.minor
    )
  }

  return base.clone().offset(
    sideSign * offsets.minor,
    0,
    majorSign * offsets.major
  )
}

export function getNeoAlignmentTarget(move: Move, side?: NeoAlignmentSide): Vec3 {
  const entry = move.entryPos.floored()
  const goal = move.exitPos.floored()
  const delta = move.exitPos.minus(move.entryPos)
  const xMajor = Math.abs(delta.x) >= Math.abs(delta.z)
  const offsets = getNeoAlignmentOffsets(move)

  if (side != null) {
    const path = move.exitPos.minus(move.entryPos)
    const entryCenter = entry.offset(0.5, 0, 0.5)
    const alignedAxis = xMajor
      ? new Vec3(entry.x + (delta.x >= 0 ? 0 : 1), entry.y, entry.z)
      : new Vec3(entry.x, entry.y, entry.z + (delta.z >= 0 ? 0 : 1))
    const candidates = xMajor
      ? [alignedAxis, alignedAxis.offset(0, 0, 1)]
      : [alignedAxis, alignedAxis.offset(1, 0, 0)]

    const chosen = candidates.find((candidate) => {
      const sideVec = candidate.minus(entryCenter)
      const cross = path.x * sideVec.z - path.z * sideVec.x
      return side === -1 ? cross >= 0 : cross < 0
    }) ?? candidates[0]

    const sideSign: 1 | -1 = xMajor
      ? (chosen.z > alignedAxis.z ? 1 : -1)
      : (chosen.x > alignedAxis.x ? 1 : -1)

    return offsetAlignedVertex(chosen, delta, xMajor, sideSign, offsets)
  }

  let bestVert: Vec3

  if (xMajor) {
    bestVert = new Vec3(entry.x + (delta.x >= 0 ? 0 : 1), entry.y, entry.z)
    return offsetAlignedVertex(bestVert, delta, xMajor, -1, offsets)
  }

  bestVert = new Vec3(entry.x, entry.y, entry.z + (delta.z >= 0 ? 0 : 1))
  return offsetAlignedVertex(bestVert, delta, xMajor, -1, offsets)
}

export function getNeoGoalBackVertex(move: Move, approachTarget: Vec3): Vec3 {
  const goal = move.exitPos.floored()
  const delta = move.exitPos.minus(move.entryPos)

  if (Math.abs(delta.x) >= Math.abs(delta.z)) {
    const x = delta.x >= 0 ? goal.x + 1 : goal.x
    const z = approachTarget.z < goal.z + 0.5 ? goal.z : goal.z + 0.5
    return new Vec3(x, goal.y + 1, z)
  }

  const x = approachTarget.x < goal.x + 0.5 ? goal.x : goal.x + 0.5
  const z = delta.z >= 0 ? goal.z + 1 : goal.z
  return new Vec3(x, goal.y + 1, z)
}


export function getNeoDirectYaw(from: Vec3, target: Vec3): number {
  return Math.atan2(-(target.x - from.x), -(target.z - from.z))
}

export function getNeoApproachDirection(move: Move): { axis: 'x' | 'z', sign: 1 | -1 } {
  const delta = move.exitPos.minus(move.entryPos)
  if (Math.abs(delta.x) >= Math.abs(delta.z)) {
    return { axis: 'x', sign: (delta.x >= 0 ? 1 : -1) as 1 | -1 }
  }

  return { axis: 'z', sign: (delta.z >= 0 ? 1 : -1) as 1 | -1 }
}

export interface NeoYawSearchOpts {
  probeDistance?: number
  probeStep?: number
  maxDelta?: number
  directionHint?: 1 | -1
}

export interface NeoYawProbeResult {
  safe: boolean
  reason: 'direct' | 'left' | 'right' | 'no-escape' | 'horizontal-collision' | 'vertical-collision'
  age?: number
}

export interface NeoPhysicsAlignProbeState {
  onGround: boolean
  isCollidedHorizontally: boolean
  isCollidedVertically: boolean
  pos: Vec3
}

export function probeAlignYawPhysics(
  yaw: number,
  step: (yaw: number) => NeoPhysicsAlignProbeState,
  maxTicks = 12
): NeoYawProbeResult {
  logNeoAlign('probeAlignYawPhysics start yaw=%d maxTicks=%d', yaw * (180 / Math.PI), maxTicks)

  for (let i = 0; i < maxTicks; i++) {
    const state = step(yaw)
    logNeoAlign(
      'probeAlignYawPhysics tick=%d yaw=%d onGround=%s vert=%s horiz=%s pos=%O',
      i,
      yaw * (180 / Math.PI),
      state.onGround,
      state.isCollidedHorizontally,
      state.pos
    )

    if (state.isCollidedHorizontally) {
      return { safe: false, reason: 'horizontal-collision' }
    }

    if (!state.onGround) {
      return { safe: true, reason: 'direct' }
    }
  }

  return { safe: false, reason: 'no-escape' }
}

export interface NeoAabbAlignProbeBlockInfo {
  physical: boolean
  liquid: boolean
  position: Vec3
  getBBs(): AABB[]
}

export interface NeoAabbAlignProbeOpts {
  origin: Vec3
  yaw: number
  playerHeight: number
  wallBlocks: AABB[]
  probeDistance?: number
  inflate?: number
}

export function probeAlignYawAABB(opts: NeoAabbAlignProbeOpts): NeoYawProbeResult {
  const probeDistance = opts.probeDistance ?? 1.5
  const inflate = opts.inflate ?? 0.02
  const dir = new Vec3(-Math.sin(opts.yaw), 0, -Math.cos(opts.yaw))
  const startBB = AABBUtils.getPlayerAABBRaw(opts.origin, opts.playerHeight).clone().expand(inflate, 0, inflate)
  const endPos = opts.origin.plus(dir.scaled(probeDistance))
  const endBB = AABBUtils.getPlayerAABBRaw(endPos, opts.playerHeight).clone().expand(inflate, 0, inflate)
  const sweptBB = startBB.expandTowards(dir.scaled(probeDistance)).expand(inflate, 0, inflate)

  const wallHit = opts.wallBlocks.some((bb) => bb.collides(sweptBB))
  if (wallHit) {
    logNeoAlign(
      'probeAlignYawAABB reject wall origin=%O yaw=%d sweptBB=%O walls=%d',
      opts.origin,
      opts.yaw * (180 / Math.PI),
      sweptBB,
      opts.wallBlocks.length
    )
    return { safe: false, reason: 'horizontal-collision' }
  }

  logNeoAlign(
    'probeAlignYawAABB success origin=%O yaw=%d sweptBB=%O walls=%d',
    opts.origin,
    opts.yaw * (180 / Math.PI),
    sweptBB,
    opts.wallBlocks.length
  )
  return { safe: true, reason: 'direct' }
}

export interface NeoWallAabbSource {
  physical: boolean
  position: Vec3
  getBBs(): AABB[]
}

export function collectNeoWallAABBs(
  move: Move,
  getBlockInfo: (pos: Vec3) => NeoWallAabbSource
): AABB[] {
  const delta = move.exitPos.minus(move.entryPos)
  const entry = move.entryPos.floored()
  const goal = move.exitPos.floored()
  const blocks: AABB[] = []

  if (Math.abs(delta.x) >= Math.abs(delta.z)) {
    const stepSign = delta.x >= 0 ? 1 : -1
    for (let x = entry.x + stepSign; x !== goal.x; x += stepSign) {
      for (const y of [entry.y, entry.y + 1]) {
        const info = getBlockInfo(new Vec3(x, y, entry.z))
        if (!info.physical) continue
        const bbs = info.getBBs()
        if (bbs.length === 0) bbs.push(AABB.fromBlock(info.position))
        blocks.push(...bbs)
      }
    }
    return blocks
  }

  const stepSign = delta.z >= 0 ? 1 : -1
  for (let z = entry.z + stepSign; z !== goal.z; z += stepSign) {
    for (const y of [entry.y, entry.y + 1]) {
      const info = getBlockInfo(new Vec3(entry.x, y, z))
      if (!info.physical) continue
      const bbs = info.getBBs()
      if (bbs.length === 0) bbs.push(AABB.fromBlock(info.position))
      blocks.push(...bbs)
    }
  }

  return blocks
}

export function findSafeYaw(
  directYaw: number,
  isSafe: (yaw: number) => NeoYawProbeResult,
  opts: NeoYawSearchOpts = {}
): number {
  const probeStep = opts.probeStep ?? (Math.PI / 180)
  const maxDelta = opts.maxDelta ?? (Math.PI / 3)
  const directionHint = opts.directionHint

  logNeoAlign(
    'findSafeYaw start directYaw=%d probeStep=%d maxDelta=%d directionHint=%s',
    directYaw * (180 / Math.PI),
    probeStep,
    maxDelta,
    directionHint
  )

  const direct = isSafe(directYaw)
  logNeoAlign('findSafeYaw direct yaw=%d safe=%s reason=%s', directYaw * (180 / Math.PI), direct.safe, direct.reason)
  if (direct.safe) return directYaw

  for (let delta = probeStep; delta <= maxDelta; delta += probeStep) {
    if (directionHint == null || directionHint < 0) {
      const left = signedRadians(directYaw - delta)
      const leftSafe = isSafe(left)
      logNeoAlign('findSafeYaw check left delta=%d yaw=%d safe=%s reason=%s age=%d', delta, left * (180 / Math.PI), leftSafe.safe, leftSafe.reason, leftSafe.age)
      if (leftSafe.safe) return left
    }

    if (directionHint == null || directionHint > 0) {
      const right = signedRadians(directYaw + delta)
      const rightSafe = isSafe(right)
      logNeoAlign('findSafeYaw check right delta=%d yaw=%d safe=%s reason=%s age=%d', delta, right * (180 / Math.PI), rightSafe.safe, rightSafe.reason, rightSafe.age)
      if (rightSafe.safe) return right
    }
  }

  logNeoAlign('findSafeYaw fallback directYaw=%d', directYaw)
  return directYaw
}

export { findSafeYaw as findMinimumSafeYaw }

export interface NeoForwardYawCheck {
  origin: Vec3
  yaw: number
  supportBlocks: AABB[]
  wallBlocks: AABB[]
  playerHeight: number
  probeDistance?: number
  probeStep?: number
  inflate?: number
}

export function isNeoForwardYawSafe(check: NeoForwardYawCheck): boolean {
  const probeDistance = check.probeDistance ?? 1.25
  const inflate = check.inflate ?? 0.02
  const dir = new Vec3(-Math.sin(check.yaw), 0, -Math.cos(check.yaw))
  const startBB = AABBUtils.getPlayerAABBRaw(check.origin, check.playerHeight).clone().expand(inflate, 0, inflate)
  const sweptBB = startBB.expandTowards(dir.scaled(probeDistance)).expand(inflate, 0, inflate)
  const endBB = AABBUtils.getPlayerAABBRaw(check.origin.plus(dir.scaled(probeDistance)), check.playerHeight).clone().expand(inflate, 0, inflate)

  const wallHit = check.wallBlocks.some((bb) => bb.collides(sweptBB) || bb.intersectsSegment(startBB.minPoint(), endBB.minPoint()) != null)
  if (wallHit) {
    logNeoAlign(
      'isNeoForwardYawSafe reject wall origin=%O yaw=%d probeDistance=%d dir=%O startBB=%O sweptBB=%O endBB=%O',
      check.origin,
      check.yaw,
      probeDistance,
      dir,
      startBB,
      sweptBB,
      endBB
    )
    return false
  }

  const supportHit = check.supportBlocks.some((bb) => bb.collides(endBB))
  logNeoAlign(
    'isNeoForwardYawSafe result origin=%O yaw=%d supportHit=%s wallHit=%s endBB=%O',
    check.origin,
    check.yaw,
    supportHit,
    wallHit,
    endBB
  )
  return !supportHit
}

export function isNeoForwardYawSafeFromSimulation(
  simulate: (yaw: number) => NeoYawProbeResult,
  yaw: number
): NeoYawProbeResult {
  return simulate(yaw)
}

export function getNeoYawSearchDirection(move: Move, side?: NeoAlignmentSide): 1 | -1 {
  const neoSide = side ?? getNeoAlignmentSide(move)
  const entryCenter = move.entryPos.floored().offset(0.5, 0, 0.5)
  const corner = getNeoAlignmentTarget(move, neoSide)
  const path = move.exitPos.minus(move.entryPos)
  const sideVec = corner.minus(entryCenter)
  const cross = path.x * sideVec.z - path.z * sideVec.x
  return cross >= 0 ? -1 : 1
}
