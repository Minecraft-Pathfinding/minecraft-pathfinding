import { Bot } from 'mineflayer';
import { ThePathfinder } from './ThePathfinder';
import { Vec3 } from 'vec3';
import { Block, HandlerOpts, PlaceBlockOptions, ResetReason } from './types';
import { PathingUtil } from './PathingUtil';
import * as goals from './mineflayer-specific/goals';
import { Path } from './mineflayer-specific/algs';
export declare function createPlugin(opts?: HandlerOpts): (bot: Bot) => void;
declare module 'mineflayer' {
    interface Bot {
        pathfinder: ThePathfinder;
        pathingUtil: PathingUtil;
        _placeBlockWithOptions: (referenceBlock: Block, faceVector: Vec3, options?: PlaceBlockOptions) => Promise<void>;
    }
    interface BotEvents {
        pathGenerated: (path: Path) => void;
        resetPath: (reason: ResetReason) => void;
        enteredRecovery: (errorCount: number) => void;
        exitedRecovery: (errorCount: number) => void;
        goalSet: (goal: goals.Goal) => void;
        goalFinished: (goal: goals.Goal) => void;
        goalAborted: (goal: goals.Goal) => void;
    }
}
export * as goals from './mineflayer-specific/goals';
export * as custom from './mineflayer-specific/custom';
export * as movementProviders from './mineflayer-specific/movements/movementProviders';
export { BuildableMoveProvider, BuildableMoveExecutor, MovementSetup } from './mineflayer-specific/movements';
export { BridgeProvider } from './mineflayer-specific/movements/bridgeProvider';
export { BridgeExecutor } from './mineflayer-specific/movements/bridgeExecutor';
export { BridgeOptimizer } from './mineflayer-specific/post/bridgeOptimizer';
