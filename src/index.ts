import { Bot } from 'mineflayer'
import { BlockInfo } from './mineflayer-specific/world/cacheWorld'
import { ThePathfinder } from './ThePathfinder'
import { Vec3 } from 'vec3'

import utilPlugin from '@nxg-org/mineflayer-util-plugin'

import { Block, PlaceBlockOptions, ResetReason } from './types'
import { PathingUtil } from './PathingUtil'

import * as goals from './mineflayer-specific/goals'
import { Path } from './mineflayer-specific/algs'

export function createPlugin (settings?: any) {
  return function (bot: Bot) {
    void BlockInfo.init(bot.registry) // set up block info
    if (!bot.hasPlugin(utilPlugin)) bot.loadPlugin(utilPlugin)
    bot.pathfinder = new ThePathfinder(bot, undefined, undefined, settings)
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

export * as moves from './mineflayer-specific/movements'
