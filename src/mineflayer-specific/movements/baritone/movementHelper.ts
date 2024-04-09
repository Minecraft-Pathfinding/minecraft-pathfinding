import { Vec3 } from 'vec3'
import { BlockInfo } from '../../world/cacheWorld'
import { Movement } from '../movement'
import { Vec3Properties } from '../../../types'
import { BreakHandler } from '../interactionUtils'

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

export function getMiningDurationTicks (move: Movement, info: BlockInfo, toBreak: BreakHandler[], includeFalling = false): number {
  if (!includeFalling) return move.safeOrBreak(info, toBreak)

  const above = move.getBlockInfo(info.position, 0, 1, 0)
  return move.safeOrBreak(info, toBreak) + getMiningDurationTicks(move, above, toBreak, true) // recurse upwards. potentially slow.
}

export function getMiningDurationTicksCoords (move: Movement, pos: Vec3, toBreak: BreakHandler[], includeFalling = false): number {
  return getMiningDurationTicks(move, move.getBlockInfoRaw(pos), toBreak, includeFalling)
}

export function canUseFrostWalker (move: Movement, info: BlockInfo): boolean {
  return info.liquid && false // TODO: frostwalker.
}


export function mustBeSolidToWalkOn(info: BlockInfo) {
  if (!BlockInfo.initialized) throw new Error('BlockInfo not initialized')

  if (info.block == null) return false

  if (info.block.type === BlockInfo.registry.blocksByName.ladder.id) return false
  if (info.block.type === BlockInfo.registry.blocksByName.vine.id) return false

  // TODO: check waterlogging
  return true
}