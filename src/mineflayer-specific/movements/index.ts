import { Bot } from 'mineflayer';
import { World } from '../world/worldInterface';
import { MovementOptions } from './movement';
import { MovementProvider } from './movementProvider';
import { MovementExecutor } from './movementExecutor';

// Don't mind these stupid ass typings, I'll clean them up later.
export type BuildableMoveProvider = new (bot: Bot, world: World, settings: Partial<MovementOptions>) => MovementProvider;
export type BuildableMoveExecutor = new (bot: Bot, world: World, settings: Partial<MovementOptions>) => MovementExecutor;

export type MovementSetup = Map<BuildableMoveProvider, BuildableMoveExecutor>;
export type ExecutorMap = Map<BuildableMoveProvider, MovementExecutor>;


export * from './movement'
export * from './movementExecutors'
export * from './movementProviders'
export * from './movementExecutor'
export * from './movementProvider'
// export * from './pp'
