import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Vec3 } from 'vec3';
export type BlockUpdateListener = (oldBlock: Block | null, newBlock: Block | null) => void;
export type BlockPositionString = `(${number}, ${number}, ${number})`;
export type BlockPositionEventName = `blockUpdate:(x, y, z)`;
export type BlockEventName = 'blockUpdate' | BlockPositionEventName;
type BlockEventListenerMap = {
    blockUpdate: BlockUpdateListener;
} & {
    [K in BlockPositionEventName]: BlockUpdateListener;
};
export declare function toBlockPositionEventName(position: Vec3): BlockPositionEventName;
export declare function onBlockEvent<K extends BlockEventName>(bot: Bot, eventName: K, listener: BlockEventListenerMap[K]): void;
export declare function onceBlockEvent<K extends BlockEventName>(bot: Bot, eventName: K, listener: BlockEventListenerMap[K]): void;
export declare function offBlockEvent<K extends BlockEventName>(bot: Bot, eventName: K, listener: BlockEventListenerMap[K]): void;
export declare function handleBlockEvent<K extends BlockEventName>(bot: Bot, eventName: K, listener: BlockEventListenerMap[K]): () => void;
export declare function handleBlockPositionEvent(bot: Bot, position: Vec3, listener: BlockUpdateListener): () => void;
export interface WaitForBlockEventOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
}
export declare function waitForBlockEvent<K extends BlockEventName>(bot: Bot, eventName: K, opts?: WaitForBlockEventOptions): Promise<Parameters<BlockEventListenerMap[K]>>;
export interface WaitForSettledBlockPredicateOptions {
    timeoutMs?: number;
    settleMs?: number;
    signal?: AbortSignal;
}
export interface WaitForSettledBlockUpdateOptions {
    timeoutMs?: number;
    settleMs?: number;
    signal?: AbortSignal;
}
export interface HandleSettledBlockEventOptions {
    settleMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
}
export type SettledBlockUpdateListener = (oldBlock: Block | null, newBlock: Block | null, settledBlock: Block | null) => void | Promise<void>;
export declare function waitForSettledBlockPredicate(bot: Bot, position: Vec3, predicate: (block: Block | null) => boolean, opts?: WaitForSettledBlockPredicateOptions): Promise<Block | null>;
export declare function waitForSettledBlockStateAtPosition(bot: Bot, position: Vec3, predicate: (block: Block | null) => boolean, opts?: WaitForSettledBlockPredicateOptions): Promise<Block | null>;
export declare function waitForSettledBlockUpdateAtPosition(bot: Bot, position: Vec3, opts?: WaitForSettledBlockUpdateOptions): Promise<Block | null>;
export declare function handleSettledBlockEvent(bot: Bot, listener: SettledBlockUpdateListener, opts?: HandleSettledBlockEventOptions): () => void;
export {};
