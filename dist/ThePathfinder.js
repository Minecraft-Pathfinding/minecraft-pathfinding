"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThePathfinder = void 0;
const goals = __importStar(require("./mineflayer-specific/goals"));
const vec3_1 = require("vec3");
const move_1 = require("./mineflayer-specific/move");
const cacheWorld_1 = require("./mineflayer-specific/world/cacheWorld");
const exceptions_1 = require("./mineflayer-specific/exceptions");
const movements_1 = require("./mineflayer-specific/movements");
const movementProviders_1 = require("./mineflayer-specific/movements/movementProviders");
const movementExecutors_1 = require("./mineflayer-specific/movements/movementExecutors");
const optimizers_1 = require("./mineflayer-specific/post/optimizers");
const post_1 = require("./mineflayer-specific/post");
const pathProducers_1 = require("./mineflayer-specific/pathProducers");
const mineflayer_util_plugin_1 = require("@nxg-org/mineflayer-util-plugin");
const algorithms_1 = require("./abstract/algorithms");
const utils_1 = require("./utils");
const customBlockEvents_1 = require("./customBlockEvents");
const debug = require('debug');
const log = debug('minecraft-pathfinding:main');
const DEFAULT_PATHFINDER_OPTS = {
    partialPathProducer: false,
    partialPathLength: 50
};
const EMPTY_VEC = new vec3_1.Vec3(0, 0, 0);
const DEFAULT_PROVIDER_EXECUTORS = [
    [movementProviders_1.Forward, movementExecutors_1.NewForwardExecutor],
    [movementProviders_1.ForwardJump, movementExecutors_1.NewForwardJumpExecutor],
    [movementProviders_1.ForwardDropDown, movementExecutors_1.ForwardDropDownExecutor],
    [movementProviders_1.Diagonal, movementExecutors_1.NewForwardExecutor],
    [movementProviders_1.StraightDown, movementExecutors_1.StraightDownExecutor],
    [movementProviders_1.StraightUp, movementExecutors_1.StraightUpExecutor],
    [movementProviders_1.ParkourForward, movementExecutors_1.ParkourForwardExecutor]
];
DEFAULT_PROVIDER_EXECUTORS.reverse();
const DEFAULT_OPTIMIZERS = [
    [movementProviders_1.Forward, optimizers_1.LandStraightAheadOpt],
    [movementProviders_1.Diagonal, optimizers_1.LandStraightAheadOpt],
    [movementProviders_1.ForwardDropDown, optimizers_1.DropDownOpt],
    [movementProviders_1.ForwardJump, optimizers_1.ForwardJumpUpOpt]
];
const DEFAULT_SETUP = new Map(DEFAULT_PROVIDER_EXECUTORS);
const DEFAULT_OPTIMIZATION = new Map(DEFAULT_OPTIMIZERS);
class ThePathfinder {
    get currentAStar() {
        var _a;
        return (_a = this._currentProducer) === null || _a === void 0 ? void 0 : _a.getAstarContext();
    }
    get currentProducer() {
        return this._currentProducer;
    }
    get activeMovements() {
        var _a;
        return (_a = this._gotoMovements) !== null && _a !== void 0 ? _a : this.movements;
    }
    get activeOptimizedMovements() {
        var _a;
        return (_a = this._gotoOptimizedMovements) !== null && _a !== void 0 ? _a : this.optimizedMovements;
    }
    get isPathing() {
        return this.executeTask.done;
    }
    get currentGoal() {
        return this.currentGotoGoal;
    }
    constructor(bot, opts = {}) {
        var _a, _b, _c;
        this.bot = bot;
        this.currentExecutionId = 0;
        this.currentTick = 0;
        this.currentIndex = 0;
        this.executeTask = mineflayer_util_plugin_1.Task.createDoneTask();
        this.abortCalculation = false;
        this.reconstructPath = algorithms_1.reconstructPath;
        this.world = (_a = opts.world) !== null && _a !== void 0 ? _a : new cacheWorld_1.CacheSyncWorld(bot, bot.world);
        const moveSettings = {};
        const pathfinderSettings = {};
        const optimizers = (_b = opts.optimizers) !== null && _b !== void 0 ? _b : DEFAULT_OPTIMIZATION;
        const moveSetup = (_c = opts.movements) !== null && _c !== void 0 ? _c : DEFAULT_SETUP;
        Object.assign(moveSettings, Object.assign(Object.assign({}, movements_1.DEFAULT_MOVEMENT_OPTS), opts.moveSettings));
        Object.assign(pathfinderSettings, Object.assign(Object.assign({}, DEFAULT_PATHFINDER_OPTS), opts.pathfinderSettings));
        const moves = new Map();
        for (const [providerType, ExecutorType] of moveSetup) {
            moves.set(providerType, new ExecutorType(bot, this.world, moveSettings));
        }
        const opts2 = new Map();
        for (const [providerType, ExecutorType] of optimizers) {
            opts2.set(providerType, new ExecutorType(bot, this.world, moveSettings));
        }
        this.movements = moves;
        this.optimizers = opts2;
        this.optimizedMovements = new Map();
        this.defaultMoveSettings = moveSettings;
        this.pathfinderSettings = pathfinderSettings;
        this.astar = null;
        this.setupListeners();
        log('Pathfinder initialized.');
    }
    setExecutor(provider, Executor) {
        if (Executor instanceof movements_1.MovementExecutor) {
            this.movements.set(provider, Executor);
        }
        else {
            this.movements.set(provider, new Executor(this.bot, this.world, this.defaultMoveSettings));
        }
    }
    setOptimizer(provider, Optimizer, Executor) {
        if (Optimizer instanceof post_1.MovementOptimizer) {
            this.optimizers.set(provider, Optimizer);
        }
        else {
            this.optimizers.set(provider, new Optimizer(this.bot, this.world, this.defaultMoveSettings));
        }
        if (Executor != null) {
            if (Executor instanceof movements_1.MovementExecutor) {
                this.optimizedMovements.set(provider, Executor);
            }
            else {
                this.optimizedMovements.set(provider, new Executor(this.bot, this.world, this.defaultMoveSettings));
            }
        }
        else {
            this.optimizedMovements.delete(provider);
        }
    }
    setMoveOptions(settings) {
        this.defaultMoveSettings = Object.assign({}, movements_1.DEFAULT_MOVEMENT_OPTS, settings);
        for (const [, executor] of this.movements) {
            executor.settings = this.defaultMoveSettings;
        }
    }
    setOptions(settings) {
        this.pathfinderSettings = Object.assign({}, DEFAULT_PATHFINDER_OPTS, settings);
    }
    dropMovment(provider) {
        this.movements.delete(provider);
    }
    dropAllMovements() {
        this.movements.clear();
    }
    cancel() {
        return __awaiter(this, void 0, void 0, function* () {
            log('User cancelled pathfinding.');
            yield this.interrupt(this.defaultMoveSettings.movementTimeoutMs, true, 'goalReassignment');
        });
    }
    interrupt() {
        return __awaiter(this, arguments, void 0, function* (timeout = this.defaultMoveSettings.movementTimeoutMs, cancelCalculation = true, reasonStr) {
            log('Interrupt called. Cancel Calculation: %s. %s', cancelCalculation, reasonStr);
            if (this._currentProducer == null)
                return log('Interrupt ignored: no producer');
            this.abortCalculation = cancelCalculation;
            if (this.currentExecutor == null)
                return log('Interrupt ignored: no executor');
            if (this.currentMove == null)
                throw new Error('No current move, but there is a current executor.');
            const reason = reasonStr ? exceptions_1.ResetError.fromReason(reasonStr) : undefined;
            this.resetReason = reasonStr;
            yield this.currentExecutor.abort(this.currentMove, { timeout, reason });
        });
    }
    reset(reason_1) {
        return __awaiter(this, arguments, void 0, function* (reason, cancelTimeout = this.defaultMoveSettings.movementTimeoutMs) {
            log('Reset triggered due to: %s', reason);
            this.bot.emit('resetPath', reason);
            yield this.interrupt(cancelTimeout, true, reason);
        });
    }
    setupListeners() {
        const disposeBlockUpdateListener = (0, customBlockEvents_1.handleSettledBlockEvent)(this.bot, (oldBlock, newBlock, settledBlock) => __awaiter(this, void 0, void 0, function* () {
            log('settled block update', oldBlock === null || oldBlock === void 0 ? void 0 : oldBlock.name, oldBlock === null || oldBlock === void 0 ? void 0 : oldBlock.position, newBlock === null || newBlock === void 0 ? void 0 : newBlock.name, newBlock === null || newBlock === void 0 ? void 0 : newBlock.position, settledBlock === null || settledBlock === void 0 ? void 0 : settledBlock.name, settledBlock === null || settledBlock === void 0 ? void 0 : settledBlock.position);
            if (oldBlock == null || settledBlock == null)
                return;
            if (this.curPath == null)
                return;
            if (oldBlock.type === settledBlock.type)
                return;
            if (!this.isPositionNearPath(oldBlock.position))
                return;
            if (settledBlock == null)
                return;
            if (this.updateMatchesWanted(settledBlock, this.curPath))
                return;
            log('Block update near path detected, resetting...');
            yield this.reset('blockUpdate');
        }), {
            settleMs: 75,
            timeoutMs: 250
        });
        this.bot.on('chunkColumnLoad', (chunk) => {
            const astarContext = this.currentAStar;
            if (astarContext == null)
                return;
            const cx = chunk.x >> 4;
            const cz = chunk.z >> 4;
            if (astarContext.visitedChunks.has(`${cx - 1},${cz}`) ||
                astarContext.visitedChunks.has(`${cx},${cz - 1}`) ||
                astarContext.visitedChunks.has(`${cx + 1},${cz}`) ||
                astarContext.visitedChunks.has(`${cx},${cz + 1}`)) {
                log('Chunk column loaded near path, resetting...');
                void this.reset('chunkLoad');
            }
        });
        this.bot.on("physicsTick", () => {
            this.currentTick++;
        });
    }
    updateMatchesWanted(block, path = this.curPath) {
        log(`block: ${block === null || block === void 0 ? void 0 : block.name} pos: ${block === null || block === void 0 ? void 0 : block.position}, path: ${path === null || path === void 0 ? void 0 : path.length}, index: ${this.currentIndex}`);
        if (block == null || path == null)
            return false;
        const pos = block.position.floored();
        for (let i = Math.max(0, this.currentIndex - 2); i < path.length; i++) {
            const move = path[i];
            for (const place of move.toPlace) {
                if (place.vec.equals(pos)) {
                    switch (place.type) {
                        case 'solid':
                            return block.boundingBox === 'block';
                        case 'water':
                            return cacheWorld_1.BlockInfo.waters.has(block.type);
                        case 'replaceable':
                            return cacheWorld_1.BlockInfo.replaceables.has(block.type);
                    }
                }
            }
            for (const br of move.toBreak) {
                log(`[debug] check break position: ${br.vec}, ${pos}, ${block.boundingBox}`);
                if (br.vec.equals(pos)) {
                    return block.boundingBox === 'empty' && !cacheWorld_1.BlockInfo.liquids.has(block.type);
                }
            }
        }
        return false;
    }
    isPositionNearPath(pos, path = this.curPath) {
        if (pos == null || path == null)
            return false;
        for (let i = this.currentIndex; i < path.length; i++) {
            const move = path[i];
            let comparisonPoint = null;
            comparisonPoint = (0, utils_1.closestPointOnLineSegment)(pos, move.entryPos, move.exitPos);
            const dx = Math.abs(comparisonPoint.x - pos.x - 0.5);
            const dy = Math.abs(comparisonPoint.y - pos.y - 0.5);
            const dz = Math.abs(comparisonPoint.z - pos.z - 0.5);
            if (dx <= 1 && dy <= 2 && dz <= 1) {
                return true;
            }
        }
        return false;
    }
    registerAll(goal, opts) {
        const boundEvent = goal._hasChanged.bind(goal);
        const boundValid = goal.isValid.bind(goal);
        const fuckEvent = [];
        const fuckValid = [];
        const newOnHasUpdate = () => {
            if (opts.onHasUpdate != null)
                opts.onHasUpdate();
            if (opts.forAll != null)
                opts.forAll();
            for (const [key, val] of fuckEvent) {
                this.bot.off(key, val);
            }
            for (const [key, val] of fuckValid) {
                this.bot.off(key, val);
            }
        };
        const newOnInvalid = () => {
            if (opts.onInvalid != null)
                opts.onInvalid();
            if (opts.forAll != null)
                opts.forAll();
            for (const [key, val] of fuckValid) {
                this.bot.off(key, val);
            }
            for (const [key, val] of fuckEvent) {
                this.bot.off(key, val);
            }
        };
        const cleanup = () => {
            if (opts.onCleanup != null)
                opts.onCleanup();
            if (opts.forAll != null)
                opts.forAll();
            for (const [key, val] of fuckValid) {
                this.bot.off(key, val);
            }
            for (const [key, val] of fuckEvent) {
                this.bot.off(key, val);
            }
        };
        for (const key of goal._eventKeys) {
            const listener = (...args) => {
                if (this.resetReason === "goalReassignment")
                    return cleanup();
                if (boundEvent(key, ...args))
                    newOnHasUpdate();
            };
            this.bot.on(key, listener);
            fuckEvent.push([key, listener]);
        }
        for (const key of goal._validKeys) {
            const listener1 = (...args) => {
                if ((this.resetReason === "goalReassignment"))
                    return cleanup();
                if (boundValid(key, ...args))
                    newOnInvalid();
            };
            this.bot.on(key, listener1);
            fuckValid.push([key, listener1]);
        }
        goal.cleanup = cleanup;
        return cleanup;
    }
    getPathTo(goal, settings = this.defaultMoveSettings) {
        return this.getPathFromTo(this.bot.entity.position, this.bot.entity.velocity, goal, settings);
    }
    getPathFromTo(startPos_1, startVel_1, goal_1) {
        return __asyncGenerator(this, arguments, function* getPathFromTo_1(startPos, startVel, goal, settings = this.defaultMoveSettings) {
            this.abortCalculation = false;
            delete this.resetReason;
            startPos = (0, utils_1.getNormalizedPos)(this.bot, startPos);
            log('Generating path from %O to %O', startPos, goal);
            this.currentMove = move_1.Move.startMove(new movementProviders_1.IdleMovement(this.bot, this.world), startPos.clone(), startVel.clone(), (0, utils_1.getScaffoldCount)(this.bot));
            this.currentExecutor = new movementExecutors_1.IdleMovementExecutor(this.bot, this.world, this.defaultMoveSettings);
            this.bot.pathingUtil.refresh();
            if (this.pathfinderSettings.partialPathProducer) {
                this._currentProducer = new pathProducers_1.PartialPathProducer(this.currentMove, goal, settings, this.bot, this.world, this.activeMovements);
            }
            else {
                this._currentProducer = new pathProducers_1.ContinuousPathProducer(this.currentMove, goal, settings, this.bot, this.world, this.activeMovements);
            }
            log('Path producer initialized: %s', this._currentProducer.constructor.name);
            let ticked = false;
            const listener = () => {
                ticked = true;
            };
            const cleanup = () => {
                this.bot.off('physicsTick', listener);
            };
            let result, astarContext;
            do {
                const res = this._currentProducer.advance();
                result = res.result;
                astarContext = res.astarContext;
                if (result.status === 'success') {
                    cleanup();
                    this.bot.emit('pathGenerated', result);
                    movements_1.MovementHandler.count = 0;
                    movements_1.MovementHandler.totCount = 0;
                    log('Path generation successful. Length: %d', result.path.length);
                    yield yield __await({ result, astarContext });
                    return yield __await({ result, astarContext });
                }
                if (this.abortCalculation) {
                    cleanup();
                    result.status = 'canceled';
                    log('Path generation canceled.');
                    yield yield __await({ result, astarContext });
                    return yield __await({ result, astarContext });
                }
                yield yield __await({ result, astarContext });
                if (!ticked) {
                    yield __await(this.bot.waitForTicks(1));
                    ticked = false;
                }
            } while (result.status === 'partial' || result.status === 'partialSuccess');
            cleanup();
            log('Path generation ended with status: %s', result.status);
            return yield __await({
                result,
                astarContext
            });
        });
    }
    getPathFromToRaw(startPos, startVel, goal) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, e_1, _b, _c;
            try {
                for (var _d = true, _e = __asyncValues(this.getPathFromTo(startPos, startVel, goal)), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                    _c = _f.value;
                    _d = false;
                    const res = _c;
                    if (res.result.status !== 'success') {
                        if (res.result.status === 'noPath' || res.result.status === 'timeout')
                            return null;
                    }
                    else {
                        return res.result;
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
                }
                finally { if (e_1) throw e_1.error; }
            }
            return null;
        });
    }
    goto(goal_1) {
        return __awaiter(this, arguments, void 0, function* (goal, performOpts = {}) {
            log('goto called');
            if (goal == null) {
                yield this.cancel();
                yield this.executeTask.promise;
                yield this.cleanupAll(goal);
                return;
            }
            if (!this.executeTask.done) {
                log('Canceling previous goto task to start new one.');
                this.wantedGoal = goal;
                yield this.cancel();
                yield this.executeTask.promise;
                if (this.wantedGoal !== goal)
                    return;
                delete this.wantedGoal;
            }
            this.cleanupClient();
            this.executeTask = new mineflayer_util_plugin_1.Task();
            this.currentGotoGoal = goal;
            this.bot.emit('goalSet', goal);
            this._gotoMovements = new Map(this.movements);
            this._gotoOptimizedMovements = new Map(this.optimizedMovements);
            try {
                yield this._goto(goal, performOpts);
                yield this.cleanupAll(goal);
            }
            finally {
                delete this._gotoMovements;
                delete this._gotoOptimizedMovements;
            }
        });
    }
    _goto(goal_1) {
        return __awaiter(this, arguments, void 0, function* (goal, performOpts = {}) {
            var _a, e_2, _b, _c;
            const doForever = !!(goal instanceof goals.GoalDynamic && goal.neverfinish && goal.dynamic);
            let toWaitOn = Promise.resolve();
            let manualCleanup = () => { };
            const setupWait = () => {
                if (goal instanceof goals.GoalDynamic && goal.dynamic) {
                    toWaitOn = new Promise((resolve) => {
                        manualCleanup = this.registerAll(goal, {
                            onHasUpdate: () => {
                                void this.reset('goalUpdated');
                            },
                            onInvalid: () => {
                                void this.cancel();
                            },
                            forAll: () => {
                                resolve();
                            }
                        });
                    });
                }
            };
            do {
                let madeIt = false;
                do {
                    setupWait();
                    let task = null;
                    let res1 = null;
                    try {
                        for (var _d = true, _e = (e_2 = void 0, __asyncValues(this.getPathTo(goal))), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                            _c = _f.value;
                            _d = false;
                            const res = _c;
                            if (res.result.status !== 'success') {
                                if (res.result.status === 'noPath' || res.result.status === 'timeout' || res.result.status === 'canceled') {
                                    log('_goto path finding ended early: %s', res.result.status);
                                    if (task !== null && res1 !== null)
                                        res1.path.length = 0;
                                    return;
                                }
                                if (res.result.status === 'partialSuccess') {
                                    if (res1 === null) {
                                        res1 = res.result;
                                        task = this.perform(res1, goal).then(() => {
                                            task = null;
                                            res1 = null;
                                        });
                                    }
                                    else {
                                        res1.path.length = res.result.path.length;
                                        for (let i = 0; i < res.result.path.length; i++) {
                                            res1.path[i] = res.result.path[i];
                                        }
                                    }
                                }
                            }
                            else {
                                if (task === null) {
                                    yield this.perform(res.result, goal);
                                }
                                else {
                                    const res2 = res1;
                                    res2.path.length = res.result.path.length;
                                    for (let i = 0; i < res.result.path.length; i++) {
                                        res2.path[i] = res.result.path[i];
                                    }
                                    yield task;
                                    task = null;
                                }
                                if (performOpts.errorOnAbort != null && performOpts.errorOnAbort && this.abortCalculation) {
                                    log('Goto aborted internally.');
                                    throw new Error('Goto: Goal was canceled.');
                                }
                                if (performOpts.errorOnReset != null && performOpts.errorOnReset && this.resetReason != null) {
                                    log('Goto reset internally. Reason: %s', this.resetReason);
                                    throw new Error('Goto: Purposefully cancelled due to recalculation of path occurring.');
                                }
                                if (this.resetReason == null) {
                                    log('Goto reached the goal!');
                                    yield this.cleanupBot();
                                    manualCleanup();
                                    setupWait();
                                    madeIt = true;
                                    break;
                                }
                                log('Goto reset detected. Cleaning up and retrying...');
                                yield this.cleanupBot();
                                manualCleanup();
                            }
                        }
                    }
                    catch (e_2_1) { e_2 = { error: e_2_1 }; }
                    finally {
                        try {
                            if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
                        }
                        finally { if (e_2) throw e_2.error; }
                    }
                } while (!(this.resetReason === "goalReassignment") && madeIt === false);
                yield this.cleanupBot();
                if (doForever) {
                    if (this.resetReason == null && !(this.resetReason === "goalReassignment")) {
                        yield toWaitOn;
                    }
                }
            } while (doForever && !(this.resetReason === "goalReassignment"));
        });
    }
    awaitWithoutTickAdvance(label, move, fn) {
        return __awaiter(this, void 0, void 0, function* () {
            const beforeTick = this.currentTick;
            const result = yield fn();
            const afterTick = this.currentTick;
            if (move.aborted)
                return result;
            if (afterTick !== beforeTick) {
                throw new exceptions_1.TickAdvanceError(label, beforeTick, afterTick);
            }
            return result;
        });
    }
    findNextCurrentIdx(execId, move, localPath, currentIndex, adding) {
        const endIdx = localPath.findIndex((m, i) => i >= currentIndex && m.exitPos.distanceTo(move.exitPos) < 0.1);
        log(`[ExecID ${execId}] Finish info. start: ${currentIndex}. endIdx: ${endIdx}, info: ${adding}, path len: ${localPath.length}`);
        log(`[ExecID ${execId}] extra info: ${localPath[endIdx].exitPos}`);
        if (typeof adding === 'number') {
            if (Number.isFinite(adding) && adding > 0)
                currentIndex += adding;
        }
        else {
            currentIndex = endIdx !== -1 ? endIdx + 1 : currentIndex + 1;
        }
        return currentIndex;
    }
    perform(path_1, goal_1) {
        return __awaiter(this, arguments, void 0, function* (path, goal, entry = 0) {
            var _a;
            const MAX_RECOVERY_DEPTH = 5;
            const ALIGN_TICK_LIMIT = 40;
            const PERFORM_TICK_LIMIT = 10000;
            if (entry > MAX_RECOVERY_DEPTH) {
                throw new Error('Too many failures, exiting performing.');
            }
            this.currentExecutionId++;
            const myExecutionId = this.currentExecutionId;
            log('Entering ExecId %s', myExecutionId);
            let currentIndex = 0;
            const localPath = path.path;
            this.currentIndex = currentIndex;
            this.curPath = localPath;
            const movements = this.activeMovements;
            const optMovements = this.activeOptimizedMovements;
            log('[ExecID: %d] Perform started. Entry: %d, Initial Path Length: %d', myExecutionId, entry, localPath.length);
            let lastPathLength = -1;
            let optSequence = [];
            while (currentIndex < localPath.length) {
                if (this.currentExecutionId !== myExecutionId) {
                    log('[ExecID: %d] Execution superseded before move start.', myExecutionId);
                    return;
                }
                this.currentIndex = currentIndex;
                this.curPath = localPath;
                if (localPath.length !== lastPathLength) {
                    log('[ExecID: %d] Path modification detected (Length %d -> %d). Optimizing remaining slice...', myExecutionId, Math.max(0, lastPathLength), localPath.length);
                    const optimizer = new post_1.Optimizer(this.bot, this.world, this.optimizers);
                    optimizer.loadPath(localPath.slice(currentIndex));
                    optSequence = yield optimizer.compute();
                    lastPathLength = localPath.length;
                }
                const rawMove = localPath[currentIndex];
                const move = (_a = optSequence.find((m) => m.hash === rawMove.hash)) !== null && _a !== void 0 ? _a : rawMove;
                let executor;
                if (rawMove !== move) {
                    executor = optMovements.get(rawMove.moveType.constructor);
                }
                if (executor == null) {
                    executor = movements.get(move.moveType.constructor);
                }
                if (executor == null) {
                    throw new Error('No executor for movement type ' + move.moveType.constructor.name);
                }
                this.currentMove = move;
                this.currentExecutor = executor;
                let tickCount = 0;
                yield this.cleanupBot();
                executor.loadMove(move);
                if (executor.isAlreadyCompleted(move, tickCount, goal)) {
                    log('[ExecID: %d] Skipping move %s at index %d (already completed)', myExecutionId, move.moveType.constructor.name, currentIndex);
                    currentIndex = this.findNextCurrentIdx(myExecutionId, move, localPath, currentIndex);
                    this.currentIndex = currentIndex;
                    continue;
                }
                log('[ExecID: %d] Executing move: %s aligned to unoptimized index %d', myExecutionId, move.moveType.constructor.name, currentIndex);
                try {
                    log('[ExecID: %d] Aligning for move: %s...', myExecutionId, move.moveType.constructor.name);
                    while (tickCount < ALIGN_TICK_LIMIT) {
                        if (this.currentExecutionId !== myExecutionId) {
                            throw new exceptions_1.CancelError('Execution superseded during align');
                        }
                        this.check();
                        const aligned = yield this.awaitWithoutTickAdvance(`${move.moveType.constructor.name}.align`, executor, () => __awaiter(this, void 0, void 0, function* () { return yield executor.align(move, tickCount++, goal); }));
                        if (aligned)
                            break;
                        if (tickCount % 20 === 0) {
                            log('[ExecID: %d] ...still aligning for move %s. Entry pos: %O, (%d ticks)', myExecutionId, move.moveType.constructor.name, move.entryPos, tickCount);
                        }
                        yield this.bot.waitForTicks(1);
                    }
                    if (tickCount >= ALIGN_TICK_LIMIT) {
                        throw new exceptions_1.CancelError(`Alignment timed out for ${move.moveType.constructor.name}`);
                    }
                    log('[ExecID: %d] Alignment complete. Initializing perform loop...', myExecutionId);
                    tickCount = 0;
                    yield executor._performInit(move, currentIndex, localPath);
                    let adding = 0;
                    while (tickCount < PERFORM_TICK_LIMIT) {
                        if (this.currentExecutionId !== myExecutionId) {
                            throw new exceptions_1.CancelError('Execution superseded during performTick');
                        }
                        this.check();
                        adding = yield this.awaitWithoutTickAdvance(`${move.moveType.constructor.name}._performPerTick`, executor, () => __awaiter(this, void 0, void 0, function* () { return yield executor._performPerTick(move, tickCount++, currentIndex, localPath); }));
                        if (adding)
                            break;
                        if (tickCount % 40 === 0) {
                            log('[ExecID: %d] ...still performing tick loop for move %s. Target: %O, (%d ticks)', myExecutionId, move.moveType.constructor.name, move.exitPos, tickCount);
                        }
                        yield this.bot.waitForTicks(1);
                    }
                    if (tickCount >= PERFORM_TICK_LIMIT) {
                        throw new exceptions_1.CancelError(`Execution tick loop timed out for ${move.moveType.constructor.name}`);
                    }
                    currentIndex = this.findNextCurrentIdx(myExecutionId, move, localPath, currentIndex, adding);
                    this.currentIndex = currentIndex;
                }
                catch (err) {
                    if (err instanceof exceptions_1.AbortError) {
                        log('[ExecID: %d] AbortError handled. Halting executor.', myExecutionId);
                        executor.reset();
                        delete this.resetReason;
                        break;
                    }
                    if (err instanceof exceptions_1.ManualResetError) {
                        log(`[ExecID: %d] ManualResetError handlded. Assume player intervention.`, myExecutionId);
                        executor.reset();
                        delete this.resetReason;
                        break;
                    }
                    if (err instanceof exceptions_1.ResetError) {
                        log('[ExecID: %d] ResetError handled. Halting executor to restart. Reason: %s', myExecutionId, this.resetReason);
                        executor.reset();
                        break;
                    }
                    if (err instanceof exceptions_1.CancelError) {
                        executor.reset();
                        if (err.message.includes('superseded')) {
                            log('[ExecID: %d] Superseded CancelError handled. Executor reset cleanly.', myExecutionId);
                            return;
                        }
                        log('[ExecID: %d] CancelError handled. Triggering recovery.', myExecutionId);
                        yield this.recovery(rawMove, path, goal, entry);
                        break;
                    }
                    log('[ExecID: %d] Unknown error (type: %s) thrown! Bubble up.', myExecutionId, err.constructor.name);
                    throw err;
                }
            }
            log(`[ExecId ${myExecutionId}] End pos: ${this.bot.entity.position}`);
            if (this.currentExecutionId === myExecutionId) {
                log('[ExecID: %d] Perform loop ended naturally.', myExecutionId);
                yield this.cleanupBot();
            }
        });
    }
    recovery(move_2, path_1, goal_1) {
        return __awaiter(this, arguments, void 0, function* (move, path, goal, entry = 0) {
            log('Entering recovery %d for move %s from %O to %O', entry, move.moveType.constructor.name, move.entryPos, move.exitPos);
            this.bot.emit('enteredRecovery', entry);
            yield this.cleanupBot();
            const ind = path.path.findIndex(m => m.entryPos.distanceTo(move.entryPos) < 0.1);
            if (ind === -1) {
                log('Recovery failed: could not find move in path.');
                return;
            }
            let newGoal;
            const pos = this.bot.entity.position;
            let bad = false;
            let nextMove = [...path.path].sort((a, b) => a.entryPos.distanceTo(pos) - b.entryPos.distanceTo(pos))[0];
            if (nextMove == null || path.path.indexOf(nextMove) < ind) {
                bad = true;
            }
            else if (path.path.indexOf(nextMove) === ind) {
                nextMove = path.path[ind + 1];
            }
            const no = entry > 5 || bad;
            if (no || nextMove == null) {
                log('Full recovery needed. Bad: %s, NextMove Null: %s', bad, nextMove == null);
                newGoal = goal;
            }
            else {
                log('Partial recovery to block %O', nextMove.vec);
                newGoal = goals.GoalBlock.fromVec(nextMove.vec);
            }
            let path1 = yield this.getPathFromToRaw(this.bot.entity.position, EMPTY_VEC, newGoal);
            if (path1 === null) {
                log('Recovery pathfinding returned null.');
                this.bot.emit('exitedRecovery', entry);
            }
            else if (no) {
                log('Executing full recovery path.');
                this.bot.emit('exitedRecovery', entry);
                yield this.perform(path1, goal, entry + 1);
            }
            else {
                log('Executing partial recovery path.');
                yield this.perform(path1, newGoal, entry + 1);
                path.path.splice(0, ind + 1);
                log('Continuing original goal after partial recovery.');
                this.bot.emit('exitedRecovery', entry);
                yield this.perform(path, goal, 0);
            }
        });
    }
    check() {
        if (this.resetReason != null) {
            throw new exceptions_1.ResetError(this.resetReason);
        }
    }
    cleanupBot() {
        return __awaiter(this, void 0, void 0, function* () {
            this.bot.clearControlStates();
            for (const [, executor] of this.activeMovements) {
                executor.reset();
            }
        });
    }
    cleanupClient() {
        this.abortCalculation = false;
        delete this.resetReason;
        delete this.currentGotoGoal;
        delete this.curPath;
        delete this.currentMove;
        delete this.currentExecutor;
    }
    cleanupAll(goal_1) {
        return __awaiter(this, arguments, void 0, function* (goal, executor = this.currentExecutor) {
            var _a, _b, _c;
            if (goal instanceof goals.GoalDynamic && goal.dynamic) {
                (_a = goal.cleanup) === null || _a === void 0 ? void 0 : _a.call(goal);
            }
            yield this.cleanupBot();
            if (executor != null) {
                yield goal.onFinish(executor);
                yield this.cleanupBot();
            }
            (_c = (_b = this.world).cleanup) === null || _c === void 0 ? void 0 : _c.call(_b);
            if ((this.resetReason === "goalReassignment")) {
                log('Cleanup: Goal aborted.');
                this.bot.emit('goalAborted', goal);
            }
            else {
                log('Cleanup: Goal finished.');
                this.bot.emit('goalFinished', goal);
            }
            this.abortCalculation = false;
            this.executeTask.finish();
            this.cleanupClient();
        });
    }
}
exports.ThePathfinder = ThePathfinder;
//# sourceMappingURL=ThePathfinder.js.map