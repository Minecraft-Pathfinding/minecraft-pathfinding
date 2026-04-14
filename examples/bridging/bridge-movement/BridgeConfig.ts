export type BridgeMode = 'normal' | 'godbridge' | 'breezily'

export interface RotationConfig {
  lerpYaw: [number, number]
  lerpPitch: [number, number]
  maxTurnRadPerTick: number
}

export interface NormalModeOptions {
  edgeDistance: number
  blocksToEagle: [number, number]
  onlyOnGround: boolean
  sprint: 'always' | 'never' | 'auto'
  pitch: number
  pitchJitter: number
  yawJitter: number
  placementPredictorThreshold: number
}

export interface GodBridgeModeOptions {
  ledgeModes: Array<'jump' | 'sneak' | 'stopInput' | 'backwards'>
  sneakMs: [number, number]
  forceSneakBelowCount: number
  pitchStraight: number
  pitchDiagonal: number
  pitchJitter: number
  yawJitter: number
}

export interface BreezilyModeOptions {
  edgeDistance: [number, number]
  pitchStraight: number
  pitchDiagonal: number
  pitchJitter: number
  yawJitter: number
}

export interface BridgeConfig {
  mode: BridgeMode
  elevatedBridgeThreshold: number
  globalSneakMs: [number, number]
  equipDelayMs: [number, number]
  placementDelayMs: [number, number]
  stallTimeoutMs: number
  rotation: RotationConfig
  normal: NormalModeOptions
  godbridge: GodBridgeModeOptions
  breezily: BreezilyModeOptions
}

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  mode: 'normal',
  elevatedBridgeThreshold: 20,
  globalSneakMs: [50, 100],
  equipDelayMs: [0, 40],
  placementDelayMs: [0, 0],
  stallTimeoutMs: 400,

  rotation: {
    lerpYaw: [0.6, 0.75],       // faster snap → less drift/wobble
    lerpPitch: [0.85, 0.95],    // was [0.6, 0.75] — converges in ~3 ticks so pitch is solid before allowPlace fires
    maxTurnRadPerTick: 0.4
  },

  normal: {
    edgeDistance: 0.1,
    blocksToEagle: [0, 0],
    onlyOnGround: true,
    sprint: 'auto',
    pitch: 78,
    pitchJitter: 0.5,           // was 2 — minimal pitch variation
    yawJitter: 0.2,             // was 0.8 — minimal yaw variation
    placementPredictorThreshold: 0.5
  },

  godbridge: {
    ledgeModes: ['jump', 'sneak'],
    sneakMs: [50, 100],
    forceSneakBelowCount: 3,
    pitchStraight: 75.7,
    pitchDiagonal: 75.6,
    pitchJitter: 0.3,
    yawJitter: 0.5
  },

  breezily: {
    edgeDistance: [0.45, 0.5],
    pitchStraight: 80,
    pitchDiagonal: 75.6,
    pitchJitter: 0.3,
    yawJitter: 3.5
  }
}
