import { Bot } from 'mineflayer';
import { Move } from '../move';
import { MovementOptions } from '../movements/movement';
import { MovementProvider } from '../movements/movementProvider';
import { World } from '../world/worldInterface';
import { MovementOptimizer } from './optimizer';
export declare class BridgeOptimizer extends MovementOptimizer {
    private readonly _bridgeProvider;
    constructor(bot: Bot, world: World, settings?: Partial<MovementOptions>);
    protected getMergedMoveType(_startIndex: number, _endIndex: number, _path: readonly Move[]): MovementProvider;
    identEndOpt(currentIndex: number, path: Move[]): number;
}
