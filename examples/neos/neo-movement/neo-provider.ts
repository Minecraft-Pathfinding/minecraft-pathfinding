import { Vec3 } from 'vec3'
import { goals, Move, MovementProvider } from '../../../src'
import { Movement } from '../../../src/mineflayer-specific/movements'
import { getNeoAlignmentSide, type NeoAlignmentSide } from './neo-align-utils'

const SIDE_DIRS_X = [new Vec3(0, 0, 1), new Vec3(0, 0, -1)]
const SIDE_DIRS_Z = [new Vec3(1, 0, 0), new Vec3(-1, 0, 0)]

function getNeoSideFromDir (dir: Vec3, sideDir: Vec3): NeoAlignmentSide {
  const cross = dir.x * sideDir.z - dir.z * sideDir.x
  return cross >= 0 ? -1 : 1
}

/**
 * Neo movement provider.
 *
 * A neo move here means:
 * - start on a solid floor
 * - clear head room at the takeoff point
 * - a 2-block-tall solid wall in front of the player for 1 or 2 blocks
 * - clear head room at the landing point
 * - a solid landing floor 2 or 3 blocks away
 *
 * Examples:
 * - start at (0,0), land at (2,0) if (1,1) and (1,2) are solid
 * - start at (0,0), land at (3,0) if (1,1), (1,2), (2,1), and (2,2) are solid
 */
export class NeoProvider extends MovementProvider {
  movementDirs = Movement.cardinalDirs

  provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    for (const dir of this.movementDirs) {
      this.getMoveNeo(start, dir, storage, closed)
    }
  }

  private getMoveNeo (node: Move, dir: Vec3, neighbors: Move[], closed: Set<string>): void {
    let chosenSide = getNeoAlignmentSide(node)

    const takeoffFloor = this.getBlockInfo(node, 0, -1, 0)
    if (!takeoffFloor.solidFull || takeoffFloor.liquid) return


    const takeoffHead = this.getBlockInfo(node, 0, 1, 0)
    const takeoffUpper = this.getBlockInfo(node, 0, 2, 0)
    if (!takeoffHead.walkthrough || !takeoffUpper.walkthrough) return

    const maxDistance = this.settings.allowSprinting ? 3 : 2

    for (let distance = 2; distance <= maxDistance; distance++) {
      const dx = dir.x * distance
      const dz = dir.z * distance

      const landingFloor = this.getBlockInfo(node, dx, -1, dz)
      if (landingFloor.isInvalid) continue
      if (closed.has(`${landingFloor.position.x},${landingFloor.position.y},${landingFloor.position.z}`)) continue
      if (!landingFloor.solidFull || landingFloor.liquid) continue

      const landingFeet = this.getBlockInfo(node, dx, 0, dz)
      const landingHead = this.getBlockInfo(node, dx, 1, dz)
      const landingUpper = this.getBlockInfo(node, dx, 2, dz)
      if (!landingFeet.walkthrough || !landingHead.walkthrough) continue

      let valid = true
      for (let step = 1; step < distance; step++) {
        const wallFeet = this.getBlockInfo(node, dir.x * step, 0, dir.z * step)
        const wallHead = this.getBlockInfo(node, dir.x * step, 1, dir.z * step)

        if (!wallFeet.solidFull || !wallHead.solidFull) {
          valid = false
          break
        }

        const sideDirs = dir.x !== 0 ? SIDE_DIRS_X : SIDE_DIRS_Z
        const openSides: NeoAlignmentSide[] = []
        for (const sideDir of sideDirs) {
          const sideFeet = this.getBlockInfo(node, dir.x * step + sideDir.x, 0, dir.z * step + sideDir.z)
          const sideHead = this.getBlockInfo(node, dir.x * step + sideDir.x, 1, dir.z * step + sideDir.z)
          if (sideFeet.walkthrough && sideHead.walkthrough) {
            openSides.push(getNeoSideFromDir(dir, sideDir))
          }
        }

        if (openSides.length === 0) {
          valid = false
          break
        }

        if (chosenSide != null) {
          if (!openSides.includes(chosenSide)) {
            valid = false
            break
          }
        } else {
          chosenSide = openSides[0]
        }

        if (chosenSide == null) {
          valid = false
          break
        }
      }

      if (!valid) continue

      const cost = 1 + this.settings.jumpCost + (distance * 0.5)
      const move = Move.fromPrevious(cost, landingFloor.position.offset(0.5, 1, 0.5), node, this)
      if (chosenSide != null) move.metadata.neoSide = chosenSide
      neighbors.push(move)
    }
  }
}
