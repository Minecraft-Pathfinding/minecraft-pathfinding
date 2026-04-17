import { Bot } from 'mineflayer';
import { Block } from './types';
import type { Item } from 'prismarine-item';
export declare class PathingUtil {
    private readonly bot;
    private items;
    private tools;
    private memoedDigSpeed;
    private memoedBestTool;
    constructor(bot: Bot);
    refresh(): void;
    bestHarvestingTool(block: Block): Item | null;
    digCost(block: Block): number;
}
