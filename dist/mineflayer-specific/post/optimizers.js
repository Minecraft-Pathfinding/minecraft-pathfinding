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
exports.ForwardJumpUpOpt = exports.DropDownOpt = exports.LandStraightAheadOpt = void 0;
const mineflayer_physics_util_1 = require("@nxg-org/mineflayer-physics-util");
const cacheWorld_1 = require("../world/cacheWorld");
const optimizer_1 = require("./optimizer");
const mineflayer_util_plugin_1 = require("@nxg-org/mineflayer-util-plugin");
const movementUtils_1 = require("../movements/movementUtils");
const debug = require('debug');
const log = debug('minecraft-pathfinding:optimizers');
class LandStraightAheadOpt extends optimizer_1.MovementOptimizer {
    identEndOpt(currentIndex, path) {
        return __awaiter(this, void 0, void 0, function* () {
            const startIndex = currentIndex;
            const thisMove = path[currentIndex];
            let lastMove = path[currentIndex];
            let nextMove = path[++currentIndex];
            log(`[LandStraightAhead] Optimizing from index ${startIndex} (${thisMove.moveType.constructor.name})`);
            if (nextMove === undefined) {
                log(`[LandStraightAhead] nextMove is undefined, aborting.`);
                return --currentIndex;
            }
            const orgY = thisMove.entryPos.y;
            const orgPos = thisMove.entryPos.floored().translate(0.5, 0, 0.5);
            const hW = 0.6;
            const uW = 0.4;
            const bb = mineflayer_util_plugin_1.AABBUtils.getEntityAABBRaw({ position: orgPos, width: hW, height: 1.8 });
            const verts = bb.expand(0, -0.1, 0).toVertices();
            const verts1 = [
                orgPos.offset(-uW / 2, -0.6, -uW / 2),
                orgPos.offset(-uW / 2, -0.6, uW / 2),
                orgPos.offset(uW / 2, -0.6, -uW / 2),
                orgPos.offset(uW / 2, -0.6, uW / 2)
            ];
            while (lastMove.exitPos.y === orgY && nextMove.exitPos.y === orgY) {
                if (!mineflayer_util_plugin_1.AABB.fromBlockPos(nextMove.entryPos).collides(mineflayer_util_plugin_1.AABB.fromBlockPos(nextMove.exitPos))) {
                    log(`[LandStraightAhead] Index ${currentIndex}: AABB collision failed between entry and exit.`);
                    return --currentIndex;
                }
                if (nextMove === undefined) {
                    log(`[LandStraightAhead] Index ${currentIndex}: nextMove became undefined.`);
                    return --currentIndex;
                }
                for (const vert of verts) {
                    const offset = vert.minus(orgPos);
                    const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0);
                    const test = test1.plus(offset);
                    const dist = nextMove.exitPos.distanceTo(orgPos);
                    const raycast0 = this.bot.world.raycast(vert, test.minus(vert).normalize(), dist, (block) => (!cacheWorld_1.BlockInfo.replaceables.has(block.type) || cacheWorld_1.BlockInfo.liquids.has(block.type) || cacheWorld_1.BlockInfo.blocksToAvoid.has(block.type)) && block.shapes.length > 0);
                    const valid0 = (raycast0 == null) || raycast0.position.distanceTo(orgPos) > dist;
                    if (!valid0) {
                        log(`[LandStraightAhead] Index ${currentIndex}: Block check raycast hit an obstacle at ${raycast0.position}.`);
                        return --currentIndex;
                    }
                }
                let counter = verts1.length;
                for (const vert of verts1) {
                    const offset = vert.minus(orgPos);
                    const test1 = nextMove.exitPos.offset(0, orgY - nextMove.exitPos.y, 0);
                    const test = test1.plus(offset);
                    const dist = nextMove.exitPos.distanceTo(orgPos);
                    const raycast0 = (yield this.bot.world.raycast(vert, test.minus(vert).normalize(), dist, (block) => cacheWorld_1.BlockInfo.replaceables.has(block.type) || cacheWorld_1.BlockInfo.liquids.has(block.type) || block.shapes.length === 0));
                    const valid0 = (raycast0 == null) || raycast0.shapes.length > 0 || raycast0.position.distanceTo(orgPos) > dist;
                    if (!valid0) {
                        counter--;
                    }
                }
                if (counter === 0) {
                    log(`[LandStraightAhead] Index ${currentIndex}: Air check raycast failed (counter reached 0).`);
                    return --currentIndex;
                }
                if (++currentIndex >= path.length) {
                    log(`[LandStraightAhead] Reached end of path.`);
                    return --currentIndex;
                }
                lastMove = nextMove;
                nextMove = path[currentIndex];
            }
            log(`[LandStraightAhead] Y-level changed or loop ended naturally. Returning index ${currentIndex - 1}.`);
            return --currentIndex;
        });
    }
}
exports.LandStraightAheadOpt = LandStraightAheadOpt;
class DropDownOpt extends optimizer_1.MovementOptimizer {
    constructor() {
        super(...arguments);
        this.mergeInteracts = false;
    }
    identEndOpt(currentIndex, path) {
        const startIndex = currentIndex;
        let lastMove = path[currentIndex];
        let nextMove = path[++currentIndex];
        log(`[DropDownOpt] Optimizing from index ${startIndex} (${lastMove.moveType.constructor.name})`);
        if (nextMove === undefined)
            return --currentIndex;
        const firstPos = lastMove.exitPos;
        let flag0 = false;
        let flag1 = false;
        while (currentIndex < path.length) {
            if (nextMove.exitPos.y > lastMove.exitPos.y) {
                log(`[DropDownOpt] Index ${currentIndex}: nextMove goes UP. Aborting.`);
                return --currentIndex;
            }
            if (nextMove.toPlace.length > 0 || nextMove.toBreak.length > 0) {
                log(`[DropDownOpt] Index ${currentIndex}: nextMove requires block placement/breaking. Aborting.`);
                return --currentIndex;
            }
            if (!mineflayer_util_plugin_1.AABB.fromBlockPos(nextMove.entryPos).collides(mineflayer_util_plugin_1.AABB.fromBlockPos(nextMove.exitPos))) {
                log(`[DropDownOpt] Index ${currentIndex}: AABB collision failed.`);
                return --currentIndex;
            }
            if (nextMove.exitPos.xzDistanceTo(firstPos) < lastMove.exitPos.xzDistanceTo(firstPos)) {
                log(`[DropDownOpt] Index ${currentIndex}: Bot is moving closer to start position (looping). Aborting.`);
                return --currentIndex;
            }
            const ctx = mineflayer_physics_util_1.EPhysicsCtx.FROM_BOT(this.bot.physicsUtil.engine, this.bot);
            ctx.velocity.set(0, 0, 0);
            ctx.position.set(lastMove.entryPos.x, lastMove.entryPos.y, lastMove.entryPos.z);
            (0, movementUtils_1.stateLookAt)(ctx.state, nextMove.entryPos);
            ctx.state.control = mineflayer_physics_util_1.ControlStateHandler.DEFAULT();
            ctx.state.control.forward = true;
            ctx.state.control.sprint = true;
            const bl0 = lastMove.moveType.getBlockInfo(nextMove.entryPos, 0, -1, 0);
            const bl1 = lastMove.moveType.getBlockInfo(nextMove.exitPos, 0, -1, 0);
            const bb0solid = bl0.physical || bl0.liquid;
            const bb1solid = bl1.physical || bl1.liquid;
            const blockBB0 = mineflayer_util_plugin_1.AABB.fromBlockPos(nextMove.entryPos.offset(0, -1, 0));
            const blockBB1 = mineflayer_util_plugin_1.AABB.fromBlockPos(nextMove.exitPos.offset(0, -1, 0));
            let flag = false;
            let good = false;
            this.sim.simulateUntil((state, ticks) => {
                const pBB = mineflayer_util_plugin_1.AABBUtils.getPlayerAABB({ position: ctx.state.pos, width: 0.6, height: 1.8 });
                const collided = (pBB.collides(blockBB0) && bb0solid) || (pBB.collides(blockBB1) && bb1solid && (state.onGround || state.isInWater));
                if (collided) {
                    good = true;
                    return true;
                }
                if (state.pos.y < nextMove.entryPos.y && state.pos.y < nextMove.exitPos.y)
                    flag = true;
                if (flag)
                    return (ticks > 0 && state.onGround) || state.isCollidedHorizontally;
                else
                    return false;
            }, () => { }, (state) => (0, movementUtils_1.stateLookAt)(state, nextMove.exitPos), ctx, this.world, 1000);
            if (!good) {
                log(`[DropDownOpt] Index ${currentIndex}: Physics simulation failed to reach target safely.`);
                return --currentIndex;
            }
            if (ctx.state.isInWater)
                flag1 = true;
            else if (flag1) {
                log(`[DropDownOpt] Index ${currentIndex}: Bot left water during drop. Aborting.`);
                return --currentIndex;
            }
            if (nextMove.exitPos.y === nextMove.entryPos.y) {
                if (!bb1solid) {
                    log(`[DropDownOpt] Index ${currentIndex}: Landing block is not solid.`);
                    return --currentIndex;
                }
                if (flag0) {
                    log(`[DropDownOpt] Index ${currentIndex}: Flag0 triggered. Returning.`);
                    return currentIndex;
                }
                else
                    flag0 = true;
            }
            if (++currentIndex >= path.length)
                return --currentIndex;
            lastMove = nextMove;
            nextMove = path[currentIndex];
        }
        return --currentIndex;
    }
}
exports.DropDownOpt = DropDownOpt;
class ForwardJumpUpOpt extends optimizer_1.MovementOptimizer {
    identEndOpt(currentIndex, path) {
        const startIndex = currentIndex;
        let lastMove = path[currentIndex];
        let nextMove = path[++currentIndex];
        log(`[ForwardJumpUpOpt] Optimizing from index ${startIndex} (${lastMove.moveType.constructor.name})`);
        if (lastMove.toPlace.length > 0) {
            log(`[ForwardJumpUpOpt] Initial move places a block. Aborting.`);
            return --currentIndex;
        }
        if (nextMove === undefined)
            return --currentIndex;
        while (lastMove.exitPos.y === nextMove.exitPos.y &&
            lastMove.entryPos.y !== lastMove.exitPos.y &&
            nextMove.toPlace.length === 0 &&
            nextMove.toBreak.length === 0) {
            if (lastMove.toPlace.length > 1) {
                log(`[ForwardJumpUpOpt] Index ${currentIndex}: Places >1 blocks. Aborting.`);
                return --currentIndex;
            }
            if (!mineflayer_util_plugin_1.AABB.fromBlockPos(nextMove.entryPos).collides(mineflayer_util_plugin_1.AABB.fromBlockPos(nextMove.exitPos))) {
                log(`[ForwardJumpUpOpt] Index ${currentIndex}: AABB collision failed.`);
                return --currentIndex;
            }
            if (++currentIndex >= path.length)
                return --currentIndex;
            lastMove = nextMove;
            nextMove = path[currentIndex];
        }
        const firstPos = lastMove.exitPos;
        while (lastMove.exitPos.y === nextMove.exitPos.y &&
            nextMove.exitPos.distanceTo(firstPos) <= 2 &&
            nextMove.toPlace.length === 0 &&
            nextMove.toBreak.length === 0) {
            if (nextMove.exitPos.y > firstPos.y) {
                log(`[ForwardJumpUpOpt] Index ${currentIndex}: nextMove Y is higher than firstPos Y. Aborting.`);
                return --currentIndex;
            }
            if (++currentIndex >= path.length)
                return --currentIndex;
            lastMove = nextMove;
            nextMove = path[currentIndex];
        }
        log(`[ForwardJumpUpOpt] Optimized up to index ${currentIndex - 1}`);
        return --currentIndex;
    }
}
exports.ForwardJumpUpOpt = ForwardJumpUpOpt;
//# sourceMappingURL=optimizers.js.map