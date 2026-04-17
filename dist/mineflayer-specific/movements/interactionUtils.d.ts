import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import type { Item } from 'prismarine-item';
import { BlockInfo } from '../world/cacheWorld';
import { World } from '../world/worldInterface';
import { AABB } from '@nxg-org/mineflayer-util-plugin';
import { MovementOptions } from './movement';
import { MovementExecutor } from './movementExecutor';
import { Block, RayType } from '../../types';
import { Task } from '../../utils';
export type InteractType = 'water' | 'solid' | 'replaceable';
interface InteractionPerformInfo {
    ticks: number;
    tickAllowance: number;
    shiftTick: number;
    raycasts: RayType[];
}
export interface InteractOpts {
    info?: InteractionPerformInfo;
    returnToStart?: boolean;
    returnToPos?: Vec3;
    predictBlock?: boolean;
    noAwait?: boolean;
}
export declare abstract class InteractHandler {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly type: InteractType;
    readonly offhand: boolean;
    protected performing: boolean;
    cancelled: boolean;
    protected _equipping: boolean;
    protected _done: boolean;
    protected _internalLock: boolean;
    protected task?: Task<void, Error>;
    readonly blockInfo: BlockInfo;
    protected readonly move: MovementExecutor;
    protected get settings(): MovementOptions;
    get vec(): Vec3;
    get bb(): AABB;
    get equipping(): boolean;
    constructor(x: number, y: number, z: number, type: InteractType, offhand?: boolean);
    get isPerforming(): boolean;
    get done(): boolean;
    get allowExit(): boolean;
    loadMove(move: MovementExecutor): void;
    abstract needToPerform(bot: Bot): boolean;
    abstract getItem(bot: Bot, block?: Block): Item | null;
    abstract perform(bot: Bot, item: Item | null, opts?: InteractOpts): Promise<void>;
    abstract performInfo(bot: Bot, ticks?: number): Promise<InteractionPerformInfo>;
    abstract toBlockInfo(): BlockInfo;
    abstract abort(bot: Bot): Promise<void>;
    _abort(bot: Bot): Promise<void>;
    _perform(bot: Bot, item: Item | null, opts?: InteractOpts): Promise<void>;
    getCurrentItem(bot: Bot): Item | null;
    equipItem(bot: Bot, item: Item | null): Promise<void>;
    allowExternalInfluence(bot: Bot, ticks?: number, sneak?: boolean): Promise<boolean>;
}
export declare class PlaceHandler extends InteractHandler {
    static reach: number;
    private _placeTask?;
    static fromVec(vec: Vec3, type: InteractType, offhand?: boolean): PlaceHandler;
    static identTypeFromItem(item: Item): InteractType;
    toBlockInfo(): BlockInfo;
    getItem(bot: Bot): Item | null;
    getNearbyBlocks(world: World): BlockInfo[];
    needToPerform(bot: Bot): boolean;
    performInfo(bot: Bot, ticks?: number, scale?: number): Promise<InteractionPerformInfo>;
    perform(bot: Bot, item: Item | null, opts?: InteractOpts): Promise<void>;
    abort(bot: Bot): Promise<void>;
}
export declare class BreakHandler extends InteractHandler {
    static reach: number;
    private _breakTask?;
    static fromVec(vec: Vec3, type: InteractType, offhand?: boolean): BreakHandler;
    toBlockInfo(): BlockInfo;
    getBlock(world: World): Block | null;
    getItem(bot: Bot, block: Block): Item | null;
    needToPerform(bot: Bot): boolean;
    performInfo(bot: Bot, ticks?: number): Promise<InteractionPerformInfo>;
    perform(bot: Bot, item?: Item | null, opts?: InteractOpts): Promise<void>;
    abort(bot: Bot): Promise<void>;
}
export {};
