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
exports.BridgeExecutor = void 0;
const vec3_1 = require("vec3");
const movementExecutor_1 = require("./movementExecutor");
const interactionUtils_1 = require("./interactionUtils");
const exceptions_1 = require("../exceptions");
const debug = require('debug');
const log = debug('minecraft-pathfinding:BridgeExecutor');
const RAD75 = 75 * (Math.PI / 180);
const RAD_MAX_TURN = 0.4;
const LERP_YAW = 0.65;
const LERP_PITCH = 0.85;
const EDGE_PROBE_DIST = 0.28;
const PHASE_REACH_DIST = 0.6;
const PLACE_COOLDOWN_MS = 110;
const STALL_TIMEOUT_MS = 500;
class BridgeExecutor extends movementExecutor_1.MovementExecutor {
    constructor(bot, world, settings = {}) {
        super(bot, world, settings);
        this.phases = [];
        this.phaseIdx = 0;
        this.placementCooldownUntilMs = 0;
        this.stallStartMs = 0;
    }
    align(thisMove, tickCount, goal) {
        const _super = Object.create(null, {
            align: { get: () => super.align }
        });
        return __awaiter(this, void 0, void 0, function* () {
            if (this._inWater()) {
                yield _super.align.call(this, thisMove, tickCount, goal);
                this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.entryPos.y);
                return this.isInitAligned(thisMove);
            }
            void this.postInitAlignToPath(thisMove);
            if (!this.bot.entity.onGround && this.bot.entity.position.y > thisMove.entryPos.y + 0.1)
                return false;
            return this.isInitAligned(thisMove);
        });
    }
    performInit(thisMove, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            this.bot.clearControlStates();
            this.phaseIdx = 0;
            this.placementCooldownUntilMs = 0;
            this.stallStartMs = 0;
            const entry = thisMove.entryPos;
            const exit = thisMove.exitPos;
            this.phases = this._buildPhases(entry, exit, thisMove.toPlace);
            log(`[BridgeExec] init: ${this.phases.length} phase(s), entry=${entry}, exit=${exit}`);
            yield this.lookAtPathPos(exit);
        });
    }
    performPerTick(thisMove, tickCount, currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            const bot = this.bot;
            const pos = bot.entity.position;
            const now = Date.now();
            if (this._inWater()) {
                if (pos.y < thisMove.exitPos.y)
                    bot.setControlState('jump', true);
                void this.postInitAlignToPath(thisMove);
                return this._allPlaced(thisMove) && this.isComplete(thisMove);
            }
            if (!bot.entity.onGround && pos.y < Math.round(thisMove.entryPos.y) - 3) {
                throw new exceptions_1.CancelError('BridgeExecutor: fell off path');
            }
            const xzVel = Math.sqrt(Math.pow(bot.entity.velocity.x, 2) + Math.pow(bot.entity.velocity.z, 2));
            const collidedH = bot.entity.isCollidedHorizontally;
            if (!bot.entity.onGround && (collidedH || xzVel < 0.01)) {
                if (this.stallStartMs === 0)
                    this.stallStartMs = now;
                if (now - this.stallStartMs > STALL_TIMEOUT_MS)
                    throw new exceptions_1.CancelError('BridgeExecutor: stalled');
            }
            else {
                this.stallStartMs = 0;
            }
            yield this._drainBreaks(thisMove);
            const phase = this.phases[this.phaseIdx];
            if (phase == null) {
                return this._allPlaced(thisMove) && this.isComplete(thisMove);
            }
            if (phase.type === 'walk') {
                this._execWalkPhase(phase);
                if (this._hasCrossedTarget(pos, phase)) {
                    log(`[BridgeExec] walk phase ${this.phaseIdx} complete`);
                    this.phaseIdx++;
                }
                return false;
            }
            this._applyYawPitch(phase.dir);
            const atEdge = this._atEdge(pos, phase.dir);
            const voidAhead = this._voidAhead(pos, phase.dir);
            bot.setControlState('sneak', atEdge && voidAhead);
            bot.setControlState('sprint', !atEdge && bot.food > 6);
            bot.setControlState('forward', true);
            bot.setControlState('jump', false);
            if (atEdge && voidAhead && now >= this.placementCooldownUntilMs) {
                const placed = this._attemptImmediatePlacement(thisMove);
                if (placed) {
                    this.placementCooldownUntilMs = now + PLACE_COOLDOWN_MS;
                    bot.setControlState('sneak', false);
                    log(`[BridgeExec] placed block, phase=${this.phaseIdx}, placed so far=${thisMove.toPlace.filter(p => p.done).length}`);
                }
            }
            if (this._hasCrossedTarget(pos, phase)) {
                log(`[BridgeExec] bridge phase ${this.phaseIdx} complete`);
                this.phaseIdx++;
            }
            if (this.phaseIdx >= this.phases.length) {
                return this._allPlaced(thisMove) && this.isComplete(thisMove);
            }
            return false;
        });
    }
    reset() {
        this._clearSuppressReset();
        super.reset();
    }
    _buildPhases(entry, exit, toPlace) {
        const dx = Math.round(exit.x - entry.x);
        const dz = Math.round(exit.z - entry.z);
        const absDx = Math.abs(dx);
        const absDz = Math.abs(dz);
        const signX = Math.sign(dx);
        const signZ = Math.sign(dz);
        const flEntry = entry.floored().offset(0.5, 0, 0.5);
        const flExit = exit.floored().offset(0.5, 0, 0.5);
        if (absDx === 0 && absDz === 0) {
            const dir = new vec3_1.Vec3(0, 0, 1);
            return [{ type: 'bridge', start: flEntry, target: flExit, dir, isDiagonal: false }];
        }
        if (absDx === 0 || absDz === 0) {
            const dir = new vec3_1.Vec3(signX, 0, signZ);
            return [{ type: 'bridge', start: flEntry, target: flExit, dir, isDiagonal: false }];
        }
        if (absDx === absDz) {
            const dir = new vec3_1.Vec3(signX, 0, signZ).normalize();
            return [{ type: 'bridge', start: flEntry, target: flExit, dir, isDiagonal: true }];
        }
        const minComp = Math.min(absDx, absDz);
        const maxComp = Math.max(absDx, absDz);
        const lateralSteps = maxComp - minComp;
        const majorIsX = absDx >= absDz;
        const cardDir = majorIsX ? new vec3_1.Vec3(signX, 0, 0) : new vec3_1.Vec3(0, 0, signZ);
        const diagDir = new vec3_1.Vec3(signX, 0, signZ).normalize();
        const needsBridgeSet = new Set();
        for (const p of toPlace) {
            needsBridgeSet.add(`${Math.floor(p.x)},${Math.floor(p.z)}`);
        }
        if (this._prewalkFeasible(entry, cardDir, lateralSteps, needsBridgeSet)) {
            const prewalkEnd = flEntry.offset(cardDir.x * lateralSteps, 0, cardDir.z * lateralSteps);
            log(`[BridgeExec] strategy=prewalk-then-diagonal, lateralSteps=${lateralSteps}`);
            return [
                { type: 'walk', start: flEntry, target: prewalkEnd, dir: cardDir, isDiagonal: false },
                { type: 'bridge', start: prewalkEnd, target: flExit, dir: diagDir, isDiagonal: true }
            ];
        }
        const diagSteps = minComp;
        const diagEnd = flEntry.offset(signX * diagSteps, 0, signZ * diagSteps);
        log(`[BridgeExec] strategy=diagonal-then-cardinal, diagSteps=${diagSteps}, cardSteps=${lateralSteps}`);
        return [
            { type: 'bridge', start: flEntry, target: diagEnd, dir: diagDir, isDiagonal: true },
            { type: 'bridge', start: diagEnd, target: flExit, dir: cardDir, isDiagonal: false }
        ];
    }
    _prewalkFeasible(entry, cardDir, steps, needsBridgeSet) {
        for (let s = 1; s <= steps; s++) {
            const px = Math.floor(entry.x) + Math.round(cardDir.x * s);
            const pz = Math.floor(entry.z) + Math.round(cardDir.z * s);
            if (needsBridgeSet.has(`${px},${pz}`))
                return false;
            const ground = this.getBlockInfo({ x: px, y: entry.y, z: pz }, 0, -1, 0);
            if (!ground.physical && !ground.liquid)
                return false;
        }
        return true;
    }
    _hasCrossedTarget(pos, phase) {
        const dir = phase.dir;
        const toTarget = new vec3_1.Vec3(phase.target.x - phase.start.x, 0, phase.target.z - phase.start.z);
        const toBot = new vec3_1.Vec3(pos.x - phase.start.x, 0, pos.z - phase.start.z);
        const targetProj = toTarget.dot(dir);
        const botProj = toBot.dot(dir);
        return botProj >= targetProj - 0.12;
    }
    _execWalkPhase(phase) {
        const bot = this.bot;
        const target = phase.target;
        const yaw = Math.atan2(-(target.x - bot.entity.position.x), -(target.z - bot.entity.position.z));
        this._lerpRotation(yaw, -0.2);
        bot.setControlState('forward', true);
        bot.setControlState('sprint', bot.food > 6);
        bot.setControlState('sneak', false);
        bot.setControlState('jump', false);
    }
    _atEdge(pos, dir) {
        const checkX = pos.x + dir.x * EDGE_PROBE_DIST;
        const checkZ = pos.z + dir.z * EDGE_PROBE_DIST;
        const support = this.getBlockInfo({ x: checkX, y: pos.y, z: checkZ }, 0, -1, 0);
        return !support.physical && !support.liquid;
    }
    _voidAhead(pos, dir) {
        const ahead = this.getBlockInfo({ x: pos.x + dir.x * 0.6, y: pos.y, z: pos.z + dir.z * 0.6 }, 0, -1, 0);
        return !ahead.physical && !ahead.liquid;
    }
    _attemptImmediatePlacement(thisMove) {
        for (const place of thisMove.toPlace) {
            if (place.done)
                continue;
            if (place.isPerforming)
                continue;
            if (!(place instanceof interactionUtils_1.PlaceHandler))
                continue;
            if (!place.needToPerform(this.bot))
                continue;
            const item = place.getItem(this.bot);
            if (item == null)
                continue;
            if (place.getCurrentItem(this.bot) !== item) {
                void place.equipItem(this.bot, item);
                return false;
            }
            void this.bot.rightClick();
            place._done = true;
            place._internalLock = false;
            return true;
        }
        return false;
    }
    _drainBreaks(thisMove) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const brk of thisMove.toBreak) {
                if (brk.done || brk.isPerforming)
                    continue;
                if (!(brk instanceof interactionUtils_1.BreakHandler))
                    continue;
                if (!brk.needToPerform(this.bot))
                    continue;
                const block = brk.getBlock(this.world);
                const item = block != null ? brk.getItem(this.bot, block) : null;
                void brk._perform(this.bot, item, {}).catch(() => { });
                return;
            }
        });
    }
    _applyYawPitch(dir) {
        const targetYaw = Math.atan2(-dir.x, -dir.z);
        const targetPitch = -RAD75;
        this._lerpRotation(targetYaw, targetPitch);
    }
    _lerpRotation(targetYaw, targetPitch) {
        const curYaw = this.bot.entity.yaw;
        const curPitch = this.bot.entity.pitch;
        const rawDelta = ((targetYaw - curYaw) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
        const clampedDelta = Math.abs(rawDelta) > RAD_MAX_TURN ? Math.sign(rawDelta) * RAD_MAX_TURN : rawDelta;
        this.bot.entity.yaw = curYaw + clampedDelta * LERP_YAW;
        this.bot.entity.pitch = curPitch + (targetPitch - curPitch) * LERP_PITCH;
    }
    _allPlaced(thisMove) {
        return thisMove.toPlace.every(p => p.done);
    }
    _inWater() {
        if (this.bot.entity.isInWater)
            return true;
        if (this.bot.entity.onGround)
            return false;
        return this.getBlockInfo(this.bot.entity.position, 0, -0.6, 0).liquid;
    }
    _clearSuppressReset() {
        const pf = this.bot.pathfinder;
        if (pf != null)
            pf.suppressPathReset = false;
    }
}
exports.BridgeExecutor = BridgeExecutor;
//# sourceMappingURL=bridgeExecutor.js.map