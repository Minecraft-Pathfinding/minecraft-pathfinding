"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MovementDiagonal = exports.MovementDescend = exports.MovementAscend = exports.IdleMovement = void 0;
const vec3_1 = require("vec3");
const movementProvider_1 = require("../movementProvider");
const movementHelper_1 = require("./movementHelper");
const costs_1 = require("../costs");
const cacheWorld_1 = require("../../world/cacheWorld");
class IdleMovement extends movementProvider_1.MovementProvider {
    constructor() {
        super(...arguments);
        this.movementDirs = [];
    }
    provideMovements(start, storage) { }
    performInit(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    performPerTick(thisMove, tickCount, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            return true;
        });
    }
}
exports.IdleMovement = IdleMovement;
class MovementAscend extends movementProvider_1.MovementProvider {
    constructor() {
        super(...arguments);
        this.movementDirs = [new vec3_1.Vec3(0, 1, 0)];
    }
    provideMovements(start, storage, goal, closed) {
        for (const dir of this.movementDirs) {
            const off = start.cachedVec.plus(dir);
            if (closed.has(off.toString()))
                return;
            this.provideAscend(start, dir, storage, closed);
        }
    }
    provideAscend(node, dir, storage, closed) {
        const blPlace = this.getBlockInfo(node, dir.x, 0, dir.y);
        if (blPlace.isInvalid)
            return;
        const toPlace = [];
        const toBreak = [];
        let cost = 0;
        if (!blPlace.physical) {
            if (!blPlace.replaceable) {
                if ((cost += this.safeOrBreak(blPlace, toBreak)) >= costs_1.COST_INF)
                    return;
            }
            if ((cost += this.safeOrPlace(blPlace, toPlace)) >= costs_1.COST_INF)
                return;
            if ((0, movementHelper_1.findPlaceOpts)(this, node, blPlace.position) == null)
                return;
        }
        const srcUp1 = this.getBlockInfo(node, 0, 1, 0);
        const srcUp2 = this.getBlockInfo(node, 0, 2, 0);
        const srcUp3 = this.getBlockInfo(node, 0, 3, 0);
        if (srcUp3.canFall && ((0, movementHelper_1.canWalkThrough)(srcUp1) || !srcUp2.canFall)) {
            return;
        }
        const srcDown1 = this.getBlockInfo(node, 0, -1, 0);
        if (srcDown1.climbable)
            return;
        const jumpFromBottomSlab = (0, movementHelper_1.isBottomSlab)(srcDown1);
        const jumpToBottomSlab = (0, movementHelper_1.isBottomSlab)(blPlace);
        if (jumpFromBottomSlab && !jumpToBottomSlab) {
            return;
        }
        let walk = 0;
        if (jumpToBottomSlab) {
            if (jumpFromBottomSlab) {
                walk = Math.max(costs_1.JUMP_ONE_BLOCK_COST, costs_1.WALK_ONE_BLOCK_COST);
                walk += this.settings.jumpCost;
            }
            else {
                walk = costs_1.WALK_ONE_BLOCK_COST;
            }
        }
        else {
            if (blPlace.block.type === cacheWorld_1.BlockInfo.soulsandId) {
                walk = costs_1.WALK_ONE_OVER_SOUL_SAND_COST;
            }
            else {
                walk = Math.max(costs_1.JUMP_ONE_BLOCK_COST, costs_1.WALK_ONE_BLOCK_COST);
            }
            walk += this.settings.jumpCost;
        }
        if ((cost += walk) >= costs_1.COST_INF)
            return;
        if ((cost += (0, movementHelper_1.getMiningDurationTicks)(this, srcUp2)) >= costs_1.COST_INF)
            return;
        const target1 = this.getBlockInfo(node, dir.x, 1, dir.z);
        if ((cost += (0, movementHelper_1.getMiningDurationTicks)(this, target1)) >= costs_1.COST_INF)
            return;
        const target2 = this.getBlockInfo(node, dir.x, 2, dir.z);
        if ((cost += (0, movementHelper_1.getMiningDurationTicks)(this, target2)) >= costs_1.COST_INF)
            return;
        cost += 1;
    }
}
exports.MovementAscend = MovementAscend;
class MovementDescend extends movementProvider_1.MovementProvider {
    constructor() {
        super(...arguments);
        this.movementDirs = [new vec3_1.Vec3(0, -1, 0)];
    }
    provideMovements(start, storage, goal, closed) {
        for (const dir of this.movementDirs) {
            this.provideDescend(start, dir, storage, closed);
        }
    }
    provideDescend(node, dir, storage, closed) {
        const srcN1 = this.getBlockInfo(node, dir.x, -1, dir.z);
        if (srcN1.climbable)
            return;
        const srcN2 = this.getBlockInfo(node, dir.x, -2, dir.z);
        if (!(0, movementHelper_1.canWalkOn)(srcN2)) {
            return;
        }
        if ((0, movementHelper_1.canUseFrostWalker)(this, srcN2)) {
            return;
        }
        let cost = 0;
        const destN1 = this.getBlockInfo(node, dir.x, -1, dir.z);
        if ((cost += (0, movementHelper_1.getMiningDurationTicks)(this, destN1)) >= costs_1.COST_INF)
            return;
        const dest = this.getBlockInfo(node, dir.x, 0, dir.z);
        if ((cost += (0, movementHelper_1.getMiningDurationTicks)(this, dest)) >= costs_1.COST_INF)
            return;
        const dest1 = this.getBlockInfo(node, dir.x, 1, dir.z);
        if ((cost += (0, movementHelper_1.getMiningDurationTicks)(this, dest1, true)) >= costs_1.COST_INF)
            return;
        let walk = costs_1.WALK_OFF_BLOCK_COST;
        if (srcN1.block.type === cacheWorld_1.BlockInfo.soulsandId) {
            walk = costs_1.WALK_ONE_OVER_SOUL_SAND_COST / costs_1.WALK_ONE_BLOCK_COST;
        }
        cost += walk;
        cost += Math.max(costs_1.FALL_N_BLOCKS_COST[1], costs_1.CENTER_AFTER_FALL_COST);
    }
    dynamicFallCosts(info, cost) {
    }
}
exports.MovementDescend = MovementDescend;
class MovementDiagonal extends movementProvider_1.MovementProvider {
    constructor() {
        super(...arguments);
        this.movementDirs = movementProvider_1.MovementProvider.diagonalDirs;
    }
    provideMovements(start, storage, goal, closed) {
    }
}
exports.MovementDiagonal = MovementDiagonal;
//# sourceMappingURL=baritoneProviders.js.map