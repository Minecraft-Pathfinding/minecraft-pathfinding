import { Bot } from 'mineflayer'
import { BuildableMoveProvider } from '../movements'
import { World } from '../world/worldInterface'
import { MovementOptimizer } from './optimizer'
import { MovementReplacement } from './replacement'

export * from './optimizer'

export type OptimizationSetup = Map<BuildableMoveProvider, BuildableOptimizer>

export type BuildableOptimizer = new (
  bot: Bot,
  world: World,
) => MovementOptimizer

export type OptimizationMap = Map<BuildableMoveProvider, MovementOptimizer>

export type ReplacementMap = Map<BuildableMoveProvider, MovementReplacement>
