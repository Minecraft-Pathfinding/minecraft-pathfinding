import { Bot } from 'mineflayer';
import { PathData } from '../../abstract/node';
import { BuildableMoveProvider, MovementProvider } from '../movements'
import { World } from '../world/worldInterface';
import { MovementOptimizer } from './optimizer';
import { Move } from '../move';

export * from './optimizer'


export type OptimizationSetup = Map<BuildableMoveProvider, BuildableOptimizer>

export type BuildableOptimizer = new (
    bot: Bot,
    world: World,
  ) => MovementOptimizer;
  
export type OptimizationMap = Map<BuildableMoveProvider, MovementOptimizer>;