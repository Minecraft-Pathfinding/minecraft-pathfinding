import { ControlStateHandler, EPhysicsCtx } from '@nxg-org/mineflayer-physics-util'
import { Vec3 } from 'vec3'
import { Move } from '../move'
import type { RayType } from '../../types'
import { BlockInfo } from '../world/cacheWorld'
import { MovementOptimizer } from './optimizer'
import { World } from '../world/worldInterface'
import { sumExclusionAreas } from '../movements/movement'
import type { ExclusionArea } from '../movements/exclusionZones'
import { COST_INF } from '../movements/costs'

import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'
import { stateLookAt } from '../movements/movementUtils'

const debug = require('debug')
const log = debug('minecraft-pathfinding:optimizers')

/**
 * Walk the straight segment from `from` to `to` with a voxel traversal
 * (Amanatides & Woo) and return true as soon as a cell lands inside a HARD step
 * zone (summed weight >= COST_INF). Visiting exactly the cells the segment
 * crosses keeps the check correct (no skipped cells) and cheap.
 *
 * Only hard zones stop a straight-line merge; soft zones are a preference, not a
 * wall. Returns false immediately when there are no step areas.
 */
export function lineCrossesHardExclusion (world: World, from: Vec3, to: Vec3, areas: ExclusionArea[]): boolean {
  if (areas.length === 0) return false

  let x = Math.floor(from.x)
  let y = Math.floor(from.y)
  let z = Math.floor(from.z)
  const endX = Math.floor(to.x)
  const endY = Math.floor(to.y)
  const endZ = Math.floor(to.z)

  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z

  const stepX = Math.sign(dx)
  const stepY = Math.sign(dy)
  const stepZ = Math.sign(dz)

  // The segment is parameterised by t in [0, 1]. tMax* is the t at which we next
  // cross a cell boundary on that axis; tDelta* is the t to cross one whole cell.
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity

  let tMaxX = stepX !== 0 ? (stepX > 0 ? x + 1 - from.x : from.x - x) / Math.abs(dx) : Infinity
  let tMaxY = stepY !== 0 ? (stepY > 0 ? y + 1 - from.y : from.y - y) / Math.abs(dy) : Infinity
  let tMaxZ = stepZ !== 0 ? (stepZ > 0 ? z + 1 - from.z : from.z - z) / Math.abs(dz) : Infinity

  // Cells to visit = Manhattan distance in cells + 1. A fixed loop count (rather
  // than tMax comparisons) keeps termination floating-point safe.
  const cells = Math.abs(endX - x) + Math.abs(endY - y) + Math.abs(endZ - z)

  for (let i = 0; i <= cells; i++) {
    if (sumExclusionAreas(areas, world.getBlockInfo(new Vec3(x, y, z))) >= COST_INF) return true

    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      x += stepX
      tMaxX += tDeltaX
    } else if (tMaxY <= tMaxZ) {
      y += stepY
      tMaxY += tDeltaY
    } else {
      z += stepZ
      tMaxZ += tDeltaZ
    }
  }
  return false
}

