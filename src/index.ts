import { Bot } from 'mineflayer'
import { BlockInfo } from './mineflayer-specific/world/cacheWorld'
import { PathfinderOptions, ThePathfinder } from './ThePathfinder'
import { Vec3 } from 'vec3'

import utilPlugin from '@nxg-org/mineflayer-util-plugin'

import { Block, PlaceBlockOptions, ResetReason } from './types'
import { PathingUtil } from './PathingUtil'

import * as goals from './mineflayer-specific/goals'
import { Path } from './mineflayer-specific/algs'
import { MovementOptions, MovementSetup } from './mineflayer-specific/movements'
import { OptimizationSetup } from './mineflayer-specific/post'

export function createPlugin (opts?: {
  movements?: MovementSetup
  optimizers?: OptimizationSetup
  settings?: PathfinderOptions
  moveSettings?: MovementOptions
}) {
  return function (bot: Bot) {
    void BlockInfo.init(bot.registry) // set up block info
    if (!bot.hasPlugin(utilPlugin)) bot.loadPlugin(utilPlugin)
    bot.pathfinder = new ThePathfinder(bot, opts?.movements, opts?.optimizers, opts?.moveSettings, opts?.settings)
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
export * as custom from './mineflayer-specific/custom'
