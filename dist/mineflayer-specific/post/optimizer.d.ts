import { Bot } from 'mineflayer';
import { OptimizationMap } from '.';
import { MovementProvider } from '../movements';
import { World } from '../world/worldInterface';
import { Move } from '../move';
import { BaseSimulator } from '@nxg-org/mineflayer-physics-util';
export declare abstract class MovementOptimizer {
    bot: Bot;
    world: World;
    sim: BaseSimulator;
    readonly mergeInteracts: boolean;
    constructor(bot: Bot, world: World);
    abstract identEndOpt(currentIndex: number, path: Move[]): number | Promise<number>;
    protected getMergedMoveType(startIndex: number, endIndex: number, path: readonly Move[]): MovementProvider;
    protected createMergedMove(startIndex: number, endIndex: number, path: readonly Move[]): Move;
    mergeMoves(startIndex: number, endIndex: number, path: readonly Move[]): Move;
}
export declare class Optimizer {
    optMap: OptimizationMap;
    private pathCopy;
    private currentIndex;
    constructor(bot: Bot, world: World, optMap: OptimizationMap);
    loadPath(path: Move[]): void;
    sanitize(): boolean;
    private mergeMoves;
    compute(): Promise<Move[]>;
    makeResult(): Move[];
}
