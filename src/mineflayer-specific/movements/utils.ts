import { Bot } from "mineflayer";
import { Vec3 } from "vec3";

import type { Item } from "prismarine-item";
import type { Item as MdItem } from "minecraft-data";
import { BlockInfo } from "../world/cacheWorld";
import { EPhysicsCtx, EntityPhysics } from "@nxg-org/mineflayer-physics-util";
import { World } from "../world/worldInterface";
import {AABB, BlockFace} from '@nxg-org/mineflayer-util-plugin'
import { onceWithCleanup } from "../../utils";

type InteractType = "water" | "solid" | "replaceable";

interface InteractOpts {
  returnToStart?: boolean;
  returnToPos?: Vec3;
}

export abstract class InteractHandler {
  protected performing = false;
  protected readonly vec: Vec3;

  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly type: InteractType,
    public readonly offhand = false
  ) {
    this.vec = new Vec3(x, y, z);
  }

  public get isPerforming(): boolean {
    return this.performing;
  }

  abstract getItem(bot: Bot, blockInfo: typeof BlockInfo, block?: Block): Item | undefined;
  abstract perform(bot: Bot, item: Item, opts?: InteractOpts): Promise<void>;

  getCurrentItem(bot: Bot) {
    if (this.offhand) return bot.inventory.slots[bot.getEquipmentDestSlot("off-hand")]; // could be wrong lol
    return bot.inventory.slots[bot.getEquipmentDestSlot("hand")];
  }

  equipItem(bot: Bot, item: Item) {
    if (this.offhand) {
      bot.equip(item, "off-hand");
    } else {
      bot.equip(item, "hand");
    }
  }

  allowExternalInfluence(bot: Bot, ticks = 1): boolean {
    if (!this.performing) return true;
    const ectx = new EntityPhysics(bot.registry);
    const state = EPhysicsCtx.FROM_BOT(ectx, bot);

    for (let i = 0; i < ticks; i++) {
      ectx.simulate(state, bot.pathfinder.world);
    }

    // TODO: add raycast check to see if block is still visible.
    return this.vec.distanceTo(state.position) < PlaceHandler.reach;
  }
}

export class PlaceHandler extends InteractHandler {
  static reach = 4;

  static fromVec(vec: Vec3, type: InteractType, offhand = false) {
    return new PlaceHandler(vec.x, vec.y, vec.z, type, offhand);
  }

