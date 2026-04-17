import { Vec3 } from 'vec3';
import { Move } from '../../move';
import { MovementProvider } from '../movementProvider';
import { Goal } from '../../goals';
import { BlockInfo } from '../../world/cacheWorld';
export declare class IdleMovement extends MovementProvider {
    movementDirs: Vec3[];
    provideMovements(start: Move, storage: Move[]): void;
    performInit(thisMove: Move, currentIndex: number, path: Move[]): Promise<void>;
    performPerTick(thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean>;
}
export declare class MovementAscend extends MovementProvider {
    movementDirs: Vec3[];
    provideMovements(start: Move, storage: Move[], goal: Goal, closed: Set<string>): void;
    provideAscend(node: Move, dir: Vec3, storage: Move[], closed: Set<string>): void;
}
export declare class MovementDescend extends MovementProvider {
    movementDirs: Vec3[];
    provideMovements(start: Move, storage: Move[], goal: Goal, closed: Set<string>): void;
    provideDescend(node: Move, dir: Vec3, storage: Move[], closed: Set<string>): void;
    dynamicFallCosts(info: BlockInfo, cost: number): void;
}
export declare class MovementDiagonal extends MovementProvider {
    movementDirs: Vec3[];
    provideMovements(start: Move, storage: Move[], goal: Goal, closed: Set<string>): void;
}
