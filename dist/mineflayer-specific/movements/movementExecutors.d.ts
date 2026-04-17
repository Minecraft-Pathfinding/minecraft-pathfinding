import { Vec3 } from 'vec3';
import * as goals from '../goals';
import { Move } from '../move';
import { BlockInfo } from '../world/cacheWorld';
import { CompleteOpts, MovementExecutor } from './movementExecutor';
import { JumpCalculator } from './movementUtils';
export declare class IdleMovementExecutor extends MovementExecutor {
    provideMovements(start: Move, storage: Move[]): void;
    performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void>;
    performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean>;
}
export declare class NewForwardExecutor extends MovementExecutor {
    private faceForward;
    align(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean>;
    landAlign(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean>;
    performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void>;
    private doWaterLogic;
    private canJump;
    performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number>;
}
export declare class ForwardExecutor extends MovementExecutor {
    private currentIndex;
    private getRemainingPlacements;
    private faceForward;
    align(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean>;
    performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void>;
    private identMove;
    private canJump;
    performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number>;
}
export declare class ForwardJumpExecutor extends MovementExecutor {
    jumpInfo: ReturnType<JumpCalculator['findJumpPoint']>;
    private readonly shitter;
    private flag;
    private getRemainingPlacements;
    protected isComplete(startMove: Move, endMove?: Move): boolean;
    align(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean>;
    align1(thisMove: Move, tickCount: number, goal: goals.Goal): boolean;
    performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void>;
    performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean>;
}
export declare class NewForwardJumpExecutor extends ForwardJumpExecutor {
    performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean>;
}
export declare class ForwardDropDownExecutor extends MovementExecutor {
    private currentIndex;
    private getRemainingPlacements;
    private getRemainingBreaks;
    align(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean>;
    performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void>;
    private identMove;
    performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number>;
    getLandingBlock(node: Move, dir: Vec3): BlockInfo | null;
}
export declare class NewForwardDropDownExecutor extends ForwardDropDownExecutor {
    performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number>;
}
export declare class StraightDownExecutor extends MovementExecutor {
    private getRemainingBreaks;
    align(thisMove: Move): boolean;
    performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void>;
    performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number>;
}
export declare class StraightUpExecutor extends MovementExecutor {
    private static readonly CENTER_EPS;
    private static readonly FAR_CENTER_DIST;
    private static readonly BAD_VEL_DOT;
    isAlreadyCompleted(thisMove: Move, tickCount: number, goal: goals.Goal): boolean;
    private _getEntryCenter;
    private _getExitCenter;
    private _getHorizontalOffsetToCenter;
    private _getHorizontalVelocity;
    private _isMostlyCentered;
    private _clearLateralControls;
    private _faceCenterYaw;
    private _applyGroundCentering;
    private _applyVerticalAscentControls;
    align(thisMove: Move): Promise<boolean>;
    performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void>;
    performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean>;
}
export declare class ParkourForwardExecutor extends MovementExecutor {
    private readonly shitterTwo;
    private executing;
    private lockedYaw;
    private _lookAtInFlight;
    private _pendingLookTarget;
    private static readonly APPROACH_YAW_EPS;
    protected isComplete(startMove: Move, endMove?: Move, opts?: CompleteOpts): boolean;
    private _debugLog;
    private _lockCurrentYaw;
    private _clearLockedYaw;
    private _applyLockedYaw;
    private _queueLookAtSync;
    private _getTargetBlock;
    private _getTargetEyeVec;
    private _getUnderlyingBbs;
    private _getJumpState;
    private _debugJumpState;
    private _setApproachControls;
    private _clearApproachControls;
    private _startJumpExecution;
    private _desiredYawTo;
    private _yawDeltaAbs;
    private _isYawAlignedForApproach;
    private _tryApproachWhenAligned;
    align(thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean>;
    performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void>;
    performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean>;
}
