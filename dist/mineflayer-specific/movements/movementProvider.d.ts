import { Bot } from 'mineflayer';
import { Move } from '../move';
import * as goals from '../goals';
import { World } from '../world/worldInterface';
import { Movement, MovementOptions } from './movement';
import { MovementProvider as AMovementProvider } from '../../abstract';
import { ExecutorMap } from '.';
import { Vec3 } from 'vec3';
import { Vec3Properties } from '../../types';
import { BlockInfo } from '../world/cacheWorld';
export declare abstract class MovementProvider extends Movement {
    orgPos: Vec3;
    toClear: Set<number>;
    constructor(bot: Bot, world: World, settings?: Partial<MovementOptions>);
    abstract movementDirs: Vec3[];
    private boundaries;
    private halfway;
    abstract provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void;
    private localData;
    loadLocalData(orgPos: Vec3, boundaries: [x: number, z: number, y: number], arr: Array<BlockInfo | null>, clear: Set<number>): void;
    getBlockInfo(pos: Vec3Properties, dx: number, dy: number, dz: number): BlockInfo;
    getBlockInfoRaw(yes: Vec3): BlockInfo;
}
export declare class MovementHandler implements AMovementProvider<Move> {
    recognizedMovements: MovementProvider[];
    goal: goals.Goal;
    world: World;
    constructor(bot: Bot, world: World, recMovement: MovementProvider[]);
    static create(bot: Bot, world: World, recMovement: ExecutorMap, settings?: Partial<MovementOptions>): MovementHandler;
    sanitize(): boolean;
    loadGoal(goal: goals.Goal): void;
    private readonly boundaries;
    private readonly halfway;
    private readonly maxBound;
    private readonly toClear;
    private readonly localData;
    resetLocalData(): void;
    private readonly swapArray;
    private readonly swapSet;
    static count: number;
    static totCount: number;
    shiftLocalData(orgPos: Vec3, newPos: Vec3): void;
    preloadInteractData(orgPos: Vec3, move: Move): void;
    private lastPos?;
    getNeighbors(currentMove: Move, closed: Set<string>): Move[];
}
