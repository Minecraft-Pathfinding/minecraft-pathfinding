import { Vec3 } from 'vec3';
import * as goals from '../goals';
import { Move } from '../move';
import { MovementProvider } from './movementProvider';
import { BlockInfo } from '../world/cacheWorld';
export declare class IdleMovement extends MovementProvider {
    movementDirs: Vec3[];
    provideMovements(start: Move, storage: Move[]): void;
    performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void>;
    performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean>;
}
export declare class Forward extends MovementProvider {
    movementDirs: Vec3[];
    provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void;
    getMoveForward(start: Move, dir: Vec3, neighbors: Move[]): void;
}
export declare class Diagonal extends MovementProvider {
    movementDirs: Vec3[];
    static diagonalCost: number;
    provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void;
    getMoveDiagonal(node: Move, dir: Vec3, neighbors: Move[], goal: goals.Goal): void;
}
export declare class ForwardJump extends MovementProvider {
    movementDirs: Vec3[];
    provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void;
    getMoveJumpUp(node: Move, dir: Vec3, neighbors: Move[]): void;
}
declare abstract class DropDownProvider extends MovementProvider {
    getLandingBlock(orgBlock: BlockInfo, node: Move, dir?: Vec3): BlockInfo | null;
}
export declare class ForwardDropDown extends DropDownProvider {
    movementDirs: Vec3[];
    provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void;
    getMoveDropDown(node: Move, dir: Vec3, neighbors: Move[], closed: Set<string>): void;
}
export declare class StraightDown extends DropDownProvider {
    movementDirs: Vec3[];
    provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void;
    getMoveDown(node: Move, neighbors: Move[], closed: Set<string>): void;
}
export declare class StraightUp extends MovementProvider {
    movementDirs: Vec3[];
    provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void;
    getMoveUp(node: Move, neighbors: Move[], closed: Set<string>): void;
}
export declare class ParkourForward extends MovementProvider {
    movementDirs: Vec3[];
    provideMovements(start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void;
    getMoveParkourForward(node: Move, dir: Vec3, neighbors: Move[], closed: Set<string>): void;
}
export {};
