import { Bot } from "mineflayer";
import { Block } from "./types";
import type { Item } from "prismarine-item";
import * as nbt from "prismarine-nbt";
import { BlockInfo } from "./mineflayer-specific/world/cacheWorld";
import { AABB } from "@nxg-org/mineflayer-util-plugin";

export class PathingUtil {
  private items: Item[] = [];
  private tools: Item[] = [];

  private memoedDigSpeed: { [key: string]: number } = {};
  private memoedBestTool: { [key: string]: Item | null } = {};

  constructor(private readonly bot: Bot) {
    this.refresh();
  }


  public refresh() {
    this.items = this.bot.inventory.items();
    this.tools = this.items.filter(
      (item) => item.name.includes("pickaxe") || item.name.includes("axe") || item.name.includes("shovel") || item.name.includes("hoe")
    );
    this.memoedDigSpeed = {};
    this.memoedBestTool = {};
  }

  /**
   * TODO: Handle underwater digging.
   */
  public bestHarvestingTool(block: Block) {
    if (block === null) return null;
    if (this.memoedBestTool[block.type]) return this.memoedBestTool[block.type];

    const availableTools = this.tools;
    const effects = this.bot.entity.effects;

    let fastest = Number.MAX_VALUE;
    let bestTool = null as unknown as Item;
    for (const tool of availableTools) {
      const enchants = tool && tool.nbt ? nbt.simplify(tool.nbt).Enchantments : [];
      const digTime = block.digTime(tool ? tool.type : null, false, false, false, enchants, effects);
      if (digTime < fastest) {
        fastest = digTime;
        bestTool = tool;
      }
    }

    if (fastest === Number.MAX_VALUE) {
      fastest = block.digTime(null, false, false, false, [], effects);
    }

    this.memoedBestTool[block.type] = bestTool;
    this.memoedDigSpeed[block.type] = fastest;
    return bestTool;
  }

  public digCost(block: Block) {
    if (this.memoedDigSpeed[block.type]) return this.memoedDigSpeed[block.type];
    this.bestHarvestingTool(block); // run it to fill everything in.

    return this.memoedDigSpeed[block.type];
  }
}
