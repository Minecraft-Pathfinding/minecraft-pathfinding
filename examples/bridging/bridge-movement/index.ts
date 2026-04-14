export { BridgeExecutor } from './BridgeExecutor'
export { PathSplicer } from './PathSplicer'
export type {
  BridgeConfig,
  BridgeMode,
  RotationConfig,
  NormalModeOptions,
  GodBridgeModeOptions,
  BreezilyModeOptions,
} from './BridgeConfig'
export { DEFAULT_BRIDGE_CONFIG } from './BridgeConfig'
export {
  OptimalLineTracker,
  GodBridgeSideTracker,
  PlacementPredictor,
  isCloseToEdge,
  isFractionallyNearEdge,
  getMovementDegrees,
  getHorizontalMoveDir,
  shortestYawDelta,
  randFloat, randRangeMs, randChoice
} from './BridgeUtils'

import { BridgeConfig } from './BridgeConfig'
import { BridgeExecutor } from './BridgeExecutor'

import { movementProviders } from '../../src'
const { Forward, Diagonal } = movementProviders;


import { BuildableMoveExecutor } from '../../src' // todo move to proper path
import { MovementSetup } from '../../src'

export function makeBridgeSetup (cfg: Partial<BridgeConfig> = {}): MovementSetup {
  const ExecutorClass: BuildableMoveExecutor = BridgeExecutor.withConfig(cfg)
  return new Map<typeof Forward | typeof Diagonal, BuildableMoveExecutor>([
    [Forward, ExecutorClass],
    [Diagonal, ExecutorClass]
  ])
}

