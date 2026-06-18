// ===========================================================================
// Movement cost constants — every value below is measured in GAME TICKS.
//
// Minecraft runs at 20 ticks per second, so "ticks" is just "how long the bot
// is busy doing this thing". Lower = faster. Putting every cost in the same
// unit (ticks) is the whole point of this file: the pathfinder can now compare
// "walk around" vs "dig through" vs "jump up" honestly, because they are all
// expressed as time, not as made-up numbers.
//
// The numbers are Baritone's hardcoded estimates. Each one is `20 / speed`,
// where `speed` is how many blocks per second the bot covers doing that action
// (e.g. the player walks at 4.317 blocks/s, so walking one block ~ 20 / 4.317
// ~ 4.633 ticks). They are "correct enough" — close to in-game reality without
// running a physics simulation for every candidate move.
// ===========================================================================

/** Ticks to WALK one block (player walks 4.317 blocks/s). */
export const WALK_ONE_BLOCK_COST = 4.633 as const
/** Ticks to swim/walk one block while IN water (much slower than on land). */
export const WALK_ONE_IN_WATER_COST = 9.091 as const
/** Ticks to walk one block on top of soul sand (it drags you). */
export const WALK_ONE_OVER_SOUL_SAND_COST = 9.266 as const
/** Ticks to climb UP one block on a ladder/vine. */
export const LADDER_UP_ONE_COST = 8.511 as const
/** Ticks to climb DOWN one block on a ladder/vine. */
export const LADDER_DOWN_ONE_COST = 6.667 as const
/** Ticks to sneak one block (slowest way to move). */
export const SNEAK_ONE_BLOCK_COST = 15.385 as const
/** Ticks to SPRINT one block (player sprints 5.612 blocks/s — the fastest ground travel). */
export const SPRINT_ONE_BLOCK_COST = 3.564 as const
/** Sprinting is this fraction of the time of walking (sprint / walk). */
export const SPRINT_MULTIPLIER = 0.769 as const
/** Ticks to walk OFF the edge of a block (start of a drop; slightly cheaper than a full walk). */
export const WALK_OFF_BLOCK_COST = 3.706 as const
/** Ticks to re-center on the block you just dropped onto. */
export const CENTER_AFTER_FALL_COST = 0.927 as const
/** "Infinitely expensive" — any move costing this much or more is treated as impossible. */
export const COST_INF = 1000000

/**
 * Per-block weight used by the goal HEURISTIC (A*'s estimate of remaining cost),
 * also measured in ticks. It is deliberately the WALK cost, not the cheaper
 * SPRINT cost.
 *
 * Why walk and not sprint? A* stays optimal only when the heuristic never
 * over-estimates the *cheapest* real cost (sprinting). By estimating with the
 * slightly-higher walk cost we run a lightly "weighted" A*: it leans toward the
 * goal and explores far fewer dead-ends (fast), while the paths it returns are
 * at most ~1.3x the true optimum (walk / sprint = 4.633 / 3.564). Before this
 * file's costs were in ticks, the same heuristic was ~4.6x the per-move cost,
 * so that bound used to be ~4.6x — this is a large quality win at no speed cost.
 */
export const COST_HEURISTIC = 20 / 4.317

/**
 * Lookup table: `FALL_N_BLOCKS_COST[n]` = ticks to fall `n` blocks straight down.
 * Falling speeds up over time, so this is not linear (falling 2 blocks costs less
 * than twice falling 1). Index it with a whole number of blocks.
 */
export const FALL_N_BLOCKS_COST = generateFallNBlocksCost()
export const FALL_1_25_BLOCKS_COST = distanceToTicks(1.25)
export const FALL_0_25_BLOCKS_COST = distanceToTicks(0.25)
/**
 * Ticks for the upward arc of a normal jump. A jump lifts the bot ~1.25 blocks
 * and it lands back ~0.25 blocks lower than the peak, so the "useful" climb costs
 * the difference between those two fall times.
 */
export const JUMP_ONE_BLOCK_COST = FALL_1_25_BLOCKS_COST - FALL_0_25_BLOCKS_COST

export function distanceToTicks (distance: number): number {
  if (distance === 0) {
    return 0
  }
  let tmpDistance = distance
  let tickCount = 0
  while (true) {
    const fallDistance = velocity(tickCount)
    if (tmpDistance <= fallDistance) {
      return tickCount + tmpDistance / fallDistance
    }
    tmpDistance -= fallDistance
    tickCount++
  }
}

export function velocity (ticks: number): number {
  return (Math.pow(0.98, ticks) - 1) * -3.92
}

export function oldFormula (ticks: number): number {
  return -3.92 * (99 - 49.5 * (Math.pow(0.98, ticks) + 1) - ticks)
}

export function generateFallNBlocksCost (): number[] {
  const costs: number[] = []
  for (let i = 0; i < 4097; i++) {
    costs[i] = distanceToTicks(i)
  }
  return costs
}
