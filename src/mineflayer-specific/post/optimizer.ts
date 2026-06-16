import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import type { OptimizationMap } from '.'
import type { BuildableMoveProvider, ExclusionArea } from '../movements'
import { MovementProvider } from '../movements'
import { World } from '../world/worldInterface'
import { Move } from '../move'
import { COST_INF } from '../movements/costs'
import { BaseSimulator, BotcraftPhysics } from '@nxg-org/mineflayer-physics-util'

const debug = require('debug')
const log = debug('minecraft-pathfinding:Optimizer')
const logMerge = debug('minecraft-pathfinding:Optimizer:merge')

/**
 * Walk the straight line from `from` to `to` block-by-block and return true if any
 * cell falls inside a HARD step-exclusion zone (one whose summed weight reaches
 * COST_INF). Used to stop an optimizer from straight-lining a path through a
 * "keep out" area the original A* route deliberately went around.
 *
 * Only hard zones block a merge. Soft zones (a finite extra cost) are a
 * preference, not a wall, so the optimizer is allowed to straighten through them.
 */
function lineCrossesHardExclusion (world: World, from: Vec3, to: Vec3, areas: ExclusionArea[]): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const steps = Math.max(1, Math.ceil(dist * 2)) // sample roughly every half block
  let lastKey = ''
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = Math.floor(from.x + dx * t)
    const y = Math.floor(from.y + dy * t)
    const z = Math.floor(from.z + dz * t)
    const key = `${x},${y},${z}`
    if (key === lastKey) continue // same cell as the previous sample
    lastKey = key
    const block = world.getBlockInfo(new Vec3(x, y, z))
    let weight = 0
    for (const area of areas) weight += area(block)
    if (weight >= COST_INF) return true
  }
  return false
}

export abstract class MovementOptimizer {
  bot: Bot
  world: World
  sim: BaseSimulator

  public readonly mergeInteracts: boolean = true

  constructor (bot: Bot, world: World) {
    this.bot = bot
    this.world = world
    this.sim = new BaseSimulator(new BotcraftPhysics(bot.registry))
  }

  abstract identEndOpt (currentIndex: number, path: Move[]): number | Promise<number>

  /**
   * Select the move type that should represent the merged block.
   *
   * Default behavior keeps the start move's provider so existing optimizer/executor
   * mappings continue to work unchanged.
   * 
   * For now, changing this here does not work. Do not use this to set a different movement provider.
   */
  protected getMergedMoveType (startIndex: number, endIndex: number, path: readonly Move[]): MovementProvider {
    return path[startIndex].moveType
  }

  /**
   * Build the merged move for the optimized span.
   *
   * Subclasses may override this when they need to swap in a different move type
   * or otherwise rewrite the resulting move object.
   */
  protected createMergedMove (startIndex: number, endIndex: number, path: readonly Move[]): Move {
    const startMove = path[startIndex]
    const endMove = path[endIndex]
    const mergedMoveType = this.getMergedMoveType(startIndex, endIndex, path)

    logMerge(`Merging ${endIndex - startIndex + 1} moves: [Index ${startIndex}] ${startMove.moveType.constructor.name} -> [Index ${endIndex}] ${endMove.moveType.constructor.name}`)
    logMerge(`Start Pos: ${startMove.entryPos}, End Pos: ${endMove.exitPos}`)

    const toBreak = [...startMove.toBreak]
    const toPlace = [...startMove.toPlace]
    let costSum = 0

    for (let i = startIndex + 1; i < endIndex; i++) {
      const intermediateMove = path[i]
      if (this.mergeInteracts) {
        toBreak.push(...intermediateMove.toBreak)
        toPlace.push(...intermediateMove.toPlace)
      }
      costSum += intermediateMove.cost
    }

    toBreak.push(...endMove.toBreak)
    toPlace.push(...endMove.toPlace)

    costSum += endMove.cost

    logMerge(`Merge complete. Total Cost: ${costSum.toFixed(2)}, Breaks: ${toBreak.length}, Places: ${toPlace.length}`)

    return new Move(
      startMove.x,
      startMove.y,
      startMove.z,
      toPlace,
      toBreak,
      endMove.remainingBlocks,
      costSum,
      mergedMoveType,
      startMove.entryPos,
      startMove.entryVel,
      endMove.exitPos,
      endMove.exitVel,
      startMove.parent
    )
  }

