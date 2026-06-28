import { Vec3 } from 'vec3'
import * as goals from '../goals'
import { Move } from '../move'
import { Movement } from './movement'
import { BreakHandler, PlaceHandler } from './interactionUtils'
import { emptyVec } from '@nxg-org/mineflayer-physics-util/dist/physics/settings'
import { MovementProvider } from './movementProvider'
import { BlockInfo } from '../world/cacheWorld'
import {
  COST_INF,
  FALL_N_BLOCKS_COST,
  JUMP_ONE_BLOCK_COST,
  LADDER_UP_ONE_COST,
  WALK_OFF_BLOCK_COST,
  WALK_ONE_BLOCK_COST
} from './costs'

const PARKOUR_DIAGONAL_3_3_TRAVEL = Math.sqrt(18) // 3 by 3 offset.

// Small fixed tick penalty for the "forward" parkour landing (running across a
// gap onto a same-height block). It is slower than a clean jump-and-drop, so it
// pays a little extra. Kept as a placeholder until per-frame parkour timing exists.
const PARKOUR_FORWARD_LANDING_PENALTY = 3

// technically, the offsets are slow. Yeah, I know.
// However, removing those breaks the code. So I won't fix that for the time being. -Gen

export class IdleMovement extends MovementProvider {
  movementDirs: Vec3[] = []
  provideMovements (start: Move, storage: Move[]): void {}
  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {}
  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
    return true
  }
}

export class Forward extends MovementProvider {
  movementDirs = Movement.cardinalDirs

  provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    for (const dir of this.movementDirs) {
      const off = start.cachedVec.plus(dir).floor()
      if (closed.has(`${off.x},${off.y},${off.z}`)) continue
      this.getMoveForward(start, dir, storage)
    }
  }

  getMoveForward (start: Move, dir: Vec3, neighbors: Move[]): void {
    const pos = start.cachedVec

    let cost = this.travelCost(1) // sprint/walk one block forward

    if (this.getBlockInfo(pos, 0, 0, 0).liquid) cost += this.settings.liquidCost

    const blockC = this.getBlockInfo(pos, dir.x, 0, dir.z)
    if (blockC.isInvalid) return // out of range.

    if (!blockC.walkthrough) return

    const blockB = this.getBlockInfo(pos, dir.x, 1, dir.z)
    const blockD = this.getBlockInfo(pos, dir.x, -1, dir.z)

    const toBreak: BreakHandler[] = []
    const toPlace: PlaceHandler[] = []

    if (!blockD.physical && !blockC.liquid) {
      if (start.remainingBlocks <= 0) return // not enough blocks to place

      // if (this.getNumEntitiesAt(blockD.position, 0, 0, 0) > 0) return // D intersects an entity hitbox
      if (!blockD.replaceable) {
        if ((cost += this.safeOrBreak(blockD, toBreak)) > COST_INF) return
      }

      if ((cost += this.safeOrPlace(blockD, toPlace, 'solid')) > COST_INF) return
    }

    // console.log('yay!')
    // console.log('hello?', cost, blockC.block, blockB.block, this.breakCost(blockC), this.breakCost(blockB))
    if ((cost += this.safeOrBreak(blockB, toBreak)) > COST_INF) return
    if ((cost += this.safeOrBreak(blockC, toBreak)) > COST_INF) return

    // Exclusion zones: blockC is where the bot's feet end up. Fold the step cost
    // in now (before the move exists) so Move.cost stays read-only.
    if ((cost += this.exclusionStep(blockC)) > COST_INF) return

    // set cachedVec to center of wanted block
    neighbors.push(Move.fromPrevious(cost, blockC.position.offset(0.5, 0, 0.5), start, this, toPlace, toBreak))
  }
}

export class Diagonal extends MovementProvider {
  movementDirs = Movement.diagonalDirs

  provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    for (const dir of this.movementDirs) {
      const off = start.cachedVec.plus(dir).floor()
      if (closed.has(`${off.x},${off.y},${off.z}`)) continue
      this.getMoveDiagonal(start, dir, storage, goal)
    }
  }

  getMoveDiagonal (node: Move, dir: Vec3, neighbors: Move[], goal: goals.Goal): void {
    let cost = this.travelCost(Math.SQRT2) // one diagonal block is sqrt(2) blocks of travel

    const block0 = this.getBlockInfo(node, dir.x, 0, dir.z)

    if (block0.isInvalid) return // out of range.

    if (!block0.walkthrough) return

    if (this.getBlockInfo(node, 0, 0, 0).liquid) cost += this.settings.liquidCost

    const toBreak: BreakHandler[] = []
    const toPlace: PlaceHandler[] = []
    const block00 = this.getBlockInfo(node, 0, 0, 0)

    if (block00.height - block0.height > 0.6) return // Too high to walk up
    // const needSideClearance = block00.height - block0.height < 0
    const block1 = this.getBlockInfo(node, dir.x, 1, dir.z)
    const blockN1 = this.getBlockInfo(node, dir.x, -1, dir.z)
    if (!blockN1.physical && !block0.liquid) {
      const blockCheck0 = this.getBlockInfo(node, 0, -1, dir.z)
      const blockCheck1 = this.getBlockInfo(node, dir.x, -1, 0)

      // first sol.
      if (!blockCheck0.physical && !blockCheck1.physical) {
        if (node.remainingBlocks <= 0) return // not enough blocks to place

        const wanted = blockCheck0
        if (!wanted.replaceable) {
          if ((cost += this.safeOrBreak(wanted, toBreak)) > COST_INF) return
        }
        if ((cost += this.safeOrPlace(wanted, toPlace, 'solid')) > COST_INF) return
      }

      if ((cost += this.safeOrPlace(blockN1, toPlace, 'solid')) > COST_INF) return
    }

    if (toPlace.length > 1 && !this.settings.allowDiagonalBridging) return

    // expect these to all be relatively easy.
    cost += this.safeOrBreak(block0, toBreak)
    cost += this.safeOrBreak(block1, toBreak)
    cost += this.safeOrBreak(this.getBlockInfo(node, dir.x, 0, 0), toBreak)
    cost += this.safeOrBreak(this.getBlockInfo(node, 0, 0, dir.z), toBreak)
    cost += this.safeOrBreak(this.getBlockInfo(node, dir.x, 1, 0), toBreak)
    cost += this.safeOrBreak(this.getBlockInfo(node, 0, 1, dir.z), toBreak)
    if (cost > COST_INF) return

    // Exclusion zones: block0 is the destination foot block.
    if ((cost += this.exclusionStep(block0)) > COST_INF) return

    neighbors.push(Move.fromPrevious(cost, block0.position.offset(0.5, 0, 0.5), node, this, toPlace, toBreak))
  }
}

export class ForwardJump extends MovementProvider {
  movementDirs = Movement.cardinalDirs

  provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    for (const dir of this.movementDirs) {
      const off = start.cachedVec.plus(dir).floor()
      if (closed.has(`${off.x},${off.y + 1},${off.z}`)) continue
      this.getMoveJumpUp(start, dir, storage)
    }
  }

  /**
   * TODO: provide both non-sprint and sprint-jump moves here.
   * Saves time.
   * @param node
   * @param dir
   * @param neighbors
   * @returns
   */
  getMoveJumpUp (node: Move, dir: Vec3, neighbors: Move[]): void {
    // const pos = node.exitRounded(1)
    const pos = node.cachedVec
    const blockB = this.getBlockInfo(pos, dir.x, 1, dir.z)

    if (blockB.isInvalid) return // out of range.

    const blockA = this.getBlockInfo(pos, 0, 2, 0)
    const blockH = this.getBlockInfo(pos, dir.x, 2, dir.z)
    const blockC = this.getBlockInfo(pos, dir.x, 0, dir.z)

    // Jumping up one block: you move and rise at the same time, so the cost is
    // the slower of "walk one block" and "the jump arc", not their sum.
    let cost = Math.max(JUMP_ONE_BLOCK_COST, WALK_ONE_BLOCK_COST) + this.settings.jumpCost

    const block0 = this.getBlockInfo(pos, 0, 0, 0)
    if (block0.liquid) cost += this.settings.liquidCost

    const toBreak: BreakHandler[] = []
    const toPlace: PlaceHandler[] = []

    let cHeight = blockC.height

    // if (blockA.physical && (this.getNumEntitiesAt(blockA.position, 0, 1, 0) > 0)) return // Blocks A, B and H are above C, D and the player's space, we need to make sure there are no entities that will fall down onto our building space if we break them
    // if (blockH.physical && (this.getNumEntitiesAt(blockH.position, 0, 1, 0) > 0)) return
    // if (blockB.physical && !blockH.physical && !blockC.physical && (this.getNumEntitiesAt(blockB.position, 0, 1, 0) > 0)) return // It is fine if an ent falls on B so long as we don't need to replace block C

    // if liquid, allow swim movement up to it.
    if (!blockC.solidFull && !blockB.liquid) {
      if (node.remainingBlocks <= 0) return // not enough blocks to place

      // if (this.getNumEntitiesAt(blockC.position, 0, 0, 0) > 0) return // Check for any entities in the way of a block placement

      // console.log('blockC', blockC)
      const blockD = this.getBlockInfo(pos, dir.x, -1, dir.z)
      if (!blockD.solidFull) {
        if (node.remainingBlocks <= 1) return // not enough blocks to place

        // if (this.getNumEntitiesAt(blockD.position, 0, 0, 0) > 0) return // Check for any entities in the way of a block placement

        if (!blockD.replaceable) {
          if ((cost += this.breakCost(blockD)) > COST_INF) return
          toBreak.push(BreakHandler.fromVec(blockD.position, 'solid'))
        }
        if ((cost += this.safeOrPlace(blockD, toPlace, 'solid')) > COST_INF) return
      }

      if (!blockC.replaceable) {
        if ((cost += this.breakCost(blockC)) > COST_INF) return
        toBreak.push(BreakHandler.fromVec(blockC.position, 'solid'))
      }

      if ((cost += this.safeOrPlace(blockC, toPlace, 'solid')) > COST_INF) return

      cHeight += 1
    }

    const block1 = this.getBlockInfo(pos, 0, -1, 0)
    if (cHeight - block1.height > 1.2) return // Too high to jump

    if ((cost += this.safeOrBreak(blockA, toBreak)) > COST_INF) return
    if ((cost += this.safeOrBreak(blockB, toBreak)) > COST_INF) return
    if ((cost += this.safeOrBreak(blockH, toBreak)) > COST_INF) return
    if (toPlace.length > 0) return

    // Exclusion zones: blockB is the destination foot block.
    if ((cost += this.exclusionStep(blockB)) > COST_INF) return

    // set cachedVec to center of block we want.
    neighbors.push(Move.fromPrevious(cost, blockB.position.offset(0.5, 0, 0.5), node, this, toPlace, toBreak))
  }
}

abstract class DropDownProvider extends MovementProvider {
  getLandingBlock (orgBlock: BlockInfo, node: Move, dir: Vec3 = emptyVec): BlockInfo | null {
    // const chunk = this.bot.world.getColumn(node.x >> 4, node.z >> 4) as unknown as PCChunk;

    // TODO: optimize this.
    // If the chunk is cached, this will double our calculation speed.
    let min

    const startedInLiquid = orgBlock.liquid
    let blockLand
    if (startedInLiquid) {
      min = node.y - 1
      blockLand = this.getBlockInfo(node, dir.x, -1, dir.z)
    } else {
      blockLand = this.getBlockInfo(node, dir.x, -2, dir.z)
      if (this.settings.infiniteLiquidDropdownDistance) {
        min = (this.bot.game as any).minY
        // min = isBlockTypeInChunks(BlockInfo.WATER1.block!, chunk) ? (this.bot.game as any).minY : node.y - this.settings.maxDropDown;
      } else {
        min = node.y - this.settings.maxDropDown
      }
    }

    // min = node.y - this.settings.maxDropDown

    while (blockLand.position.y >= min) {
      if (blockLand.liquid && blockLand.walkthrough) {
        return blockLand
      }
      if (blockLand.physical) {
        if (node.y - blockLand.position.y <= this.settings.maxDropDown) {
          return this.getBlockInfo(blockLand.position, 0, 1, 0)
        }
        // return null;
      }
      if (!blockLand.walkthrough) return null
      // console.log("before drop:", blockLand.position)
      blockLand = this.getBlockInfo(blockLand.position, 0, -1, 0)
      // console.log("after drop:", blockLand.position)if (node.y - blockLand.position.y <= this.settings.maxDropDown)
    }
    return null
  }
}

export class ForwardDropDown extends DropDownProvider {
  movementDirs = Movement.cardinalDirs

  provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    for (const dir of this.movementDirs) {
      // // // const off = start.cachedVec.plus(dir).floor()
      // // // // if (closed.has(`${off.x},${off.y},${off.z}`)) continue
      this.getMoveDropDown(start, dir, storage, closed)
    }
  }

  getMoveDropDown (node: Move, dir: Vec3, neighbors: Move[], closed: Set<string>): void {
    let cost = WALK_OFF_BLOCK_COST // step off the ledge

    const block0 = this.getBlockInfo(node, 0, 0, 0)
    const blockLand = this.getLandingBlock(block0, node, dir)

    if (blockLand == null) return
    if (blockLand.isInvalid) return // out of range.
    if (closed.has(`${blockLand.position.x},${blockLand.position.y},${blockLand.position.z}`)) return

    if (block0.liquid) cost += this.settings.liquidCost

    // ticks to fall the height we are dropping (whole blocks)
    cost += FALL_N_BLOCKS_COST[node.y - blockLand.position.y]

    const blockA = this.getBlockInfo(node, dir.x, 2, dir.z)
    const blockB = this.getBlockInfo(node, dir.x, 1, dir.z)
    const blockC = this.getBlockInfo(node, dir.x, 0, dir.z)
    const blockD = this.getBlockInfo(node, dir.x, -1, dir.z)

    const toBreak: BreakHandler[] = []
    const toPlace: PlaceHandler[] = []

    // if (!this.settings.infiniteLiquidDropdownDistance && node.y - blockLand.position.y > this.settings.maxDropDown) return; // Don't drop down into water

    const blockCheck0 = this.getBlockInfo(blockLand.position, dir.x, 1, dir.z)
    const blockCheck1 = this.getBlockInfo(blockLand.position, dir.x, 2, dir.z)

    if ((cost += this.safeOrBreak(blockCheck0, toBreak)) > COST_INF) return
    if ((cost += this.safeOrBreak(blockCheck1, toBreak)) > COST_INF) return
    if ((cost += this.safeOrBreak(blockA, toBreak)) > COST_INF) return
    if ((cost += this.safeOrBreak(blockB, toBreak)) > COST_INF) return
    if ((cost += this.safeOrBreak(blockC, toBreak)) > COST_INF) return
    if ((cost += this.safeOrBreak(blockD, toBreak)) > COST_INF) return

    // Exclusion zones: blockLand is where the bot lands and stands.
    if ((cost += this.exclusionStep(blockLand)) > COST_INF) return

    // cost += this.getNumEntitiesAt(blockLand.position, 0, 0, 0) * this.entityCost // add cost for entities
    neighbors.push(Move.fromPrevious(cost, blockLand.position.offset(0.5, 0, 0.5), node, this, toPlace, toBreak))
  }
}

export class StraightDown extends DropDownProvider {
  movementDirs = [new Vec3(0, -1, 0)]

  provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    const off = start.cachedVec.floored()
    if (closed.has(`${off.x},${off.y - 1},${off.z}`)) return
    return this.getMoveDown(start, storage, closed)
  }

  getMoveDown (node: Move, neighbors: Move[], closed: Set<string>): void {
    let cost = 0 // straight down has no horizontal travel; the fall below is the whole cost
    const block0 = this.getBlockInfo(node, 0, 0, 0)

    const blockLand = this.getLandingBlock(block0, node)
    if (blockLand == null) return
    if (blockLand.isInvalid) return // out of range.
    if (closed.has(`${blockLand.position.x},${blockLand.position.y},${blockLand.position.z}`)) return

    if (block0.liquid) cost += this.settings.liquidCost // dont go underwater

    // ticks to fall the height we are dropping (whole blocks)
    cost += FALL_N_BLOCKS_COST[node.y - blockLand.position.y]

    const block1 = this.getBlockInfo(node, 0, -1, 0)

    const toBreak: BreakHandler[] = []
    const toPlace: PlaceHandler[] = []

    if ((cost += this.safeOrBreak(block1, toBreak)) > COST_INF) return

    // Exclusion zones: blockLand is where the bot lands and stands.
    if ((cost += this.exclusionStep(blockLand)) > COST_INF) return

    // cost += this.getNumEntitiesAt(blockLand.position, 0, 0, 0) * this.entityCost // add cost for entities

    neighbors.push(Move.fromPrevious(cost, blockLand.position.offset(0.5, 0, 0.5), node, this, toPlace, toBreak))
  }
}

