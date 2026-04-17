import { MovementProvider as AMovementProvider } from '../../abstract';
import { Move } from '../move';
import { MovementProvider } from '../movements';
export declare class ReplacementHandler implements AMovementProvider<Move> {
    private readonly orgMove;
    private readonly replacement;
    constructor(orgMove: Move, replacement: MovementProvider);
    static createFromSingle(move: Move, replacement: MovementProvider): ReplacementHandler;
    sanitize(): boolean;
    getNeighbors(org: Move): Move[];
}
