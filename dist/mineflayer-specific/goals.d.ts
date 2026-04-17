import { Vec3 } from 'vec3';
import { Goal as AGoal } from '../abstract';
import { Move } from './move';
import { World } from './world/worldInterface';
import { AABB } from '@nxg-org/mineflayer-util-plugin';
import type { Item } from 'prismarine-item';
import { MovementExecutor } from './movements';
import { Block } from '../types';
import { BotEvents } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
export declare abstract class Goal implements AGoal<Move> {
    abstract isEnd(node: Move): boolean;
    abstract heuristic(node: Move): number;
    abstract distHeuristic(node: Move): number;
    onFinish(node: MovementExecutor): Promise<void>;
}
type EasyKeys = keyof BotEvents | Array<keyof BotEvents>;
interface GoalDynamicOpts {
    neverfinish?: boolean;
    dynamic?: boolean;
}
export declare abstract class GoalDynamic<Change extends EasyKeys = Array<keyof BotEvents>, Valid extends EasyKeys = Array<keyof BotEvents>, ChKey extends Change extends keyof BotEvents ? [Change] : Change = Change extends keyof BotEvents ? [Change] : Change, VlKey extends Valid extends keyof BotEvents ? [Valid] : Valid = Valid extends keyof BotEvents ? [Valid] : Valid> extends Goal {
    protected constructor(opts?: GoalDynamicOpts);
    dynamic: boolean;
    neverfinish: boolean;
    abstract readonly eventKeys: Readonly<Change>;
    abstract readonly validKeys: Readonly<Valid>;
    abstract hasChanged(event: ChKey[number], ...args: Parameters<BotEvents[ChKey[number]]>): boolean;
    abstract isValid(event: VlKey[number], ...args: Parameters<BotEvents[VlKey[number]]>): boolean;
    abstract update(): void;
    cleanup?: () => void;
    _hasChanged(event: keyof BotEvents, ...args: Parameters<BotEvents[keyof BotEvents]>): boolean;
    get _eventKeys(): ChKey;
    get _validKeys(): VlKey;
}
export declare class GoalInvert<G extends Goal | GoalDynamic = Goal> extends GoalDynamic<any, any> {
    readonly goal: G;
    get eventKeys(): ReadonlyArray<keyof BotEvents>;
    get validKeys(): ReadonlyArray<keyof BotEvents>;
    constructor(goal: G);
    static from<G1 extends Goal>(goal: G1): GoalInvert<G1>;
    hasChanged(event: keyof BotEvents, ...args: Parameters<BotEvents[keyof BotEvents]>): boolean;
    isValid(event: keyof BotEvents, ...args: Parameters<BotEvents[keyof BotEvents]>): boolean;
    update(): void;
    isEnd(node: Move): boolean;
    heuristic(node: Move): number;
    distHeuristic(node: Move): number;
}
export declare abstract class GoalComposite<Gls extends readonly Goal[]> extends GoalDynamic<any, any> {
    get eventKeys(): ReadonlyArray<keyof BotEvents>;
    get validKeys(): ReadonlyArray<keyof BotEvents>;
    protected readonly dynGoals: GoalDynamic[];
    protected readonly dGEventMap: Map<keyof BotEvents, GoalDynamic[]>;
    protected readonly dGValidMap: Map<keyof BotEvents, GoalDynamic[]>;
    protected readonly goals: Gls;
    constructor(...goals: Gls);
    hasChanged(event: keyof BotEvents, ...args: Parameters<BotEvents[keyof BotEvents]>): boolean;
    isValid(event: keyof BotEvents, ...args: Parameters<BotEvents[keyof BotEvents]>): boolean;
    update(): void;
}
export declare class GoalCompositeAny<Gls extends readonly Goal[]> extends GoalComposite<Gls> {
    static from<G extends readonly Goal[]>(...goals: G): GoalCompositeAny<G>;
    isEnd(node: Move): boolean;
    heuristic(node: Move): number;
    distHeuristic(node: Move): number;
}
export declare class GoalCompositeAll<Gls extends readonly Goal[]> extends GoalComposite<Gls> {
    static from<G extends readonly Goal[]>(...goals: G): GoalCompositeAll<G>;
    isEnd(node: Move): boolean;
    heuristic(node: Move): number;
    distHeuristic(node: Move): number;
}
export declare class GoalBlock extends Goal {
    x: number;
    y: number;
    z: number;
    constructor(x: number, y: number, z: number);
    static fromVec(vec: Vec3): GoalBlock;
    static fromBlock(block: {
        position: Vec3;
    }): GoalBlock;
    heuristic(node: Move): number;
    distHeuristic(node: Move): number;
    isEnd(node: Move): boolean;
}
export declare class GoalNear extends Goal {
    x: number;
    y: number;
    z: number;
    distance: number;
    constructor(x: number, y: number, z: number, distance: number);
    static fromVec(vec: Vec3, distance: number): GoalNear;
    static fromEntity(entity: {
        position: Vec3;
    }, distance: number): GoalNear;
    static fromBlock(block: {
        position: Vec3;
    }, distance: number): GoalNear;
    isEnd(node: Move): boolean;
    heuristic(node: Move): number;
    distHeuristic(node: Move): number;
}
export declare class GoalNearXZ extends Goal {
    x: number;
    z: number;
    distance: number;
    constructor(x: number, z: number, distance: number);
    static fromVec(vec: Vec3, distance: number): GoalNearXZ;
    isEnd(node: Move): boolean;
    heuristic(node: Move): number;
    distHeuristic(node: Move): number;
}
export declare class GoalLookAt extends Goal {
    private readonly world;
    width: number;
    height: number;
    distance: number;
    eyeHeight: number;
    protected readonly bb: AABB;
    x: number;
    y: number;
    z: number;
    constructor(world: World, x: number, y: number, z: number, width: number, height: number, distance: number, eyeHeight: number);
    static fromEntity(world: World, entity: {
        position: Vec3;
        height: number;
    }, width: number, distance?: number, height?: number): GoalLookAt;
    static fromBlock(world: World, block: {
        position: Vec3;
    }, distance?: number, height?: number): GoalLookAt;
    heuristic(node: Move): number;
    distHeuristic(node: Move): number;
    isEnd(node: Move): boolean;
    onFinish(node: MovementExecutor): Promise<void>;
}
export declare class GoalMineBlock extends GoalLookAt {
    private readonly block;
    constructor(world: World, block: Block, distance: number, height: number);
    static fromBlock(world: World, block: Block, distance?: number, height?: number): GoalMineBlock;
    onFinish(node: MovementExecutor): Promise<void>;
}
export declare class GoalPlaceBlock extends GoalLookAt {
    private readonly bPos;
    private readonly handler;
    constructor(world: World, bPos: Vec3, item: Item, distance: number, height: number);
    static fromInfo(world: World, bPos: Vec3, item: Item, distance?: number, height?: number): GoalPlaceBlock;
    isEnd(node: Move): boolean;
    onFinish(node: MovementExecutor): Promise<void>;
}
export declare class GoalFollowEntity extends GoalDynamic<'entityMoved', 'entityGone'> {
    readonly refVec: Vec3;
    readonly eventKeys: "entityMoved";
    readonly validKeys: "entityGone";
    x: number;
    y: number;
    z: number;
    sqDist: number;
    constructor(refVec: Vec3, distance: number, opts?: GoalDynamicOpts);
    static fromEntity(entity: {
        position: Vec3;
    }, distance: number, opts: GoalDynamicOpts): GoalFollowEntity;
    isEnd(node: Move): boolean;
    heuristic(node: Move): number;
    distHeuristic(node: Move): number;
    hasChanged(event: 'entityMoved', e: Entity): boolean;
    isValid(event: 'entityGone', entity: Entity): boolean;
    update(): void;
}
export {};
