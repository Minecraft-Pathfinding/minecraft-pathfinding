import { Vec3 } from 'vec3'
import { goals, Move } from '../../../src'
import { Movement, MovementProvider } from '../../../src/mineflayer-specific/movements'
import { BlockInfo } from '../../../src/mineflayer-specific/world/cacheWorld'

const DIAGONAL_COST = Math.SQRT2

function closedKey(pos: Vec3): string {
  return `${pos.x},${pos.y},${pos.z}`
}

function getLadderSupportCandidates(landing: Vec3, dir: Vec3): Vec3[] {
  const candidates = [landing.offset(-dir.x, -1, -dir.z)]

  if (dir.x !== 0 && dir.z !== 0) {
    candidates.push(landing.offset(-dir.x, -1, 0))
    candidates.push(landing.offset(0, -1, -dir.z))
  } else if (dir.x !== 0) {
    candidates.push(landing.offset(0, -1, 1))
    candidates.push(landing.offset(0, -1, -1))
  } else if (dir.z !== 0) {
    candidates.push(landing.offset(1, -1, 0))
    candidates.push(landing.offset(-1, -1, 0))
  }

  return candidates
}

function getLadderSupport(provider: MovementProvider, landing: Vec3, dir: Vec3): Vec3 | null {
  for (const candidate of getLadderSupportCandidates(landing, dir)) {
    if (provider.getBlockInfoRaw(candidate).climbable) return candidate
  }
  return null
}

function setLadderSupportMetadata(move: Move, ladderSupport: Vec3): void {
  move.metadata = {
    ...move.metadata,
    ladderSupport
  }
}

function pushMoveWithOptionalLadder(
  neighbors: Move[],
  node: Move,
  cost: number,
  landing: Vec3,
  ladderSupport: Vec3 | null,
  moveType: MovementProvider
): void {
  const move = Move.fromPrevious(cost, landing.offset(0.5, 0, 0.5), node, moveType)
  if (ladderSupport != null) setLadderSupportMetadata(move, ladderSupport)
  neighbors.push(move)
}

function pushMoveLandingOnLadder(
  neighbors: Move[],
  node: Move,
  cost: number,
  ladderPos: Vec3,
  moveType: MovementProvider
): void {
  neighbors.push(Move.fromPrevious(cost, ladderPos.offset(0.5, 1, 0.5), node, moveType))
}

/**
 * Ladder-assisted parkour forward movement.
 *
 * This is intentionally kept very close to the existing parkour forward
 * producer so the behavior stays familiar, with the only added rule being that
 * a ladder in the block immediately before the landing can satisfy the higher
 * forward variants.
 */
export class LadderForward extends MovementProvider {
  movementDirs = Movement.cardinalDirs

  provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    for (const dir of Movement.cardinalDirs) {
      this.getMoveLadderForward(start, dir, storage, closed)
    }
  }

  /**
   * One-block-down forward jump.
   */
  private canForwardDropLanding(
    ladderAtC: Vec3 | null,
    ceilingClear: boolean,
    distance: number,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo,
    floorCleared: boolean
  ): boolean {
    return floorCleared && blockB.walkthrough && blockC.walkthrough && blockD.walkthrough && (ceilingClear || distance === 2 || ladderAtC != null)
  }

  /**
   * Flat forward jump.
   */
  private canForwardFlatLanding(
    ladderAtC: Vec3 | null,
    ceilingClear: boolean,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo
  ): boolean {
    return blockB.walkthrough && blockC.walkthrough && blockD.physical && (ceilingClear || ladderAtC != null)
  }

  /**
   * Two-block-up forward jump.
   */
  private canForwardTwoUpLanding(
    ladderAtA: Vec3 | null,
    ceilingClear: boolean,
    blockA: BlockInfo,
    blockB: BlockInfo
  ): boolean {
    return blockA.walkthrough && blockB.physical && ladderAtA != null && ceilingClear
  }

  /**
   * One-block-up forward jump.
   */
  private canForwardOneUpLanding(
    ladderAtB: Vec3 | null,
    ceilingClear: boolean,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo
  ): boolean {
    return blockB.walkthrough && blockC.physical && blockD.walkthrough && (ceilingClear || ladderAtB != null)
  }

  getMoveLadderForward(node: Move, dir: Vec3, neighbors: Move[], closed: Set<string>): void {
    const block0 = this.getBlockInfo(node, 0, -1, 0)

    if (!block0.physical) return

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

    const cost0 = 1 + this.settings.jumpCost
    let ceilingClear = this.getBlockInfo(node, 0, 2, 0).walkthrough && this.getBlockInfo(node, dir.x, 2, dir.z).walkthrough
    let floorCleared = !this.getBlockInfo(node, dir.x, -2, dir.z).physical
    const maxD = this.settings.allowSprinting ? 7 : 4

    for (let d = 2; d <= maxD; d++) {
      const cost = cost0 + d * 0.5
      const dx = dir.x * d
      const dz = dir.z * d

      const flag0 = !closed.has(closedKey(new Vec3(node.x + dx, node.y - 1, node.z + dz)))
      const flag1 = !closed.has(closedKey(new Vec3(node.x + dx, node.y, node.z + dz)))
      const flag2 = !closed.has(closedKey(new Vec3(node.x + dx, node.y + 1, node.z + dz)))

      if (!flag0 && !flag1 && !flag2) return

      const blockA = this.getBlockInfo(node, dx, 2, dz)
      const blockB = this.getBlockInfo(node, dx, 1, dz)
      const blockC = this.getBlockInfo(node, dx, 0, dz)
      const blockD = this.getBlockInfo(node, dx, -1, dz)

      const ladderAtC = getLadderSupport(this, blockC.position, dir)
      const ladderAtB = getLadderSupport(this, blockB.position, dir)
      const ladderAtA = getLadderSupport(this, blockA.position, dir)

      if (flag0 && this.canForwardDropLanding(ladderAtC, ceilingClear, d, blockB, blockC, blockD, floorCleared)) {
        const blockE = this.getBlockInfo(node, dx, -2, dz)
        if (ladderAtC != null) {
          pushMoveWithOptionalLadder(neighbors, node, cost, blockC.position, ladderAtC, this)
        } else if (blockE.physical) {
          pushMoveWithOptionalLadder(neighbors, node, cost, blockD.position, null, this)
        }
        floorCleared = floorCleared && !blockE.physical
      } else if (d <= 6 && flag1 && this.canForwardFlatLanding(ladderAtC, ceilingClear, blockB, blockC, blockD)) {
        pushMoveWithOptionalLadder(neighbors, node, cost + 3, blockC.position, ladderAtC, this)
        break
      } else if (d <= 4 && flag2 && this.canForwardTwoUpLanding(ladderAtA, ceilingClear, blockA, blockB)) {
        pushMoveWithOptionalLadder(neighbors, node, cost, blockA.position, ladderAtA, this)
        break
      } else if (d <= 6 && flag2 && this.canForwardOneUpLanding(ladderAtB, ceilingClear, blockB, blockC, blockD)) {
        if (d === 5) continue

        if (blockC.height - block0.height > 1.2 && ladderAtB == null) break
        pushMoveWithOptionalLadder(neighbors, node, cost, blockB.position, ladderAtB, this)
        break
      } else if (!blockB.walkthrough || !blockC.walkthrough) {
        break
      }

      ceilingClear = ceilingClear && blockA.walkthrough
    }
  }
}

/**
 * Ladder-assisted parkour diagonal movement.
 *
 * This mirrors the standard diagonal producer and only relaxes the higher path
 * when a ladder is present on the approach block.
 */
export class LadderDiagonal extends MovementProvider {
  movementDirs = Movement.diagonalDirs

  static allowOffsetDiagonals = true

  provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    for (const dir of Movement.diagonalDirs) {
      this.getMoveLadderDiagonal(start, dir, storage, closed)
    }
  }

  /**
   * One-block-down diagonal jump.
   */
  private canDiagonalDropLanding(
    ladderAtC: Vec3 | null,
    ceilingClear: boolean,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo,
    blockFrontD: BlockInfo,
    blockEPhysical: boolean
  ): boolean {
    return blockEPhysical && blockB.walkthrough && blockC.walkthrough && blockD.walkthrough && blockFrontD.walkthrough && (ceilingClear || ladderAtC != null)
  }

  /**
   * Flat diagonal jump.
   */
  private canDiagonalFlatLanding(
    ladderAtC: Vec3 | null,
    ceilingClear: boolean,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo,
    blockFrontC: BlockInfo
  ): boolean {
    return blockB.walkthrough && blockC.walkthrough && blockD.physical && blockFrontC.walkthrough && (ceilingClear || ladderAtC != null)
  }

  /**
   * Two-block-up diagonal jump.
   */
  private canDiagonalTwoUpLanding(
    ladderAtA: Vec3 | null,
    ceilingClear: boolean,
    blockA: BlockInfo,
    blockB: BlockInfo
  ): boolean {
    return blockA.walkthrough && blockB.physical && ladderAtA != null && ceilingClear
  }

  /**
   * One-block-up diagonal jump.
   */
  private canDiagonalOneUpLanding(
    ladderAtB: Vec3 | null,
    ceilingClear: boolean,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo,
    blockFrontB: BlockInfo
  ): boolean {
    return blockB.walkthrough && blockC.physical && blockD.walkthrough && blockFrontB.walkthrough && (ceilingClear || ladderAtB != null)
  }

  getMoveLadderDiagonal(node: Move, dir: Vec3, neighbors: Move[], closed: Set<string>): void {
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

    const cost0 = DIAGONAL_COST + this.settings.jumpCost
    const maxD = this.settings.allowSprinting ? 6 : 4

    for (let d = 2; d <= maxD; d++) {
      if (this.tryDiagonalLanding(node, dir, d, d, cost0, block0, neighbors, closed)) break
    }

    if (LadderDiagonal.allowOffsetDiagonals) {
      for (let major = 2; major <= maxD; major++) {
        for (let minor = 1; minor < major; minor++) {
          if (minor === major) continue

          if (this.tryDiagonalLanding(node, dir, minor, major, cost0, block0, neighbors, closed)) return
          if (this.tryDiagonalLanding(node, dir, major, minor, cost0, block0, neighbors, closed)) return
        }
      }
    }
  }

  private tryDiagonalLanding(
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

    const flag0 = !closed.has(`${node.x + dx},${node.y - 1},${node.z + dz}`)
    const flag1 = !closed.has(`${node.x + dx},${node.y},${node.z + dz}`)
    const flag2 = !closed.has(`${node.x + dx},${node.y + 1},${node.z + dz}`)

    if (!flag0 && !flag1 && !flag2) return false

    const blockD = this.getBlockInfo(node, dx, -1, dz)
    if (blockD.climbable) return false; // no need to consider a movement for a ladder, we'll consider it eventually anyway.

    const blockA = this.getBlockInfo(node, dx, 2, dz)
    const blockB = this.getBlockInfo(node, dx, 1, dz)
    const blockC = this.getBlockInfo(node, dx, 0, dz)
    const blockFrontD = this.getBlockInfo(node, frontDx, -1, frontDz)
    const blockFrontC = this.getBlockInfo(node, frontDx, 0, frontDz)
    const blockFrontB = this.getBlockInfo(node, frontDx, 1, frontDz)

    if (!this.getBlockInfo(node, dx, 0, 0).walkthrough) return false
    if (!this.getBlockInfo(node, 0, 0, dz).walkthrough) return false
    if (!this.getBlockInfo(node, dx, 1, 0).walkthrough) return false
    if (!this.getBlockInfo(node, 0, 1, dz).walkthrough) return false

    const blockE = this.getBlockInfo(node, dx, -2, dz)
    const ladderAtC = getLadderSupport(this, blockC.position, dir)
    const ladderAtB = getLadderSupport(this, blockB.position, dir)
    const ladderAtA = getLadderSupport(this, blockA.position, dir)

    const ceilingClear =
      this.getBlockInfo(node, 0, 2, 0).walkthrough &&
      this.getBlockInfo(node, dx, 2, dz).walkthrough &&
      this.getBlockInfo(node, dx, 2, 0).walkthrough &&
      this.getBlockInfo(node, 0, 2, dz).walkthrough

    const floorCleared = !blockE.physical

    if (flag0 && this.canDiagonalDropLanding(ladderAtC, ceilingClear, blockB, blockC, blockD, blockFrontD, blockE.physical)) {
      if (ladderAtC != null) {
        pushMoveWithOptionalLadder(neighbors, node, cost, blockC.position, ladderAtC, this)
        return true
      }

      if (blockE.physical) {
        pushMoveWithOptionalLadder(neighbors, node, cost, blockD.position, null, this)
        return true
      }
    } else if (flag1 && this.canDiagonalFlatLanding(ladderAtC, ceilingClear, blockB, blockC, blockD, blockFrontC)) {
      pushMoveWithOptionalLadder(neighbors, node, cost + 3, blockC.position, ladderAtC, this)
      return true
    } else if (flag2 && this.canDiagonalTwoUpLanding(ladderAtA, ceilingClear, blockA, blockB)) {
      pushMoveWithOptionalLadder(neighbors, node, cost, blockA.position, ladderAtA, this)
      return true
    } else if (flag2 && this.canDiagonalOneUpLanding(ladderAtB, ceilingClear, blockB, blockC, blockD, blockFrontB)) {
      if (blockC.height - block0.height > 1.2 && ladderAtB == null) return false
      if (travel > 3.0 && ladderAtB == null) return false
      pushMoveWithOptionalLadder(neighbors, node, cost, blockB.position, ladderAtB, this)
      return true
    }

    return false
  }
}

