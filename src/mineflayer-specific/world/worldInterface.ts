import { Vec3 } from 'vec3'
import type { BlockInfo } from './cacheWorld'
import { Block } from '../../types'
import { RayType } from '../movements/interactionUtils'

export interface World {
  minY: number;
  raycast: (from: Vec3, direction: Vec3, range: number, matcher?: (block: Block) => boolean) => RayType | null
  getBlock: (pos: Vec3) => Block | null
  getBlockInfo: (pos: Vec3) => BlockInfo
  getBlockStateId: (pos: Vec3) => number | undefined
  cleanup?: () => void
}
