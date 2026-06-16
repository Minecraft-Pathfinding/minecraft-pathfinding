import { Bot } from 'mineflayer'
import { BlockInfo } from './mineflayer-specific/world/cacheWorld'
import { PathfinderOptions, ThePathfinder } from './ThePathfinder'
import { Vec3 } from 'vec3'

import utilPlugin from '@nxg-org/mineflayer-util-plugin'
import physicsUtil, { initSetup } from '@nxg-org/mineflayer-physics-util'

import type { Block, ResetReason } from './types'
import { HandlerOpts, PlaceBlockOptions } from './types'
import { PathingUtil } from './PathingUtil'

import * as goals from './mineflayer-specific/goals'
import { Path } from './mineflayer-specific/algs'
import type { MovementOptions, MovementSetup } from './mineflayer-specific/movements'
import { MovementProvider } from './mineflayer-specific/movements'
import type { OptimizationSetup } from './mineflayer-specific/post'

export function createPlugin(opts?: HandlerOpts) {
  return function (bot: Bot) {
    BlockInfo.init(bot.registry) // set up block info
    if (!bot.hasPlugin(utilPlugin)) bot.loadPlugin(utilPlugin)
    if (!bot.hasPlugin(physicsUtil)) bot.loadPlugin(physicsUtil)
    initSetup(bot.registry)
    bot.pathfinder = new ThePathfinder(bot, opts)
    bot.pathingUtil = new PathingUtil(bot)
  }
}

declare module 'mineflayer' {
  interface Bot {
    pathfinder: ThePathfinder
    pathingUtil: PathingUtil

    _placeBlockWithOptions: (referenceBlock: Block, faceVector: Vec3, options?: PlaceBlockOptions) => Promise<void>
  }

  interface BotEvents {
    pathGenerated: (path: Path) => void
    resetPath: (reason: ResetReason) => void
    enteredRecovery: (errorCount: number) => void
    exitedRecovery: (errorCount: number) => void
    goalSet: (goal: goals.Goal) => void
    goalFinished: (goal: goals.Goal) => void
    goalAborted: (goal: goals.Goal) => void
  }
}

export * as goals from './mineflayer-specific/goals'

export { MovementExecutor, MovementProvider } from './mineflayer-specific/movements'
export type { BuildableMoveExecutor, BuildableMoveProvider, MovementSetup } from './mineflayer-specific/movements'
export type { MovementOptions } from './mineflayer-specific/movements'

// Exclusion zones ("keep out" areas), like upstream mineflayer-pathfinder.
// Only the type is exported; users write their own zone functions
// (see examples/exclusionZones.js for ready-to-copy box/radius helpers).
export type { ExclusionArea } from './mineflayer-specific/movements/exclusionZones'
export { MovementOptimizer } from './mineflayer-specific/post'
export type { BuildableMoveOptimizer, OptimizationSetup, OptimizationMap } from './mineflayer-specific/post'
export { Move } from './mineflayer-specific/move'

export * as movementProviders from './mineflayer-specific/movements/movementProviders'