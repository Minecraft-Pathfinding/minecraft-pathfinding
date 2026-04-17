import { IPhysics } from '@nxg-org/mineflayer-physics-util/dist/physics/engines';
import { PlayerState } from '@nxg-org/mineflayer-physics-util/dist/physics/states';
import { AABB } from '@nxg-org/mineflayer-util-plugin';
import { Vec3 } from 'vec3';
import { World } from '../../world/worldInterface';
import { BaseSimulator, Controller, EPhysicsCtx, OnGoalReachFunction, SimulationGoal } from '@nxg-org/mineflayer-physics-util';
export declare class JumpSim extends BaseSimulator<PlayerState> {
    readonly physics: IPhysics;
    readonly world: World;
    constructor(physics: IPhysics, world: World);
    clone(): JumpSim;
    simulateUntilNextTick(ctx: EPhysicsCtx<PlayerState>): PlayerState;
    simulateUntilOnGround(ctx: EPhysicsCtx<PlayerState>, ticks?: number, goal?: SimulationGoal): PlayerState;
    simulateSmartAim(goal: AABB[], goalVec: Vec3, ctx: EPhysicsCtx<PlayerState>, sprint: boolean, jump: boolean, jumpAfter?: number, ticks?: number): PlayerState;
    simulateBackUpBeforeJump(ctx: EPhysicsCtx<PlayerState>, goal: Vec3, sprint: boolean, strafe?: boolean, ticks?: number): PlayerState;
    simulateJumpFromEdgeOfBlock(ctx: EPhysicsCtx<PlayerState>, srcAABBs: AABB[], goalCorner: Vec3, goalBlock: AABB[], sprint: boolean, ticks?: number): PlayerState;
    static getReachedAABB(bbs: AABB[]): SimulationGoal;
    static getCleanupPosition(...path: Vec3[]): OnGoalReachFunction;
    static getControllerStraightAim(nextPoint: Vec3): Controller;
    static getControllerStrafeAim(nextPoint: Vec3): Controller;
    static getControllerJumpSprint(jump: boolean, sprint: boolean, jumpAfter?: number): Controller;
    static getControllerSmartMovement(goal: Vec3, sprint: boolean): Controller;
}
