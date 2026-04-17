"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimMovement = exports.Movement = exports.DEFAULT_MOVEMENT_OPTS = void 0;
const mineflayer_physics_util_1 = require("@nxg-org/mineflayer-physics-util");
const vec3_1 = require("vec3");
const cacheWorld_1 = require("../world/cacheWorld");
const interactionUtils_1 = require("./interactionUtils");
const costs_1 = require("./costs");
exports.DEFAULT_MOVEMENT_OPTS = {
    allowJumpSprint: true,
    canOpenDoors: true,
    canDig: true,
    canPlace: true,
    dontCreateFlow: true,
    dontMineUnderFallingBlock: true,
    allow1by1towers: true,
    maxDropDown: 3,
    infiniteLiquidDropdownDistance: true,
    allowSprinting: true,
    liquidCost: 3,
    placeCost: 2,
    digCost: 1,
    jumpCost: 0.5,
    velocityKillCost: 2,
    forceLook: true,
    careAboutLookAlignment: true,
    allowDiagonalBridging: true,
    movementTimeoutMs: 1000
};
const cardinalVec3s = [
    new vec3_1.Vec3(-1, 0, 0),
    new vec3_1.Vec3(1, 0, 0),
    new vec3_1.Vec3(0, 0, -1),
    new vec3_1.Vec3(0, 0, 1)
];
Object.freeze(cardinalVec3s);
cardinalVec3s.forEach(Object.freeze);
const diagonalVec3s = [
    new vec3_1.Vec3(-1, 0, -1),
    new vec3_1.Vec3(-1, 0, 1),
    new vec3_1.Vec3(1, 0, -1),
    new vec3_1.Vec3(1, 0, 1)
];
Object.freeze(diagonalVec3s);
diagonalVec3s.forEach(Object.freeze);
const jumpVec3s = [
    new vec3_1.Vec3(-3, 0, 0),
    new vec3_1.Vec3(-2, 0, 1),
    new vec3_1.Vec3(-2, 0, -1),
    new vec3_1.Vec3(-1, 0, 2),
    new vec3_1.Vec3(-1, 0, -2),
    new vec3_1.Vec3(0, 0, 3),
    new vec3_1.Vec3(0, 0, -3),
    new vec3_1.Vec3(1, 0, 2),
    new vec3_1.Vec3(1, 0, -2),
    new vec3_1.Vec3(2, 0, 1),
    new vec3_1.Vec3(2, 0, -1),
    new vec3_1.Vec3(3, 0, 0)
];
Object.freeze(jumpVec3s);
jumpVec3s.forEach(Object.freeze);
class Movement {
    constructor(bot, world, settings = {}) {
        this.bot = bot;
        this.world = world;
        this.settings = Object.assign({}, exports.DEFAULT_MOVEMENT_OPTS, settings);
    }
    loadMove(move) {
        this.currentMove = move;
    }
    toBreak() {
        var _a, _b;
        return (_b = (_a = this.currentMove.toBreak) === null || _a === void 0 ? void 0 : _a.filter((b) => !b.allowExit)) !== null && _b !== void 0 ? _b : [];
    }
    toBreakLen() {
        var _a, _b;
        return (_b = (_a = this.currentMove.toBreak) === null || _a === void 0 ? void 0 : _a.filter((b) => !b.allowExit).length) !== null && _b !== void 0 ? _b : 0;
    }
    toPlace() {
        var _a, _b;
        return (_b = (_a = this.currentMove.toPlace) === null || _a === void 0 ? void 0 : _a.filter((b) => !b.allowExit)) !== null && _b !== void 0 ? _b : [];
    }
    toPlaceLen() {
        var _a, _b;
        return (_b = (_a = this.currentMove.toPlace) === null || _a === void 0 ? void 0 : _a.filter((b) => !b.allowExit).length) !== null && _b !== void 0 ? _b : 0;
    }
    getBlock(pos, dx, dy, dz) {
        return this.world.getBlock(new vec3_1.Vec3(pos.x + dx, pos.y + dy, pos.z + dz));
    }
    getBlockInfo(pos, dx, dy, dz) {
        const yes = new vec3_1.Vec3(Math.floor(pos.x + dx), Math.floor(pos.y + dy), Math.floor(pos.z + dz));
        return this.world.getBlockInfo(yes);
    }
    getBlockInfoRaw(pos) {
        return this.world.getBlockInfo(pos);
    }
    safe(pos) {
        const block = this.world.getBlockInfo(new vec3_1.Vec3(pos.x, pos.y, pos.z));
        return block.physical ? 0 : costs_1.COST_INF;
    }
    safeToBreak(block) {
        if (!this.settings.canDig) {
            return false;
        }
        if (this.settings.dontCreateFlow) {
            if (!block.additionalLoaded)
                block.loadAdditionalInfo(this);
            if (block.waterAround)
                return false;
        }
        if (this.settings.dontMineUnderFallingBlock) {
            if (!block.additionalLoaded)
                block.loadAdditionalInfo(this);
            if (block.fallBlockOver)
                return false;
        }
        return cacheWorld_1.BlockInfo.replaceables.has(block.type) || !cacheWorld_1.BlockInfo.blocksCantBreak.has(block.type);
    }
    safeOrBreak(block, toBreak) {
        if (block.walkthrough) {
            return 0;
        }
        if (block.block === null)
            return costs_1.COST_INF;
        if (!this.safeToBreak(block))
            return costs_1.COST_INF;
        const cost = this.breakCost(block);
        if (cost >= costs_1.COST_INF)
            return cost;
        toBreak.push(interactionUtils_1.BreakHandler.fromVec(block.position, 'solid'));
        return cost;
    }
    breakCost(block) {
        if (block.block === null)
            return costs_1.COST_INF;
        const digTime = this.bot.pathingUtil.digCost(block.block);
        const laborCost = (1 + 3 * digTime / 1000) * this.settings.digCost;
        return laborCost;
    }
    safeOrPlace(block, toPlace, type = 'solid') {
        if (!this.settings.canPlace)
            return costs_1.COST_INF;
        if (this.currentMove.remainingBlocks <= 0)
            return costs_1.COST_INF;
        if (block.block === null)
            return costs_1.COST_INF;
        if (block.solidFull)
            return 0;
        const cost = this.placeCost(block);
        if (cost >= costs_1.COST_INF)
            return cost;
        toPlace.push(interactionUtils_1.PlaceHandler.fromVec(block.position, type));
        return cost;
    }
    placeCost(block) {
        return this.settings.placeCost;
    }
}
exports.Movement = Movement;
Movement.cardinalDirs = cardinalVec3s;
Movement.diagonalDirs = diagonalVec3s;
Movement.jumpDirs = jumpVec3s;
class SimMovement extends Movement {
    constructor(bot, world, settings) {
        super(bot, world, settings);
        this.sim = new mineflayer_physics_util_1.BaseSimulator(new mineflayer_physics_util_1.BotcraftPhysics(bot.registry));
        this.stateCtx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(this.sim.ctx, bot);
    }
    simulateUntil(...args) {
        return this.sim.simulateUntil(...args);
    }
}
exports.SimMovement = SimMovement;
//# sourceMappingURL=movement.js.map