export class StraightUp extends MovementProvider {
  movementDirs = [new Vec3(0, 1, 0)]

  provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    const off = start.cachedVec.floored()
    if (closed.has(`${off.x},${off.y + 1},${off.z}`)) return
    return this.getMoveUp(start, storage, closed)
  }

  getMoveUp (node: Move, neighbors: Move[], closed: Set<string>): void {
    const block1 = this.getBlockInfo(node, 0, 0, 0)

    if (block1.isInvalid) return // out of range.

    // Climbing a ladder/vine has its own speed; otherwise we jump (and below we
    // may also place a block to tower up, which adds its own place cost).
    let cost = block1.climbable ? LADDER_UP_ONE_COST : JUMP_ONE_BLOCK_COST + this.settings.jumpCost

    if (block1.liquid) cost += this.settings.liquidCost
    // if (this.getNumEntitiesAt(node, 0, 0, 0) > 0) return // an entity (besides the player) is blocking the building area

    const block2 = this.getBlockInfo(node, 0, 2, 0)
    const block3 = this.getBlockInfo(node, 0, 1, 0) // the block the bot ends up standing in

    const toBreak: BreakHandler[] = []
    const toPlace: PlaceHandler[] = []

    if ((cost += this.safeOrBreak(block2, toBreak)) > COST_INF) return

    if (!block1.climbable) {
      if (!block3.liquid) {
        if (!this.settings.allow1by1towers || node.remainingBlocks <= 0) return // not enough blocks to place

        if (!block1.replaceable) {
          if ((cost += this.breakCost(block1)) > COST_INF) return
          toBreak.push(BreakHandler.fromVec(block1.position, 'solid'))
        }

        if ((cost += this.safeOrPlace(block1, toPlace, 'solid')) > COST_INF) return

        const block0 = this.getBlockInfo(node, 0, -1, 0)

        if (block0.liquid) return // cant build in water
        if (block0.physical && block0.height - node.y < -0.2) return // cannot jump-place from a half block
      }
    }

    // Exclusion zones: block3 is where the bot's feet end up.
    if ((cost += this.exclusionStep(block3)) > COST_INF) return

    neighbors.push(Move.fromPrevious(cost, block1.position.offset(0.5, 1, 0.5), node, this, toPlace, toBreak))
  }
}

export class ParkourForward extends MovementProvider {
  movementDirs = Movement.cardinalDirs

  provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    for (const dir of Movement.cardinalDirs) {
      this.getMoveParkourForward(start, dir, storage, closed)
    }
  }

  // Jump up, down or forward over a 1 block gap
  getMoveParkourForward (node: Move, dir: Vec3, neighbors: Move[], closed: Set<string>): void {
    const block0 = this.getBlockInfo(node, 0, -1, 0)

    if (!block0.physical) return // cant jump from water

    const block00 = this.getBlockInfo(node, 0, 0, 0)
    if (block00.liquid) return

    const block1 = this.getBlockInfo(node, dir.x, -1, dir.z)
    if (
      (block1.physical && block1.height >= block0.height) ||
      !this.getBlockInfo(node, dir.x, 0, dir.z).walkthrough ||
      !this.getBlockInfo(node, dir.x, 1, dir.z).walkthrough
    ) {
      return
    }

    const cost0 = JUMP_ONE_BLOCK_COST + this.settings.jumpCost // the jump itself

    // Leaving entities at the ceiling level (along path) out for now because there are few cases where that will be important
    // cost += this.getNumEntitiesAt(node, dir.x, 0, dir.z) * this.entityCost

    // If we have a block on the ceiling, we cannot jump but we can still fall
    let ceilingClear = this.getBlockInfo(node, 0, 2, 0).walkthrough && this.getBlockInfo(node, dir.x, 2, dir.z).walkthrough

    // Similarly for the down path
    let floorCleared = !this.getBlockInfo(node, dir.x, -2, dir.z).physical

    const maxD = this.settings.allowSprinting ? 5 : 2

    for (let d = 2; d <= maxD; d++) {
      let cost = cost0 + this.travelCost(d) // jump plus sprinting across d blocks
      const dx = dir.x * d
      const dz = dir.z * d

      const flag0 = /* true */ !closed.has(`${node.x + dx},${node.y - 1},${node.z + dz}`)
      const flag1 = /* true */ !closed.has(`${node.x + dx},${node.y},${node.z + dz}`)
      const flag2 = /* true */ !closed.has(`${node.x + dx},${node.y + 1},${node.z + dz}`)

      if (!flag0 && !flag1 && !flag2) return

      const blockA = this.getBlockInfo(node, dx, 2, dz)
      const blockB = this.getBlockInfo(node, dx, 1, dz)
      const blockC = this.getBlockInfo(node, dx, 0, dz)
      const blockD = this.getBlockInfo(node, dx, -1, dz)

      // ceilingClear &&= this.getBlockInfo(node, dx, 2, dx).safe

      // if (blockC.safe) cost += this.getNumEntitiesAt(blockC.position, 0, 0, 0) * this.entityCost

      if (flag0 && (ceilingClear || d === 2) && blockB.walkthrough && blockC.walkthrough && blockD.walkthrough && floorCleared) {
        // Down
        const blockE = this.getBlockInfo(node, dx, -2, dz)
        if (blockE.physical) { // TODO: support jumping into liquid.
          // Exclusion zones: blockD is the landing. Skip the move if it is forbidden.
          if ((cost += this.exclusionStep(blockD)) < COST_INF) {
            neighbors.push(Move.fromPrevious(cost, blockD.position.offset(0.5, 0, 0.5), node, this))
          }
        }
        floorCleared = floorCleared && !blockE.physical
      } else if (flag1 && ceilingClear && blockB.walkthrough && blockC.walkthrough && blockD.physical) {
        // Forward
        cost += PARKOUR_FORWARD_LANDING_PENALTY
        if ((cost += this.exclusionStep(blockC)) < COST_INF) {
          neighbors.push(Move.fromPrevious(cost, blockC.position.offset(0.5, 0, 0.5), node, this))
        }
        break
      } else if (flag2 && ceilingClear && blockA.walkthrough && blockB.walkthrough && blockC.physical) {
        // Up
        if (d === 5) continue

        // 4 Blocks forward 1 block up is very difficult and fails often
        if (blockC.height - block0.height > 1.2) break // Too high to jump
        if ((cost += this.exclusionStep(blockB)) < COST_INF) {
          neighbors.push(Move.fromPrevious(cost, blockB.position.offset(0.5, 0, 0.5), node, this))
        }
        break
        // }
      } else if (!blockB.walkthrough || !blockC.walkthrough) {
        break
      }

      ceilingClear = ceilingClear && blockA.walkthrough
    }
  }
}

export class ParkourDiagonal extends MovementProvider {
  movementDirs = Movement.diagonalDirs

  // default: preserve current behavior
  static allowOffsetDiagonals = true

  provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    for (const dir of Movement.diagonalDirs) {
      this.getMoveParkourDiagonal(start, dir, storage, closed)
    }
  }

  getMoveParkourDiagonal (node: Move, dir: Vec3, neighbors: Move[], closed: Set<string>): void {
    const block0 = this.getBlockInfo(node, 0, -1, 0)
    if (!block0.physical) return

    const block00 = this.getBlockInfo(node, 0, 0, 0)
    if (block00.liquid) return

    const block1Floor = this.getBlockInfo(node, dir.x, -1, dir.z)
    if (block1Floor.physical && block1Floor.height >= block0.height) return

    if (!this.getBlockInfo(node, dir.x, 0, dir.z).walkthrough) return
    if (!this.getBlockInfo(node, dir.x, 1, dir.z).walkthrough) return

    if (!this.getBlockInfo(node, dir.x, 0, 0).walkthrough) return
    if (!this.getBlockInfo(node, 0, 0, dir.z).walkthrough) return
    if (!this.getBlockInfo(node, dir.x, 1, 0).walkthrough) return
    if (!this.getBlockInfo(node, 0, 1, dir.z).walkthrough) return

    const cost0 = JUMP_ONE_BLOCK_COST + this.settings.jumpCost // the jump itself
    const maxD = this.settings.allowSprinting ? 4 : 2

    // old behavior
    for (let d = 2; d <= maxD; d++) {
      if (this.tryDiagonalLanding(node, dir, d, d, cost0, block0, neighbors, closed)) break
    }

    // new optional asymmetric behavior
    if (ParkourDiagonal.allowOffsetDiagonals) {
      for (let major = 2; major <= maxD; major++) {
        for (let minor = 1; minor < major; minor++) {
          if (minor === major) continue

          // check both (minor, major) and (major, minor)
          if (this.tryDiagonalLanding(node, dir, minor, major, cost0, block0, neighbors, closed)) return
          if (this.tryDiagonalLanding(node, dir, major, minor, cost0, block0, neighbors, closed)) return
        }
      }
    }
  }

  private tryDiagonalLanding (
    node: Move,
    dir: Vec3,
    xSteps: number,
    zSteps: number,
    cost0: number,
    block0: BlockInfo,
    neighbors: Move[],
    closed: Set<string>
  ): boolean {
    const dx = dir.x * xSteps
    const dz = dir.z * zSteps

    const travel = Math.sqrt(xSteps * xSteps + zSteps * zSteps)
    let cost = cost0 + this.travelCost(travel) // jump plus sprinting across the gap
    const majorIsX = xSteps > zSteps
    const majorIsZ = zSteps > xSteps
    const frontDx = dx - (majorIsX || xSteps === zSteps ? dir.x : 0)
    const frontDz = dz - (majorIsZ || xSteps === zSteps ? dir.z : 0)

    const flag0 = !closed.has(`${node.x + dx},${node.y - 1},${node.z + dz}`)
    const flag1 = !closed.has(`${node.x + dx},${node.y},${node.z + dz}`)
    const flag2 = !closed.has(`${node.x + dx},${node.y + 1},${node.z + dz}`)

    if (!flag0 && !flag1 && !flag2) return false

    const blockA = this.getBlockInfo(node, dx, 2, dz)
    const blockB = this.getBlockInfo(node, dx, 1, dz)
    const blockC = this.getBlockInfo(node, dx, 0, dz)
    const blockD = this.getBlockInfo(node, dx, -1, dz)
    const blockFrontD = this.getBlockInfo(node, frontDx, -1, frontDz)
    const blockFrontC = this.getBlockInfo(node, frontDx, 0, frontDz)
    const blockFrontB = this.getBlockInfo(node, frontDx, 1, frontDz)

    if (!this.getBlockInfo(node, dx, 0, 0).walkthrough) return false
    if (!this.getBlockInfo(node, 0, 0, dz).walkthrough) return false
    if (!this.getBlockInfo(node, dx, 1, 0).walkthrough) return false
    if (!this.getBlockInfo(node, 0, 1, dz).walkthrough) return false

    const blockE = this.getBlockInfo(node, dx, -2, dz)

    const ceilingClear =
      this.getBlockInfo(node, 0, 2, 0).walkthrough &&
      this.getBlockInfo(node, dx, 2, dz).walkthrough &&
      this.getBlockInfo(node, dx, 2, 0).walkthrough &&
      this.getBlockInfo(node, 0, 2, dz).walkthrough

    const floorCleared = !blockE.physical

    if (flag0 && ceilingClear && blockB.walkthrough && blockC.walkthrough && blockD.walkthrough && blockFrontD.walkthrough && !floorCleared) {
      if (blockE.physical) {
        if ((cost += this.exclusionStep(blockD)) < COST_INF) {
          neighbors.push(Move.fromPrevious(cost, blockD.position.offset(0.5, 0, 0.5), node, this))
        }
        return true
      }
    } else if (flag1 && ceilingClear && blockB.walkthrough && blockC.walkthrough && blockD.physical && blockFrontC.walkthrough) {
      cost += PARKOUR_FORWARD_LANDING_PENALTY
      if ((cost += this.exclusionStep(blockC)) < COST_INF) {
        neighbors.push(Move.fromPrevious(cost, blockC.position.offset(0.5, 0, 0.5), node, this))
      }
      return true
    } else if (flag2 && ceilingClear && blockA.walkthrough && blockB.walkthrough && blockC.physical && blockFrontB.walkthrough) {
      if (blockC.height - block0.height > 1.2) return false
      if (travel > PARKOUR_DIAGONAL_3_3_TRAVEL) return false
      if ((cost += this.exclusionStep(blockB)) < COST_INF) {
        neighbors.push(Move.fromPrevious(cost, blockB.position.offset(0.5, 0, 0.5), node, this))
      }
      return true
    }

    return false
  }
}
