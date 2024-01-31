import { Bot } from "mineflayer";
import { BlockInfo } from "./mineflayer-specific/world/cacheWorld";
import { ThePathfinder } from "./ThePathfinder";
import { Vec3 } from "vec3";

import utilPlugin from '@nxg-org/mineflayer-util-plugin';

export { goals } from "./mineflayer-specific/goals";

import {Block, PlaceBlockOptions } from './types'

export function createPlugin(settings?: any) {
  return function (bot: Bot) {
    BlockInfo.init(bot.registry); // set up block info
    if (!bot.hasPlugin(utilPlugin)) bot.loadPlugin(utilPlugin);
    bot.pathfinder = new ThePathfinder(bot);
  };
}


declare module "mineflayer" {
  interface Bot {
    pathfinder: ThePathfinder;

    _placeBlockWithOptions(referenceBlock: Block, faceVector: Vec3, options?: PlaceBlockOptions): Promise<void>;
  }
}
