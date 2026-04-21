import { Vec3 } from 'vec3'
import { goals, Move } from '../../../src'
import { Movement, MovementProvider } from '../../../src/mineflayer-specific/movements'
import { BlockInfo } from '../../../src/mineflayer-specific/world/cacheWorld'

const DIAGONAL_COST = Math.SQRT2

function closedKey(pos: Vec3): string {
  return `${pos.x},${pos.y},${pos.z}`
}

function pushMove(neighbors: Move[], node: Move, cost: number, landing: Vec3, moveType: MovementProvider): void {
  neighbors.push(Move.fromPrevious(cost, landing.offset(0.5, 0, 0.5), node, moveType))
}

/**
 * Around-the-corner diagonal movement.
 *
 * This keeps the same diagonal search shape as the ladder diagonal provider,
 * but adds the corner wall checks needed for the turn.
 */
export class AroundCornerDiagonal extends MovementProvider {
  movementDirs = Movement.diagonalDirs

  static allowOffsetDiagonals = true

  provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    for (const dir of Movement.diagonalDirs) {
      this.getMoveAroundCornerDiagonal(start, dir, storage, closed)
    }
  }

  /**
   * One-block-down around-the-corner jump.
   */
  private canCornerDropLanding(
    ceilingClear: boolean,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo,
    blockFrontD: BlockInfo,
    blockEPhysical: boolean
  ): boolean {
    return blockEPhysical && blockB.walkthrough && blockC.walkthrough && blockD.walkthrough && blockFrontD.physical && ceilingClear
  }

  /**
   * Flat around-the-corner jump.
   */
  private canCornerFlatLanding(
    ceilingClear: boolean,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo,
    blockFrontC: BlockInfo
  ): boolean {
    return blockB.walkthrough && blockC.walkthrough && blockD.physical && blockFrontC.physical && ceilingClear
  }

  /**
   * Two-block-up around-the-corner jump.
   */
  private canCornerTwoUpLanding(ceilingClear: boolean, blockA: BlockInfo, blockB: BlockInfo): boolean {
    return blockA.walkthrough && blockB.physical && ceilingClear
  }

  /**
   * One-block-up around-the-corner jump.
   */
  private canCornerOneUpLanding(
    ceilingClear: boolean,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo,
    blockFrontB: BlockInfo
  ): boolean {
    return blockB.walkthrough && blockC.physical && blockD.walkthrough && blockFrontB.physical && ceilingClear
  }

  private getMoveAroundCornerDiagonal(node: Move, dir: Vec3, neighbors: Move[], closed: Set<string>): void {
    const block0 = this.getBlockInfo(node, 0, -1, 0)
    if (!block0.physical) return

    const block00 = this.getBlockInfo(node, 0, 0, 0)
    if (block00.liquid) return

    const block1Floor = this.getBlockInfo(node, dir.x, -1, dir.z)
    if (block1Floor.physical && block1Floor.height >= block0.height) return

    if (!this.getBlockInfo(node, dir.x, 0, dir.z).physical) return
    if (!this.getBlockInfo(node, dir.x, 1, dir.z).physical) return
    if (!this.getBlockInfo(node, dir.x, 0, 0).physical) return
    if (!this.getBlockInfo(node, 0, 0, dir.z).physical) return
    if (!this.getBlockInfo(node, dir.x, 1, 0).physical) return
    if (!this.getBlockInfo(node, 0, 1, dir.z).physical) return

    const cost0 = DIAGONAL_COST + this.settings.jumpCost
    const maxD = this.settings.allowSprinting ? 6 : 4

    for (let d = 2; d <= maxD; d++) {
      if (this.tryLanding(node, dir, d, d, cost0, block0, neighbors, closed)) break
    }

    if (AroundCornerDiagonal.allowOffsetDiagonals) {
      for (let major = 2; major <= maxD; major++) {
        for (let minor = 1; minor < major; minor++) {
          if (minor === major) continue

          if (this.tryLanding(node, dir, minor, major, cost0, block0, neighbors, closed)) return
          if (this.tryLanding(node, dir, major, minor, cost0, block0, neighbors, closed)) return
        }
      }
    }
  }

  private tryLanding(
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
    const cost = cost0 + 0.5 * DIAGONAL_COST * travel
    const majorIsX = xSteps > zSteps
    const majorIsZ = zSteps > xSteps
    const frontDx = dx - (majorIsX || xSteps === zSteps ? dir.x : 0)
    const frontDz = dz - (majorIsZ || xSteps === zSteps ? dir.z : 0)

    const flag0 = !closed.has(closedKey(new Vec3(node.x + dx, node.y - 1, node.z + dz)))
    const flag1 = !closed.has(closedKey(new Vec3(node.x + dx, node.y, node.z + dz)))
    const flag2 = !closed.has(closedKey(new Vec3(node.x + dx, node.y + 1, node.z + dz)))

    if (!flag0 && !flag1 && !flag2) return false

    const blockD = this.getBlockInfo(node, dx, -1, dz)
    if (blockD.climbable) return false

    const blockA = this.getBlockInfo(node, dx, 2, dz)
    const blockB = this.getBlockInfo(node, dx, 1, dz)
    const blockC = this.getBlockInfo(node, dx, 0, dz)
    const blockFrontD = this.getBlockInfo(node, frontDx, -1, frontDz)
    const blockFrontC = this.getBlockInfo(node, frontDx, 0, frontDz)
    const blockFrontB = this.getBlockInfo(node, frontDx, 1, frontDz)

    if (!this.getBlockInfo(node, dx, 0, 0).physical) return false
    if (!this.getBlockInfo(node, 0, 0, dz).physical) return false
    if (!this.getBlockInfo(node, dx, 1, 0).physical) return false
    if (!this.getBlockInfo(node, 0, 1, dz).physical) return false

    const blockE = this.getBlockInfo(node, dx, -2, dz)

    const ceilingClear =
      this.getBlockInfo(node, 0, 2, 0).walkthrough &&
      this.getBlockInfo(node, dx, 2, dz).walkthrough &&
      this.getBlockInfo(node, dx, 2, 0).walkthrough &&
      this.getBlockInfo(node, 0, 2, dz).walkthrough

    if (flag0 && this.canCornerDropLanding(ceilingClear, blockB, blockC, blockD, blockFrontD, blockE.physical)) {
      pushMove(neighbors, node, cost, blockD.position, this)
      return true
    }

    if (flag1 && this.canCornerFlatLanding(ceilingClear, blockB, blockC, blockD, blockFrontC)) {
      pushMove(neighbors, node, cost + 3, blockC.position, this)
      return true
    }

    if (flag2 && this.canCornerTwoUpLanding(ceilingClear, blockA, blockB)) {
      pushMove(neighbors, node, cost, blockA.position, this)
      return true
    }

    if (flag2 && this.canCornerOneUpLanding(ceilingClear, blockB, blockC, blockD, blockFrontB)) {
      if (blockC.height - block0.height > 1.2) return false
      if (travel > 3.0) return false
      pushMove(neighbors, node, cost, blockB.position, this)
      return true
    }

    return false
  }
}
