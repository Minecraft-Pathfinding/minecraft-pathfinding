import { Bot } from "mineflayer";
import { Vec3 } from "vec3";

import type { Item } from "prismarine-item";
import type { Item as MdItem } from "minecraft-data";
import { BlockInfo } from "../world/cacheWorld";
import { EPhysicsCtx, EntityPhysics } from "@nxg-org/mineflayer-physics-util";
import { World } from "../world/worldInterface";
import { AABB, BlockFace } from "@nxg-org/mineflayer-util-plugin";
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
  abstract canPerform(bot: Bot): Promise<boolean>;

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
      world.getBlockInfo(this.vec.offset(0, 1, 0)),
      world.getBlockInfo(this.vec.offset(0, -1, 0)),
      world.getBlockInfo(this.vec.offset(0, 0, -1)),
      world.getBlockInfo(this.vec.offset(0, 0, 1)),
      world.getBlockInfo(this.vec.offset(-1, 0, 0)),
      world.getBlockInfo(this.vec.offset(1, 0, 0)),
    ];
  }

  faceToVec(face: BlockFace) {
    switch (face) {
      case BlockFace.BOTTOM:
        return new Vec3(0, 1, 0);
      case BlockFace.TOP:
        return new Vec3(0, -1, 0);

      case BlockFace.NORTH:
        return new Vec3(0, 0, -1);
      case BlockFace.SOUTH:
        return new Vec3(0, 0, 1);
      case BlockFace.WEST:
        return new Vec3(-1, 0, 0);
      case BlockFace.EAST:
        return new Vec3(1, 0, 0);

      default:
        throw new Error("Invalid face");
    }
  }

  private raycastValid(raycast: Block & { face: BlockFace; intersect: Vec3 }, wantedBlock: Vec3, goalPlacement: Vec3) {
    if (raycast === null) return false;
    if (!wantedBlock.equals(raycast.position)) return false;
    const faceVec = this.faceToVec(raycast.face);
    const offset = goalPlacement.minus(wantedBlock);
    console.log("goal", goalPlacement, "intersect", raycast.intersect, "faceVec", faceVec, "offset", offset);
    return faceVec.equals(offset);
  }

  async canPerform(bot: Bot) {
    switch (this.type) {
      case "solid": {
        const bb = AABB.fromBlock(this.vec);
        const verts = bb.expand(-0.05, -0.05, -0.05).toVertices();
        const eyePos = bot.entity.position.offset(0, bot.physics.playerHeight, 0);
        const works = [];
        for (const vert of verts) {
          const rayRes = await bot.world.raycast(eyePos, vert.minus(eyePos).normalize(), PlaceHandler.reach);
          if (rayRes !== null) works.push(rayRes);
        }

        return works.some((res) => (res as any).position.plus(this.faceToVec(res.face).equals(this.vec)));
      }
    }

    return true;
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
        if (this.getCurrentItem(bot) !== item) this.equipItem(bot, item);

        const bb = AABB.fromBlock(this.vec);
        const verts = bb.expand(0.1, 0, 0.1).toVertices();

        const works: any[] = [];

        let triggered = false;
      
        outer: while (works.length === 0) {
          const ectx = EPhysicsCtx.FROM_BOT(bot.physicsUtil.engine, bot);
          const state = ectx.state;
          for (let i = 0; i < 5; i++) {
            const eyePos = state.pos.offset(0, bot.physics.playerHeight, 0);
            console.log(eyePos)
            inner: for (const vert of verts) {
              const rayRes = await bot.world.raycast(eyePos, vert.minus(eyePos).normalize(), PlaceHandler.reach);
              if (rayRes === null) continue inner;
              if ((rayRes as any).position.plus(this.faceToVec(rayRes.face)).equals(this.vec)) {
                works.push(rayRes);
                break outer;
              }
            }
            bot.physicsUtil.engine.simulate(ectx, bot.world);
          }

          console.log('done loop')
          
          await bot.waitForTicks(1);
          triggered = true;
          bot.setControlState('sneak', true)
        }

        console.log('\n\n')

        const rayRes = works[0];

        if (rayRes === undefined) throw new Error("Invalid block");

        console.log(bot.entity.position, this.faceToVec(rayRes.face), bot.canSeeBlock(rayRes));
        await bot.lookAt((rayRes as any).intersect, true);
        await bot.placeBlock(rayRes as any, this.faceToVec(rayRes.face));
        if (triggered) bot.setControlState('sneak', false)
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

  async canPerform(bot: Bot) {
    return true;
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