/**
 * Ladder-landing parkour forward movement.
 *
 * This variant targets the ladder block itself instead of the air block above
 * and behind it.
 */
export class LadderLandingForward extends MovementProvider {
  movementDirs = Movement.cardinalDirs

  provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    for (const dir of Movement.cardinalDirs) {
      this.getMoveLadderLandingForward(start, dir, storage, closed)
    }
  }

  private canForwardLandingDrop(
    ladderAtC: Vec3 | null,
    ceilingClear: boolean,
    distance: number,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo,
    blockEPhysical: boolean
  ): boolean {
    return blockEPhysical && blockB.walkthrough && blockC.walkthrough && blockD.walkthrough && (ceilingClear || distance === 2 || ladderAtC != null)
  }

  private canForwardLandingFlat(
    ladderAtB: Vec3 | null,
    ceilingClear: boolean,
    blockC: BlockInfo,
    blockD: BlockInfo
  ): boolean {
    return blockC.walkthrough && blockD.physical && (ceilingClear || ladderAtB != null)
  }

  private canForwardLandingTwoUp(
    ladderAtA: Vec3 | null,
    ceilingClear: boolean,
    blockA: BlockInfo,
    blockB: BlockInfo
  ): boolean {
    return blockA.walkthrough && blockB.physical && ladderAtA != null && ceilingClear
  }

  private canForwardLandingOneUp(
    ladderAtB: Vec3 | null,
    ceilingClear: boolean,
    blockC: BlockInfo,
    blockD: BlockInfo
  ): boolean {
    return blockC.physical && blockD.walkthrough && (ceilingClear || ladderAtB != null)
  }

  private getMoveLadderLandingForward(node: Move, dir: Vec3, neighbors: Move[], closed: Set<string>): void {
    const block0 = this.getBlockInfo(node, 0, -1, 0)
    if (!block0.physical) return

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

    const cost0 = 1 + this.settings.jumpCost
    const baseCeilingClear = this.getBlockInfo(node, 0, 2, 0).walkthrough
    const maxD = this.settings.allowSprinting ? 7 : 4

    for (let d = 2; d <= maxD; d++) {
      const cost = cost0 + d * 0.5
      const dx = dir.x * d
      const dz = dir.z * d

      const flag0 = !closed.has(closedKey(new Vec3(node.x + dx, node.y - 1, node.z + dz)))
      const flag1 = !closed.has(closedKey(new Vec3(node.x + dx, node.y, node.z + dz)))
      const flag2 = !closed.has(closedKey(new Vec3(node.x + dx, node.y + 1, node.z + dz)))

      if (!flag0 && !flag1 && !flag2) return

      const blockA = this.getBlockInfo(node, dx, 2, dz)
      const blockB = this.getBlockInfo(node, dx, 1, dz)
      const blockC = this.getBlockInfo(node, dx, 0, dz)
      const blockD = this.getBlockInfo(node, dx, -1, dz)
      const blockE = this.getBlockInfo(node, dx, -2, dz)

      const ladderAtC = getLadderSupport(this, blockC.position, dir)
      const ladderAtB = getLadderSupport(this, blockB.position, dir)
      const ladderAtA = getLadderSupport(this, blockA.position, dir)
      const ceilingClear = baseCeilingClear && blockA.walkthrough
      const floorCleared = !blockE.physical

      if (flag0 && this.canForwardLandingDrop(ladderAtC, ceilingClear, d, blockB, blockC, blockD, floorCleared)) {
        if (ladderAtC != null) {
          pushMoveLandingOnLadder(neighbors, node, cost, ladderAtC, this)
        }
      } else if (d <= 6 && flag1 && this.canForwardLandingFlat(ladderAtB, ceilingClear, blockC, blockD)) {
        if (ladderAtB != null) {
          pushMoveLandingOnLadder(neighbors, node, cost + 3, ladderAtB, this)
        }
        break
      } else if (d <= 4 && flag2 && this.canForwardLandingTwoUp(ladderAtA, ceilingClear, blockA, blockB)) {
        pushMoveLandingOnLadder(neighbors, node, cost, ladderAtA!, this)
        break
      } else if (d <= 6 && flag2 && this.canForwardLandingOneUp(ladderAtB, ceilingClear, blockC, blockD)) {
        if (blockC.height - block0.height > 1.2 && ladderAtB == null) break
        if (ladderAtB != null) {
          pushMoveLandingOnLadder(neighbors, node, cost, ladderAtB, this)
        }
        break
      } else if (!blockB.walkthrough || !blockC.walkthrough) {
        continue
      }
    }
  }
}