export class LandStraightAheadOpt extends MovementOptimizer {
  async identEndOpt (currentIndex: number, path: Move[]): Promise<number> {
    const startIndex = currentIndex
    const thisMove = path[currentIndex] // starting move
    const stepAreas = thisMove.moveType.settings.exclusionAreasStep

    let lastMove = path[currentIndex]
    let nextMove = path[++currentIndex]

    log(`[LandStraightAhead] Optimizing from index ${startIndex} (${thisMove.moveType.constructor.name})`)

    if (nextMove === undefined) {
      log(`[LandStraightAhead] nextMove is undefined, aborting.`)
      return --currentIndex
    }

    const orgY = thisMove.entryPos.y

    const orgPos = thisMove.entryPos.floored().translate(0.5, 0, 0.5) // ensure middle of block.
    const hW = 0.6 // ensure safety (larger than actual bot aabb)
    const uW = 0.4

    const bb = AABBUtils.getEntityAABBRaw({ position: orgPos, width: hW, height: 1.8 })
    const verts = bb.expand(0, -0.1, 0).toVertices()

    const verts1 = [
      orgPos.offset(-uW / 2, -0.6, -uW / 2),
      orgPos.offset(-uW / 2, -0.6, uW / 2),
      orgPos.offset(uW / 2, -0.6, -uW / 2),
      orgPos.offset(uW / 2, -0.6, uW / 2)
    ]

    while (lastMove.exitPos.y === orgY && nextMove.exitPos.y === orgY) {
      if (!AABB.fromBlockPos(nextMove.entryPos).collides(AABB.fromBlockPos(nextMove.exitPos))) {
        log(`[LandStraightAhead] Index ${currentIndex}: AABB collision failed between entry and exit.`)
        return --currentIndex
      }

      if (nextMove === undefined) {
        log(`[LandStraightAhead] Index ${currentIndex}: nextMove became undefined.`)
        return --currentIndex
      }
      
      for (const vert of verts) {
        const offset = vert.minus(orgPos)
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0)
        const test = test1.plus(offset)
        const dist = nextMove.exitPos.distanceTo(orgPos)
        
        const raycast0 = this.bot.world.raycast(
          vert,
          test.minus(vert).normalize(),
          dist,
          (block) => (!BlockInfo.replaceables.has(block.type) || BlockInfo.liquids.has(block.type) || BlockInfo.blocksToAvoid.has(block.type)) && block.shapes.length > 0
        ) as unknown as RayType | null
        
        const valid0 = (raycast0 == null) || raycast0.position.distanceTo(orgPos) > dist

        if (!valid0) {
          log(`[LandStraightAhead] Index ${currentIndex}: Block check raycast hit an obstacle at ${raycast0.position}.`)
          return --currentIndex
        }
      }

      let validCount = 0
      for (const vert of verts1) {
        const offset = vert.minus(orgPos)
        const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0)
        const test = test1.plus(offset)
        const dist = nextMove.exitPos.distanceTo(orgPos)
        
        const raycast0 = (await this.bot.world.raycast(
          vert,
          test.minus(vert).normalize(),
          dist,
          (block) => BlockInfo.replaceables.has(block.type) || BlockInfo.liquids.has(block.type) || block.shapes.length === 0
        )) as unknown as RayType | null

        const valid0 = (raycast0 == null) || raycast0.shapes.length > 0 || raycast0.position.distanceTo(orgPos) > dist

        if (valid0) validCount++
      }

      // Require every foot-corner probe to be clear. Accepting a line when
      // only one probe succeeds lets the optimizer merge paths that skim block
      // edges and then snag the player's hitbox.
      if (validCount !== verts1.length) {
        log(`[LandStraightAhead] Index ${currentIndex}: Air check raycast failed (${validCount}/${verts1.length} corners clear).`)
        return --currentIndex
      }

      // Exclusion zones: do not straight-line the merge through a hard "keep out"
      // area the original route went around. Stop before this move if it would.
      if (lineCrossesHardExclusion(this.world, orgPos, nextMove.exitPos, stepAreas)) {
        log(`[LandStraightAhead] Index ${currentIndex}: straight line would cross a hard exclusion zone.`)
        return --currentIndex
      }

      if (++currentIndex >= path.length) {
        log(`[LandStraightAhead] Reached end of path.`)
        return --currentIndex
      }
      lastMove = nextMove
      nextMove = path[currentIndex]
    }
    
    log(`[LandStraightAhead] Y-level changed or loop ended naturally. Returning index ${currentIndex - 1}.`)
    return --currentIndex
  }
}

export class DropDownOpt extends MovementOptimizer {
  readonly mergeInteracts = false

