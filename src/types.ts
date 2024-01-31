
export interface Vec3Properties {
    x: number
    y: number
    z: number
  }
  

export type BlockType = ReturnType<typeof import('prismarine-block')>
export type Block = import('prismarine-block').Block

export type MCData = import('minecraft-data').IndexedData

export interface PlaceBlockOptions {
  half?: 'top'|'bottom'
  delta?: Vec3Properties
  forceLook?: boolean | 'ignore'
  offhand?: boolean
  swingArm?: 'right' | 'left'
  showHand?: boolean
 }


 export interface InteractionPerformInfo {
  raycasts: any[],
  ticks: number
  shiftTick: number
 }