import { BaseSimulator, EPhysicsCtx, IEntityState, PlayerState, SimulationGoal } from '@nxg-org/mineflayer-physics-util';
import { Bot } from 'mineflayer';
import { World } from '../world/worldInterface';
import { Vec3 } from 'vec3';
import { AABB } from '@nxg-org/mineflayer-util-plugin';
import { JumpSim } from './simulators/jumpSim';
import { Block } from '../../types';
import type { PCChunk } from 'prismarine-chunk';
interface JumpInfo {
    jumpTick: number;
    sprintTick: number;
    backTick: number;
}
export declare function stateLookAt(state: IEntityState, point: Vec3): void;
export declare function isBlockTypeInChunks(info: Block | number, ...chunks: PCChunk[]): boolean;
export declare function getUnderlyingBBs(world: World, pos: Vec3, width: number, colliding?: boolean): AABB[];
export declare function leavingBlockLevel(bot: Bot, world: World, ticks?: number, ectx?: EPhysicsCtx): boolean;
export declare class JumpCalculator {
    readonly engine: BaseSimulator<PlayerState>;
    readonly bot: Bot;
    ctx: EPhysicsCtx<PlayerState>;
    readonly world: World;
    constructor(sim: BaseSimulator<PlayerState>, bot: Bot, world: World, ctx: EPhysicsCtx<PlayerState>);
    findJumpPoint(goal: Vec3, maxTicks?: number): JumpInfo | null;
    protected resetState(): PlayerState;
    protected checkImmediateSprintJump(goal: Vec3): boolean;
    protected checkSprintJump(goal: Vec3, firstTicks?: number, secondTicks?: number, sprintAfterJump?: boolean, backTicks?: number): boolean;
    protected simJump(state: PlayerState, maxTicks?: number): PlayerState;
    protected simJumpAdvanced(state: PlayerState, goal: Vec3, opts?: {
        firstTicks?: number;
        secondTicks?: number;
        backTicks?: number;
        sprintAfterJump?: boolean;
        maxTicks?: number;
    }): PlayerState;
}
export declare class ParkourJumpHelper {
    readonly sim: JumpSim;
    private readonly bot;
    private readonly world;
    constructor(bot: Bot, world: World);
    findGoalVertex(goal: AABB): Vec3;
    findBackupVertex(bbs: AABB[], goalVert: Vec3, orgPos?: Vec3): Vec3;
    simJumpFromEdge(srcBBs: AABB[], goal: Vec3): boolean;
    simFallOffEdge(goal: Vec3, target?: Vec3): boolean;
    simForwardMove(goal: Vec3, eyeTarget?: Vec3, jump?: boolean, ...constraints: SimulationGoal[]): boolean;
    simBackupJump(goal: Vec3): boolean;
}
export {};
