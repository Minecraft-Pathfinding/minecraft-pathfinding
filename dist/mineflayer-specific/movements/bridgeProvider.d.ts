import { Vec3 } from 'vec3';
import { Move } from '../move';
import * as goals from '../goals';
import { MovementProvider } from './movementProvider';
export declare class BridgeProvider extends MovementProvider {
    readonly movementDirs: Vec3[];
    provideMovements(_start: Move, _storage: Move[], _goal: goals.Goal, _closed: Set<string>): void;
}
