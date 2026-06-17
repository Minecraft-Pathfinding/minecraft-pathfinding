import type { BlockInfo } from '../world/cacheWorld'

/**
 * An exclusion area: a function that returns the extra cost of letting the bot
 * use a given block.
 *
 *   - `0`               -> no opinion on this block.
 *   - a positive number -> a soft penalty; the bot avoids the block when it can.
 *   - `>= COST_INF`     -> a hard "keep out"; the bot will never use the block.
 *
 * These are stored in the three movement settings `exclusionAreasStep`,
 * `exclusionAreasBreak` and `exclusionAreasPlace`. The pathfinder intentionally
 * ships no ready-made shapes — write your own, or copy the box/radius helpers
 * from `examples/exclusionZones.js`. This mirrors upstream mineflayer-pathfinder.
 */
export type ExclusionArea = (block: BlockInfo) => number
