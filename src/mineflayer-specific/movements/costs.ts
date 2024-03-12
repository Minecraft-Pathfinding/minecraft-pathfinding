// blatantly stolen from Baritone.

// export const WALK_ONE_BLOCK_COST = 20 / 4.317;
// export const WALK_ONE_IN_WATER_COST = 20 / 2.2;
// export const WALK_ONE_OVER_SOUL_SAND_COST = WALK_ONE_BLOCK_COST * 2;
// export const LADDER_UP_ONE_COST = 20 / 2.35;
// export const LADDER_DOWN_ONE_COST = 20 / 3.0;
// export const SNEAK_ONE_BLOCK_COST = 20 / 1.3;
// export const SPRINT_ONE_BLOCK_COST = 20 / 5.612;
// export const SPRINT_MULTIPLIER = SPRINT_ONE_BLOCK_COST / WALK_ONE_BLOCK_COST;
// export const WALK_OFF_BLOCK_COST = WALK_ONE_BLOCK_COST * 0.8;
// export const CENTER_AFTER_FALL_COST = WALK_ONE_BLOCK_COST - WALK_OFF_BLOCK_COST;
// export const COST_INF = 1000000;

export const WALK_ONE_BLOCK_COST = 4.633 as const;
export const WALK_ONE_IN_WATER_COST = 9.091 as const;
export const WALK_ONE_OVER_SOUL_SAND_COST = 9.266 as const;
export const LADDER_UP_ONE_COST = 8.511 as const;
export const LADDER_DOWN_ONE_COST = 6.667 as const;
export const SNEAK_ONE_BLOCK_COST = 15.385 as const;
export const SPRINT_ONE_BLOCK_COST = 3.564 as const;
export const SPRINT_MULTIPLIER = 0.769 as const;
export const WALK_OFF_BLOCK_COST = 3.706 as const;
export const CENTER_AFTER_FALL_COST = 0.927 as const;
export const COST_INF = 1000000;


export const FALL_N_BLOCKS_COST = generateFallNBlocksCost();
export const FALL_1_25_BLOCKS_COST = distanceToTicks(1.25);
export const FALL_0_25_BLOCKS_COST = distanceToTicks(0.25);
export const JUMP_ONE_BLOCK_COST = FALL_1_25_BLOCKS_COST - FALL_0_25_BLOCKS_COST;

export function distanceToTicks(distance: number): number {
  if (distance === 0) {
    return 0;
  }
  let tmpDistance = distance;
  let tickCount = 0;
  while (true) {
    const fallDistance = velocity(tickCount);
    if (tmpDistance <= fallDistance) {
      return tickCount + tmpDistance / fallDistance;
    }
    tmpDistance -= fallDistance;
    tickCount++;
  }
}

export function velocity(ticks: number): number {
  return (Math.pow(0.98, ticks) - 1) * -3.92;
}

export function oldFormula(ticks: number): number {
  return -3.92 * (99 - 49.5 * (Math.pow(0.98, ticks) + 1) - ticks);
}

export function generateFallNBlocksCost(): number[] {
  const costs: number[] = [];
  for (let i = 0; i < 4097; i++) {
    costs[i] = distanceToTicks(i);
  }
  return costs;
}