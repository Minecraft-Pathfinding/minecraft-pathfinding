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

import { movementProviders, OptimizationMap } from '../../../src'
const { Forward, Diagonal } = movementProviders;


import { BuildableMoveExecutor } from '../../../src' // todo move to proper path
import { MovementSetup } from '../../../src'
import { BridgeOptimizer } from './bridgeOptimizer'
import { Bot } from 'mineflayer'



export function applyBridgeSetup(bot: Bot, dbg: any, cfg: Partial<BridgeConfig> = {}): number {

  dbg(`applyBridgeMode → mode="${cfg.mode}"`)
  let count = 0
  const ExecutorClass = BridgeExecutor.withConfig(cfg)

  for (const value of [Forward, Diagonal]) {
    dbg(`  setExecutor: ${value.name} → BridgeExecutor[${cfg.mode}]`)
    // bot.pathfinder.setExecutor(value, ExecutorClass)
    bot.pathfinder.setOptimizer(value, BridgeOptimizer, ExecutorClass)
    count++;
  }
  dbg(`  ${count} executor(s) registered.`)
  return count
}

