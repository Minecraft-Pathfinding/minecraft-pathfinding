"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContinuousPathProducer = void 0;
const algs_1 = require("../../mineflayer-specific/algs");
const movements_1 = require("../movements");
class ContinuousPathProducer {
    constructor(start, goal, settings, bot, world, movements) {
        this._currentPath = [];
        this.gcInterval = 10;
        this.lastGc = 0;
        this.lastStartTime = performance.now();
        this.start = start;
        this.goal = goal;
        this.settings = settings;
        this.bot = bot;
        this.world = world;
        this.movements = movements;
    }
    getAstarContext() {
        return this.astarContext;
    }
    getCurrentPath() {
        return this._currentPath;
    }
    advance() {
        if (this.astarContext == null) {
            const moveHandler = movements_1.MovementHandler.create(this.bot, this.world, this.movements, this.settings);
            moveHandler.loadGoal(this.goal);
            this.astarContext = new algs_1.AStar(this.start, moveHandler, this.goal, -1, 40, -1, 0);
        }
        const result = this.astarContext.compute();
        this._currentPath = result.path;
        if (global.gc != null && ++this.lastGc % this.gcInterval === 0) {
            if (this.lastGc % (this.gcInterval * 10) === 0) {
            }
            else {
                global.gc(true);
            }
        }
        else {
        }
        return { result, astarContext: this.astarContext };
    }
}
exports.ContinuousPathProducer = ContinuousPathProducer;
//# sourceMappingURL=continuousPathProducer.js.map