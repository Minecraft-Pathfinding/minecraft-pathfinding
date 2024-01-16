import { Bot } from "mineflayer";
import { Vec3 } from "vec3";

import type { Item } from "prismarine-item";
import type { Item as MdItem } from "minecraft-data";
import { BlockInfo } from "../world/cacheWorld";
import { EPhysicsCtx, EntityPhysics } from "@nxg-org/mineflayer-physics-util";

type PlaceType = "liquid" | "solid" | "replaceable";


interface PlaceHandlerOpts {
  returnToStart?: boolean;
  returnToPos?: Vec3;
}

export class PlaceHandler {


  static reach = 4;
  private performing = false;
  private readonly vec: Vec3;

  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly type: PlaceType,
    public readonly offhand = false
  ) {
    this.vec = new Vec3(x, y, z);
  }

  public get isPerforming(): boolean {
    return this.performing;
  }

  /**
   * TODO: Move block static info to its own class.
   * @param bot
   * @param blockInfo
   */
  async getItem(bot: Bot, blockInfo: typeof BlockInfo) {
    switch (this.type) {
      case "liquid": {
        return bot.inventory.items().find((item) => item.name === "water_bucket");
      }
      case "solid": {
        return bot.inventory.items().find((item) => blockInfo.scaffoldingBlockItems.has(item.type));
      }
      case "replaceable": {
        throw new Error("Not implemented");
      }
      default:
        throw new Error("Not implemented");
    }
  }

  getCurrentItem(bot: Bot) {
    if (this.offhand) return bot.inventory.slots[bot.getEquipmentDestSlot("off-hand")]; // could be wrong lol
    return bot.inventory.slots[bot.getEquipmentDestSlot("hand")];
  }


  allowExternalInfluence(bot: Bot, ticks=1): boolean {
    if (!this.performing) return true;
    const ectx = new EntityPhysics(bot.registry);
    const state = EPhysicsCtx.FROM_BOT(ectx, bot);

    for (let i = 0; i < ticks; i++) {
      ectx.simulate(state, bot.pathfinder.world);
    }

    // TODO: add raycast check to see if block is still visible.
    return this.vec.distanceTo(state.position) < PlaceHandler.reach;
  }

  equipItem(bot: Bot, item: Item) {
    if (this.offhand) {
      bot.equip(item, "off-hand");
    } else {
      bot.equip(item, "hand");
    }
  }

  /**
   * Assumes that the bot is already at the position and that item is correct item.
   * @param bot
   * @param item
   * @param opts
   */
  async perform(bot: Bot, item: Item, opts: PlaceHandlerOpts = {}) {
    if (this.performing) throw new Error("Already performing");
    this.performing = true;
    const curInfo = {yaw: bot.entity.yaw, pitch: bot.entity.pitch};

    if (item === null) throw new Error("Invalid item");

    switch (this.type) {
      case "liquid": {
        if (item.name !== "water_bucket") throw new Error("Invalid item");
        if (this.getCurrentItem(bot) !== item) this.equipItem(bot, item);

        await bot.util.move.forceLookAt(this.vec, true);
        bot.activateItem(this.offhand);
        break; // not necessary.
      }

      case "solid": {
        if (this.getCurrentItem(bot) !== item) this.equipItem(bot, item);
        const block = bot.pathfinder.world.getBlock(this.vec);
        if (block === null) throw new Error("Invalid block");
        await bot.util.move.forceLookAt(this.vec, true);

        // TODO: calculate proper face to place block on. FireJoust has the code somewhere.
        // TODO: Do not await block response, that is too slow. Just assume it worked.
        bot.placeBlock(block, new Vec3(0, 1, 0));
        break;
      }
      case "replaceable":
      default: {
        throw new Error("Not implemented");
        break; // not necessary.
      }
    }

    if (opts.returnToPos !== undefined) {
      await bot.util.move.forceLookAt(opts.returnToPos, true);
    } else if (opts.returnToStart) {
      await bot.util.move.forceLook(curInfo.yaw, curInfo.pitch, true);
    }

    this.performing = false;
  }
}
