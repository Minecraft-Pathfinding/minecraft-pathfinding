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
exports.ParkourForwardExecutor = exports.StraightUpExecutor = exports.StraightDownExecutor = exports.NewForwardDropDownExecutor = exports.ForwardDropDownExecutor = exports.NewForwardJumpExecutor = exports.ForwardJumpExecutor = exports.ForwardExecutor = exports.NewForwardExecutor = exports.IdleMovementExecutor = void 0;
const vec3_1 = require("vec3");
const exceptions_1 = require("../exceptions");
const cacheWorld_1 = require("../world/cacheWorld");
const interactionUtils_1 = require("./interactionUtils");
const mineflayer_util_plugin_1 = require("@nxg-org/mineflayer-util-plugin");
const movementExecutor_1 = require("./movementExecutor");
const movementUtils_1 = require("./movementUtils");
const mineflayer_physics_util_1 = require("@nxg-org/mineflayer-physics-util");
const debug = require('debug');
const logIdle = debug('minecraft-pathfinding:movementExecutors:Idle');
const logFwd = debug('minecraft-pathfinding:movementExecutors:NewForward');
const logOldFwd = debug('minecraft-pathfinding:movementExecutors:Forward');
const logJump = debug('minecraft-pathfinding:movementExecutors:ForwardJump');
const logDrop = debug('minecraft-pathfinding:movementExecutors:ForwardDropDown');
const logDown = debug('minecraft-pathfinding:movementExecutors:StraightDown');
const logUp = debug('minecraft-pathfinding:movementExecutors:StraightUp');
const logParkour = debug('minecraft-pathfinding:movementExecutors:Parkour');
class IdleMovementExecutor extends movementExecutor_1.MovementExecutor {
    provideMovements(start, storage) { }
    performInit(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            logIdle('performInit called');
        });
    }
    performPerTick(thisMove, tickCount, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            return true;
        });
    }
}
exports.IdleMovementExecutor = IdleMovementExecutor;
class NewForwardExecutor extends movementExecutor_1.MovementExecutor {
    faceForward() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (this.doWaterLogic())
                return true;
            const eyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0);
            const placementVecs = this.toPlace().map((p) => mineflayer_util_plugin_1.AABB.fromBlock(p.vec));
            const near = placementVecs.some((p) => p.distanceToVec(eyePos) < interactionUtils_1.PlaceHandler.reach + 2);
            return ((_a = this.currentMove) === null || _a === void 0 ? void 0 : _a.toPlace.length) === 0 || !near;
        });
    }
    align(thisMove, tickCount, goal) {
        const _super = Object.create(null, {
            align: { get: () => super.align }
        });
        return __awaiter(this, void 0, void 0, function* () {
            if (this.doWaterLogic()) {
                yield _super.align.call(this, thisMove, tickCount, goal);
            }
            const faceForward = yield this.faceForward();
            let target;
            if (faceForward) {
                target = thisMove.entryPos.floored().translate(0.5, 0, 0.5);
            }
            else {
                const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position);
                target = offset;
            }
            return yield this.landAlign(thisMove, tickCount, goal);
        });
    }
    landAlign(thisMove, tickCount, goal) {
        return __awaiter(this, void 0, void 0, function* () {
            const faceForward = yield this.faceForward();
            const opts = { enterExitInterp: true };
            if (!this.bot.entity.onGround || this.bot.getControlState('jump')) {
                opts.customBB = mineflayer_util_plugin_1.AABBUtils.getEntityAABB(this.bot.entity);
                opts.customBB.expand(0, -1.3, 0);
            }
            const target = thisMove.entryPos.floored().translate(0.5, 0, 0.5);
            if (faceForward) {
                this.bot.setControlState('forward', true);
                if (this.bot.food <= 6)
                    this.bot.setControlState('sprint', false);
                else
                    this.bot.setControlState('sprint', true);
            }
            else {
                const offset = this.bot.entity.position.minus(target).plus(this.bot.entity.position);
                void this.lookAt(offset);
                this.bot.setControlState('forward', false);
                this.bot.setControlState('sprint', false);
                this.bot.setControlState('back', true);
            }
            return this.isInitAligned(thisMove, target, opts);
        });
    }
    performInit(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            this.bot.clearControlStates();
            const faceForward = yield this.faceForward();
            if (faceForward) {
                yield this.postInitAlignToPath(thisMove);
            }
            else {
                const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position);
                yield this.postInitAlignToPath(thisMove, { lookAt: offset });
            }
        });
    }
    doWaterLogic() {
        if (this.bot.entity.isInWater)
            return true;
        if (this.bot.entity.onGround)
            return false;
        const bl = this.getBlockInfo(this.bot.entity.position, 0, -0.6, 0);
        return bl.liquid;
    }
    canJump(thisMove, currentIndex, path) {
        if (this.doWaterLogic()) {
            if (this.bot.entity.position.y < thisMove.exitPos.y) {
                return true;
            }
            else {
                return false;
            }
        }
        if (!this.settings.allowJumpSprint)
            return false;
        if (!this.bot.entity.onGround)
            return false;
        if (this.toBreakLen() > 0 || this.toPlaceLen() > 0)
            return false;
        const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
        if (xzVel.norm() < 0.14)
            return false;
        const ctx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot);
        this.sim.simulateUntil((state, ticks) => (ticks > 0 && state.onGround) || state.isCollidedHorizontally, () => { }, (state) => {
            state.control.set('jump', true);
        }, ctx, this.world, 20);
        if (ctx.state.pos.y > thisMove.entryPos.y)
            return false;
        const nextPos = path[++currentIndex];
        let offset = 0.4;
        if (currentIndex < path.length) {
            if (nextPos.toPlace.length > 0 || nextPos.toBreak.length > 0)
                offset = 0.8;
            if (nextPos.exitPos.y > thisMove.entryPos.y) {
                offset = 0.8;
            }
            if (nextPos.exitPos.y - thisMove.entryPos.y > 2) {
                offset = 0.8;
            }
        }
        if (thisMove.entryPos.xzDistanceTo(ctx.state.pos) > thisMove.entryPos.xzDistanceTo(thisMove.exitPos) - offset) {
            return false;
        }
        if (ctx.state.isCollidedHorizontally)
            return false;
        return ctx.state.onGround;
    }
    performPerTick(thisMove, tickCount, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.cI != null && !(yield this.cI.allowExternalInfluence(this.bot))) {
                return false;
            }
            else if (this.cI == null) {
                const test = yield this.interactNeeded(5);
                if (test != null) {
                    void this.performInteraction(test);
                    return false;
                }
            }
            if ((!this.bot.entity.onGround &&
                !this.bot.getControlState('jump') &&
                !this.doWaterLogic() &&
                this.canJump(thisMove, currentIndex, path)) ||
                this.bot.entity.position.y < Math.round(thisMove.entryPos.y) - 1) {
                throw new exceptions_1.CancelError(`ForwardMove: not on ground. Target pos: ${thisMove.exitPos}, us: ${this.bot.entity.position}`);
            }
            const faceForward = yield this.faceForward();
            if (faceForward) {
                const jump = this.canJump(thisMove, currentIndex, path);
                this.bot.setControlState('jump', jump);
                void this.postInitAlignToPath(thisMove);
                return this.isComplete(thisMove);
            }
            else {
                const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position);
                void this.postInitAlignToPath(thisMove, { lookAt: offset });
                return this.isComplete(thisMove);
            }
        });
    }
}
exports.NewForwardExecutor = NewForwardExecutor;
class ForwardExecutor extends movementExecutor_1.MovementExecutor {
    getRemainingPlacements() {
        if (!this.currentMove)
            return [];
        return this.currentMove.toPlace.filter(p => p.needToPerform(this.bot));
    }
    faceForward() {
        return __awaiter(this, void 0, void 0, function* () {
            const eyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0);
            const remaining = this.getRemainingPlacements();
            if (remaining.length === 0)
                return true;
            const placementVecs = remaining.map((p) => mineflayer_util_plugin_1.AABB.fromBlock(p.vec));
            const near = placementVecs.some((p) => p.distanceToVec(eyePos) < interactionUtils_1.PlaceHandler.reach + 2);
            return !near;
        });
    }
    align(thisMove, tickCount, goal) {
        return __awaiter(this, void 0, void 0, function* () {
            const faceFwd = yield this.faceForward();
            const target = thisMove.entryPos.floored().translate(0.5, 0, 0.5);
            if (faceFwd) {
                void this.postInitAlignToPath(thisMove, { lookAtYaw: target });
            }
            else {
                const offset = this.bot.entity.position.minus(target).plus(this.bot.entity.position);
                void this.postInitAlignToPath(thisMove, { lookAt: offset });
            }
            const off0 = thisMove.exitPos.minus(this.bot.entity.position);
            const off1 = thisMove.exitPos.minus(target);
            off0.translate(0, -off0.y, 0);
            off1.translate(0, -off1.y, 0);
            const similarDirection = off0.normalize().dot(off1.normalize()) > 0.95;
            const bb0 = mineflayer_util_plugin_1.AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 });
            const bb1bl = this.getBlockInfo(target, 0, -1, 0);
            const bb1 = bb1bl.getBBs();
            if (bb1.length === 0)
                bb1.push(mineflayer_util_plugin_1.AABB.fromBlock(bb1bl.position));
            const bb1physical = bb1bl.physical || bb1bl.liquid;
            const bb2bl = thisMove.moveType.getBlockInfo(thisMove.exitPos.floored(), 0, -1, 0);
            const bb2 = bb2bl.getBBs();
            if (bb2.length === 0)
                bb2.push(mineflayer_util_plugin_1.AABB.fromBlock(bb1bl.position));
            const bb2physical = bb2bl.physical || bb2bl.liquid;
            if ((bb1.some((b) => b.collides(bb0)) && bb1physical) || (bb2.some((b) => b.collides(bb0)) && bb2physical)) {
                if (similarDirection)
                    return true;
                else if (this.bot.entity.position.xzDistanceTo(target) < 0.2)
                    return this.isLookingAtYaw(target);
            }
            return false;
        });
    }
    performInit(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            this.bot.clearControlStates();
            this.currentIndex = 0;
            const faceFwd = yield this.faceForward();
            if (faceFwd) {
                yield this.postInitAlignToPath(thisMove);
            }
            else {
                const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position);
                yield this.postInitAlignToPath(thisMove, { lookAt: offset, sprint: true });
            }
        });
    }
    identMove(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            let lastMove = thisMove;
            let nextMove = path[++currentIndex];
            if (nextMove === undefined)
                return --currentIndex;
            const orgY = thisMove.entryPos.y;
            const width = 0.61;
            const bb = mineflayer_util_plugin_1.AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width, height: 1.8 });
            const verts = bb.expand(0, -1, 0).toVertices();
            const verts1 = [
                this.bot.entity.position.offset(-width / 2, -0.6, -width / 2),
                this.bot.entity.position.offset(width / 2, -0.6, -width / 2),
                this.bot.entity.position.offset(width / 2, -0.6, width / 2),
                this.bot.entity.position.offset(-width / 2, -0.6, width / 2)
            ];
            const pos0 = this.bot.entity.position;
            while (lastMove.exitPos.y === orgY && nextMove.exitPos.y === orgY) {
                if (nextMove === undefined)
                    return --currentIndex;
                for (const vert of verts) {
                    const offset = vert.minus(this.bot.entity.position);
                    const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0);
                    const test = test1.plus(offset);
                    const dist = lastMove.exitPos.distanceTo(this.bot.entity.position) + 1;
                    const raycast0 = (yield this.bot.world.raycast(vert, test.minus(vert).normalize().scale(0.5), dist * 2));
                    const valid0 = raycast0 == null || raycast0.position.distanceTo(pos0) > dist;
                    if (!valid0) {
                        return --currentIndex;
                    }
                }
                let counter = verts1.length;
                for (const vert of verts1) {
                    const offset = vert.minus(this.bot.entity.position);
                    const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0);
                    const test = test1.plus(offset);
                    const dist = lastMove.exitPos.distanceTo(this.bot.entity.position) + 1;
                    const raycast0 = (yield this.bot.world.raycast(vert, test.minus(vert).normalize().scale(0.5), dist * 2, (block) => cacheWorld_1.BlockInfo.replaceables.has(block.type)));
                    const valid0 = raycast0 == null || raycast0.position.distanceTo(pos0) > dist;
                    if (!valid0)
                        counter--;
                }
                if (counter === 0)
                    return --currentIndex;
                if (++currentIndex >= path.length)
                    return --currentIndex;
                lastMove = nextMove;
                nextMove = path[currentIndex];
            }
            return --currentIndex;
        });
    }
    canJump(thisMove, currentIndex, path) {
        if (!this.settings.allowJumpSprint)
            return false;
        if (!this.bot.entity.onGround)
            return false;
        if (this.toBreakLen() > 0 || this.toPlaceLen() > 0)
            return false;
        const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
        if (xzVel.norm() < 0.14)
            return false;
        const ctx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot);
        this.sim.simulateUntil((state, ticks) => (ticks > 0 && state.onGround) || state.isCollidedHorizontally, () => { }, (state) => {
            state.control.set('jump', true);
        }, ctx, this.world, 20);
        if (ctx.state.pos.y > thisMove.entryPos.y)
            return false;
        const nextPos = path[++currentIndex];
        let offset = 0.3;
        if (currentIndex < path.length) {
            if (nextPos.toPlace.length > 0 || nextPos.toBreak.length > 0)
                offset = 0.8;
            if (nextPos.exitPos.y > thisMove.entryPos.y)
                offset = 0.8;
        }
        if (thisMove.entryPos.xzDistanceTo(ctx.state.pos) > thisMove.entryPos.xzDistanceTo(thisMove.exitPos) - offset) {
            return false;
        }
        if (ctx.state.isCollidedHorizontally)
            return false;
        return ctx.state.onGround;
    }
    performPerTick(thisMove, tickCount, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.cI != null && !(yield this.cI.allowExternalInfluence(this.bot))) {
                this.bot.clearControlStates();
                this.bot.setControlState('sneak', true);
                return false;
            }
            else if (this.cI == null) {
                const remaining = this.getRemainingPlacements();
                if (remaining.length > 0) {
                    let batchExecuted = false;
                    for (const p of remaining) {
                        const info = yield p.performInfo(this.bot, 5);
                        if (info.ticks === 0) {
                            logOldFwd(`Block ${p.vec} is visible NOW. Rapid-placing.`);
                            this.bot.clearControlStates();
                            this.bot.setControlState('sneak', true);
                            yield this.performInteraction(p, { info, predictBlock: true, noAwait: true });
                            batchExecuted = true;
                        }
                        else if (info.ticks < Infinity) {
                            if (!batchExecuted) {
                                logOldFwd(`Block ${p.vec} visible in ${info.ticks} ticks. Triggering background interaction.`);
                                void this.performInteraction(p, { info, predictBlock: true });
                            }
                            break;
                        }
                        else {
                            break;
                        }
                    }
                    if (batchExecuted)
                        return false;
                }
            }
            if (!this.bot.entity.onGround &&
                this.bot.entity.position.y < thisMove.entryPos.y &&
                !this.bot.getControlState('jump')) {
                throw new exceptions_1.CancelError('ForwardMove: not on ground');
            }
            const faceFwd = yield this.faceForward();
            if (faceFwd) {
                if (false) {
                    this.bot.setControlState('back', false);
                    this.bot.setControlState('sprint', true);
                    this.bot.setControlState('forward', true);
                    const idx = yield this.identMove(thisMove, currentIndex, path);
                    this.currentIndex = Math.max(idx, this.currentIndex);
                    const nextMove = path[this.currentIndex];
                    if (currentIndex !== this.currentIndex && nextMove !== undefined) {
                        void this.postInitAlignToPath(thisMove, nextMove);
                        if (this.isComplete(thisMove, nextMove))
                            return this.currentIndex - currentIndex;
                    }
                    else {
                        void this.postInitAlignToPath(thisMove);
                        return this.isComplete(thisMove);
                    }
                }
                else {
                    const jump = this.canJump(thisMove, currentIndex, path);
                    this.bot.setControlState('jump', jump);
                    void this.postInitAlignToPath(thisMove);
                    return this.isComplete(thisMove);
                }
            }
            else {
                const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position);
                void this.postInitAlignToPath(thisMove, { lookAt: offset });
                this.bot.setControlState('forward', false);
                this.bot.setControlState('back', true);
                this.bot.setControlState('sprint', false);
                this.bot.setControlState('sneak', true);
                return this.isComplete(thisMove);
            }
            return false;
        });
    }
}
exports.ForwardExecutor = ForwardExecutor;
class ForwardJumpExecutor extends movementExecutor_1.MovementExecutor {
    constructor() {
        super(...arguments);
        this.shitter = new movementUtils_1.JumpCalculator(this.sim, this.bot, this.world, this.simCtx);
        this.flag = false;
    }
    getRemainingPlacements() {
        if (!this.currentMove)
            return [];
        return this.currentMove.toPlace.filter(p => p.needToPerform(this.bot));
    }
    isComplete(startMove, endMove) {
        return super.isComplete(startMove, endMove, { ticks: 0 });
    }
    align(thisMove, tickCount, goal) {
        const _super = Object.create(null, {
            align: { get: () => super.align }
        });
        return __awaiter(this, void 0, void 0, function* () {
            if (this.bot.entity.isInWater) {
                this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.entryPos.y);
                return yield _super.align.call(this, thisMove, tickCount, goal);
            }
            return yield _super.align.call(this, thisMove, tickCount, goal);
        });
    }
    align1(thisMove, tickCount, goal) {
        const bb = mineflayer_util_plugin_1.AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 });
        if (this.flag) {
            void this.lookAt(thisMove.entryPos.floored().offset(0.5, 0, 0.5));
            this.bot.setControlState('forward', true);
            this.bot.setControlState('back', false);
            this.bot.setControlState('sprint', true);
            const bl = this.getBlockInfo(thisMove.entryPos.floored(), 0, -1, 0);
            const bigBBs = bl.getBBs().map((b) => b.extend(0, 10, 0));
            return bigBBs.some((b) => b.contains(bb)) && this.bot.entity.onGround;
        }
        else if (this.bot.entity.onGround) {
            if (thisMove.toPlace.length === 0) {
                this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos);
                if (this.jumpInfo === null) {
                    this.flag = true;
                    return false;
                }
            }
            return true;
        }
        return false;
    }
    performInit(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            this.flag = false;
            this.bot.clearControlStates();
            logJump(`performInit`);
            if (thisMove.toBreak.length > 0) {
                yield this.bot.clearControlStates();
                for (const breakH of this.toBreak()) {
                    const start = performance.now();
                    yield this.performInteraction(breakH);
                    logJump(`[${performance.now() - start}ms] break block ${breakH.blockInfo.position} completed.`);
                }
            }
            this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos);
            if (this.jumpInfo === null) {
                this.bot.setControlState('forward', true);
                this.bot.setControlState('jump', true);
                this.bot.setControlState('sprint', true);
            }
        });
    }
    performPerTick(thisMove, tickCount, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (this.cI != null && !(yield this.cI.allowExternalInfluence(this.bot))) {
                return false;
            }
            if (this.cI == null) {
                const remaining = this.getRemainingPlacements();
                if (remaining.length > 0) {
                    let batchExecuted = false;
                    for (const p of remaining) {
                        const info = yield p.performInfo(this.bot, 5);
                        if (info.ticks === 0) {
                            logJump(`Block ${p.vec} is visible NOW. Rapid-placing mid-air.`);
                            yield this.performInteraction(p, { info, predictBlock: true, noAwait: true });
                            batchExecuted = true;
                        }
                        else if (info.ticks < Infinity) {
                            if (!batchExecuted) {
                                logJump(`Block ${p.vec} visible in ${info.ticks} ticks. Triggering background interaction.`);
                                void this.performInteraction(p, { info, predictBlock: true });
                            }
                            break;
                        }
                        else {
                            break;
                        }
                    }
                }
            }
            void this.postInitAlignToPath(thisMove);
            if (this.jumpInfo != null) {
                if (tickCount >= this.jumpInfo.backTick) {
                    this.bot.setControlState('forward', false);
                    this.bot.setControlState('back', true);
                }
                if (tickCount >= this.jumpInfo.sprintTick) {
                    this.bot.setControlState('sprint', true);
                    this.bot.setControlState('forward', true);
                }
                else {
                    this.bot.setControlState('sprint', false);
                    this.bot.setControlState('forward', false);
                }
                if (tickCount >= this.jumpInfo.jumpTick) {
                    this.bot.setControlState('jump', this.bot.entity.position.y - thisMove.entryPos.y < 0.8);
                }
                else {
                    this.bot.setControlState('jump', false);
                }
            }
            if (this.bot.entity.position.y - thisMove.exitPos.y < -1.25)
                throw new exceptions_1.CancelError('ForwardJumpMove: too low (1)');
            if (tickCount > ((_b = (_a = this.jumpInfo) === null || _a === void 0 ? void 0 : _a.jumpTick) !== null && _b !== void 0 ? _b : 0) && this.bot.entity.onGround) {
                this.bot.setControlState('jump', false);
                this.bot.setControlState('sprint', true);
                if (this.bot.entity.position.y - thisMove.exitPos.y < -0.25) {
                    throw new exceptions_1.CancelError(`ForwardJumpMove: too low (2) ${this.bot.entity.position.y} ${thisMove.exitPos.y}`);
                }
            }
            return this.isComplete(thisMove);
        });
    }
}
exports.ForwardJumpExecutor = ForwardJumpExecutor;
class NewForwardJumpExecutor extends ForwardJumpExecutor {
    performPerTick(thisMove, tickCount, currentIndex, path) {
        const _super = Object.create(null, {
            performPerTick: { get: () => super.performPerTick }
        });
        return __awaiter(this, void 0, void 0, function* () {
            if (this.bot.entity.isInWater) {
                this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.exitPos.y);
                void this.postInitAlignToPath(thisMove);
                return this.isComplete(thisMove);
            }
            else {
                return yield _super.performPerTick.call(this, thisMove, tickCount, currentIndex, path);
            }
        });
    }
}
exports.NewForwardJumpExecutor = NewForwardJumpExecutor;
class ForwardDropDownExecutor extends movementExecutor_1.MovementExecutor {
    getRemainingPlacements() {
        if (!this.currentMove)
            return [];
        return this.currentMove.toPlace.filter(p => p.needToPerform(this.bot));
    }
    getRemainingBreaks() {
        if (!this.currentMove)
            return [];
        return this.currentMove.toBreak.filter(b => b.needToPerform(this.bot));
    }
    align(thisMove, tickCount, goal) {
        const _super = Object.create(null, {
            align: { get: () => super.align }
        });
        return __awaiter(this, void 0, void 0, function* () {
            if (this.bot.entity.isInWater) {
                return yield _super.align.call(this, thisMove, tickCount, goal);
            }
            return yield _super.align.call(this, thisMove, tickCount, goal);
        });
    }
    performInit(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            this.currentIndex = currentIndex;
            yield this.postInitAlignToPath(thisMove);
        });
    }
    identMove(thisMove, currentIndex, path) {
        let lastMove = thisMove;
        let nextMove = path[++currentIndex];
        if (nextMove === undefined)
            return --currentIndex;
        const pos = this.bot.entity.position;
        while (lastMove.entryPos.xzDistanceTo(pos) > lastMove.entryPos.xzDistanceTo(lastMove.exitPos) &&
            lastMove.entryPos.y > nextMove.exitPos.y &&
            nextMove.moveType.toPlaceLen() === 0) {
            if (++currentIndex >= path.length)
                return --currentIndex;
            lastMove = nextMove;
            nextMove = path[currentIndex];
        }
        if (lastMove.entryPos.y === nextMove.exitPos.y)
            currentIndex++;
        return --currentIndex;
    }
    performPerTick(thisMove, tickCount, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.cI != null && !(yield this.cI.allowExternalInfluence(this.bot, 0))) {
                this.bot.clearControlStates();
                return false;
            }
            if (this.cI == null) {
                const remainingBreaks = this.getRemainingBreaks();
                if (remainingBreaks.length > 0) {
                    const breakTarget = remainingBreaks[0];
                    logDrop(`[ForwardDrop] Block ${breakTarget.vec} needs breaking. Triggering background interaction.`);
                    this.bot.clearControlStates();
                    void this.performInteraction(breakTarget);
                    return false;
                }
                const remainingPlaces = this.getRemainingPlacements();
                if (remainingPlaces.length > 0) {
                    let batchExecuted = false;
                    for (const p of remainingPlaces) {
                        const info = yield p.performInfo(this.bot, 5);
                        if (info.ticks === 0) {
                            logDrop(`[ForwardDrop] Block ${p.vec} is visible NOW. Rapid-placing.`);
                            this.bot.clearControlStates();
                            yield this.performInteraction(p, { info, predictBlock: true, noAwait: true });
                            batchExecuted = true;
                        }
                        else if (info.ticks < Infinity) {
                            if (!batchExecuted) {
                                logDrop(`[ForwardDrop] Block ${p.vec} visible in ${info.ticks} ticks. Triggering background interaction.`);
                                void this.performInteraction(p, { info, predictBlock: true });
                            }
                            break;
                        }
                        else {
                            break;
                        }
                    }
                    if (batchExecuted)
                        return false;
                }
            }
            if (false) {
                const idx = this.identMove(thisMove, currentIndex, path);
                this.currentIndex = Math.max(idx, this.currentIndex);
                const nextMove = path[this.currentIndex];
                if (currentIndex !== this.currentIndex && nextMove !== undefined) {
                    void this.postInitAlignToPath(thisMove, nextMove);
                    if (this.isComplete(thisMove, nextMove))
                        return this.currentIndex - currentIndex;
                }
                else {
                    void this.postInitAlignToPath(thisMove, thisMove);
                    if (this.isComplete(thisMove, thisMove))
                        return true;
                }
            }
            else {
                if (currentIndex < path.length)
                    void this.postInitAlignToPath(thisMove);
                else
                    void this.postInitAlignToPath(thisMove);
                if (this.isComplete(thisMove))
                    return true;
            }
            return false;
        });
    }
    getLandingBlock(node, dir) {
        let blockLand = this.getBlockInfo(node, dir.x, -2, dir.z);
        while (blockLand.position.y > this.bot.game.minY) {
            if (blockLand.liquid && blockLand.walkthrough)
                return blockLand;
            if (blockLand.physical) {
                if (node.y - blockLand.position.y <= this.settings.maxDropDown)
                    return this.getBlockInfo(blockLand.position, 0, 1, 0);
                return null;
            }
            if (!blockLand.walkthrough)
                return null;
            blockLand = this.getBlockInfo(blockLand.position, 0, -1, 0);
        }
        return null;
    }
}
exports.ForwardDropDownExecutor = ForwardDropDownExecutor;
class NewForwardDropDownExecutor extends ForwardDropDownExecutor {
    performPerTick(thisMove, tickCount, currentIndex, path) {
        const _super = Object.create(null, {
            performPerTick: { get: () => super.performPerTick }
        });
        return __awaiter(this, void 0, void 0, function* () {
            if (this.bot.entity.isInWater) {
                this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.exitPos.y);
                return this.isComplete(thisMove);
            }
            else {
                return yield _super.performPerTick.call(this, thisMove, tickCount, currentIndex, path);
            }
        });
    }
}
exports.NewForwardDropDownExecutor = NewForwardDropDownExecutor;
class StraightDownExecutor extends movementExecutor_1.MovementExecutor {
    getRemainingBreaks() {
        if (!this.currentMove)
            return [];
        return this.currentMove.toBreak.filter(b => b.needToPerform(this.bot));
    }
    align(thisMove) {
        this.bot.clearControlStates();
        const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
        if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && xzVel.norm() < 0.1) {
            return true;
        }
        void this.lookAt(thisMove.exitPos);
        if (xzVel.normalize().dot(this.bot.util.getViewDir()) <= 0 || this.bot.entity.position.distanceTo(thisMove.exitPos) > 0.5) {
            this.bot.setControlState('forward', true);
            this.bot.setControlState('sprint', true);
            this.bot.setControlState('sneak', false);
        }
        else {
            this.bot.setControlState('forward', true);
            this.bot.setControlState('sprint', false);
            this.bot.setControlState('sneak', true);
        }
        return false;
    }
    performInit(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    performPerTick(thisMove, tickCount, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.cI != null && !(yield this.cI.allowExternalInfluence(this.bot, 0))) {
                this.bot.clearControlStates();
                return false;
            }
            if (this.cI == null) {
                const remainingBreaks = this.getRemainingBreaks();
                if (remainingBreaks.length > 0) {
                    const breakTarget = remainingBreaks[0];
                    logDown(`[StraightDown] Block ${breakTarget.vec} needs breaking. Triggering background interaction.`);
                    this.bot.clearControlStates();
                    void this.performInteraction(breakTarget);
                    return false;
                }
            }
            if (this.bot.entity.isInWater) {
                return tickCount > 0 && this.bot.entity.position.y <= thisMove.exitPos.y;
            }
            if (this.bot.entity.position.y < thisMove.exitPos.y)
                throw new exceptions_1.CancelError('StraightDown: too low');
            return tickCount > 0 && this.bot.entity.onGround && this.bot.entity.position.y === thisMove.exitPos.y;
        });
    }
}
exports.StraightDownExecutor = StraightDownExecutor;
class StraightUpExecutor extends movementExecutor_1.MovementExecutor {
    isAlreadyCompleted(thisMove, tickCount, goal) {
        return this.bot.entity.position.y >= thisMove.exitPos.y;
    }
    _getEntryCenter(thisMove) {
        return thisMove.entryPos.floored().offset(0.5, 0, 0.5);
    }
    _getExitCenter(thisMove) {
        return thisMove.exitPos.floored().offset(0.5, 0, 0.5);
    }
    _getHorizontalOffsetToCenter(center) {
        return center.minus(this.bot.entity.position).offset(0, -(center.y - this.bot.entity.position.y), 0);
    }
    _getHorizontalVelocity() {
        return this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);
    }
    _isMostlyCentered(thisMove) {
        const center = this._getEntryCenter(thisMove);
        return this.bot.entity.position.xzDistanceTo(center) <= StraightUpExecutor.CENTER_EPS;
    }
    _clearLateralControls() {
        this.bot.setControlState('forward', false);
        this.bot.setControlState('back', false);
        this.bot.setControlState('left', false);
        this.bot.setControlState('right', false);
        this.bot.setControlState('sprint', false);
        this.bot.setControlState('sneak', false);
    }
    _faceCenterYaw(thisMove) {
        const center = this._getEntryCenter(thisMove);
        const pos = this.bot.entity.position;
        const yaw = Math.atan2(-(center.x - pos.x), -(center.z - pos.z));
        this.bot.entity.yaw = yaw;
    }
    _applyGroundCentering(thisMove) {
        const center = this._getEntryCenter(thisMove);
        const offset = this._getHorizontalOffsetToCenter(center);
        const dist = offset.norm();
        this._faceCenterYaw(thisMove);
        if (dist <= StraightUpExecutor.CENTER_EPS) {
            this._clearLateralControls();
            return true;
        }
        const xzVel = this._getHorizontalVelocity();
        const velNorm = xzVel.norm();
        const dirToCenter = dist > 1e-6 ? offset.normalize() : new vec3_1.Vec3(0, 0, 0);
        const velDir = velNorm > 1e-6 ? xzVel.normalize() : null;
        const velDot = velDir != null ? velDir.dot(dirToCenter) : 1;
        const shouldCorrectHard = dist > StraightUpExecutor.FAR_CENTER_DIST ||
            velNorm < 0.03 ||
            velDot < StraightUpExecutor.BAD_VEL_DOT;
        this.bot.setControlState('forward', true);
        this.bot.setControlState('back', false);
        this.bot.setControlState('left', false);
        this.bot.setControlState('right', false);
        if (shouldCorrectHard) {
            this.bot.setControlState('sprint', true);
            this.bot.setControlState('sneak', false);
        }
        else {
            this.bot.setControlState('sprint', false);
            this.bot.setControlState('sneak', true);
        }
        return false;
    }
    _applyVerticalAscentControls(thisMove) {
        this.bot.setControlState('jump', true);
        if (this._isMostlyCentered(thisMove)) {
            this._clearLateralControls();
            return true;
        }
        this.bot.setControlState('forward', true);
        this.bot.setControlState('back', false);
        this.bot.setControlState('left', false);
        this.bot.setControlState('right', false);
        this.bot.setControlState('sprint', false);
        this.bot.setControlState('sneak', false);
        this._faceCenterYaw(thisMove);
        return false;
    }
    align(thisMove) {
        return __awaiter(this, void 0, void 0, function* () {
            const inWater = this.bot.entity.isInWater;
            if (!this.bot.entity.onGround || inWater) {
                return this._applyVerticalAscentControls(thisMove);
            }
            return this._applyGroundCentering(thisMove);
        });
    }
    performInit(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            this.bot.clearControlStates();
            for (const breakH of this.toBreak()) {
                yield this.lookAt(breakH.vec.offset(0.5, 0.5, 0.5));
                yield this.performInteraction(breakH);
            }
            if (thisMove.toPlace.length > 1) {
                throw new exceptions_1.CancelError('StraightUp: toPlace.length > 1');
            }
            const place = thisMove.toPlace[0];
            if (place != null) {
                yield this.lookAt(place.vec.offset(0.5, 0.5, 0.5));
                this.bot.setControlState('jump', true);
                void this.performInteraction(place);
            }
        });
    }
    performPerTick(thisMove, tickCount, currentIndex, path) {
        if (this.bot.entity.position.y < thisMove.entryPos.y) {
            throw new exceptions_1.CancelError('StraightUp: too low');
        }
        const inWater = this.bot.entity.isInWater;
        if (!this.bot.entity.onGround || inWater) {
            this._applyVerticalAscentControls(thisMove);
        }
        else {
            this._applyGroundCentering(thisMove);
        }
        this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.exitPos.y);
        if (inWater) {
            return tickCount > 0 && this.bot.entity.position.y >= thisMove.exitPos.y;
        }
        return tickCount > 0 &&
            this.bot.entity.onGround &&
            this.bot.entity.position.y >= thisMove.exitPos.y;
    }
}
exports.StraightUpExecutor = StraightUpExecutor;
StraightUpExecutor.CENTER_EPS = 0.2;
StraightUpExecutor.FAR_CENTER_DIST = 0.45;
StraightUpExecutor.BAD_VEL_DOT = 0.25;
class ParkourForwardExecutor extends movementExecutor_1.MovementExecutor {
    constructor() {
        super(...arguments);
        this.shitterTwo = new movementUtils_1.ParkourJumpHelper(this.bot, this.world);
        this.executing = false;
        this.lockedYaw = null;
        this._lookAtInFlight = null;
        this._pendingLookTarget = null;
    }
    isComplete(startMove, endMove, opts = {}) {
        const ret = super.isComplete(startMove, endMove, opts);
        return ret;
    }
    _debugLog(...args) {
        logParkour(...args);
    }
    _lockCurrentYaw() {
        this.lockedYaw = this.bot.entity.yaw;
    }
    _clearLockedYaw() {
        this.lockedYaw = null;
    }
    _applyLockedYaw() {
        if (this.lockedYaw != null) {
            this.bot.entity.yaw = this.lockedYaw;
        }
    }
    _queueLookAtSync(target) {
        this._pendingLookTarget = target;
        if (this._lookAtInFlight != null) {
            return this._lookAtInFlight;
        }
        this._lookAtInFlight = (() => __awaiter(this, void 0, void 0, function* () {
            try {
                while (this._pendingLookTarget != null) {
                    const nextTarget = this._pendingLookTarget;
                    this._pendingLookTarget = null;
                    yield this.lookAt(nextTarget, true);
                }
            }
            finally {
                this._lookAtInFlight = null;
            }
        }))();
        return this._lookAtInFlight;
    }
    _getTargetBlock(thisMove) {
        return thisMove.exitPos.offset(0, -1, 0);
    }
    _getTargetEyeVec(target) {
        return this.shitterTwo.findGoalVertex(mineflayer_util_plugin_1.AABB.fromBlockPos(target));
    }
    _getUnderlyingBbs(thisMove) {
        const bbs = (0, movementUtils_1.getUnderlyingBBs)(this.world, this.bot.entity.position, 0.6);
        if (bbs.length === 0) {
            bbs.push(mineflayer_util_plugin_1.AABB.fromBlockPos(thisMove.entryPos.offset(0, -1, 0)));
        }
        return bbs;
    }
    _getJumpState(thisMove) {
        const target = this._getTargetBlock(thisMove);
        const targetEyeVec = this._getTargetEyeVec(target);
        const bbs = this._getUnderlyingBbs(thisMove);
        return {
            target,
            targetEyeVec,
            canDirectJump: this.shitterTwo.simForwardMove(target, targetEyeVec),
            canJumpFromEdge: this.shitterTwo.simJumpFromEdge(bbs, target),
            fallOffEdge: this.shitterTwo.simFallOffEdge(target)
        };
    }
    _debugJumpState(label, jumpState) {
        var _a;
        var _b;
        (_a = (_b = this)._lastTime) !== null && _a !== void 0 ? _a : (_b._lastTime = 0);
        this._debugLog(label, performance.now() - this._lastTime);
        this._debugLog('can we make it?', 'jump right now:', jumpState.canDirectJump, 'jump at ledge:', jumpState.canJumpFromEdge, 'fallOffEdge:', jumpState.fallOffEdge);
        this._debugLog('current bot info:', this.bot.entity.yaw, this.bot.entity.position, this.bot.entity.velocity);
        this._debugLog('yaw delta:', this._yawDeltaAbs(this._desiredYawTo(jumpState.targetEyeVec)));
        this._lastTime = performance.now();
    }
    _setApproachControls() {
        this.bot.setControlState('sprint', true);
        this.bot.setControlState('forward', true);
        this.bot.setControlState('jump', false);
        this.bot.setControlState('sneak', false);
    }
    _clearApproachControls() {
        this.bot.setControlState('forward', false);
        this.bot.setControlState('back', false);
        this.bot.setControlState('left', false);
        this.bot.setControlState('right', false);
        this.bot.setControlState('jump', false);
        this.bot.setControlState('sprint', false);
        this.bot.setControlState('sneak', false);
    }
    _startJumpExecution() {
        this.lockedYaw = this.bot.entity.yaw;
        this.executing = true;
        this.bot.setControlState('sprint', true);
        this.bot.setControlState('forward', true);
        this.bot.setControlState('jump', true);
        this.bot.setControlState('sneak', false);
    }
    _desiredYawTo(target) {
        const dx = target.x - this.bot.entity.position.x;
        const dz = target.z - this.bot.entity.position.z;
        return Math.atan2(-dx, -dz);
    }
    _yawDeltaAbs(targetYaw) {
        let delta = targetYaw - this.bot.entity.yaw;
        while (delta > Math.PI)
            delta -= Math.PI * 2;
        while (delta < -Math.PI)
            delta += Math.PI * 2;
        return Math.abs(delta);
    }
    _isYawAlignedForApproach(target) {
        const wantedYaw = this._desiredYawTo(target);
        return this._yawDeltaAbs(wantedYaw) <= ParkourForwardExecutor.APPROACH_YAW_EPS;
    }
    _tryApproachWhenAligned(targetEyeVec) {
        void this._queueLookAtSync(targetEyeVec);
        if (!this._isYawAlignedForApproach(targetEyeVec)) {
            this._clearApproachControls();
            return false;
        }
        this._setApproachControls();
        return true;
    }
    align(thisMove, tickCount, goal) {
        return __awaiter(this, void 0, void 0, function* () {
            this.executing = false;
            this._clearLockedYaw();
            const jumpState = this._getJumpState(thisMove);
            const { target, targetEyeVec, canDirectJump, canJumpFromEdge, fallOffEdge } = jumpState;
            void this._queueLookAtSync(targetEyeVec);
            this._debugJumpState('align', jumpState);
            if (fallOffEdge) {
                this.executing = true;
                this._lockCurrentYaw();
                this.bot.setControlState('sprint', true);
                this.bot.setControlState('forward', true);
                this.bot.setControlState('jump', false);
                return true;
            }
            if (canDirectJump) {
                if (!this._isYawAlignedForApproach(targetEyeVec)) {
                    this._clearApproachControls();
                    return false;
                }
                this._startJumpExecution();
                return true;
            }
            if (canJumpFromEdge) {
                this._tryApproachWhenAligned(targetEyeVec);
                return false;
            }
            if (!this.bot.entity.onGround && this.bot.entity.position.y <= thisMove.entryPos.y) {
                throw new exceptions_1.CancelError(`Too low y level! bot: ${this.bot.entity.position.y} | target: ${thisMove.entryPos.y}`);
            }
            if (this.bot.entity.onGround) {
                this.bot.clearControlStates();
            }
            this._tryApproachWhenAligned(targetEyeVec);
            return false;
        });
    }
    performInit(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            this.executing = false;
            this._clearLockedYaw();
            const target = this._getTargetBlock(thisMove);
            const targetEyeVec = this._getTargetEyeVec(target);
            void this._queueLookAtSync(targetEyeVec);
        });
    }
    performPerTick(thisMove, tickCount, currentIndex, path) {
        if (this.executing) {
            this.bot.setControlState('jump', false);
            this._applyLockedYaw();
            return this.isComplete(thisMove);
        }
        const jumpState = this._getJumpState(thisMove);
        const { targetEyeVec, canDirectJump, canJumpFromEdge, fallOffEdge } = jumpState;
        this._debugJumpState('tick', jumpState);
        if (this.bot.entity.position.y < thisMove.exitPos.y - 1) {
            throw new exceptions_1.CancelError('y level: too low!');
        }
        void this._queueLookAtSync(targetEyeVec);
        if (canDirectJump || fallOffEdge) {
            if (!this._isYawAlignedForApproach(targetEyeVec)) {
                this._clearApproachControls();
                return false;
            }
            if (canDirectJump)
                this._startJumpExecution();
            else
                this._setApproachControls();
            return false;
        }
        if (canJumpFromEdge) {
            this._clearLockedYaw();
            this._tryApproachWhenAligned(targetEyeVec);
            return false;
        }
        if (!this.bot.entity.onGround) {
            this._clearLockedYaw();
            throw new exceptions_1.CancelError('ParkourExecutor: missed jump window');
        }
        this._clearLockedYaw();
        this.bot.clearControlStates();
        throw new exceptions_1.CancelError('ParkourExecutor: will not make this jump!');
    }
}
exports.ParkourForwardExecutor = ParkourForwardExecutor;
ParkourForwardExecutor.APPROACH_YAW_EPS = 0.16;
//# sourceMappingURL=movementExecutors.js.map