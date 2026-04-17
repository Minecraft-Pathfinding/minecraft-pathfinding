import { Bot } from 'mineflayer';
import { PathProducer, AStar } from '../../mineflayer-specific/algs';
import * as goals from '../goals';
import { Move } from '../move';
import { ExecutorMap, MovementOptions } from '../movements';
import { World } from '../world/worldInterface';
import { AdvanceRes } from '.';
export declare class ContinuousPathProducer implements PathProducer {
    private readonly start;
    private readonly goal;
    private readonly settings;
    private readonly bot;
    private readonly world;
    private readonly movements;
    private astarContext;
    private _currentPath;
    private readonly gcInterval;
    private lastGc;
    private readonly lastStartTime;
    constructor(start: Move, goal: goals.Goal, settings: MovementOptions, bot: Bot, world: World, movements: ExecutorMap);
    getAstarContext(): AStar | undefined;
    getCurrentPath(): Move[];
    advance(): AdvanceRes;
}
