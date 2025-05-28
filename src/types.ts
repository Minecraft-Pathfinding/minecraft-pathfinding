import { BlockFace } from '@nxg-org/mineflayer-util-plugin'
import { PathfinderOptions } from './ThePathfinder'
import { MovementOptions, MovementSetup } from './mineflayer-specific/movements'
import { OptimizationSetup } from './mineflayer-specific/post'
import { World } from './mineflayer-specific/world/worldInterface'
import { Vec3 } from 'vec3'

export interface Vec3Properties {
  x: number
  y: number
  z: number
}

export interface HandlerOpts {
  world?: World
  movements?: MovementSetup
  optimizers?: OptimizationSetup
  moveSettings?: MovementOptions
  pathfinderSettings?: PathfinderOptions
}

export type PathStatus = 'noPath' | 'timeout' | 'partial' | 'success' | 'partialSuccess' | 'cancelled'

export type ResetReason = 'blockUpdate' | 'chunkLoad' | 'goalUpdated'

export type BlockType = ReturnType<typeof import('prismarine-block')>
export type Block = import('prismarine-block').Block

export type MCData = ReturnType<(typeof import('prismarine-registry'))>

export interface PlaceBlockOptions {
  half?: 'top' | 'bottom'
  delta?: Vec3Properties
  forceLook?: boolean | 'ignore'
  offhand?: boolean
  swingArm?: 'right' | 'left'
  showHand?: boolean
}

export type RayType = {
  intersect: Vec3
  face: BlockFace
} & Block


export interface InteractionPerformInfo {
  ticks: number
  tickAllowance: number
  shiftTick: number
  raycasts: RayType[]
}


export interface InteractOpts {
  info?: InteractionPerformInfo
  returnToStart?: boolean
  returnToPos?: Vec3
  predictBlock?: boolean
  // precrouch?: boolean
}