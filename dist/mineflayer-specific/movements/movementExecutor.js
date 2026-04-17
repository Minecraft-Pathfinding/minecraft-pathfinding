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
exports.MovementExecutor = void 0;
const move_1 = require("../move");
const interactionUtils_1 = require("./interactionUtils");
const exceptions_1 = require("../exceptions");
const movement_1 = require("./movement");
const mineflayer_util_plugin_1 = require("@nxg-org/mineflayer-util-plugin");
const mineflayer_physics_util_1 = require("@nxg-org/mineflayer-physics-util");
const controls_1 = require("./controls");
const utils_1 = require("../../utils");
const debug = require('debug');
const log = debug('minecraft-pathfinding:movementExecutor');
class MovementExecutor extends movement_1.Movement {
    get cI() {
        return this._cI;
    }
    constructor(bot, world, settings = {}) {
        super(bot, world, settings);
        this.aborted = false;
        this.task = new mineflayer_util_plugin_1.Task();
        this.engine = new mineflayer_physics_util_1.BotcraftPhysics(bot.registry);
        this.sim = new mineflayer_physics_util_1.BaseSimulator(this.engine);
        this.simCtx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(this.engine, bot);
    }
    reset() {
        this.aborted = false;
        delete this.resetReason;
        this.task.finish();
    }
    abort() {
        return __awaiter(this, arguments, void 0, function* (move = this.currentMove, settings = {}) {
            var _a;
            const resetting = settings.reason;
            log('Aborting movement. Reason:', (_a = resetting === null || resetting === void 0 ? void 0 : resetting.message) !== null && _a !== void 0 ? _a : 'None');
            this.aborted = true;
            this.resetReason = resetting;
            yield this.task.promise;
            this.task = new mineflayer_util_plugin_1.Task();
        });
    }
    holdUntilAborted(move_2, task_1) {
        return __awaiter(this, arguments, void 0, function* (move, task, timeout = 1000) {
            if (!this.aborted && this.resetReason == null)
                return;
            log('holdUntilAborted: aborting process started');
            let start = performance.now();
            for (const breakTarget of move.toBreak) {
                yield breakTarget._abort(this.bot);
            }
            log('aborted breaks in %d ms', performance.now() - start);
            start = performance.now();
            for (const place of move.toPlace) {
                yield place._abort(this.bot);
            }
            log('aborted places in %d ms', performance.now() - start);
            start = performance.now();
            if (!this.safeToCancel(move)) {
                yield new Promise((resolve, reject) => {
                    const listener = () => {
                        if (this.safeToCancel(move)) {
                            this.bot.off('physicsTick', listener);
                            resolve();
                        }
                    };
                    this.bot.on('physicsTick', listener);
                    setTimeout(() => {
                        this.bot.off('physicsTick', listener);
                        reject(new Error('Movement failed to abort properly.'));
                    }, timeout);
                });
            }
            log('aborted all in %d ms', performance.now() - start);
            if (this.resetReason != null)
                throw this.resetReason;
            if (this.aborted)
                throw new exceptions_1.AbortError('Movement aborted.');
        });
    }
    perform(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            log('Performing move at index %d', currentIndex);
            this.currentMove = thisMove;
            if (this.resetReason != null)
                throw this.resetReason;
            if (this.aborted)
                throw new exceptions_1.AbortError('Movement aborted.');
            yield this._performInit(thisMove, currentIndex, path);
            let result = false;
            yield new Promise((resolve, reject) => {
                const listener = () => __awaiter(this, void 0, void 0, function* () {
                    if (this.aborted) {
                        reject(new exceptions_1.AbortError('Movement aborted.'));
                    }
                    if (this.resetReason != null) {
                        reject(this.resetReason);
                    }
                    if (result === false) {
                        result = yield this._performPerTick(thisMove, tickCount, currentIndex, path);
                    }
                    if (result) {
                        this.bot.off('physicsTick', listener);
                        resolve();
                    }
                });
                this.bot.on('physicsTick', listener);
            });
            let tickCount = 0;
            while (result === false) {
                result = yield this._performPerTick(thisMove, tickCount, currentIndex, path);
                tickCount++;
            }
        });
    }
    _performInit(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.holdUntilAborted(thisMove, this.task);
            return yield this.performInit(thisMove, currentIndex, path);
        });
    }
    _performPerTick(thisMove, tickCount, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.holdUntilAborted(thisMove, this.task);
            return yield this.performPerTick(thisMove, tickCount, currentIndex, path);
        });
    }
    _align(thisMove, tickCount, goal) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.holdUntilAborted(thisMove, this.task);
            return yield this.align(thisMove, tickCount, goal);
        });
    }
    align(thisMove, tickCount, goal, lookTarget) {
        const target = lookTarget !== null && lookTarget !== void 0 ? lookTarget : thisMove.entryPos;
        if (lookTarget != null)
            void this.postInitAlignToPath(thisMove, { lookAt: target });
        else
            void this.postInitAlignToPath(thisMove);
        return this.isInitAligned(thisMove, target);
    }
    isAlreadyCompleted(thisMove, tickCount, goal) {
        return this.isComplete(thisMove);
    }
    isComplete(startMove, endMove = startMove, opts = {}) {
        var _a;
        if (this.cI !== undefined) {
            if (!this.cI.allowExit)
                return false;
        }
        const ticks = (_a = opts.ticks) !== null && _a !== void 0 ? _a : 1;
        const target = endMove.exitPos;
        const offset = endMove.exitPos.minus(this.bot.entity.position);
        const dir = endMove.exitPos.minus(startMove.entryPos);
        offset.translate(0, -offset.y, 0);
        dir.translate(0, -dir.y, 0);
        const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
        const xzVelDir = xzVel.normalize();
        const dist = offset.norm();
        const ectx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(this.bot.physicsUtil.engine, this.bot);
        const history = [ectx.position.clone()];
        for (let i = 0; i < ticks; i++) {
            ectx.state.control.set('jump', false);
            ectx.state.jumpQueued = false;
            this.bot.physicsUtil.engine.simulate(ectx, this.world);
            history.push(ectx.position.clone());
        }
        const pos = ectx.state.pos.clone();
        const normPos = (0, utils_1.getNormalizedPos)(this.bot, pos);
        const bb0 = mineflayer_util_plugin_1.AABBUtils.getPlayerAABB({ position: normPos, width: 0.599, height: 1.8 });
        let bb1bl;
        let bbCheckCond = false;
        let weGood = false;
        const aboveWater = !ectx.state.isInWater &&
            !ectx.state.onGround &&
            this.bot.pathfinder.world.getBlockInfo(this.bot.entity.position.floored().translate(0, -0.6, 0)).liquid;
        if (aboveWater) {
            bb1bl = this.bot.pathfinder.world.getBlockInfo(target.floored());
            bbCheckCond = bb1bl.walkthrough;
            const bb1s = mineflayer_util_plugin_1.AABB.fromBlockPos(bb1bl.position);
            weGood = bb1s.collides(bb0) && bbCheckCond;
        }
        else if (ectx.state.isInWater) {
            bb1bl = this.bot.pathfinder.world.getBlockInfo(target.floored());
            bbCheckCond = bb1bl.liquid;
            const bb1s = mineflayer_util_plugin_1.AABB.fromBlock(bb1bl.position);
            weGood = bb1s.collides(bb0) && bbCheckCond;
        }
        else {
            bb1bl = this.bot.pathfinder.world.getBlockInfo(target.floored().translate(0, -1, 0));
            bbCheckCond = bb1bl.physical;
            const bb1s = bb1bl.getBBs();
            weGood = bb1s.some((b) => b.collides(bb0)) && bbCheckCond && pos.y >= bb1bl.height;
        }
        const headingThatWay = xzVelDir.dot(dir.normalize()) > -2;
        const similarDirection = offset.normalize().dot(dir.normalize()) > 0.5;
        if (weGood) {
            if (similarDirection && headingThatWay)
                return !ectx.state.isCollidedHorizontally;
            else if (dist < 0.2)
                return true;
            else {
                return true;
            }
        }
        return (this.bot.entity.position.xzDistanceTo(endMove.exitPos) < 0.2 &&
            this.bot.entity.position.y === endMove.exitPos.y &&
            this.bot.entity.onGround);
    }
    isInitAligned(thisMove, target = thisMove.entryPos, options = {}) {
        var _a;
        const off0 = thisMove.exitPos.minus(this.bot.entity.position).normalize();
        const off1 = thisMove.exitPos.minus(target).normalize();
        if (this.bot.entity.position.y < thisMove.entryPos.y - 1)
            throw new exceptions_1.CancelError('MovementExecutor: bot is too low.');
        log('isInitAligned: off0.dot(off1)=%d', off0.dot(off1));
        off0.translate(0, -off0.y, 0);
        off1.translate(0, -off1.y, 0);
        const similarDirection = off0.dot(off1) > 0.95;
        let bb0 = options.customBB;
        if (bb0 == null) {
            const normPos = (0, utils_1.getNormalizedPos)(this.bot);
            bb0 = mineflayer_util_plugin_1.AABBUtils.getEntityAABBRaw({ position: normPos, width: 0.6, height: 1.8 });
        }
        const toCheck = (_a = options.others) !== null && _a !== void 0 ? _a : [];
        const entercheck = { pos: target.offset(0, -1, 0), requireSupport: true };
        const exitCheck = { pos: thisMove.exitPos.floored().translate(0, -1, 0), requireSupport: true };
        toCheck.push(entercheck);
        toCheck.push(exitCheck);
        let valid;
        if (options.enterExitInterp) {
            valid = this.interpolatedBBCheck(bb0, thisMove.cachedVec.offset(0.5, 0, 0.5), thisMove.exitPos.floored().offset(0.5, 0, 0.5)) || this.boundingBoxCheck(bb0, ...toCheck);
        }
        else
            valid = this.boundingBoxCheck(bb0, ...toCheck);
        if (valid) {
            log('isInitAligned: yaw check passed. similarDirection=%s, dist=%d', similarDirection, this.bot.entity.position.xzDistanceTo(target));
            if (similarDirection)
                return true;
            else {
                if (this.bot.entity.position.xzDistanceTo(target) < 0.2)
                    return true;
                if (this.boundingBoxCheck(bb0, exitCheck))
                    return true;
            }
        }
        log(`isInitAligned: We are not aligned. us: %O, target pos: %O`, bb0, target);
        return false;
    }
    safeToCancel(startMove, endMove = startMove) {
        return this.bot.entity.onGround || this.bot.entity.isInWater;
    }
    interactNeeded() {
        return __awaiter(this, arguments, void 0, function* (ticks = 1) {
            const start = performance.now();
            for (const breakTarget of this.currentMove.toBreak) {
                if (breakTarget !== this._cI && !breakTarget.done) {
                    if (!breakTarget.needToPerform(this.bot))
                        continue;
                    const res = yield breakTarget.performInfo(this.bot, ticks);
                    log(`[${start - performance.now()}ms] interactNeeded: break ticks %d (raycasts: %s)`, res.ticks, res.raycasts.length > 0);
                    if (res.ticks < Infinity)
                        return breakTarget;
                }
            }
            for (const place of this.currentMove.toPlace) {
                if (place !== this._cI && !place.done) {
                    if (!place.needToPerform(this.bot))
                        continue;
                    const res = yield place.performInfo(this.bot, ticks);
                    log(`[${start - performance.now()}ms] interactNeeded: place ticks %d (raycasts: %s)`, res.ticks, res.raycasts.length > 0);
                    if (res.ticks < Infinity)
                        return place;
                }
            }
        });
    }
    performInteraction(interaction_1) {
        return __awaiter(this, arguments, void 0, function* (interaction, opts = {}) {
            this._cI = interaction;
            interaction.loadMove(this);
            if (interaction instanceof interactionUtils_1.PlaceHandler) {
                yield this.performPlace(interaction, opts);
            }
            else if (interaction instanceof interactionUtils_1.BreakHandler) {
                yield this.performBreak(interaction, opts);
            }
        });
    }
    performPlace(place_1) {
        return __awaiter(this, arguments, void 0, function* (place, opts = {}) {
            const item = place.getItem(this.bot);
            if (item == null)
                throw new exceptions_1.CancelError('MovementExecutor: no item to place');
            log('performPlace: placing item %s', item.name);
            yield place._perform(this.bot, item, opts);
            this._cI = undefined;
        });
    }
    performBreak(breakTarget_1) {
        return __awaiter(this, arguments, void 0, function* (breakTarget, opts = {}) {
            const block = breakTarget.getBlock(this.bot.pathfinder.world);
            if (block == null)
                throw new exceptions_1.CancelError('MovementExecutor: no block to break');
            const item = breakTarget.getItem(this.bot, block);
            log('performBreak: breaking block %s', block.name);
            yield breakTarget._perform(this.bot, item, opts);
            this._cI = undefined;
        });
    }
    lookAtPathPos(vec3_1) {
        return __awaiter(this, arguments, void 0, function* (vec3, force = this.settings.forceLook) {
            return yield this.lookAt(vec3.offset(0, -vec3.y + this.bot.entity.position.y + 1.62, 0), force);
        });
    }
    lookAt(vec3_1) {
        return __awaiter(this, arguments, void 0, function* (vec3, force = this.settings.forceLook) {
            if (this.isLookingAt(vec3, 0.001))
                return;
            yield this.bot.lookAt(vec3, force);
        });
    }
    isLookingAt(vec3, limit = 0.01) {
        if (!this.settings.careAboutLookAlignment)
            return true;
        const bl = this.bot.blockAtCursor(256);
        if (bl == null)
            return false;
        const eyePos = this.bot.entity.position.offset(0, 1.62, 0);
        return bl.intersect.minus(eyePos).normalize().dot(vec3.minus(eyePos).normalize()) > 1 - limit;
    }
    isLookingAtYaw(vec3, limit = 0.01) {
        if (!this.settings.careAboutLookAlignment)
            return true;
        const inter = this.bot.util.getViewDir();
        const eyePos = this.bot.entity.position.offset(0, 1.62, 0);
        const pos1 = vec3.minus(eyePos);
        pos1.translate(0, -pos1.y, 0);
        return inter.normalize().dot(pos1.normalize()) > 1 - limit;
    }
    boundingBoxCheck(orgBB, ...info) {
        let valid = false;
        for (const { pos, requireSupport } of info) {
            const bInfo = this.getBlockInfoRaw(pos);
            const bbs = bInfo.getBBs();
            if (bbs.length === 0)
                bbs.push(mineflayer_util_plugin_1.AABB.fromBlock(bInfo.position));
            if (requireSupport && !(bInfo.physical || bInfo.liquid)) {
                continue;
            }
            valid = valid || bbs.some((b) => b.collides(orgBB));
        }
        return valid;
    }
    interpolatedBBCheck(orgBB, start, end) {
        for (const pos of (0, utils_1.interpolateStepPoints)(start, end, 0.8)) {
            const bInfo = this.getBlockInfoRaw(pos);
            const bbs = bInfo.getBBs();
            if (bbs.length === 0) {
                bbs.push(mineflayer_util_plugin_1.AABB.fromBlock(bInfo.position));
            }
            if (bbs.some((b) => b.collides(orgBB))) {
                return true;
            }
        }
        log(`interpolatedBBCheck: no collision. orgBB %O, from %O to %O`, orgBB, start, end);
        return false;
    }
    resetState() {
        this.simCtx.state.update(this.bot);
        return this.simCtx.state;
    }
    simUntil(...args) {
        this.simCtx.state.update(this.bot);
        return this.sim.simulateUntil(...args);
    }
    simUntilGrounded(controller, maxTicks = 1000) {
        this.simCtx.state.update(this.bot);
        return this.sim.simulateUntil((state) => state.onGround, () => { }, controller, this.simCtx, this.world, maxTicks);
    }
    simJump({ goal, controller } = {}, maxTicks = 1000) {
        this.simCtx.state.update(this.bot);
        goal = goal !== null && goal !== void 0 ? goal : ((state) => state.onGround);
        controller =
            controller !== null && controller !== void 0 ? controller : ((state) => {
                state.control.set('jump', true);
            });
        return this.sim.simulateUntil(goal, () => { }, controller, this.simCtx, this.world, maxTicks);
    }
    postInitAlignToPath(startMove, endMove, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if (endMove === undefined) {
                endMove = startMove;
                opts = {};
            }
            else if (endMove instanceof move_1.Move) {
                opts = opts !== null && opts !== void 0 ? opts : {};
            }
            else {
                opts = endMove;
                endMove = startMove;
            }
            let target = (_b = (_a = opts.lookAt) !== null && _a !== void 0 ? _a : opts.lookAtYaw) !== null && _b !== void 0 ? _b : endMove.exitPos;
            if (opts.lookAtYaw != null && opts.lookAt == null) {
                target = target.offset(0, -target.y + this.bot.entity.position.y + this.bot.entity.height, 0);
            }
            const sprint = (_c = opts.sprint) !== null && _c !== void 0 ? _c : true;
            if (target !== endMove.exitPos) {
                yield this.lookAt(target);
                if (!this.isLookingAt(target, 0.01))
                    return;
            }
            else {
                yield this.lookAtPathPos(target);
                const yawPitch = (0, utils_1.posToYawPitchFromEye)(this.bot.entity.position, 1.62, target);
                if (!this.isLookingAtYaw(target, 0.01)) {
                    log(`postInitAlignToPath: failed yaw check (offset=${yawPitch.yaw - this.bot.entity.yaw})`);
                }
            }
            (0, controls_1.botStrafeMovementStrict)(this.bot, endMove.exitPos);
            (0, controls_1.botSmartMovement)(this.bot, endMove.exitPos, sprint);
        });
    }
    willFallOff(ticks = 1) {
        const ectx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot);
        for (let i = 0; i < ticks; i++) {
            this.bot.physicsUtil.engine.simulate(ectx, this.bot.world);
        }
        return !ectx.state.onGround && this.bot.entity.onGround;
    }
}
exports.MovementExecutor = MovementExecutor;
//# sourceMappingURL=movementExecutor.js.map