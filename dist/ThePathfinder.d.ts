import { Bot } from 'mineflayer';
import { AStarBackOff as AAStar } from './abstract/algorithms/astar';
import { AStar, Path, PathProducer } from './mineflayer-specific/algs';
import * as goals from './mineflayer-specific/goals';
import { Vec3 } from 'vec3';
import { Move } from './mineflayer-specific/move';
import { BuildableMoveExecutor, BuildableMoveProvider, MovementHandler, MovementOptions, ExecutorMap, MovementExecutor } from './mineflayer-specific/movements';
import { BuildableMoveOptimizer, MovementOptimizer, OptimizationMap } from './mineflayer-specific/post';
import { Block, HandlerOpts, ResetReason } from './types';
import { reconstructPath } from './abstract/algorithms';
import { World } from './mineflayer-specific/world/worldInterface';
export interface PathfinderOptions {
    partialPathProducer: boolean;
    partialPathLength: number;
}
type PathInfo = Path;
type PathGenerator = AsyncGenerator<PathGeneratorResult, PathGeneratorResult | null, unknown>;
interface PathGeneratorResult {
    result: PathInfo;
    astarContext: AAStar<Move, MovementHandler>;
}
interface PerformOpts {
    errorOnReset?: boolean;
    errorOnAbort?: boolean;
}
export declare class ThePathfinder {
    private readonly bot;
    astar: AStar | null;
    world: World;
    movements: ExecutorMap;
    optimizers: OptimizationMap;
    optimizedMovements: ExecutorMap;
    defaultMoveSettings: MovementOptions;
    pathfinderSettings: PathfinderOptions;
    currentExecutionId: number;
    private currentTick;
    private currentIndex;
    private executeTask;
    private wantedGoal?;
    abortCalculation: boolean;
    private currentGotoGoal?;
    private curPath?;
    private currentMove?;
    private currentExecutor?;
    private resetReason?;
    private _currentProducer?;
    private _gotoMovements?;
    private _gotoOptimizedMovements?;
    get currentAStar(): AStar | undefined;
    get currentProducer(): PathProducer | undefined;
    private get activeMovements();
    private get activeOptimizedMovements();
    get isPathing(): boolean;
    get currentGoal(): Readonly<goals.Goal> | undefined;
    reconstructPath: typeof reconstructPath;
    constructor(bot: Bot, opts?: HandlerOpts);
    setExecutor(provider: BuildableMoveProvider, Executor: BuildableMoveExecutor | MovementExecutor): void;
    setOptimizer(provider: BuildableMoveProvider, Optimizer: BuildableMoveOptimizer | MovementOptimizer, Executor?: BuildableMoveExecutor | MovementExecutor): void;
    setMoveOptions(settings: Partial<MovementOptions>): void;
    setOptions(settings: Partial<PathfinderOptions>): void;
    dropMovment(provider: BuildableMoveProvider): void;
    dropAllMovements(): void;
    cancel(): Promise<void>;
    interrupt(timeout?: number, cancelCalculation?: boolean, reasonStr?: ResetReason): Promise<void>;
    reset(reason: ResetReason, cancelTimeout?: number): Promise<void>;
    setupListeners(): void;
    updateMatchesWanted(block: Block | null, path?: Move[] | undefined): boolean;
    isPositionNearPath(pos: Vec3 | undefined, path?: Move[] | undefined): boolean;
    private registerAll;
    getPathTo(goal: goals.Goal, settings?: MovementOptions): PathGenerator;
    getPathFromTo(startPos: Vec3, startVel: Vec3, goal: goals.Goal, settings?: MovementOptions): PathGenerator;
    getPathFromToRaw(startPos: Vec3, startVel: Vec3, goal: goals.Goal): Promise<PathInfo | null>;
    goto(goal: goals.Goal, performOpts?: PerformOpts): Promise<void>;
    private _goto;
    private awaitWithoutTickAdvance;
    private findNextCurrentIdx;
    perform(path: Path, goal: goals.Goal, entry?: number): Promise<void>;
    recovery(move: Move, path: Path, goal: goals.Goal, entry?: number): Promise<void>;
    private check;
    cleanupBot(): Promise<void>;
    cleanupClient(): void;
    cleanupAll(goal: goals.Goal, executor?: MovementExecutor | undefined): Promise<void>;
}
export {};
