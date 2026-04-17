"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeOptimizer = void 0;
const movementProviders_1 = require("../movements/movementProviders");
const bridgeProvider_1 = require("../movements/bridgeProvider");
const optimizer_1 = require("./optimizer");
const debug = require('debug');
const log = debug('minecraft-pathfinding:BridgeOptimizer');
class BridgeOptimizer extends optimizer_1.MovementOptimizer {
    constructor(bot, world, settings = {}) {
        super(bot, world);
        this._bridgeProvider = new bridgeProvider_1.BridgeProvider(bot, world, settings);
    }
    getMergedMoveType(_startIndex, _endIndex, _path) {
        return this._bridgeProvider;
    }
    identEndOpt(currentIndex, path) {
        const startMove = path[currentIndex];
        const startCtor = startMove.moveType.constructor;
        if (startCtor !== movementProviders_1.Forward && startCtor !== movementProviders_1.Diagonal) {
            return currentIndex;
        }
        if (startMove.toPlace.length === 0) {
            return currentIndex;
        }
        const orgY = startMove.exitPos.y;
        log(`[BridgeOpt] Start at index ${currentIndex}, type=${startMove.moveType.constructor.name}, y=${orgY}`);
        let lastValidIdx = currentIndex;
        for (let i = currentIndex + 1; i < path.length; i++) {
            const next = path[i];
            const ctor = next.moveType.constructor;
            if (ctor !== movementProviders_1.Forward && ctor !== movementProviders_1.Diagonal) {
                log(`[BridgeOpt] Stop at ${i}: wrong type ${next.moveType.constructor.name}`);
                break;
            }
            if (Math.abs(next.exitPos.y - orgY) > 0.01 || Math.abs(next.entryPos.y - orgY) > 0.01) {
                log(`[BridgeOpt] Stop at ${i}: y-level changed`);
                break;
            }
            if (next.toBreak.length > 0) {
                log(`[BridgeOpt] Stop at ${i}: has breaking`);
                break;
            }
            lastValidIdx = i;
        }
        log(`[BridgeOpt] Merged indices ${currentIndex}–${lastValidIdx} (${lastValidIdx - currentIndex + 1} moves)`);
        return lastValidIdx;
    }
}
exports.BridgeOptimizer = BridgeOptimizer;
//# sourceMappingURL=bridgeOptimizer.js.map