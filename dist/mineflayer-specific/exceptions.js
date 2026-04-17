"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TickAdvanceError = exports.ManualResetError = exports.ResetError = exports.AbortError = exports.CancelError = void 0;
class CancelError extends Error {
    constructor(...args) {
        super('Movement canceled: ' + args.join(' '));
    }
}
exports.CancelError = CancelError;
class AbortError extends Error {
    constructor(...args) {
        super('Movement aborted: ' + args.join(' '));
    }
}
exports.AbortError = AbortError;
class ResetError extends Error {
    static fromReason(reason, ...args) {
        if (reason === "goalReassignment")
            return new ManualResetError(...args);
        else
            return new ResetError(reason, ...args);
    }
    constructor(reason, ...args) {
        const extra = args.length > 0 ? `: ${args.join(' ')}` : '.';
        super(`Movement was reset${extra}`);
        this.reason = reason;
    }
}
exports.ResetError = ResetError;
class ManualResetError extends ResetError {
    constructor(...args) {
        super('goalReassignment', 'manual reset.');
    }
}
exports.ManualResetError = ManualResetError;
class TickAdvanceError extends Error {
    constructor(label, beforeTick, afterTick) {
        super(`[tick-guard] Tick advanced during await for ${label}: ${beforeTick} -> ${afterTick}`);
        this.name = 'TickAdvanceError';
    }
}
exports.TickAdvanceError = TickAdvanceError;
//# sourceMappingURL=exceptions.js.map