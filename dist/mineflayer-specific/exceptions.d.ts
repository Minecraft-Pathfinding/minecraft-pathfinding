import { ResetReason } from '../types';
export declare class CancelError extends Error {
    constructor(...args: any[]);
}
export declare class AbortError extends Error {
    constructor(...args: any[]);
}
export declare class ResetError extends Error {
    readonly reason: ResetReason;
    static fromReason(reason: ResetReason, ...args: any[]): ResetError;
    constructor(reason: ResetReason, ...args: any[]);
}
export declare class ManualResetError extends ResetError {
    constructor(...args: any[]);
}
export declare class TickAdvanceError extends Error {
    constructor(label: string, beforeTick: number, afterTick: number);
}
