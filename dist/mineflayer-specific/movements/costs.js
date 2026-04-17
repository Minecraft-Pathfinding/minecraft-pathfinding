"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JUMP_ONE_BLOCK_COST = exports.FALL_0_25_BLOCKS_COST = exports.FALL_1_25_BLOCKS_COST = exports.FALL_N_BLOCKS_COST = exports.COST_INF = exports.CENTER_AFTER_FALL_COST = exports.WALK_OFF_BLOCK_COST = exports.SPRINT_MULTIPLIER = exports.SPRINT_ONE_BLOCK_COST = exports.SNEAK_ONE_BLOCK_COST = exports.LADDER_DOWN_ONE_COST = exports.LADDER_UP_ONE_COST = exports.WALK_ONE_OVER_SOUL_SAND_COST = exports.WALK_ONE_IN_WATER_COST = exports.WALK_ONE_BLOCK_COST = void 0;
exports.distanceToTicks = distanceToTicks;
exports.velocity = velocity;
exports.oldFormula = oldFormula;
exports.generateFallNBlocksCost = generateFallNBlocksCost;
exports.WALK_ONE_BLOCK_COST = 4.633;
exports.WALK_ONE_IN_WATER_COST = 9.091;
exports.WALK_ONE_OVER_SOUL_SAND_COST = 9.266;
exports.LADDER_UP_ONE_COST = 8.511;
exports.LADDER_DOWN_ONE_COST = 6.667;
exports.SNEAK_ONE_BLOCK_COST = 15.385;
exports.SPRINT_ONE_BLOCK_COST = 3.564;
exports.SPRINT_MULTIPLIER = 0.769;
exports.WALK_OFF_BLOCK_COST = 3.706;
exports.CENTER_AFTER_FALL_COST = 0.927;
exports.COST_INF = 1000000;
exports.FALL_N_BLOCKS_COST = generateFallNBlocksCost();
exports.FALL_1_25_BLOCKS_COST = distanceToTicks(1.25);
exports.FALL_0_25_BLOCKS_COST = distanceToTicks(0.25);
exports.JUMP_ONE_BLOCK_COST = exports.FALL_1_25_BLOCKS_COST - exports.FALL_0_25_BLOCKS_COST;
function distanceToTicks(distance) {
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
function velocity(ticks) {
    return (Math.pow(0.98, ticks) - 1) * -3.92;
}
function oldFormula(ticks) {
    return -3.92 * (99 - 49.5 * (Math.pow(0.98, ticks) + 1) - ticks);
}
function generateFallNBlocksCost() {
    const costs = [];
    for (let i = 0; i < 4097; i++) {
        costs[i] = distanceToTicks(i);
    }
    return costs;
}
//# sourceMappingURL=costs.js.map