import { Bot } from 'mineflayer'
import { NeoExecutor } from './neo-executor'
import { NeoProvider } from './neo-provider'

export function applyNeoSetup (bot: Bot, dbg: (...args: unknown[]) => void = () => {}): number {
  console.log('applyNeoSetup: registering NeoProvider -> NeoExecutor')
  bot.pathfinder.setExecutor(NeoProvider, NeoExecutor)
  return 1
}
