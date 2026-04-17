"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartialPathProducer = void 0;
const algs_1 = require("../../mineflayer-specific/algs");
const movements_1 = require("../movements");
const debug = require('debug');
const log = debug('minecraft-pathfindng:pathProducer');
class PartialPathProducer {
    get maxPathLength() {
        return Math.min(this.bot.pathfinder.pathfinderSettings.partialPathLength, this.goal.distHeuristic(this.start));
    }
    get lastAstarContext() {
        return this._lastContext;
    }
    constructor(start, goal, settings, bot, world, movements) {
        this.latestMoves = [];
        this.latestCost = 0;
        this.lastPath = [];
        this.startTime = performance.now();
        this.lastStartTime = performance.now();
        this.consideredNodeCount = 0;
        this.latestClosedNodeCount = 0;
        this.latestMoveCount = 0;
        this.start = start;
        this.goal = goal;
        this.settings = settings;
        this.bot = bot;
        this.world = world;
        this.movements = movements;
    }
    getAstarContext() {
        return this._lastContext;
    }
    getCurrentPath() {
        return this.lastPath;
    }
    getSliceLen(orgLen) {
        return Math.min(orgLen - 1, Math.floor(orgLen * 0.9));
    }
    handleAstarContext(foundPathLen, maxPathLen = this.maxPathLength) {
        if (this._lastContext != null && foundPathLen <= maxPathLen) {
            return this._lastContext;
        }
        return this.generateAstarContext();
    }
    generateAstarContext() {
        const moveHandler = movements_1.MovementHandler.create(this.bot, this.world, this.movements, this.settings);
        moveHandler.loadGoal(this.goal);
        let start;
        if (this.latestMove != null) {
            start = this.latestMove;
        }
        else {
            start = this.start;
        }
        const ret = new algs_1.AStar(start, moveHandler, this.goal, -1, 40, -1, 0);
        return ret;
    }
    advance() {
        var _a, _b, _c, _d, _e, _f, _g;
        if (this._lastContext == null)
            this._lastContext = this.generateAstarContext();
        const result = this._lastContext.compute();
        let status = result.status;
        log('AStar compute returned status: %s, Path length: %d (Max: %d)', status, result.path.length, this.maxPathLength);
        if (result.status === 'noPath') {
            log('No path found. Popping latest move.');
            this.latestMoves.pop();
            if (this.latestMoves.length === 0) {
                log('Latest moves empty, returning noPath definitively.');
                const astarContext = this._lastContext;
                delete this._lastContext;
                return {
                    result: Object.assign(Object.assign({}, result), { status, cost: this.latestCost, path: this.lastPath }),
                    astarContext
                };
            }
        }
        if (result.path.length > this.maxPathLength || result.status === 'success') {
            status = status === 'success' ? 'success' : 'partialSuccess';
            log('Threshold met! Upgrading status to: %s', status);
            const val = result.status === 'success' ? result.path.length : this.getSliceLen(result.path.length);
            this.latestMove = result.path[val];
            const toTake = result.path.slice(0, val + 1);
            this.latestMoves.push(this.latestMove);
            this.lastPath = [...this.lastPath, ...toTake];
            const cost = toTake.reduce((acc, move) => acc + move.cost, 0);
            const nodecount = (_b = (_a = this._lastContext) === null || _a === void 0 ? void 0 : _a.nodeConsiderCount) !== null && _b !== void 0 ? _b : 0;
            const seensize = (_d = (_c = this._lastContext) === null || _c === void 0 ? void 0 : _c.closedDataSet.size) !== null && _d !== void 0 ? _d : 0;
            const movecount = (_f = (_e = this._lastContext) === null || _e === void 0 ? void 0 : _e.moveConsiderCount) !== null && _f !== void 0 ? _f : 0;
            this.latestCost += cost;
            this.consideredNodeCount += nodecount;
            this.latestClosedNodeCount += seensize;
            this.latestMoveCount += movecount;
            const time1 = performance.now() - this.lastStartTime;
            const totalTime = performance.now() - this.startTime;
            log('Partial Path cost increased by %d to %d. Target Vec: %O', cost, this.latestCost, (_g = this.latestMove) === null || _g === void 0 ? void 0 : _g.vec);
            log('ITERATION METRICS | Time: %dms | Nodes: %d (%d n/s) | Seen: %d (%d s/s) | Moves: %d (%d m/s)', time1.toFixed(2), nodecount, Math.round((nodecount / time1) * 1000), seensize, Math.round((seensize / time1) * 1000), movecount, Math.round((movecount / time1) * 1000));
            log('TOTAL METRICS     | Time: %dms | Nodes: %d (%d n/s) | Seen: %d (%d s/s) | Moves: %d (%d m/s)', totalTime.toFixed(2), this.consideredNodeCount, Math.round((this.consideredNodeCount / totalTime) * 1000), this.latestClosedNodeCount, Math.round((this.latestClosedNodeCount / totalTime) * 1000), this.latestMoveCount, Math.round((this.latestMoveCount / totalTime) * 1000));
            this.lastStartTime = performance.now();
        }
        else {
            log('Threshold NOT met. Remaining in status: %s', status);
        }
        const ret = {
            result: Object.assign(Object.assign({}, result), { status, cost: this.latestCost, path: this.lastPath }),
            astarContext: this._lastContext
        };
        this._lastContext = this.handleAstarContext(result.path.length);
        return ret;
    }
    mergePathspath(path1, path2) {
        let newPath = path1;
        for (let i = 0; i < path2.length; i++) {
            if (path1[i] === undefined) {
                newPath = newPath.concat(path2.slice(i));
                break;
            }
            if (path1[i].exitPos.distanceTo(path2[i].entryPos) > 0.5) {
                newPath = newPath.concat(path2.slice(i));
                break;
            }
        }
    }
}
exports.PartialPathProducer = PartialPathProducer;
//# sourceMappingURL=partialPathProducer.js.map