"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MovementHandler = exports.MovementProvider = void 0;
const movement_1 = require("./movement");
const vec3_1 = require("vec3");
class MovementProvider extends movement_1.Movement {
    constructor(bot, world, settings = {}) {
        super(bot, world, settings);
        this.localData = [];
    }
    loadLocalData(orgPos, boundaries, arr, clear) {
        this.orgPos = orgPos;
        this.localData = arr;
        this.boundaries = boundaries;
        this.halfway = [Math.floor(boundaries[0] / 2), Math.floor(boundaries[1] / 2), Math.floor(boundaries[2] / 2)];
        this.toClear = clear;
    }
    getBlockInfo(pos, dx, dy, dz) {
        const yes = new vec3_1.Vec3(Math.floor(pos.x) + dx, Math.floor(pos.y) + dy, Math.floor(pos.z) + dz);
        return this.getBlockInfoRaw(yes);
    }
    getBlockInfoRaw(yes) {
        let move = this.currentMove;
        let i = 0;
        while (move !== undefined && i++ < 3) {
            for (const m of move.toPlace) {
                if (m.x === yes.x && m.y === yes.y && m.z === yes.z) {
                    return m.blockInfo;
                }
            }
            for (const m of move.toBreak) {
                if (m.x === yes.x && m.y === yes.y && m.z === yes.z) {
                    return m.blockInfo;
                }
            }
            move = move.parent;
        }
        const wantedDx = yes.x - this.orgPos.x + this.halfway[0];
        const wantedDz = yes.z - this.orgPos.z + this.halfway[1];
        const wantedDy = yes.y - this.orgPos.y + this.halfway[2];
        if (wantedDx < 0 ||
            wantedDx >= this.boundaries[0] ||
            wantedDz < 0 ||
            wantedDz >= this.boundaries[1] ||
            wantedDy < 0 ||
            wantedDy >= this.boundaries[2]) {
            return this.world.getBlockInfo(yes);
        }
        const idx = wantedDx * this.boundaries[2] * this.boundaries[1] + wantedDz * this.boundaries[2] + wantedDy;
        const data = this.localData[idx];
        if (data !== null) {
            return data;
        }
        const ret = this.world.getBlockInfo(yes);
        this.localData[idx] = ret;
        return ret;
    }
}
exports.MovementProvider = MovementProvider;
class MovementHandler {
    constructor(bot, world, recMovement) {
        this.boundaries = [7, 7, 7];
        this.halfway = [Math.floor(this.boundaries[0] / 2), Math.floor(this.boundaries[1] / 2), Math.floor(this.boundaries[2] / 2)];
        this.maxBound = this.boundaries[0] * this.boundaries[1] * this.boundaries[2];
        this.toClear = new Set();
        this.localData = new Array(this.maxBound).fill(null, 0, this.maxBound);
        this.swapArray = new Array(this.maxBound).fill(null);
        this.swapSet = new Array(this.maxBound);
        this.world = world;
        this.recognizedMovements = recMovement;
    }
    static create(bot, world, recMovement, settings = {}) {
        const opts = Object.assign({}, movement_1.DEFAULT_MOVEMENT_OPTS, settings);
        return new MovementHandler(bot, world, [...recMovement.keys()].map((M) => new M(bot, world, opts)));
    }
    sanitize() {
        return !!this.goal;
    }
    loadGoal(goal) {
        this.goal = goal;
    }
    resetLocalData() {
        for (let i = 0; i < this.maxBound; i++) {
            this.localData[i] = null;
        }
    }
    shiftLocalData(orgPos, newPos) {
        const diff = newPos.minus(orgPos);
        let swapIdx = 0;
        for (let idx = 0; idx < this.maxBound; idx++) {
            if (this.localData[idx] === null)
                continue;
            const x = Math.floor(idx / (this.boundaries[2] * this.boundaries[1]));
            const rest = idx % (this.boundaries[2] * this.boundaries[1]);
            const z = Math.floor(rest / this.boundaries[2]);
            const y = rest % this.boundaries[2];
            const newX = x - diff.x;
            const newY = y - diff.y;
            const newZ = z - diff.z;
            if (newX >= 0 && newX < this.boundaries[0] && newY >= 0 && newY < this.boundaries[2] && newZ >= 0 && newZ < this.boundaries[1]) {
                const newIdx = newX * this.boundaries[2] * this.boundaries[1] + newZ * this.boundaries[2] + newY;
                this.swapArray[newIdx] = this.localData[idx];
                this.swapSet[swapIdx++] = newIdx;
            }
            this.localData[idx] = null;
        }
        for (let i = 0; i < swapIdx; i++) {
            const idx = this.swapSet[i];
            this.localData[idx] = this.swapArray[idx];
        }
        if (swapIdx > 0)
            MovementHandler.count++;
        MovementHandler.totCount++;
    }
    preloadInteractData(orgPos, move) {
        let move1 = move;
        let exit = false;
        const seen = new Set();
        while (move1 !== undefined && !exit) {
            const wantedDx = move1.x - orgPos.x + this.halfway[0];
            const wantedDz = move1.z - orgPos.z + this.halfway[1];
            const wantedDy = move1.y - orgPos.y + this.halfway[2];
            if (wantedDx < 0 || wantedDx >= this.boundaries[0] || wantedDz < 0 || wantedDz >= this.boundaries[1] || wantedDy < 0 || wantedDy >= this.boundaries[2]) {
                exit = true;
            }
            for (const m of move1.toPlace) {
                const wantedDx = m.x - orgPos.x + this.halfway[0];
                const wantedDz = m.z - orgPos.z + this.halfway[1];
                const wantedDy = m.y - orgPos.y + this.halfway[2];
                if (wantedDx < 0 || wantedDx >= this.boundaries[0] || wantedDz < 0 || wantedDz >= this.boundaries[1] || wantedDy < 0 || wantedDy >= this.boundaries[2]) {
                    exit = true;
                }
                else {
                    const idx = wantedDx * this.boundaries[2] * this.boundaries[1] + wantedDz * this.boundaries[2] + wantedDy;
                    if (!seen.has(idx)) {
                        this.localData[idx] = m.blockInfo;
                        seen.add(idx);
                    }
                }
            }
            for (const m of move1.toBreak) {
                const wantedDx = m.x - orgPos.x + this.halfway[0];
                const wantedDz = m.z - orgPos.z + this.halfway[1];
                const wantedDy = m.y - orgPos.y + this.halfway[2];
                if (wantedDx < 0 || wantedDx >= this.boundaries[0] || wantedDz < 0 || wantedDz >= this.boundaries[1] || wantedDy < 0 || wantedDy >= this.boundaries[2]) {
                    exit = true;
                }
                else {
                    const idx = wantedDx * this.boundaries[2] * this.boundaries[1] + wantedDz * this.boundaries[2] + wantedDy;
                    if (!seen.has(idx)) {
                        this.localData[idx] = m.blockInfo;
                        seen.add(idx);
                    }
                }
            }
            move1 = move1.parent;
        }
    }
    getNeighbors(currentMove, closed) {
        var _a;
        const moves = [];
        const pos = currentMove.entryPos.floored();
        const old = (_a = this.lastPos) !== null && _a !== void 0 ? _a : pos;
        this.shiftLocalData(old, pos);
        this.preloadInteractData(pos, currentMove);
        this.lastPos = pos;
        for (const newMove of this.recognizedMovements) {
            newMove.loadMove(currentMove);
            newMove.loadLocalData(pos, this.boundaries, this.localData, this.toClear);
            newMove.provideMovements(currentMove, moves, this.goal, closed);
        }
        return moves;
    }
}
exports.MovementHandler = MovementHandler;
MovementHandler.count = 0;
MovementHandler.totCount = 0;
//# sourceMappingURL=movementProvider.js.map