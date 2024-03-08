import { PathfinderOptions } from './ThePathfinder'
import { MovementOptions, MovementSetup } from './mineflayer-specific/movements'
import { OptimizationSetup } from './mineflayer-specific/post'
import { World } from './mineflayer-specific/world/worldInterface'

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

export type PathStatus = 'noPath' | 'timeout' | 'partial' | 'success' | 'partialSuccess' | 'canceled'

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

export interface InteractionPerformInfo {
  raycasts: any[]
  ticks: number
  shiftTick: number
}