  /**
   * TODO: Move block static info to its own class.
   * @param bot
   * @param blockInfo
   */
  getItem(bot: Bot, blockInfo: typeof BlockInfo) {
    switch (this.type) {
      case "water": {
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

  getNearbyBlocks(world: World) {
    return [
      world.getBlockInfo(this.vec.offset(1, 0, 0)),
      world.getBlockInfo(this.vec.offset(-1, 0, 0)),
      world.getBlockInfo(this.vec.offset(0, 1, 0)),
      world.getBlockInfo(this.vec.offset(0, -1, 0)),
      world.getBlockInfo(this.vec.offset(0, 0, 1)),
      world.getBlockInfo(this.vec.offset(0, 0, -1)),
    ];
  }

  faceToVec(face: BlockFace) {
    switch (face) {
      case BlockFace.EAST:
        return new Vec3(1, 0, 0);
      case BlockFace.WEST:
        return new Vec3(-1, 0, 0);
      case BlockFace.BOTTOM:
        return new Vec3(0, 1, 0);
      case BlockFace.TOP:
        return new Vec3(0, -1, 0);
      case BlockFace.SOUTH:
        return new Vec3(0, 0, 1);
      case BlockFace.NORTH:
        return new Vec3(0, 0, -1);
      default:
        throw new Error("Invalid face");
    }
  }

  wantedFacePlacement(face: BlockFace) {
    switch (face) {
      case BlockFace.EAST:
        return new Vec3(0.5, 0.5, 0);
      case BlockFace.WEST:
        return new Vec3(-0.5, 0.5, 0);
      case BlockFace.BOTTOM:
        return new Vec3(0.5, 0, 0.5);
      case BlockFace.TOP:
        return new Vec3(0.5, 1, 0.5);
      case BlockFace.NORTH:
        return new Vec3(0.5, 0.5, -0.5);
      case BlockFace.SOUTH:
        return new Vec3(0.5, 0.5, 0.5);
      default:
        console.log(face);
        throw new Error("Invalid face");
    }
  }


  private raycastValid(raycast: Block & {face: BlockFace}, wantedBlock: Vec3, goalPlacement: Vec3) {
    if (raycast === null) return false;
    if (!wantedBlock.equals(raycast.position)) return false;
    const faceVec = this.faceToVec(raycast.face);
    const offset = goalPlacement.minus(wantedBlock)
    console.log("faceVec", faceVec, "offset", offset)
    return faceVec.equals(offset);
  }

  /**
   * Assumes that the bot is already at the position and that item is correct
   * item.
   * @param bot
   * @param item
   * @param opts
   */
  async perform(bot: Bot, item: Item, opts: InteractOpts = {}) {
    if (this.performing) throw new Error("Already performing");
    this.performing = true;
    const curInfo = { yaw: bot.entity.yaw, pitch: bot.entity.pitch };

    if (item === null) throw new Error("Invalid item");

    switch (this.type) {
      case "water": {
        if (item.name !== "water_bucket") throw new Error("Invalid item");
        if (this.getCurrentItem(bot) !== item) this.equipItem(bot, item);

        await bot.lookAt(this.vec, true);
        bot.activateItem(this.offhand);
        break; // not necessary.
      }

      case "solid": {
        console.log("FUCL")
        if (this.getCurrentItem(bot) !== item) this.equipItem(bot, item);

        await bot.lookAt(this.vec, true);
        let eyePos = bot.entity.position.offset(0, 1.62, 0)
        let viewDir = bot.util.getViewDir();

        let blocks = this.getNearbyBlocks(bot.pathfinder.world);
        blocks = blocks.filter(b=>b.physical);
        blocks = blocks.sort((a,b)=> b.position.minus(eyePos).dot(viewDir) - a.position.minus(eyePos).dot(viewDir));

        let block1 = blocks[0];

      
        console.log(blocks, block1, this.vec, bot.blockAt(this.vec))

        const offset = block1.position.minus(this.vec);
   
        await bot.lookAt(block1.position.minus(offset.scale(0.9)), true);

        if (block1 === undefined) throw new Error("Invalid block");

        let rayRes = await bot.world.raycast(eyePos, bot.util.getViewDir(), PlaceHandler.reach);
        while (rayRes === null || !this.raycastValid(rayRes as any, block1.position, this.vec)) {
          await onceWithCleanup(bot, 'move');
          blocks = blocks.sort((a,b)=> b.position.minus(eyePos).dot(viewDir) - a.position.minus(eyePos).dot(viewDir));
          block1 = blocks[0];

          eyePos = bot.entity.position.offset(0, 1.62, 0)
          const offset = block1.position.minus(this.vec);

          await bot.lookAt(block1.position.minus(offset.scale(0.9)), true);
          viewDir = bot.util.getViewDir();          
          rayRes = await bot.world.raycast(eyePos, bot.util.getViewDir(), PlaceHandler.reach);
        }

        if (rayRes === null) throw new Error("Invalid block");

        console.log(bot.entity.position, this.faceToVec(rayRes.face))
        await bot.placeBlock(rayRes as any, this.faceToVec(rayRes.face));
        break;
      }
      case "replaceable":
      default: {
        throw new Error("Not implemented");
        break; // not necessary.
      }
    }

    if (opts.returnToPos !== undefined) {
      await bot.lookAt(opts.returnToPos, true);
    } else if (opts.returnToStart) {
      await bot.look(curInfo.yaw, curInfo.pitch, true);
    }

    this.performing = false;
  }
}

export class BreakHandler extends InteractHandler {
  static reach = 4;

  static fromVec(vec: Vec3, type: InteractType, offhand = false) {
    return new BreakHandler(vec.x, vec.y, vec.z, type, offhand);
  }

  getBlock(world: World) {
    return world.getBlock(this.vec);
  }

  getItem(bot: Bot, blockInfo: typeof BlockInfo, block: Block): Item | undefined {
    switch (this.type) {
      case "water": {
        return bot.inventory.items().find((item) => item.name === "bucket"); // empty bucket
      }
      case "solid": {
        // TODO: identify best tool for block.
        return bot.inventory.items()[0];
      }
      case "replaceable": {
        throw new Error("Not implemented");
      }
      default:
        throw new Error("Not implemented");
    }
  }

  async perform(bot: Bot, item: Item, opts: InteractOpts = {}): Promise<void> {
    if (this.performing) throw new Error("Already performing");
    this.performing = true;
    const curInfo = { yaw: bot.entity.yaw, pitch: bot.entity.pitch };

    if (item === null) throw new Error("Invalid item");

    switch (this.type) {
      case "water": {
        if (item.name !== "bucket") throw new Error("Invalid item");
        if (this.getCurrentItem(bot) !== item) this.equipItem(bot, item);
        await bot.lookAt(this.vec, true);
        bot.activateItem(this.offhand);
        break; // not necessary.
      }

      case "solid": {
        if (this.getCurrentItem(bot) !== item) this.equipItem(bot, item);
        const block = bot.pathfinder.world.getBlock(this.vec);
        if (block === null) throw new Error("Invalid block");
        await bot.lookAt(this.vec, true);
        await bot.dig(block);
        break;
      }

      case "replaceable": {
        throw new Error("Not implemented");
        break; // not necessary.
      }

      default: {
        throw new Error("Not implemented");
        break; // not necessary.
      }
    }

    if (opts.returnToPos !== undefined) {
      await bot.lookAt(opts.returnToPos, true);
    } else if (opts.returnToStart) {
      await bot.util.move.forceLook(curInfo.yaw, curInfo.pitch, true);
    }

    this.performing = false;
  }
}
