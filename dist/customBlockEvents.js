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
exports.toBlockPositionEventName = toBlockPositionEventName;
exports.onBlockEvent = onBlockEvent;
exports.onceBlockEvent = onceBlockEvent;
exports.offBlockEvent = offBlockEvent;
exports.handleBlockEvent = handleBlockEvent;
exports.handleBlockPositionEvent = handleBlockPositionEvent;
exports.waitForBlockEvent = waitForBlockEvent;
exports.waitForSettledBlockPredicate = waitForSettledBlockPredicate;
exports.waitForSettledBlockStateAtPosition = waitForSettledBlockStateAtPosition;
exports.waitForSettledBlockUpdateAtPosition = waitForSettledBlockUpdateAtPosition;
exports.handleSettledBlockEvent = handleSettledBlockEvent;
const createDebug = require('debug');
const debug = createDebug('minecraft-pathfinding:block-events');
function toBlockPositionEventName(position) {
    return `blockUpdate:${position.toString()}`;
}
function onBlockEvent(bot, eventName, listener) {
    debug('on %s', eventName);
    bot.on(eventName, listener);
}
function onceBlockEvent(bot, eventName, listener) {
    debug('once %s', eventName);
    bot.once(eventName, listener);
}
function offBlockEvent(bot, eventName, listener) {
    debug('off %s', eventName);
    bot.off(eventName, listener);
}
function handleBlockEvent(bot, eventName, listener) {
    onBlockEvent(bot, eventName, listener);
    return () => offBlockEvent(bot, eventName, listener);
}
function handleBlockPositionEvent(bot, position, listener) {
    return handleBlockEvent(bot, toBlockPositionEventName(position), listener);
}
function waitForBlockEvent(bot, eventName, opts = {}) {
    const { timeoutMs = 5000, signal } = opts;
    return new Promise((resolve, reject) => {
        let finished = false;
        let timeout;
        const cleanup = () => {
            if (timeout)
                clearTimeout(timeout);
            offBlockEvent(bot, eventName, listener);
            signal === null || signal === void 0 ? void 0 : signal.removeEventListener('abort', onAbort);
        };
        const succeed = (...args) => {
            if (finished)
                return;
            finished = true;
            cleanup();
            debug('resolved waitForBlockEvent %s', eventName);
            resolve(args);
        };
        const fail = (err) => {
            if (finished)
                return;
            finished = true;
            cleanup();
            debug('rejected waitForBlockEvent %s: %s', eventName, err.message);
            reject(err);
        };
        const listener = ((...args) => {
            succeed(...args);
        });
        const onAbort = () => {
            fail(new Error(`Aborted while waiting for ${eventName}`));
        };
        onBlockEvent(bot, eventName, listener);
        if (timeoutMs > 0) {
            timeout = setTimeout(() => {
                fail(new Error(`Timed out waiting for ${eventName}`));
            }, timeoutMs);
        }
        if (signal) {
            if (signal.aborted) {
                fail(new Error(`Aborted while waiting for ${eventName}`));
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}
function waitForPositionSettle(bot, position, opts) {
    var _a, _b;
    const eventName = toBlockPositionEventName(position);
    const timeoutMs = (_a = opts.timeoutMs) !== null && _a !== void 0 ? _a : 5000;
    const settleMs = (_b = opts.settleMs) !== null && _b !== void 0 ? _b : 75;
    const signal = opts.signal;
    return new Promise((resolve, reject) => {
        let finished = false;
        let timeoutTimer;
        let settleTimer;
        const succeed = (value) => {
            if (finished)
                return;
            finished = true;
            cleanup();
            debug('resolved %s %s', opts.debugLabel, eventName);
            resolve(value);
        };
        const fail = (err) => {
            if (finished)
                return;
            finished = true;
            cleanup();
            debug('rejected %s %s: %s', opts.debugLabel, eventName, err.message);
            reject(err);
        };
        const armSettleTimer = (fn) => {
            if (settleTimer)
                clearTimeout(settleTimer);
            settleTimer = setTimeout(() => {
                if (finished)
                    return;
                fn();
            }, settleMs);
        };
        const cancelSettleTimer = () => {
            if (settleTimer) {
                clearTimeout(settleTimer);
                settleTimer = undefined;
            }
        };
        const controller = {
            resolve: succeed,
            reject: fail,
            finishGuard: () => finished,
            position,
            eventName,
            settleMs,
            bot,
            armSettleTimer,
            cancelSettleTimer
        };
        const baseListener = opts.createListener(controller);
        const onUpdate = (oldBlock, newBlock) => {
            baseListener(oldBlock, newBlock);
        };
        const onAbort = () => {
            fail(new Error(`Aborted while waiting for ${eventName}`));
        };
        const cleanup = () => {
            if (timeoutTimer)
                clearTimeout(timeoutTimer);
            cancelSettleTimer();
            offBlockEvent(bot, eventName, onUpdate);
            signal === null || signal === void 0 ? void 0 : signal.removeEventListener('abort', onAbort);
        };
        onBlockEvent(bot, eventName, onUpdate);
        if (timeoutMs > 0) {
            timeoutTimer = setTimeout(() => {
                fail(new Error(`Timed out waiting for ${opts.debugLabel} at ${position}`));
            }, timeoutMs);
        }
        if (signal) {
            if (signal.aborted) {
                fail(new Error(`Aborted while waiting for ${eventName}`));
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}
function waitForSettledBlockPredicate(bot_1, position_1, predicate_1) {
    return __awaiter(this, arguments, void 0, function* (bot, position, predicate, opts = {}) {
        var _a;
        return yield waitForPositionSettle(bot, position, {
            timeoutMs: opts.timeoutMs,
            settleMs: (_a = opts.settleMs) !== null && _a !== void 0 ? _a : 500,
            signal: opts.signal,
            debugLabel: 'waitForSettledBlockPredicate',
            createListener: (controller) => {
                let candidate = null;
                const cancel = () => {
                    const settleTimer = controller.settleTimer;
                    if (settleTimer) {
                        clearTimeout(settleTimer);
                        controller.settleTimer = undefined;
                    }
                };
                return (_oldBlock, newBlock) => {
                    var _a;
                    const matches = predicate(newBlock);
                    debug('event %s new=%s matches=%s', controller.eventName, (_a = newBlock === null || newBlock === void 0 ? void 0 : newBlock.name) !== null && _a !== void 0 ? _a : 'null', matches);
                    if (matches) {
                        candidate = newBlock;
                        controller.armSettleTimer(() => {
                            var _a;
                            debug('settle check %s candidate=%s matches=%s', controller.eventName, (_a = candidate === null || candidate === void 0 ? void 0 : candidate.name) !== null && _a !== void 0 ? _a : 'null', true);
                            controller.resolve(candidate);
                        });
                    }
                    else {
                        candidate = null;
                        cancel();
                    }
                };
            }
        });
    });
}
function waitForSettledBlockStateAtPosition(bot_1, position_1, predicate_1) {
    return __awaiter(this, arguments, void 0, function* (bot, position, predicate, opts = {}) {
        var _a;
        return yield waitForPositionSettle(bot, position, {
            timeoutMs: opts.timeoutMs,
            settleMs: (_a = opts.settleMs) !== null && _a !== void 0 ? _a : 75,
            signal: opts.signal,
            debugLabel: 'waitForSettledBlockStateAtPosition',
            createListener: (controller) => {
                const cancel = () => {
                    const settleTimer = controller.settleTimer;
                    if (settleTimer) {
                        clearTimeout(settleTimer);
                        controller.settleTimer = undefined;
                    }
                };
                return (_oldBlock, _newBlock) => {
                    var _a, _b;
                    const current = (_a = controller.bot.blockAt(controller.position)) !== null && _a !== void 0 ? _a : null;
                    const matches = predicate(current);
                    debug('event %s current=%s matches=%s', controller.eventName, (_b = current === null || current === void 0 ? void 0 : current.name) !== null && _b !== void 0 ? _b : 'null', matches);
                    if (matches) {
                        ;
                        controller.armSettleTimer(() => {
                            var _a, _b;
                            const settled = (_a = controller.bot.blockAt(controller.position)) !== null && _a !== void 0 ? _a : null;
                            const settledMatches = predicate(settled);
                            debug('settle check %s current=%s matches=%s', controller.eventName, (_b = settled === null || settled === void 0 ? void 0 : settled.name) !== null && _b !== void 0 ? _b : 'null', settledMatches);
                            if (settledMatches) {
                                controller.resolve(settled);
                            }
                        });
                    }
                    else {
                        cancel();
                    }
                };
            }
        });
    });
}
function waitForSettledBlockUpdateAtPosition(bot_1, position_1) {
    return __awaiter(this, arguments, void 0, function* (bot, position, opts = {}) {
        var _a;
        return yield waitForPositionSettle(bot, position, {
            timeoutMs: opts.timeoutMs,
            settleMs: (_a = opts.settleMs) !== null && _a !== void 0 ? _a : 75,
            signal: opts.signal,
            debugLabel: 'waitForSettledBlockUpdateAtPosition',
            createListener: (controller) => {
                return () => {
                    ;
                    controller.armSettleTimer(() => {
                        var _a, _b;
                        const current = (_a = controller.bot.blockAt(controller.position)) !== null && _a !== void 0 ? _a : null;
                        debug('settle check %s current=%s', controller.eventName, (_b = current === null || current === void 0 ? void 0 : current.name) !== null && _b !== void 0 ? _b : 'null');
                        controller.resolve(current);
                    });
                };
            }
        });
    });
}
function handleSettledBlockEvent(bot, listener, opts = {}) {
    const pending = new Map();
    const keyOf = (pos) => `${pos.x},${pos.y},${pos.z}`;
    const dispose = handleBlockEvent(bot, 'blockUpdate', (oldBlock, newBlock) => {
        var _a;
        if (oldBlock == null && newBlock == null)
            return;
        const position = (_a = oldBlock === null || oldBlock === void 0 ? void 0 : oldBlock.position) !== null && _a !== void 0 ? _a : newBlock === null || newBlock === void 0 ? void 0 : newBlock.position;
        if (position == null)
            return;
        const key = keyOf(position);
        if (pending.has(key))
            return;
        const task = (() => __awaiter(this, void 0, void 0, function* () {
            try {
                const settledBlock = yield waitForSettledBlockUpdateAtPosition(bot, position, {
                    settleMs: opts.settleMs,
                    timeoutMs: opts.timeoutMs,
                    signal: opts.signal
                });
                yield listener(oldBlock, newBlock, settledBlock);
            }
            finally {
                pending.delete(key);
            }
        }))();
        pending.set(key, task);
    });
    return () => {
        dispose();
        pending.clear();
    };
}
//# sourceMappingURL=customBlockEvents.js.map