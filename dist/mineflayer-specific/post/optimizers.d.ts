import { Move } from '../move';
import { MovementOptimizer } from './optimizer';
export declare class LandStraightAheadOpt extends MovementOptimizer {
    identEndOpt(currentIndex: number, path: Move[]): Promise<number>;
}
export declare class DropDownOpt extends MovementOptimizer {
    readonly mergeInteracts = false;
    identEndOpt(currentIndex: number, path: Move[]): number | Promise<number>;
}
export declare class ForwardJumpUpOpt extends MovementOptimizer {
    identEndOpt(currentIndex: number, path: Move[]): number | Promise<number>;
}
