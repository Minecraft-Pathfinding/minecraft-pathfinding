import { Vec3 } from 'vec3'
import { Move } from '../../move'
import { MovementProvider } from '../movementProvider'
import { Goal } from '../../goals'
import { canUseFrostWalker, canWalkOn, canWalkThrough, findPlaceOpts, getMiningDurationTicks, isBottomSlab, mustBeSolidToWalkOn } from './movementHelper'
import { BreakHandler, PlaceHandler } from '../interactionUtils'
import {
  CENTER_AFTER_FALL_COST,
  COST_INF,
  FALL_N_BLOCKS_COST,
  JUMP_ONE_BLOCK_COST,
  WALK_OFF_BLOCK_COST,
  WALK_ONE_BLOCK_COST,
  WALK_ONE_OVER_SOUL_SAND_COST
} from '../costs'
import { BlockInfo } from '../../world/cacheWorld'

export class IdleMovement extends MovementProvider {
  movementDirs: Vec3[] = []
  provideMovements (start: Move, storage: Move[]): void {}
  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {}
  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
    return true
  }
}

// base all code in this file off of:
// https://github.com/cabaletta/baritone/blob/1.19.4/src/main/java/baritone/pathing/movement/movements/MovementAscend.java

export class MovementAscend extends MovementProvider {
  movementDirs = [new Vec3(0, 1, 0), new Vec3(0, 1, 1), new Vec3(0, 1, -1), new Vec3(1, 1, 0), new Vec3(-1, 1, 0)]
  provideMovements (start: Move, storage: Move[], goal: Goal, closed: Set<string>): void {
    for (const dir of this.movementDirs) {
      const off = start.cachedVec.plus(dir)
      // if (closed.has(off.toString())) return
      this.provideAscend(start, dir, storage, closed)
    }
  }

  provideAscend (node: Move, dir: Vec3, storage: Move[], closed: Set<string>): void {
    const blPlace = this.getBlockInfo(node, dir.x, 0, dir.z)

    if (blPlace.block?.name.startsWith('black')) console.log('sup bitch', node.exitPos, blPlace)
    if (blPlace.isInvalid) return

    // potentially get rid of these, as we don't actually need them for the time being.
    const toPlace: PlaceHandler[] = []
    const toBreak: BreakHandler[] = []

    let cost = 0
    if (!blPlace.solidFull) {
      if (!blPlace.replaceable) {
        if ((cost += this.safeOrBreak(blPlace, toBreak)) >= COST_INF) return
      }
      if ((cost += this.safeOrPlace(blPlace, toPlace)) >= COST_INF) return
      if (findPlaceOpts(this, node, blPlace.position) == null) return
    }

    // console.log('made it here', node.exitPos)

    const srcUp1 = this.getBlockInfo(node, 0, 1, 0)
    const srcUp2 = this.getBlockInfo(node, 0, 2, 0)
    const srcUp3 = this.getBlockInfo(node, 0, 3, 0)
    // translate below to typescript
    //         if (context.get(x, y + 3, z).getBlock() instanceof FallingBlock && (MovementHelper.canWalkThrough(context, x, y + 1, z) || !(srcUp2.getBlock() instanceof FallingBlock))) {//it would fall on us and possibly suffocate us

    if (srcUp3.canFall && (canWalkThrough(srcUp1) || !srcUp2.canFall)) {
      console.log('end here')
      return
    }

    const srcDown1 = this.getBlockInfo(node, 0, -1, 0)
    if (srcDown1.climbable) return

    const jumpFromBottomSlab = isBottomSlab(srcDown1)
    const jumpToBottomSlab = isBottomSlab(blPlace)

    if (jumpFromBottomSlab && !jumpToBottomSlab) {
      return
    }

    let walk = 0
    if (jumpToBottomSlab) {
      if (jumpFromBottomSlab) {
        walk = Math.max(JUMP_ONE_BLOCK_COST, WALK_ONE_BLOCK_COST) // we hit space immediately on entering this action
        walk += this.settings.jumpCost
      } else {
        walk = WALK_ONE_BLOCK_COST
      }
    } else {
      // for speed
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (blPlace.block!.type === BlockInfo.soulsandId) {
        walk = WALK_ONE_OVER_SOUL_SAND_COST
      } else {
        walk = Math.max(JUMP_ONE_BLOCK_COST, WALK_ONE_BLOCK_COST)
      }
      walk += this.settings.jumpCost
    }

    if ((cost += walk) >= COST_INF) return
    if ((cost += getMiningDurationTicks(this, srcUp2, toBreak)) >= COST_INF) return

    const target1 = this.getBlockInfo(node, dir.x, 1, dir.z)
    if ((cost += getMiningDurationTicks(this, target1, toBreak)) >= COST_INF) return

    const target2 = this.getBlockInfo(node, dir.x, 2, dir.z)
    if ((cost += getMiningDurationTicks(this, target2, toBreak)) >= COST_INF) return

    // cost += 1
    storage.push(Move.fromPrevious(cost, target1.position, node, this, toPlace, toBreak))
  }
}

