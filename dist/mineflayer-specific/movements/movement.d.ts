import { BaseSimulator, EPhysicsCtx } from '@nxg-org/mineflayer-physics-util';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { Move } from '../move';
import { World } from '../world/worldInterface';
import { BlockInfo } from '../world/cacheWorld';
import { BreakHandler, InteractHandler, InteractType, PlaceHandler } from './interactionUtils';
import { Block, Vec3Properties } from '../../types';
export interface MovementOptions {
    allowDiagonalBridging: boolean;
    allowJumpSprint: boolean;
    allow1by1towers: boolean;
    liquidCost: number;
    digCost: number;
    forceLook: boolean;
    jumpCost: number;
    placeCost: number;
    velocityKillCost: number;
    canOpenDoors: boolean;
    canDig: boolean;
    canPlace: boolean;
    dontCreateFlow: boolean;
    dontMineUnderFallingBlock: boolean;
    maxDropDown: number;
    infiniteLiquidDropdownDistance: boolean;
    allowSprinting: boolean;
    careAboutLookAlignment: boolean;
    movementTimeoutMs: number;
}
export declare const DEFAULT_MOVEMENT_OPTS: MovementOptions;
export declare abstract class Movement {
    static readonly cardinalDirs: Vec3[];
    static readonly diagonalDirs: Vec3[];
    static readonly jumpDirs: Vec3[];
    readonly bot: Bot;
    readonly world: World;
    settings: MovementOptions;
    protected currentMove: Move;
    protected _cI?: InteractHandler;
    constructor(bot: Bot, world: World, settings?: Partial<MovementOptions>);
    loadMove(move: Move): void;
    toBreak(): BreakHandler[];
    toBreakLen(): number;
    toPlace(): PlaceHandler[];
    toPlaceLen(): number;
    getBlock(pos: Vec3Properties, dx: number, dy: number, dz: number): Block | null;
    getBlockInfo(pos: Vec3Properties, dx: number, dy: number, dz: number): BlockInfo;
    getBlockInfoRaw(pos: Vec3): BlockInfo;
    safe(pos: Vec3Properties): number;
    safeToBreak(block: BlockInfo): boolean;
    safeOrBreak(block: BlockInfo, toBreak: BreakHandler[]): number;
    breakCost(block: BlockInfo): number;
    safeOrPlace(block: BlockInfo, toPlace: PlaceHandler[], type?: InteractType): number;
    placeCost(block: BlockInfo): number;
}
export declare abstract class SimMovement extends Movement {
    stateCtx: EPhysicsCtx;
    sim: BaseSimulator;
    constructor(bot: Bot, world: World, settings: Partial<MovementOptions>);
    simulateUntil(...args: Parameters<BaseSimulator['simulateUntil']>): ReturnType<BaseSimulator['simulateUntil']>;
}
