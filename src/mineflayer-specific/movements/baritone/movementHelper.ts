import { Vec3 } from 'vec3'
import { BlockInfo } from '../../world/cacheWorld'
import { Movement } from '../movement'
import { Vec3Properties } from '../../../types'

export function canWalkOn (info: BlockInfo): boolean {
  if (info.block == null) return false
  return info.block.boundingBox === 'block' || info.safe
}

export function canWalkThrough (info: BlockInfo): boolean {
  if (info.block == null) return false
  return info.block.boundingBox === 'empty' || info.safe
}

const ALL_DIRS_BUT_UP = [
  new Vec3(1, 0, 0),
  new Vec3(-1, 0, 0),
  new Vec3(0, 0, 1),
  new Vec3(0, 0, -1),
  new Vec3(0, -1, 0)
]
export function findPlaceOpts (move: Movement, orgPos: Vec3Properties, pos: Vec3Properties): BlockInfo | null {
  for (const dir of ALL_DIRS_BUT_UP) {
    const nX = pos.x + dir.x
    const nZ = pos.z + dir.z
    if (nX === orgPos.x && nZ === orgPos.z) continue
    const info = move.getBlockInfo(pos, dir.x, dir.y, dir.z)
    if (canPlaceAgainst(info)) return info
  }

  return null
}

export function canPlaceAgainst (info: BlockInfo): boolean {
  return info.physical
}

export function isBottomSlab (info: BlockInfo): boolean {
  return info.dY === 0.5
}

export function getMiningDurationTicks (move: Movement, info: BlockInfo, includeFalling = false): number {
  if (!includeFalling) return move.breakCost(info)

  const above = move.getBlockInfo(info.position, 0, 1, 0)
  return move.breakCost(info) + getMiningDurationTicks(move, above, true) // recurse upwards. potentially slow.
}

export function getMiningDurationTicksCoords (move: Movement, pos: Vec3, includeFalling = false): number {
  return getMiningDurationTicks(move, move.getBlockInfoRaw(pos), includeFalling)
}

export function canUseFrostWalker (move: Movement, info: BlockInfo): boolean {
  return info.liquid && false // TODO: frostwalker.
}
