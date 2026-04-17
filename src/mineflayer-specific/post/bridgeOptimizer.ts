import { Bot } from 'mineflayer'
import { Move } from '../move'
import { MovementOptions } from '../movements/movement'
import { MovementProvider } from '../movements/movementProvider'
import { Forward, Diagonal } from '../movements/movementProviders'
import { BridgeProvider } from '../movements/bridgeProvider'
import { World } from '../world/worldInterface'
import { MovementOptimizer } from './optimizer'

const debug = require('debug')
const log = debug('minecraft-pathfinding:BridgeOptimizer')

export class BridgeOptimizer extends MovementOptimizer {
  private readonly _bridgeProvider: BridgeProvider

  constructor (bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world)
    this._bridgeProvider = new BridgeProvider(bot, world, settings)
  }

  protected override getMergedMoveType (_startIndex: number, _endIndex: number, _path: readonly Move[]): MovementProvider {
    return this._bridgeProvider
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