  identEndOpt (currentIndex: number, path: Move[]): number | Promise<number> {
    const startIndex = currentIndex
    let lastMove = path[currentIndex]
    let nextMove = path[++currentIndex]

    log(`[DropDownOpt] Optimizing from index ${startIndex} (${lastMove.moveType.constructor.name})`)

    if (nextMove === undefined) return --currentIndex

    const firstPos = lastMove.exitPos

    let flag0 = false
    let flag1 = false
    while (currentIndex < path.length) {
      if (nextMove.exitPos.y > lastMove.exitPos.y) {
        log(`[DropDownOpt] Index ${currentIndex}: nextMove goes UP. Aborting.`)
        return --currentIndex
      }
      if (nextMove.toPlace.length > 0 || nextMove.toBreak.length > 0) {
        log(`[DropDownOpt] Index ${currentIndex}: nextMove requires block placement/breaking. Aborting.`)
        return --currentIndex
      }

      if (!AABB.fromBlockPos(nextMove.entryPos).collides(AABB.fromBlockPos(nextMove.exitPos))) {
        log(`[DropDownOpt] Index ${currentIndex}: AABB collision failed.`)
        return --currentIndex
      }

      if (nextMove.exitPos.xzDistanceTo(firstPos) < lastMove.exitPos.xzDistanceTo(firstPos)) {
        log(`[DropDownOpt] Index ${currentIndex}: Bot is moving closer to start position (looping). Aborting.`)
        return --currentIndex
      }

      const ctx = EPhysicsCtx.FROM_BOT(this.bot.physicsUtil.engine, this.bot)
      ctx.velocity.set(0, 0, 0)
      ctx.position.set(lastMove.entryPos.x, lastMove.entryPos.y, lastMove.entryPos.z)
      stateLookAt(ctx.state, nextMove.entryPos)
      ctx.state.control = ControlStateHandler.DEFAULT()
      ctx.state.control.forward = true
      ctx.state.control.sprint = true

      const bl0 = lastMove.moveType.getBlockInfo(nextMove.entryPos, 0, -1, 0)
      const bl1 = lastMove.moveType.getBlockInfo(nextMove.exitPos, 0, -1, 0)
      const bb0solid = bl0.physical || bl0.liquid
      const bb1solid = bl1.physical || bl1.liquid
      const blockBB0 = AABB.fromBlockPos(nextMove.entryPos.offset(0, -1, 0))
      const blockBB1 = AABB.fromBlockPos(nextMove.exitPos.offset(0, -1, 0))
      let flag = false
      let good = false
      
      this.sim.simulateUntil(
        (state, ticks) => {
          const pBB = AABBUtils.getPlayerAABB({ position: ctx.state.pos, width: 0.6, height: 1.8 })
          const collided =
            (pBB.collides(blockBB0) && bb0solid) || (pBB.collides(blockBB1) && bb1solid && (state.onGround || state.isInWater))
          
          if (collided) {
            good = true
            return true
          }

          if (state.pos.y < nextMove.entryPos.y && state.pos.y < nextMove.exitPos.y) flag = true

          if (flag) return (ticks > 0 && state.onGround) || state.isCollidedHorizontally
          else return false
        },
        () => {},
        (state) => stateLookAt(state, nextMove.exitPos),
        ctx,
        this.world,
        1000
      )

      if (!good) {
        log(`[DropDownOpt] Index ${currentIndex}: Physics simulation failed to reach target safely.`)
        return --currentIndex
      }

      if (ctx.state.isInWater) flag1 = true
      else if (flag1) {
        log(`[DropDownOpt] Index ${currentIndex}: Bot left water during drop. Aborting.`)
        return --currentIndex
      }

      if (nextMove.exitPos.y === nextMove.entryPos.y) {
        if (!bb1solid) {
          log(`[DropDownOpt] Index ${currentIndex}: Landing block is not solid.`)
          return --currentIndex
        }
        if (flag0) {
          log(`[DropDownOpt] Index ${currentIndex}: Flag0 triggered. Returning.`)
          return currentIndex
        }
        else flag0 = true
      }

      if (++currentIndex >= path.length) return --currentIndex
      lastMove = nextMove
      nextMove = path[currentIndex]
    }

    return --currentIndex
  }
}

export class ForwardJumpUpOpt extends MovementOptimizer {
  identEndOpt (currentIndex: number, path: Move[]): number | Promise<number> {
    const startIndex = currentIndex
    let lastMove = path[currentIndex]
    let nextMove = path[++currentIndex]

    log(`[ForwardJumpUpOpt] Optimizing from index ${startIndex} (${lastMove.moveType.constructor.name})`)

    if (lastMove.toPlace.length > 0) {
      log(`[ForwardJumpUpOpt] Initial move places a block. Aborting.`)
      return --currentIndex
    }

    if (nextMove === undefined) return --currentIndex

    while (
      lastMove.exitPos.y === nextMove.exitPos.y &&
      lastMove.entryPos.y !== lastMove.exitPos.y &&
      nextMove.toPlace.length === 0 &&
      nextMove.toBreak.length === 0
    ) {
      if (lastMove.toPlace.length > 1) {
        log(`[ForwardJumpUpOpt] Index ${currentIndex}: Places >1 blocks. Aborting.`)
        return --currentIndex
      }

      if (!AABB.fromBlockPos(nextMove.entryPos).collides(AABB.fromBlockPos(nextMove.exitPos))) {
        log(`[ForwardJumpUpOpt] Index ${currentIndex}: AABB collision failed.`)
        return --currentIndex
      }
      
      if (++currentIndex >= path.length) return --currentIndex
      lastMove = nextMove
      nextMove = path[currentIndex]
    }

    const firstPos = lastMove.exitPos

    while (
      lastMove.exitPos.y === nextMove.exitPos.y &&
      nextMove.exitPos.distanceTo(firstPos) <= 2 && 
      nextMove.toPlace.length === 0 &&
      nextMove.toBreak.length === 0
    ) {
      if (nextMove.exitPos.y > firstPos.y) {
        log(`[ForwardJumpUpOpt] Index ${currentIndex}: nextMove Y is higher than firstPos Y. Aborting.`)
        return --currentIndex
      }
      if (++currentIndex >= path.length) return --currentIndex
      lastMove = nextMove
      nextMove = path[currentIndex]
    }

    log(`[ForwardJumpUpOpt] Optimized up to index ${currentIndex - 1}`)
    return --currentIndex
  }
}
