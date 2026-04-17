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
exports.ParkourForward = exports.StraightUp = exports.StraightDown = exports.ForwardDropDown = exports.ForwardJump = exports.Diagonal = exports.Forward = exports.IdleMovement = void 0;
const vec3_1 = require("vec3");
const move_1 = require("../move");
const movement_1 = require("./movement");
const interactionUtils_1 = require("./interactionUtils");
const settings_1 = require("@nxg-org/mineflayer-physics-util/dist/physics/settings");
const movementProvider_1 = require("./movementProvider");
const costs_1 = require("./costs");
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
class Forward extends movementProvider_1.MovementProvider {
    constructor() {
        super(...arguments);
        this.movementDirs = movement_1.Movement.cardinalDirs;
    }
    provideMovements(start, storage, goal, closed) {
        for (const dir of this.movementDirs) {
            const off = start.cachedVec.plus(dir).floor();
            if (closed.has(`${off.x},${off.y},${off.z}`))
                continue;
            this.getMoveForward(start, dir, storage);
        }
    }
    getMoveForward(start, dir, neighbors) {
        const pos = start.cachedVec;
        let cost = 1;
        if (this.getBlockInfo(pos, 0, 0, 0).liquid)
            cost += this.settings.liquidCost;
        const blockC = this.getBlockInfo(pos, dir.x, 0, dir.z);
        if (blockC.isInvalid)
            return;
        if (!blockC.walkthrough)
            return;
        const blockB = this.getBlockInfo(pos, dir.x, 1, dir.z);
        const blockD = this.getBlockInfo(pos, dir.x, -1, dir.z);
        const toBreak = [];
        const toPlace = [];
        if (!blockD.physical && !blockC.liquid) {
            if (start.remainingBlocks <= 0)
                return;
            if (!blockD.replaceable) {
                if ((cost += this.safeOrBreak(blockD, toBreak)) > costs_1.COST_INF)
                    return;
            }
            if ((cost += this.safeOrPlace(blockD, toPlace, 'solid')) > costs_1.COST_INF)
                return;
        }
        if ((cost += this.safeOrBreak(blockB, toBreak)) > costs_1.COST_INF)
            return;
        if ((cost += this.safeOrBreak(blockC, toBreak)) > costs_1.COST_INF)
            return;
        neighbors.push(move_1.Move.fromPrevious(cost, blockC.position.offset(0.5, 0, 0.5), start, this, toPlace, toBreak));
    }
}
exports.Forward = Forward;
class Diagonal extends movementProvider_1.MovementProvider {
    constructor() {
        super(...arguments);
        this.movementDirs = movement_1.Movement.diagonalDirs;
    }
    provideMovements(start, storage, goal, closed) {
        for (const dir of this.movementDirs) {
            const off = start.cachedVec.plus(dir).floor();
            if (closed.has(`${off.x},${off.y},${off.z}`))
                continue;
            this.getMoveDiagonal(start, dir, storage, goal);
        }
    }
    getMoveDiagonal(node, dir, neighbors, goal) {
        let cost = Diagonal.diagonalCost;
        const block0 = this.getBlockInfo(node, dir.x, 0, dir.z);
        if (block0.isInvalid)
            return;
        if (!block0.walkthrough)
            return;
        if (this.getBlockInfo(node, 0, 0, 0).liquid)
            cost += this.settings.liquidCost;
        const toBreak = [];
        const toPlace = [];
        const block00 = this.getBlockInfo(node, 0, 0, 0);
        if (block00.height - block0.height > 0.6)
            return;
        const block1 = this.getBlockInfo(node, dir.x, 1, dir.z);
        const blockN1 = this.getBlockInfo(node, dir.x, -1, dir.z);
        if (!blockN1.physical && !block0.liquid) {
            const blockCheck0 = this.getBlockInfo(node, 0, -1, dir.z);
            const blockCheck1 = this.getBlockInfo(node, dir.x, -1, 0);
            if (!blockCheck0.physical && !blockCheck1.physical) {
                if (node.remainingBlocks <= 0)
                    return;
                const wanted = blockCheck0;
                if (!wanted.replaceable) {
                    if ((cost += this.safeOrBreak(wanted, toBreak)) > costs_1.COST_INF)
                        return;
                }
                if ((cost += this.safeOrPlace(wanted, toPlace, 'solid')) > costs_1.COST_INF)
                    return;
            }
            if ((cost += this.safeOrPlace(blockN1, toPlace, 'solid')) > costs_1.COST_INF)
                return;
        }
        if (toPlace.length > 1 && !this.settings.allowDiagonalBridging)
            return;
        cost += this.safeOrBreak(block0, toBreak);
        cost += this.safeOrBreak(block1, toBreak);
        cost += this.safeOrBreak(this.getBlockInfo(node, dir.x, 0, 0), toBreak);
        cost += this.safeOrBreak(this.getBlockInfo(node, 0, 0, dir.z), toBreak);
        cost += this.safeOrBreak(this.getBlockInfo(node, dir.x, 1, 0), toBreak);
        cost += this.safeOrBreak(this.getBlockInfo(node, 0, 1, dir.z), toBreak);
        if (cost > costs_1.COST_INF)
            return;
        neighbors.push(move_1.Move.fromPrevious(cost, block0.position.offset(0.5, 0, 0.5), node, this, toPlace, toBreak));
    }
}
exports.Diagonal = Diagonal;
Diagonal.diagonalCost = Math.SQRT2;
class ForwardJump extends movementProvider_1.MovementProvider {
    constructor() {
        super(...arguments);
        this.movementDirs = movement_1.Movement.cardinalDirs;
    }
    provideMovements(start, storage, goal, closed) {
        for (const dir of this.movementDirs) {
            const off = start.cachedVec.plus(dir).floor();
            if (closed.has(`${off.x},${off.y + 1},${off.z}`))
                continue;
            this.getMoveJumpUp(start, dir, storage);
        }
    }
    getMoveJumpUp(node, dir, neighbors) {
        const pos = node.cachedVec;
        const blockB = this.getBlockInfo(pos, dir.x, 1, dir.z);
        if (blockB.isInvalid)
            return;
        const blockA = this.getBlockInfo(pos, 0, 2, 0);
        const blockH = this.getBlockInfo(pos, dir.x, 2, dir.z);
        const blockC = this.getBlockInfo(pos, dir.x, 0, dir.z);
        let cost = 1 + this.settings.jumpCost;
        const block0 = this.getBlockInfo(pos, 0, 0, 0);
        if (block0.liquid)
            cost += this.settings.liquidCost;
        const toBreak = [];
        const toPlace = [];
        let cHeight = blockC.height;
        if (!blockC.solidFull && !blockB.liquid) {
            if (node.remainingBlocks <= 0)
                return;
            const blockD = this.getBlockInfo(pos, dir.x, -1, dir.z);
            if (!blockD.solidFull) {
                if (node.remainingBlocks <= 1)
                    return;
                if (!blockD.replaceable) {
                    if ((cost += this.breakCost(blockD)) > costs_1.COST_INF)
                        return;
                    toBreak.push(interactionUtils_1.BreakHandler.fromVec(blockD.position, 'solid'));
                }
                if ((cost += this.safeOrPlace(blockD, toPlace, 'solid')) > costs_1.COST_INF)
                    return;
            }
            if (!blockC.replaceable) {
                if ((cost += this.breakCost(blockC)) > costs_1.COST_INF)
                    return;
                toBreak.push(interactionUtils_1.BreakHandler.fromVec(blockC.position, 'solid'));
            }
            if ((cost += this.safeOrPlace(blockC, toPlace, 'solid')) > costs_1.COST_INF)
                return;
            cHeight += 1;
        }
        const block1 = this.getBlockInfo(pos, 0, -1, 0);
        if (cHeight - block1.height > 1.2)
            return;
        if ((cost += this.safeOrBreak(blockA, toBreak)) > costs_1.COST_INF)
            return;
        if ((cost += this.safeOrBreak(blockB, toBreak)) > costs_1.COST_INF)
            return;
        if ((cost += this.safeOrBreak(blockH, toBreak)) > costs_1.COST_INF)
            return;
        if (toPlace.length > 0)
            return;
        neighbors.push(move_1.Move.fromPrevious(cost, blockB.position.offset(0.5, 0, 0.5), node, this, toPlace, toBreak));
    }
}
exports.ForwardJump = ForwardJump;
class DropDownProvider extends movementProvider_1.MovementProvider {
    getLandingBlock(orgBlock, node, dir = settings_1.emptyVec) {
        let min;
        const startedInLiquid = orgBlock.liquid;
        let blockLand;
        if (startedInLiquid) {
            min = node.y - 1;
            blockLand = this.getBlockInfo(node, dir.x, -1, dir.z);
        }
        else {
            blockLand = this.getBlockInfo(node, dir.x, -2, dir.z);
            if (this.settings.infiniteLiquidDropdownDistance) {
                min = this.bot.game.minY;
            }
            else {
                min = node.y - this.settings.maxDropDown;
            }
        }
        while (blockLand.position.y >= min) {
            if (blockLand.liquid && blockLand.walkthrough) {
                return blockLand;
            }
            if (blockLand.physical) {
                if (node.y - blockLand.position.y <= this.settings.maxDropDown) {
                    return this.getBlockInfo(blockLand.position, 0, 1, 0);
                }
            }
            if (!blockLand.walkthrough)
                return null;
            blockLand = this.getBlockInfo(blockLand.position, 0, -1, 0);
        }
        return null;
    }
}
class ForwardDropDown extends DropDownProvider {
    constructor() {
        super(...arguments);
        this.movementDirs = movement_1.Movement.cardinalDirs;
    }
    provideMovements(start, storage, goal, closed) {
        for (const dir of this.movementDirs) {
            this.getMoveDropDown(start, dir, storage, closed);
        }
    }
    getMoveDropDown(node, dir, neighbors, closed) {
        let cost = 1;
        const block0 = this.getBlockInfo(node, 0, 0, 0);
        const blockLand = this.getLandingBlock(block0, node, dir);
        if (blockLand == null)
            return;
        if (blockLand.isInvalid)
            return;
        if (closed.has(`${blockLand.position.x},${blockLand.position.y},${blockLand.position.z}`))
            return;
        if (block0.liquid)
            cost += this.settings.liquidCost;
        cost += (node.y - blockLand.position.y) * 0.5;
        const blockA = this.getBlockInfo(node, dir.x, 2, dir.z);
        const blockB = this.getBlockInfo(node, dir.x, 1, dir.z);
        const blockC = this.getBlockInfo(node, dir.x, 0, dir.z);
        const blockD = this.getBlockInfo(node, dir.x, -1, dir.z);
        const toBreak = [];
        const toPlace = [];
        const blockCheck0 = this.getBlockInfo(blockLand.position, dir.x, 1, dir.z);
        const blockCheck1 = this.getBlockInfo(blockLand.position, dir.x, 2, dir.z);
        if ((cost += this.safeOrBreak(blockCheck0, toBreak)) > costs_1.COST_INF)
            return;
        if ((cost += this.safeOrBreak(blockCheck1, toBreak)) > costs_1.COST_INF)
            return;
        if ((cost += this.safeOrBreak(blockA, toBreak)) > costs_1.COST_INF)
            return;
        if ((cost += this.safeOrBreak(blockB, toBreak)) > costs_1.COST_INF)
            return;
        if ((cost += this.safeOrBreak(blockC, toBreak)) > costs_1.COST_INF)
            return;
        if ((cost += this.safeOrBreak(blockD, toBreak)) > costs_1.COST_INF)
            return;
        neighbors.push(move_1.Move.fromPrevious(cost, blockLand.position.offset(0.5, 0, 0.5), node, this, toPlace, toBreak));
    }
}
exports.ForwardDropDown = ForwardDropDown;
class StraightDown extends DropDownProvider {
    constructor() {
        super(...arguments);
        this.movementDirs = [new vec3_1.Vec3(0, -1, 0)];
    }
    provideMovements(start, storage, goal, closed) {
        const off = start.cachedVec.floored();
        if (closed.has(`${off.x},${off.y - 1},${off.z}`))
            return;
        return this.getMoveDown(start, storage, closed);
    }
    getMoveDown(node, neighbors, closed) {
        let cost = 1;
        const block0 = this.getBlockInfo(node, 0, 0, 0);
        const blockLand = this.getLandingBlock(block0, node);
        if (blockLand == null)
            return;
        if (blockLand.isInvalid)
            return;
        if (closed.has(`${blockLand.position.x},${blockLand.position.y},${blockLand.position.z}`))
            return;
        if (block0.liquid)
            cost += this.settings.liquidCost;
        cost += (node.y - blockLand.position.y) * 0.5;
        const block1 = this.getBlockInfo(node, 0, -1, 0);
        const toBreak = [];
        const toPlace = [];
        if ((cost += this.safeOrBreak(block1, toBreak)) > costs_1.COST_INF)
            return;
        neighbors.push(move_1.Move.fromPrevious(cost, blockLand.position.offset(0.5, 0, 0.5), node, this, toPlace, toBreak));
    }
}
exports.StraightDown = StraightDown;
class StraightUp extends movementProvider_1.MovementProvider {
    constructor() {
        super(...arguments);
        this.movementDirs = [new vec3_1.Vec3(0, 1, 0)];
    }
    provideMovements(start, storage, goal, closed) {
        const off = start.cachedVec.floored();
        if (closed.has(`${off.x},${off.y + 1},${off.z}`))
            return;
        return this.getMoveUp(start, storage, closed);
    }
    getMoveUp(node, neighbors, closed) {
        let cost = this.settings.jumpCost;
        const block1 = this.getBlockInfo(node, 0, 0, 0);
        if (block1.isInvalid)
            return;
        if (block1.liquid)
            cost += this.settings.liquidCost;
        const block2 = this.getBlockInfo(node, 0, 2, 0);
        const toBreak = [];
        const toPlace = [];
        if ((cost += this.safeOrBreak(block2, toBreak)) > costs_1.COST_INF)
            return;
        if (!block1.climbable) {
            const block3 = this.getBlockInfo(node, 0, 1, 0);
            if (!block3.liquid) {
                if (!this.settings.allow1by1towers || node.remainingBlocks <= 0)
                    return;
                if (!block1.replaceable) {
                    if ((cost += this.breakCost(block1)) > costs_1.COST_INF)
                        return;
                    toBreak.push(interactionUtils_1.BreakHandler.fromVec(block1.position, 'solid'));
                }
                if ((cost += this.safeOrPlace(block1, toPlace, 'solid')) > costs_1.COST_INF)
                    return;
                const block0 = this.getBlockInfo(node, 0, -1, 0);
                if (block0.liquid)
                    return;
                if (block0.physical && block0.height - node.y < -0.2)
                    return;
            }
        }
        neighbors.push(move_1.Move.fromPrevious(cost, block1.position.offset(0.5, 1, 0.5), node, this, toPlace, toBreak));
    }
}
exports.StraightUp = StraightUp;
class ParkourForward extends movementProvider_1.MovementProvider {
    constructor() {
        super(...arguments);
        this.movementDirs = movement_1.Movement.cardinalDirs;
    }
    provideMovements(start, storage, goal, closed) {
        for (const dir of movement_1.Movement.cardinalDirs) {
            this.getMoveParkourForward(start, dir, storage, closed);
        }
    }
    getMoveParkourForward(node, dir, neighbors, closed) {
        const block0 = this.getBlockInfo(node, 0, -1, 0);
        if (!block0.physical)
            return;
        const block00 = this.getBlockInfo(node, 0, 0, 0);
        if (block00.liquid)
            return;
        const block1 = this.getBlockInfo(node, dir.x, -1, dir.z);
        if ((block1.physical && block1.height >= block0.height) ||
            !this.getBlockInfo(node, dir.x, 0, dir.z).walkthrough ||
            !this.getBlockInfo(node, dir.x, 1, dir.z).walkthrough) {
            return;
        }
        const cost0 = 1 + this.settings.jumpCost;
        let ceilingClear = this.getBlockInfo(node, 0, 2, 0).walkthrough && this.getBlockInfo(node, dir.x, 2, dir.z).walkthrough;
        let floorCleared = !this.getBlockInfo(node, dir.x, -2, dir.z).physical;
        const maxD = this.settings.allowSprinting ? 5 : 2;
        for (let d = 2; d <= maxD; d++) {
            const cost = cost0 + d * 0.5;
            const dx = dir.x * d;
            const dz = dir.z * d;
            const flag0 = !closed.has(`${node.x + dx},${node.y - 1},${node.z + dz}`);
            const flag1 = !closed.has(`${node.x + dx},${node.y},${node.z + dz}`);
            const flag2 = !closed.has(`${node.x + dx},${node.y + 1},${node.z + dz}`);
            if (!flag0 && !flag1 && !flag2)
                return;
            const blockA = this.getBlockInfo(node, dx, 2, dz);
            const blockB = this.getBlockInfo(node, dx, 1, dz);
            const blockC = this.getBlockInfo(node, dx, 0, dz);
            const blockD = this.getBlockInfo(node, dx, -1, dz);
            if (flag0 && (ceilingClear || d === 2) && blockB.walkthrough && blockC.walkthrough && blockD.walkthrough && floorCleared) {
                const blockE = this.getBlockInfo(node, dx, -2, dz);
                if (blockE.physical) {
                    neighbors.push(move_1.Move.fromPrevious(cost, blockD.position.offset(0.5, 0, 0.5), node, this));
                }
                floorCleared = floorCleared && !blockE.physical;
            }
            else if (flag1 && ceilingClear && blockB.walkthrough && blockC.walkthrough && blockD.physical) {
                if (d === 5)
                    continue;
                const cost1 = cost + 3;
                neighbors.push(move_1.Move.fromPrevious(cost1, blockC.position.offset(0.5, 0, 0.5), node, this));
                break;
            }
            else if (flag2 && ceilingClear && blockA.walkthrough && blockB.walkthrough && blockC.physical) {
                if (d === 5)
                    continue;
                if (blockC.height - block0.height > 1.2)
                    break;
                neighbors.push(move_1.Move.fromPrevious(cost, blockB.position.offset(0.5, 0, 0.5), node, this));
                break;
            }
            else if (!blockB.walkthrough || !blockC.walkthrough) {
                break;
            }
            ceilingClear = ceilingClear && blockA.walkthrough;
        }
    }
}
exports.ParkourForward = ParkourForward;
//# sourceMappingURL=movementProviders.js.map