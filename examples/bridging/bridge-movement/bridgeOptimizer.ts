import { Bot } from 'mineflayer'
import { Move } from '../../../src/mineflayer-specific/move'
import { MovementOptions } from '../../../src/mineflayer-specific/movements/movement'
import { MovementProvider } from '../../../src/mineflayer-specific/movements/movementProvider'
import { Forward, Diagonal } from '../../../src/mineflayer-specific/movements/movementProviders'
import { BridgeProvider } from './bridgeProvider'
import { World } from '../../../src/mineflayer-specific/world/worldInterface'
import { MovementOptimizer } from '../../../src/mineflayer-specific/post/optimizer'

const debug = require('debug')
const log = debug('minecraft-pathfinding:BridgeOptimizer')

export class BridgeOptimizer extends MovementOptimizer {

  constructor (bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world)
  }

  identEndOpt (currentIndex: number, path: Move[]): number {
    const startMove = path[currentIndex]
    const startCtor = startMove.moveType.constructor

    if (startCtor !== Forward && startCtor !== Diagonal) {
      return currentIndex
    }

    if (startMove.toPlace.length === 0) {
      return currentIndex
    }

    const orgY = startMove.exitPos.y
    log(`[BridgeOpt] Start at index ${currentIndex}, type=${startMove.moveType.constructor.name}, y=${orgY}`)

    let lastValidIdx = currentIndex

    for (let i = currentIndex + 1; i < path.length; i++) {
      const next = path[i]
      const ctor = next.moveType.constructor

      if (ctor !== Forward && ctor !== Diagonal) {
        log(`[BridgeOpt] Stop at ${i}: wrong type ${next.moveType.constructor.name}`)
        break
      }

      if (next.toPlace.length === 0) {
        log(`[BridgeOpt] stop at ${i}: no blocks to place, so no need to bridge.`)
        break
      }

      if (Math.abs(next.exitPos.y - orgY) > 0.01 || Math.abs(next.entryPos.y - orgY) > 0.01) {
        log(`[BridgeOpt] Stop at ${i}: y-level changed`)
        break
      }

      if (next.toBreak.length > 0) {
        log(`[BridgeOpt] Stop at ${i}: has breaking`)
        break
      }

      lastValidIdx = i
    }

    log(`[BridgeOpt] Merged indices ${currentIndex}–${lastValidIdx} (${lastValidIdx - currentIndex + 1} moves)`)
    return lastValidIdx
  }
}