export class MovementDescend extends MovementProvider {
  movementDirs = [new Vec3(0, -1, 0)]//, new Vec3(0, -1, 1), new Vec3(0, -1, -1), new Vec3(1, -1, 0), new Vec3(-1, -1, 0)];
  provideMovements (start: Move, storage: Move[], goal: Goal, closed: Set<string>): void {
    for (const dir of this.movementDirs) {
      this.provideDescend(start, dir, storage, closed)
    }
  }

  provideDescend (node: Move, dir: Vec3, storage: Move[], closed: Set<string>): void {
    const toBreak: BreakHandler[] = []

    const srcN1 = this.getBlockInfo(node, dir.x, -1, dir.z)
    if (srcN1.climbable) return

    const srcN2 = this.getBlockInfo(node, dir.x, -2, dir.z)
    if (!canWalkOn(srcN2)) {
      return // for now, do not calculate this movement as it will be handled by movementFall.
      // this.dynamicFallCosts(srcN2, cost);
    }

    if (canUseFrostWalker(this, srcN2)) {
      return
    }

    let cost = 0

    const destN1 = this.getBlockInfo(node, dir.x, -1, dir.z)

    if ((cost += getMiningDurationTicks(this, destN1, toBreak)) >= COST_INF) return

    const dest = this.getBlockInfo(node, dir.x, 0, dir.z)
    if ((cost += getMiningDurationTicks(this, dest, toBreak)) >= COST_INF) return

    const dest1 = this.getBlockInfo(node, dir.x, 1, dir.z)
    if ((cost += getMiningDurationTicks(this, dest1, toBreak)) >= COST_INF) return

    let walk = WALK_OFF_BLOCK_COST

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (srcN1.block!.type === BlockInfo.soulsandId) {
      walk = WALK_ONE_OVER_SOUL_SAND_COST / WALK_ONE_BLOCK_COST
    }

    cost += walk
    cost += Math.max(FALL_N_BLOCKS_COST[1], CENTER_AFTER_FALL_COST)
    storage.push(Move.fromPrevious(cost, destN1.position, node, this, [], toBreak))
  }

  // TODO: implement mutables
  dynamicFallCosts (info: BlockInfo, cost: number): void {}
}

export class MovementDiagonal extends MovementProvider {
  movementDirs = MovementProvider.diagonalDirs
  provideMovements (start: Move, storage: Move[], goal: Goal, closed: Set<string>): void {
    for (const dir of this.movementDirs) {
      this.provideDiagonal(start, dir, storage, closed)
    }
  }

  provideDiagonal (node: Move, dir: Vec3, storage: Move[], closed: Set<string>) {
    const toBreak: BreakHandler[] = []
    const toPlace: PlaceHandler[] = []

    const dest1 = this.getBlockInfo(node, dir.x, 1, dir.z)
    if (!canWalkThrough(dest1)) return

    const dest0 = this.getBlockInfo(node, dir.x, 0, dir.z)

    if (!canWalkThrough(dest0)) {
      return // handle in a diagonal ascension movement
    }

    // else

    const destWalkOn = this.getBlockInfo(node, dir.x, -1, dir.z)
    const fromDown = this.getBlockInfo(node, 0, -1, 0)
    const isStandingOnABlock = mustBeSolidToWalkOn(fromDown)
  }
}
