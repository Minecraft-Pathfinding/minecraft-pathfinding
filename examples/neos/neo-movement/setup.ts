import { Bot } from 'mineflayer'
import { NeoExecutor, type NeoExecutorSettings } from './neo-executor'
import { NeoProvider } from './neo-provider'
import type { MovementOptions } from '../../../src/mineflayer-specific/movements'
import type { World } from '../../../src/mineflayer-specific/world/worldInterface'

export function applyNeoSetup (
  bot: Bot,
  dbg: (...args: unknown[]) => void = () => {},
  settings: NeoExecutorSettings = {}
): number {
  console.log('applyNeoSetup: registering NeoProvider -> NeoExecutor')
  const ConfiguredNeoExecutor = class extends NeoExecutor {
    constructor (bot: Bot, world: World, moveSettings: Partial<MovementOptions>) {
      super(bot, world, { ...moveSettings, ...settings })
    }
  }

  bot.pathfinder.setExecutor(NeoProvider, ConfiguredNeoExecutor)
  return 1
}
