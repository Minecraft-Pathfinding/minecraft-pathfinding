"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Move = void 0;
const vec3_1 = require("vec3");
const emptyVec = new vec3_1.Vec3(0, 0, 0);
class Move {
    constructor(x, y, z, toPlace, toBreak, remainingBlocks, cost, moveType, entryPos, entryVel, exitPos, exitVel, parent) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.remainingBlocks = remainingBlocks;
        this.cost = cost;
        this.moveType = moveType;
        this.entryPos = entryPos;
        this.entryVel = entryVel;
        this.exitPos = exitPos;
        this.exitVel = exitVel;
        this.parent = parent;
        this.x = Math.floor(x);
        this.y = Math.floor(y);
        this.z = Math.floor(z);
        this.hash = `${this.x},${this.y},${this.z}`;
        this.targetPos = this.exitPos;
        this.cachedVec = new vec3_1.Vec3(this.x, this.y, this.z);
        Object.freeze(this.cachedVec);
        this.toPlace = toPlace;
        this.toBreak = toBreak;
    }
    static startMove(type, pos, vel, remainingBlocks) {
        return new Move(pos.x, pos.y, pos.z, [], [], remainingBlocks, 0, type, pos, vel, pos, vel);
    }
    static fromPreviousState(cost, state, prevMove, type, toPlace = [], toBreak = []) {
        return new Move(state.pos.x, state.pos.y, state.pos.z, toPlace, toBreak, prevMove.remainingBlocks - 0, cost, type, prevMove.exitPos, prevMove.exitVel, state.pos.clone(), state.vel.clone(), prevMove);
    }
    static fromPrevious(cost, pos, prevMove, type, toPlace = [], toBreak = []) {
        return new Move(pos.x, pos.y, pos.z, toPlace, toBreak, prevMove.remainingBlocks - 0, cost, type, prevMove.exitPos, prevMove.exitVel, pos, emptyVec, prevMove);
    }
    clone() {
        return Object.assign({}, this);
    }
    get vec() {
        return this.cachedVec;
    }
    toVecCenter() {
        return new vec3_1.Vec3(this.x + 0.5, this.y, this.z + 0.5);
    }
    exitRounded(digits) {
        const mult = Math.pow(10, digits);
        return new vec3_1.Vec3(Math.round(this.exitPos.x * mult) / mult, Math.round(this.exitPos.y * mult) / mult, Math.round(this.exitPos.z * mult) / mult);
    }
    toString() {
        return `Move { ${this.moveType.constructor.name} | ${this.x}, ${this.y}, ${this.z} | ${this.entryPos} | ${this.exitPos} }`;
    }
}
exports.Move = Move;
//# sourceMappingURL=move.js.map