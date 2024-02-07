import { Bot } from 'mineflayer'
import { BlockInfo } from './mineflayer-specific/world/cacheWorld'
import { ThePathfinder } from './ThePathfinder'
import { Vec3 } from 'vec3'

import utilPlugin from '@nxg-org/mineflayer-util-plugin'

import { Block, PlaceBlockOptions } from './types'
import { PathingUtil } from './PathingUtil'

export { goals } from './mineflayer-specific/goals'

export function createPlugin (settings?: any) {
  return function (bot: Bot) {
    BlockInfo.init(bot.registry) // set up block info
    if (!bot.hasPlugin(utilPlugin)) bot.loadPlugin(utilPlugin)
    bot.pathfinder = new ThePathfinder(bot)
    bot.pathingUtil = new PathingUtil(bot)
  }
}

declare module 'mineflayer' {
  interface Bot {
    pathfinder: ThePathfinder
    pathingUtil: PathingUtil

    _placeBlockWithOptions(referenceBlock: Block, faceVector: Vec3, options?: PlaceBlockOptions): Promise<void>
  }
}
