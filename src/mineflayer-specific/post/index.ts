import { Bot } from 'mineflayer'
import type { BuildableMoveProvider, MovementOptions } from '../movements'
import { World } from '../world/worldInterface'
import { MovementOptimizer } from './optimizer'
import { MovementReplacement } from './replacement'

export * from './optimizer'
export * from './registry'
export * from './elytra-optimizer'

export type BuildableMoveOptimizer = new (bot: Bot, world: World, settings: Partial<MovementOptions>) => MovementOptimizer

export type OptimizationSetup = Map<BuildableMoveProvider, BuildableMoveOptimizer>
export type ReplacementMap = Map<BuildableMoveProvider, MovementReplacement>