/**
 * Ladder-landing parkour diagonal movement.
 *
 * This variant targets the ladder block itself instead of the air block above
 * and behind it.
 */
export class LadderLandingDiagonal extends MovementProvider {
  movementDirs = Movement.diagonalDirs

  static allowOffsetDiagonals = true

  provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    for (const dir of Movement.diagonalDirs) {
      this.getMoveLadderLandingDiagonal(start, dir, storage, closed)
    }
  }

  private canDiagonalLandingDrop(
    ladderAtC: Vec3 | null,
    ceilingClear: boolean,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo,
    blockFrontD: BlockInfo,
    blockEPhysical: boolean
  ): boolean {
    return blockEPhysical && blockB.walkthrough && blockC.walkthrough && blockD.walkthrough && blockFrontD.walkthrough && (ceilingClear || ladderAtC != null)
  }

  private canDiagonalLandingFlat(
    ladderAtB: Vec3 | null,
    ceilingClear: boolean,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo,
    blockFrontC: BlockInfo
  ): boolean {
    return blockB.walkthrough && blockC.walkthrough && blockD.physical && blockFrontC.walkthrough && (ceilingClear || ladderAtB != null)
  }

  private canDiagonalLandingTwoUp(
    ladderAtA: Vec3 | null,
    ceilingClear: boolean,
    blockA: BlockInfo,
    blockB: BlockInfo
  ): boolean {
    return blockA.walkthrough && blockB.physical && ladderAtA != null && ceilingClear
  }

  private canDiagonalLandingOneUp(
    ladderAtB: Vec3 | null,
    ceilingClear: boolean,
    blockB: BlockInfo,
    blockC: BlockInfo,
    blockD: BlockInfo,
    blockFrontB: BlockInfo
  ): boolean {
    return blockB.walkthrough && blockC.physical && blockD.walkthrough && blockFrontB.walkthrough && (ceilingClear || ladderAtB != null)
  }

  private getMoveLadderLandingDiagonal(node: Move, dir: Vec3, neighbors: Move[], closed: Set<string>): void {
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

    const cost0 = DIAGONAL_COST + this.settings.jumpCost
    const maxD = this.settings.allowSprinting ? 6 : 4

    for (let d = 2; d <= maxD; d++) {
      if (this.tryDiagonalLanding(node, dir, d, d, cost0, block0, neighbors, closed)) break
    }

    if (LadderLandingDiagonal.allowOffsetDiagonals) {
      for (let major = 2; major <= maxD; major++) {
        for (let minor = 1; minor < major; minor++) {
          if (minor === major) continue

          if (this.tryDiagonalLanding(node, dir, minor, major, cost0, block0, neighbors, closed)) return
          if (this.tryDiagonalLanding(node, dir, major, minor, cost0, block0, neighbors, closed)) return
        }
      }
    }
  }

  private tryDiagonalLanding(
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

    if (!this.getBlockInfo(node, dx, 0, 0).walkthrough) return false
    if (!this.getBlockInfo(node, 0, 0, dz).walkthrough) return false
    if (!this.getBlockInfo(node, dx, 1, 0).walkthrough) return false
    if (!this.getBlockInfo(node, 0, 1, dz).walkthrough) return false

    const blockE = this.getBlockInfo(node, dx, -2, dz)
    const ladderAtC = getLadderSupport(this, blockC.position, dir)
    const ladderAtB = getLadderSupport(this, blockB.position, dir)
    const ladderAtA = getLadderSupport(this, blockA.position, dir)

    const ceilingClear =
      this.getBlockInfo(node, 0, 2, 0).walkthrough &&
      this.getBlockInfo(node, dx, 2, dz).walkthrough &&
      this.getBlockInfo(node, dx, 2, 0).walkthrough &&
      this.getBlockInfo(node, 0, 2, dz).walkthrough

    if (flag0 && this.canDiagonalLandingDrop(ladderAtC, ceilingClear, blockB, blockC, blockD, blockFrontD, blockE.physical)) {
      if (ladderAtC != null) {
        pushMoveLandingOnLadder(neighbors, node, cost, ladderAtC, this)
        return true
      }
    } else if (flag1 && this.canDiagonalLandingFlat(ladderAtB, ceilingClear, blockB, blockC, blockD, blockFrontC)) {
      if (ladderAtB != null) {
        pushMoveLandingOnLadder(neighbors, node, cost + 3, ladderAtB, this)
        return true
      }
    } else if (flag2 && this.canDiagonalLandingTwoUp(ladderAtA, ceilingClear, blockA, blockB)) {
      pushMoveLandingOnLadder(neighbors, node, cost, ladderAtA!, this)
      return true
    } else if (flag2 && this.canDiagonalLandingOneUp(ladderAtB, ceilingClear, blockB, blockC, blockD, blockFrontB)) {
      if (blockC.height - block0.height > 1.2 && ladderAtB == null) return false
      if (travel > 3.0 && ladderAtB == null) return false
      if (ladderAtB != null) {
        pushMoveLandingOnLadder(neighbors, node, cost, ladderAtB, this)
        return true
      }
    }

    return false
  }
}
