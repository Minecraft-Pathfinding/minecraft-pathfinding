import type { Vec3 } from 'vec3'
import type { BlockInfo } from '../world/cacheWorld'
import { COST_INF } from './costs'

/**
 * An "exclusion area" is a very small function.
 *
 * You hand it ONE block, and it hands you back ONE number: the EXTRA cost of
 * letting the bot use that block.
 *
 * Think of it like a price tag the bot reads before touching a block:
 *
 *   - return `0`          -> "I don't care about this block. Do whatever."
 *   - return `50`         -> "You may use this block, but it costs 50 extra.
 *                            Go around it if there is a cheaper way."
 *   - return `Infinity`   -> "Never, ever use this block." Any number that is
 *     (or `COST_INF`)       `>= COST_INF` counts as "never".
 *
 * The pathfinder keeps THREE separate lists of these functions in its settings
 * (see {@link MovementOptions}):
 *
 *   - `exclusionAreasStep`  -> asked about every block the bot would STAND in.
 *   - `exclusionAreasBreak` -> asked about every block the bot would BREAK (mine).
 *   - `exclusionAreasPlace` -> asked about every block the bot would PLACE (build).
 *
 * This is the exact same idea as upstream `PrismarineJS/mineflayer-pathfinder`,
 * so exclusion functions written for that library keep working here. The only
 * difference is that here the function is handed a {@link BlockInfo} (which has
 * a `.position`), instead of a raw prismarine block.
 */
export type ExclusionArea = (block: BlockInfo) => number

/**
 * The number the helpers below use to mean "never use this block".
 *
 * It is just the pathfinder's idea of "infinitely expensive" (`COST_INF`).
 * Re-exported here so you do not have to dig around for it.
 */
export const EXCLUSION_NEVER = COST_INF

/**
 * Make a BOX shaped "keep out" zone between two corners.
 *
 * Picture two opposite corners of a Minecraft selection (like a WorldEdit
 * `//pos1` and `//pos2`). Every block inside that box — corners included — gets
 * the given `cost`.
 *
 * You can pass the two corners in ANY order; this function figures out which
 * corner is the small one and which is the big one for you.
 *
 * @example
 * // The bot must never enter the box from (10, 64, -5) to (20, 70, 5):
 * const noGo = createBoxExclusion(new Vec3(10, 64, -5), new Vec3(20, 70, 5))
 * bot.pathfinder.setMoveOptions({ exclusionAreasStep: [noGo] })
 *
 * @example
 * // The bot CAN cross the box, but it is 80 cost more expensive, so it will
 * // only cut through when there is no cheaper way around:
 * const slowZone = createBoxExclusion(corner1, corner2, 80)
 *
 * @param corner1 one corner of the box (block coordinates, inclusive).
 * @param corner2 the opposite corner of the box (block coordinates, inclusive).
 * @param cost extra cost for blocks inside the box. Defaults to "never"
 *   ({@link EXCLUSION_NEVER}). Pass a smaller positive number for a "soft" zone.
 */
export function createBoxExclusion (corner1: Vec3, corner2: Vec3, cost: number = EXCLUSION_NEVER): ExclusionArea {
  // Work out the smaller and bigger value on each axis once, up front, so the
  // returned function only has to do cheap comparisons.
  const minX = Math.min(corner1.x, corner2.x)
  const minY = Math.min(corner1.y, corner2.y)
  const minZ = Math.min(corner1.z, corner2.z)
  const maxX = Math.max(corner1.x, corner2.x)
  const maxY = Math.max(corner1.y, corner2.y)
  const maxZ = Math.max(corner1.z, corner2.z)

  return (block: BlockInfo): number => {
    const p = block.position
    const inside =
      p.x >= minX && p.x <= maxX &&
      p.y >= minY && p.y <= maxY &&
      p.z >= minZ && p.z <= maxZ
    return inside ? cost : 0
  }
}

/**
 * Make a BALL (sphere) shaped "keep out" zone around a center point.
 *
 * Every block whose center is within `radius` blocks of `center` gets the given
 * `cost`. This is handy for "stay at least N blocks away from this spot".
 *
 * @example
 * // Keep the bot more than 8 blocks away from a turret at (0, 64, 0):
 * const danger = createRadiusExclusion(new Vec3(0, 64, 0), 8)
 * bot.pathfinder.setMoveOptions({ exclusionAreasStep: [danger] })
 *
 * @param center the middle of the ball (block coordinates).
 * @param radius how far the ball reaches, in blocks.
 * @param cost extra cost for blocks inside the ball. Defaults to "never".
 */
export function createRadiusExclusion (center: Vec3, radius: number, cost: number = EXCLUSION_NEVER): ExclusionArea {
  // Compare squared distances so we never need a (slow) square root.
  const radiusSquared = radius * radius

  return (block: BlockInfo): number => {
    const p = block.position
    const dx = p.x - center.x
    const dy = p.y - center.y
    const dz = p.z - center.z
    const distanceSquared = dx * dx + dy * dy + dz * dz
    return distanceSquared <= radiusSquared ? cost : 0
  }
}

/**
 * Make a PILLAR (vertical column) shaped "keep out" zone around a point.
 *
 * Like {@link createRadiusExclusion}, but height does NOT matter: it only looks
 * at the X/Z distance. Use this when you want to block a spot at every height,
 * for example "never go near this base, no matter how high or low".
 *
 * @example
 * const keepAway = createColumnRadiusExclusion(new Vec3(100, 0, 100), 12)
 * bot.pathfinder.setMoveOptions({ exclusionAreasStep: [keepAway] })
 *
 * @param center the middle of the column (only X and Z are used).
 * @param radius how far the column reaches outward, in blocks.
 * @param cost extra cost for blocks inside the column. Defaults to "never".
 */
export function createColumnRadiusExclusion (center: Vec3, radius: number, cost: number = EXCLUSION_NEVER): ExclusionArea {
  const radiusSquared = radius * radius

  return (block: BlockInfo): number => {
    const p = block.position
    const dx = p.x - center.x
    const dz = p.z - center.z
    const distanceSquared = dx * dx + dz * dz
    return distanceSquared <= radiusSquared ? cost : 0
  }
}
