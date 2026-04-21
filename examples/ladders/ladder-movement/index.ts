import { Bot } from 'mineflayer'
import { LadderDiagonal, LadderForward, LadderLandingDiagonal, LadderLandingForward } from './ladder-provider'
import { LadderDiagonalExecutor, LadderForwardExecutor, LadderLandingDiagonalExecutor, LadderLandingForwardExecutor } from './ladder-executor'
import { AroundCornerDiagonal } from './around-corner-provider'
import { AroundCornerDiagonalExecutor } from './around-corner-executor'
import { ParkourDiagonal, ParkourForward } from '../../../src/mineflayer-specific/movements'

export { LadderDiagonal, LadderForward } from './ladder-provider'
export { LadderDiagonalExecutor, LadderForwardExecutor } from './ladder-executor'
export { LadderLandingDiagonal, LadderLandingForward } from './ladder-provider'
export { LadderLandingDiagonalExecutor, LadderLandingForwardExecutor } from './ladder-executor'
export { AroundCornerDiagonal } from './around-corner-provider'
export { AroundCornerDiagonalExecutor } from './around-corner-executor'

export function applyLadderSetup(bot: Bot): number {

  // bot.pathfinder.dropMovment(ParkourDiagonal)
  // bot.pathfinder.dropMovment(ParkourForward)
  bot.pathfinder.setExecutor(LadderForward, LadderForwardExecutor)
  bot.pathfinder.setExecutor(LadderDiagonal, LadderDiagonalExecutor)
  bot.pathfinder.setExecutor(LadderLandingForward, LadderLandingForwardExecutor)
  bot.pathfinder.setExecutor(LadderLandingDiagonal, LadderLandingDiagonalExecutor)
  bot.pathfinder.setExecutor(AroundCornerDiagonal, AroundCornerDiagonalExecutor)
  return 5
}
