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
exports.Optimizer = exports.MovementOptimizer = void 0;
const move_1 = require("../move");
const mineflayer_physics_util_1 = require("@nxg-org/mineflayer-physics-util");
const debug = require('debug');
const log = debug('minecraft-pathfinding:Optimizer');
const logMerge = debug('minecraft-pathfinding:Optimizer:merge');
class MovementOptimizer {
    constructor(bot, world) {
        this.mergeInteracts = true;
        this.bot = bot;
        this.world = world;
        this.sim = new mineflayer_physics_util_1.BaseSimulator(new mineflayer_physics_util_1.BotcraftPhysics(bot.registry));
    }
    getMergedMoveType(startIndex, endIndex, path) {
        return path[startIndex].moveType;
    }
    createMergedMove(startIndex, endIndex, path) {
        const startMove = path[startIndex];
        const endMove = path[endIndex];
        const mergedMoveType = this.getMergedMoveType(startIndex, endIndex, path);
        logMerge(`Merging ${endIndex - startIndex + 1} moves: [Index ${startIndex}] ${startMove.moveType.constructor.name} -> [Index ${endIndex}] ${endMove.moveType.constructor.name}`);
        logMerge(`Start Pos: ${startMove.entryPos}, End Pos: ${endMove.exitPos}`);
        const toBreak = [...startMove.toBreak];
        const toPlace = [...startMove.toPlace];
        let costSum = 0;
        for (let i = startIndex + 1; i < endIndex; i++) {
            const intermediateMove = path[i];
            if (this.mergeInteracts) {
                toBreak.push(...intermediateMove.toBreak);
                toPlace.push(...intermediateMove.toPlace);
            }
            costSum += intermediateMove.cost;
        }
        toBreak.push(...endMove.toBreak);
        toPlace.push(...endMove.toPlace);
        costSum += endMove.cost;
        logMerge(`Merge complete. Total Cost: ${costSum.toFixed(2)}, Breaks: ${toBreak.length}, Places: ${toPlace.length}`);
        return new move_1.Move(startMove.x, startMove.y, startMove.z, toPlace, toBreak, endMove.remainingBlocks, costSum, mergedMoveType, startMove.entryPos, startMove.entryVel, endMove.exitPos, endMove.exitVel, startMove.parent);
    }
    mergeMoves(startIndex, endIndex, path) {
        return this.createMergedMove(startIndex, endIndex, path);
    }
}
exports.MovementOptimizer = MovementOptimizer;
class Optimizer {
    constructor(bot, world, optMap) {
        this.currentIndex = 0;
        this.optMap = optMap;
    }
    loadPath(path) {
        log(`loadPath called. Initial path length: ${path.length}. start: ${path[0].entryPos}. End: ${path[path.length - 1].exitPos}`);
        this.pathCopy = path;
        this.currentIndex = 0;
    }
    sanitize() {
        return !!this.pathCopy;
    }
    mergeMoves(startIndex, endIndex, optimizer) {
        const newMove = optimizer.mergeMoves(startIndex, endIndex, this.pathCopy);
        this.pathCopy[startIndex] = newMove;
        this.pathCopy.splice(startIndex + 1, endIndex - startIndex);
        logMerge(`Spliced array. New path length: ${this.pathCopy.length}`);
    }
    compute() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.sanitize()) {
                throw new Error('Optimizer not sanitized');
            }
            log(`compute() started. Iterating over path of length ${this.pathCopy.length}.`);
            while (this.currentIndex < this.pathCopy.length) {
                const move = this.pathCopy[this.currentIndex];
                const opt = this.optMap.get(move.moveType.constructor);
                if (opt == null) {
                    log(`[Index ${this.currentIndex}] No optimizer mapped for ${move.moveType.constructor.name}. Skipping.`);
                    this.currentIndex++;
                    continue;
                }
                log(`[Index ${this.currentIndex}] Evaluating ${move.moveType.constructor.name} using ${opt.constructor.name}...`);
                const newEnd = yield opt.identEndOpt(this.currentIndex, this.pathCopy);
                if (newEnd !== this.currentIndex) {
                    log(`[Index ${this.currentIndex}] Optimizer identified mergable sequence ending at index ${newEnd}.`);
                    this.mergeMoves(this.currentIndex, newEnd, opt);
                }
                else {
                    log(`[Index ${this.currentIndex}] Optimizer returned identical index. No merge performed.`);
                }
                this.currentIndex++;
            }
            log(`compute() finished. Final optimized path length: ${this.pathCopy.length}. End: ${this.pathCopy[this.pathCopy.length - 1].exitPos}`);
            return this.pathCopy;
        });
    }
    makeResult() {
        return this.pathCopy;
    }
}
exports.Optimizer = Optimizer;
//# sourceMappingURL=optimizer.js.map