  mergeMoves (startIndex: number, endIndex: number, path: readonly Move[]): Move {
    return this.createMergedMove(startIndex, endIndex, path)
  }
}

export class Optimizer {
  optMap: OptimizationMap
  world: World

  private pathCopy!: Move[]
  private currentIndex: number

  constructor (bot: Bot, world: World, optMap: OptimizationMap) {
    this.currentIndex = 0
    this.optMap = optMap
    this.world = world
  }

  loadPath (path: Move[]): void {
    log(`loadPath called. Initial path length: ${path.length}. start: ${path[0].entryPos}. End: ${path[path.length - 1].exitPos}`)
    this.pathCopy = path
    this.currentIndex = 0
  }

  sanitize (): boolean {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    return !!this.pathCopy
  }

  
  async compute (): Promise<Move[]> {
    if (!this.sanitize()) {
      throw new Error('Optimizer not sanitized')
    }

    log(`compute() started. Iterating over path of length ${this.pathCopy.length}.`)

    while (this.currentIndex < this.pathCopy.length) {
      const move = this.pathCopy[this.currentIndex]
      const opts = this.optMap.get(move.moveType.constructor as BuildableMoveProvider)

      if (opts == null || opts.length === 0) {
        log(`[Index ${this.currentIndex}] No optimizer mapped for ${move.moveType.constructor.name}. Skipping.`)
        this.currentIndex++
        continue
      }

      let merged = false

      for (const opt of opts) {
        log(`[Index ${this.currentIndex}] Evaluating ${move.moveType.constructor.name} using ${opt.optimizer.constructor.name} (priority ${opt.priority})...`)
        const newEnd = await opt.optimizer.identEndOpt(this.currentIndex, this.pathCopy)

        if (newEnd > this.currentIndex) {
          log(`[Index ${this.currentIndex}] Optimizer identified mergable sequence ending at index ${newEnd}.`)
          const newMove = opt.optimizer.mergeMoves(this.currentIndex, newEnd, this.pathCopy)

          // Exclusion zones: an optimizer may straight-line a path across cells the
          // original A* route went around. Never let a merge cut through a hard
          // "keep out" (step) zone -- fall back to the unoptimized moves instead.
          const stepAreas = newMove.moveType.settings.exclusionAreasStep
          if (stepAreas.length > 0 && lineCrossesHardExclusion(this.world, newMove.entryPos, newMove.exitPos, stepAreas)) {
            log(`[Index ${this.currentIndex}] Merge would cross a hard exclusion zone; skipping this optimizer.`)
            continue
          }

          newMove.optimizedExecutor = opt.optimizedExecutor

          // Splice the newly merged move into the array, replacing all intermediate moves
          this.pathCopy[this.currentIndex] = newMove
          this.pathCopy.splice(this.currentIndex + 1, newEnd - this.currentIndex)
          logMerge(`Spliced array. New path length: ${this.pathCopy.length}`)
          merged = true
          break
        }

        log(`[Index ${this.currentIndex}] Optimizer returned non-merge index ${newEnd}. Trying next candidate if available.`)
      }

      if (!merged) {
        log(`[Index ${this.currentIndex}] No optimizer merged this move ${move.moveType.constructor.name}. Skipping.`)
      }

      // Move to the next movement (which will be the movement directly after our merged block)
      this.currentIndex++
    }

    log(`compute() finished. Final optimized path length: ${this.pathCopy.length}. End: ${this.pathCopy[this.pathCopy.length -1 ].exitPos}`)
    return this.pathCopy
  }

  makeResult (): Move[] {
    return this.pathCopy
  }
}
