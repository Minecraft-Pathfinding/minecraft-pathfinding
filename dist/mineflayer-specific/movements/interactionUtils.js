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
exports.BreakHandler = exports.PlaceHandler = exports.InteractHandler = void 0;
const vec3_1 = require("vec3");
const cacheWorld_1 = require("../world/cacheWorld");
const mineflayer_physics_util_1 = require("@nxg-org/mineflayer-physics-util");
const mineflayer_util_plugin_1 = require("@nxg-org/mineflayer-util-plugin");
const exceptions_1 = require("../exceptions");
const utils_1 = require("../../utils");
const customBlockEvents_1 = require("../../customBlockEvents");
const debug = require('debug');
const logBase = debug('minecraft-pathfinding:InteractHandler');
const logPlace = debug('minecraft-pathfinding:PlaceHandler');
const logBreak = debug('minecraft-pathfinding:BreakHandler');
class InteractHandler {
    get settings() {
        return this.move.settings;
    }
    get vec() {
        return new vec3_1.Vec3(this.x, this.y, this.z);
    }
    get bb() {
        return mineflayer_util_plugin_1.AABB.fromBlock(this.vec);
    }
    get equipping() {
        return this._equipping;
    }
    constructor(x, y, z, type, offhand = false) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.type = type;
        this.offhand = offhand;
        this.performing = false;
        this.cancelled = false;
        this._equipping = false;
        this._done = false;
        this._internalLock = true;
        this.blockInfo = this.toBlockInfo();
    }
    get isPerforming() {
        return this.performing;
    }
    get done() {
        return this._done;
    }
    get allowExit() {
        return !this._internalLock;
    }
    loadMove(move) {
        this.move = move;
    }
    _abort(bot) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.performing && !this.cancelled) {
                logBase(`Aborting interaction at ${this.vec}`);
                yield this.abort(bot);
                this.performing = false;
                this.cancelled = true;
            }
        });
    }
    _perform(bot_1, item_1) {
        return __awaiter(this, arguments, void 0, function* (bot, item, opts = {}) {
            if (this.performing) {
                logBase(`Error: Already performing interaction at ${this.vec}`);
                throw new Error('Already performing');
            }
            logBase(`Starting interaction at ${this.vec} (Type: ${this.type}, Offhand: ${this.offhand})`);
            this.performing = true;
            this._internalLock = true;
            this.task = new utils_1.Task();
            const ret = yield this.perform(bot, item, opts).catch((err) => {
                var _a;
                logBase(`Interaction failed at ${this.vec}: %O`, err);
                this._internalLock = false;
                this._done = true;
                this.performing = false;
                if (((_a = this.task) === null || _a === void 0 ? void 0 : _a.canceled) != null)
                    return;
                throw new exceptions_1.CancelError(`Failed to perform ${this.constructor.name}`, err);
            });
            logBase(`Successfully completed interaction at ${this.vec}`);
            this._internalLock = false;
            this._done = true;
            this.performing = false;
            return ret;
        });
    }
    getCurrentItem(bot) {
        if (this.offhand)
            return bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')];
        return bot.inventory.slots[bot.getEquipmentDestSlot('hand')];
    }
    equipItem(bot, item) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._equipping)
                return;
            this._equipping = true;
            if (item === null) {
                logBase(`Unequipping ${this.offhand ? 'off-hand' : 'hand'}`);
                yield bot.unequip(this.offhand ? 'off-hand' : 'hand');
            }
            else if (this.offhand) {
                logBase(`Equipping ${item.name} to off-hand`);
                yield bot.equip(item, 'off-hand');
            }
            else {
                logBase(`Equipping ${item.name} to hand`);
                yield bot.equip(item, 'hand');
            }
            bot.updateHeldItem();
            this._equipping = false;
        });
    }
    allowExternalInfluence(bot_1) {
        return __awaiter(this, arguments, void 0, function* (bot, ticks = 1, sneak = false) {
            if (!this.performing)
                return true;
            if (!this._internalLock)
                return true;
            const res = yield this.performInfo(bot, ticks);
            if (res.ticks < Infinity)
                return true;
            const ectx = new mineflayer_physics_util_1.BotcraftPhysics(bot.registry);
            const state = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(ectx, bot);
            const flag0 = bot.entity.onGround;
            for (let i = 0; i < ticks; i++) {
                ectx.simulate(state, bot.pathfinder.world);
            }
            if (flag0)
                if (state.position.y < bot.entity.position.y)
                    return false;
            if (state.state.pos.y < bot.entity.position.y)
                return false;
            return this.bb.distanceToVec(state.state.pos) < PlaceHandler.reach;
        });
    }
}
exports.InteractHandler = InteractHandler;
class PlaceHandler extends InteractHandler {
    static fromVec(vec, type, offhand = false) {
        return new PlaceHandler(vec.x, vec.y, vec.z, type, offhand);
    }
    static identTypeFromItem(item) {
        if (item.name.includes('water'))
            return 'water';
        return 'solid';
    }
    toBlockInfo() {
        switch (this.type) {
            case 'solid':
                return cacheWorld_1.BlockInfo.SOLID(this.vec);
            case 'water':
                return cacheWorld_1.BlockInfo.WATER(this.vec);
            case 'replaceable':
                return cacheWorld_1.BlockInfo.REPLACEABLE(this.vec);
            default:
                throw new Error('Invalid type');
        }
    }
    getItem(bot) {
        var _a, _b;
        switch (this.type) {
            case 'water': {
                return (_a = bot.inventory.items().find((item) => item.name === 'water_bucket')) !== null && _a !== void 0 ? _a : null;
            }
            case 'solid': {
                return (_b = bot.inventory.items().find((item) => cacheWorld_1.BlockInfo.scaffoldingBlockItems.has(item.type))) !== null && _b !== void 0 ? _b : null;
            }
            case 'replaceable': {
                throw new Error('Not implemented');
            }
            default:
                throw new Error('Not implemented');
        }
    }
    getNearbyBlocks(world) {
        return [
            world.getBlockInfo(this.vec.offset(0, 1, 0)),
            world.getBlockInfo(this.vec.offset(0, -1, 0)),
            world.getBlockInfo(this.vec.offset(0, 0, -1)),
            world.getBlockInfo(this.vec.offset(0, 0, 1)),
            world.getBlockInfo(this.vec.offset(-1, 0, 0)),
            world.getBlockInfo(this.vec.offset(1, 0, 0))
        ];
    }
    needToPerform(bot) {
        const blockInfo = bot.pathfinder.world.getBlockInfo(this.vec);
        if (blockInfo.isInvalid) {
            logPlace(`Block at ${this.vec} is invalid. needsToPerform: true`);
            return true;
        }
        let needs = true;
        switch (this.type) {
            case 'water': {
                needs = !(blockInfo.liquid && cacheWorld_1.BlockInfo.waters.has(blockInfo.type));
                break;
            }
            case 'solid': {
                needs = !blockInfo.physical;
                break;
            }
            case 'replaceable': {
                needs = !(blockInfo.replaceable);
                break;
            }
        }
        return needs;
    }
    performInfo(bot_1) {
        return __awaiter(this, arguments, void 0, function* (bot, ticks = 15, scale = 0.5) {
            switch (this.type) {
                case 'water': {
                    throw new Error('Not implemented');
                }
                case 'solid': {
                    const works = [];
                    for (let i = 0; i <= ticks; i++) {
                        const ectx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(bot.physicsUtil.engine, bot);
                        const state = ectx.state;
                        for (let j = 0; j < i; j++) {
                            bot.physicsUtil.engine.simulate(ectx, bot.world);
                        }
                        const bb1 = state.getBB();
                        const eyePos = state.pos.offset(0, state.eyeHeight, 0);
                        const dx = eyePos.x - (this.vec.x + 0.5);
                        const dy = eyePos.y - (this.vec.y + 0.5);
                        const dz = eyePos.z - (this.vec.z + 0.5);
                        const verts = [];
                        const m = 0.05;
                        const M = 0.95;
                        if (dy > 0) {
                            verts.push(this.vec.offset(0.5, 1, 0.5), this.vec.offset(m, 1, m), this.vec.offset(M, 1, m), this.vec.offset(m, 1, M), this.vec.offset(M, 1, M));
                        }
                        else {
                            verts.push(this.vec.offset(0.5, 0, 0.5), this.vec.offset(m, 0, m), this.vec.offset(M, 0, m), this.vec.offset(m, 0, M), this.vec.offset(M, 0, M));
                        }
                        if (dx > 0) {
                            verts.push(this.vec.offset(1, 0.5, 0.5), this.vec.offset(1, m, m), this.vec.offset(1, M, m), this.vec.offset(1, m, M), this.vec.offset(1, M, M));
                        }
                        else {
                            verts.push(this.vec.offset(0, 0.5, 0.5), this.vec.offset(0, m, m), this.vec.offset(0, M, m), this.vec.offset(0, m, M), this.vec.offset(0, M, M));
                        }
                        if (dz > 0) {
                            verts.push(this.vec.offset(0.5, 0.5, 1), this.vec.offset(m, m, 1), this.vec.offset(M, m, 1), this.vec.offset(m, M, 1), this.vec.offset(M, M, 1));
                        }
                        else {
                            verts.push(this.vec.offset(0.5, 0.5, 0), this.vec.offset(m, m, 0), this.vec.offset(M, m, 0), this.vec.offset(m, M, 0), this.vec.offset(M, M, 0));
                        }
                        let good = 0;
                        for (const vert of verts) {
                            const rayRes = (yield bot.world.raycast(eyePos, vert.minus(eyePos).normalize().scale(scale), PlaceHandler.reach / scale));
                            if (rayRes === null)
                                continue;
                            const pos = rayRes.position.plus((0, utils_1.faceToVec)(rayRes.face));
                            if (pos.equals(this.vec)) {
                                if (bb1.containsVec(rayRes.intersect))
                                    continue;
                                if (mineflayer_util_plugin_1.AABB.fromBlock(pos).intersects(bb1))
                                    continue;
                                good++;
                                works.push(rayRes);
                            }
                        }
                        if (good > 0) {
                            logPlace(`performInfo calculated for pos ${this.blockInfo.position}. ticks: ${i}, raycasts: ${good}`);
                            return { ticks: i, tickAllowance: 0, shiftTick: Infinity, raycasts: works };
                        }
                    }
                    logPlace(`performInfo failed to find placement path for pos ${this.blockInfo.position}. Returning Infinity.`);
                    return { ticks: Infinity, tickAllowance: Infinity, shiftTick: Infinity, raycasts: works };
                }
                case 'replaceable': {
                    throw new Error('Not implemented');
                }
                default: {
                    throw new Error('Not implemented');
                }
            }
        });
    }
    perform(bot_1, item_1) {
        return __awaiter(this, arguments, void 0, function* (bot, item, opts = {}) {
            var _a, _b;
            const curInfo = { yaw: bot.entity.yaw, pitch: bot.entity.pitch };
            if (item === null) {
                logPlace('Error: Cannot perform placement with null item');
                throw new Error('Invalid item');
            }
            logPlace(`Starting perform sequence at ${this.vec} with ${item.name}`);
            switch (this.type) {
                case 'water': {
                    if (item.name !== 'water_bucket')
                        throw new Error('Invalid item');
                    if (this.getCurrentItem(bot) !== item)
                        yield this.equipItem(bot, item);
                    logPlace(`Looking at ${this.vec} to place water.`);
                    yield bot.lookAt(this.vec, this.settings.forceLook);
                    bot.activateItem(this.offhand);
                    logPlace(`Water placed.`);
                    break;
                }
                case 'solid': {
                    if (this.getCurrentItem(bot) !== item)
                        yield this.equipItem(bot, item);
                    const predictBlock = (_a = opts.predictBlock) !== null && _a !== void 0 ? _a : true;
                    let works;
                    if (opts.info === undefined) {
                        works = yield this.performInfo(bot);
                    }
                    else
                        works = opts.info;
                    let waitTicks = 0;
                    while (works.raycasts.length === 0) {
                        waitTicks++;
                        yield bot.waitForTicks(1);
                        works = yield this.performInfo(bot);
                    }
                    if (waitTicks > 0)
                        logPlace(`Waited ${waitTicks} ticks for valid raycast intersections.`);
                    const stateEyePos = bot.entity.position.offset(0, 1.62, 0);
                    const lookDir = bot.util.getViewDir();
                    works.raycasts.sort((a, b) => b.intersect.minus(stateEyePos).dot(lookDir) - a.intersect.minus(stateEyePos).dot(lookDir));
                    const rayRes = works.raycasts[0];
                    if (rayRes === undefined) {
                        logPlace('Error: Failed to find valid rayRes after filtering.');
                        throw new Error('Invalid block');
                    }
                    const pos = rayRes.position.plus((0, utils_1.faceToVec)(rayRes.face));
                    const posBl = mineflayer_util_plugin_1.AABB.fromBlock(pos);
                    console.log(bot.entity.position);
                    logPlace(`Simulating movement ticks before placement (ticks needed: ${works.ticks})`);
                    let i = 1;
                    for (; i <= works.ticks; i++) {
                        const ectx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(bot.physicsUtil.engine, bot);
                        const state = ectx.state;
                        bot.physicsUtil.engine.simulate(ectx, bot.world);
                        const sPos = state.pos.offset(0, 1.62, 0);
                        const testCheck = (yield bot.world.raycast(sPos, rayRes.intersect.minus(sPos).normalize().scale(0.5), PlaceHandler.reach * 2));
                        if (testCheck === null) {
                            logPlace('what the fuck?');
                            break;
                        }
                        const pos1 = testCheck.position.plus((0, utils_1.faceToVec)(testCheck.face));
                        const pos1Bl = mineflayer_util_plugin_1.AABB.fromBlock(pos1);
                        if (testCheck.position.equals(rayRes.position) && testCheck.face === rayRes.face && !state.getBB().intersects(pos1Bl)) {
                            logPlace(`Early exit from pre-placement simulation at tick ${i}/${works.ticks} due to favorable conditions. Current position: ${state.pos}, Ray intersect: ${rayRes.intersect}, Test check position: ${testCheck.position}, Test check face: ${testCheck.face}`);
                            yield bot.waitForTicks(1);
                            break;
                        }
                        logPlace(`Simulating tick ${i}/${works.ticks} before placement. Current position: ${state.pos}, Ray intersect: ${rayRes.intersect}, Test check position: ${testCheck.position}, Test check face: ${testCheck.face}`);
                        yield bot.waitForTicks(1);
                    }
                    const botBB = mineflayer_util_plugin_1.AABBUtils.getEntityAABBRaw({ position: bot.entity.position, width: 0.6, height: 1.8 });
                    if (!this.move.isLookingAt(rayRes.intersect)) {
                        logPlace(`Adjusting look toward raycast intersection at ${rayRes.intersect}`);
                        void this.move.lookAt(rayRes.intersect);
                        void bot.lookAt(rayRes.intersect, this.settings.forceLook);
                    }
                    const invalidPlacement = botBB.intersects(posBl);
                    if (invalidPlacement) {
                        logPlace(`Error: Invalid placement! Bot AABB intersects target placement AABB at ${posBl.bottomMiddlePoint()}. Age: ${i}, bot: ${bot.entity.position}, sim: ${botBB.bottomMiddlePoint()}`);
                        yield bot.lookAt(rayRes.intersect, this.settings.forceLook);
                        throw new exceptions_1.CancelError('Invalid placement');
                    }
                    const direction = (0, utils_1.faceToVec)(rayRes.face);
                    logPlace(`Calling bot._placeBlockWithOptions at face ${rayRes.face}`);
                    this._placeTask = bot._placeBlockWithOptions(rayRes, direction, { forceLook: 'ignore', swingArm: 'right' });
                    if (predictBlock) {
                        logPlace(`Predicting block placement at ${rayRes.position.plus(direction)}`);
                        bot.world.setBlock(rayRes.position.plus(direction), cacheWorld_1.BlockInfo.PBlock.fromStateId(cacheWorld_1.BlockInfo.substituteBlockStateId, 0));
                    }
                    this._internalLock = false;
                    if (opts.noAwait) {
                        this._placeTask.catch((err) => logPlace(`Background place task failed: %O`, err));
                    }
                    else {
                        yield this._placeTask;
                        logPlace(`_placeTask resolved.`);
                    }
                    (_b = this.task) === null || _b === void 0 ? void 0 : _b.finish();
                    break;
                }
                case 'replaceable':
                default: {
                    throw new Error('Not implemented');
                }
            }
            if (opts.returnToPos !== undefined) {
                yield bot.lookAt(opts.returnToPos, this.settings.forceLook);
            }
            else if (opts.returnToStart != null && opts.returnToStart) {
                yield bot.look(curInfo.yaw, curInfo.pitch, this.settings.forceLook);
            }
            this._done = true;
            this.performing = false;
            delete this._placeTask;
            logPlace(`Completed perform sequence at ${this.vec}`);
        });
    }
    abort(bot) {
        return __awaiter(this, void 0, void 0, function* () {
            logPlace(`Aborting placement at ${this.vec}`);
            if ((this.task != null) && !this.task.done) {
                this.task.finish();
                this.task.canceled = true;
            }
            if (this._placeTask != null) {
                yield this._placeTask.catch((err) => {
                    logPlace(`Caught error during _placeTask abort: %O`, err);
                });
            }
        });
    }
}
exports.PlaceHandler = PlaceHandler;
PlaceHandler.reach = 4;
class BreakHandler extends InteractHandler {
    static fromVec(vec, type, offhand = false) {
        return new BreakHandler(vec.x, vec.y, vec.z, type, offhand);
    }
    toBlockInfo() {
        return cacheWorld_1.BlockInfo.AIR(this.vec);
    }
    getBlock(world) {
        return world.getBlock(this.vec);
    }
    getItem(bot, block) {
        var _a;
        switch (this.type) {
            case 'water': {
                return (_a = bot.inventory.items().find((item) => item.name === 'bucket')) !== null && _a !== void 0 ? _a : null;
            }
            case 'solid': {
                return bot.pathingUtil.bestHarvestingTool(block);
            }
            case 'replaceable': {
                throw new Error('Not implemented');
            }
            default:
                throw new Error('Not implemented');
        }
    }
    needToPerform(bot) {
        var _a;
        const blockInfo = bot.pathfinder.world.getBlockInfo(this.vec);
        if (blockInfo.isInvalid) {
            logBreak(`Block at ${this.vec} is invalid. needsToPerform: true`);
            return true;
        }
        const needs = !(((_a = blockInfo.block) === null || _a === void 0 ? void 0 : _a.boundingBox) === 'empty' && !cacheWorld_1.BlockInfo.liquids.has(blockInfo.type));
        return needs;
    }
    performInfo(bot_1) {
        return __awaiter(this, arguments, void 0, function* (bot, ticks = 15) {
            const bb = mineflayer_util_plugin_1.AABB.fromBlock(this.vec);
            const dist = bb.distanceToVec(bot.entity.position.offset(0, 1.62, 0));
            const reachable = dist < BreakHandler.reach + 5;
            logBreak(`performInfo calculation. Distance: ${dist.toFixed(2)}, Reachable: ${reachable}`);
            return reachable
                ? { ticks: 0, tickAllowance: 0, shiftTick: 0, raycasts: [] }
                : { ticks: Infinity, tickAllowance: Infinity, shiftTick: Infinity, raycasts: [] };
        });
    }
    perform(bot_1) {
        return __awaiter(this, arguments, void 0, function* (bot, item = null, opts = {}) {
            var _a;
            const curInfo = { yaw: bot.entity.yaw, pitch: bot.entity.pitch };
            logBreak(`Starting break sequence at ${this.vec}`);
            switch (this.type) {
                case 'water': {
                    if (item === null)
                        throw new Error('No item');
                    if (item.name !== 'bucket')
                        throw new Error('Invalid item');
                    if (this.getCurrentItem(bot) !== item)
                        yield this.equipItem(bot, item);
                    logBreak(`Looking at ${this.vec} to collect water.`);
                    yield bot.lookAt(this.vec, this.settings.forceLook);
                    bot.activateItem(this.offhand);
                    logBreak(`Water collected.`);
                    break;
                }
                case 'solid': {
                    if (item === null) {
                        if (this.getCurrentItem(bot) !== null)
                            yield bot.unequip(this.offhand ? 'off-hand' : 'hand');
                    }
                    else if (this.getCurrentItem(bot) !== item) {
                        yield this.equipItem(bot, item);
                    }
                    const block = yield bot.world.getBlock(this.vec);
                    if (block == null) {
                        logBreak('Error: Block is null');
                        throw new Error('Invalid block');
                    }
                    logBreak(`Looking at ${this.vec} to start digging.`);
                    yield bot.lookAt(this.vec, this.settings.forceLook);
                    logBreak(`Calling bot.dig on ${block.name}`);
                    this._breakTask = bot.dig(block, 'ignore', 'raycast');
                    logBreak(`Dig task resolved. Now waiting for world update.`);
                    yield (0, customBlockEvents_1.waitForSettledBlockStateAtPosition)(bot, this.blockInfo.position, (block) => block != null && cacheWorld_1.BlockInfo.replaceables.has(block.type), { timeoutMs: 5000, settleMs: 75 });
                    yield this._breakTask;
                    if (this.task != null)
                        this.task.finish();
                    break;
                }
                case 'replaceable': {
                    throw new Error('Not implemented');
                }
                default: {
                    throw new Error('Not implemented');
                }
            }
            if (opts.returnToPos !== undefined) {
                yield bot.lookAt(opts.returnToPos, this.settings.forceLook);
            }
            else {
                const look = (_a = opts.returnToStart) !== null && _a !== void 0 ? _a : false;
                if (look)
                    yield bot.look(curInfo.yaw, curInfo.pitch, this.settings.forceLook);
            }
            delete this._breakTask;
            logBreak(`Completed break sequence at ${this.vec}`);
        });
    }
    abort(bot) {
        return __awaiter(this, void 0, void 0, function* () {
            logBreak(`Aborting break at ${this.vec}`);
            if ((this.task != null) && !this.task.done) {
                this.task.finish();
                this.task.canceled = true;
            }
            if (this._breakTask != null) {
                switch (this.type) {
                    case 'water': {
                        break;
                    }
                    case 'solid': {
                        logBreak(`Calling bot.stopDigging()`);
                        bot.stopDigging();
                        break;
                    }
                    case 'replaceable': {
                        break;
                    }
                }
                yield this._breakTask.catch((err) => {
                    logBreak(`Caught error during _breakTask abort: %O`, err);
                });
            }
        });
    }
}
exports.BreakHandler = BreakHandler;
BreakHandler.reach = 4;
//# sourceMappingURL=interactionUtils.js.map