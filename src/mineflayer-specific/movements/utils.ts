import { Bot } from "mineflayer";
import { Vec3 } from "vec3";

import type { Item } from "prismarine-item";
import type { Item as MdItem } from "minecraft-data";
import { BlockInfo } from "../world/cacheWorld";
import { EPhysicsCtx, EntityPhysics, EntityState } from "@nxg-org/mineflayer-physics-util";
import { World } from "../world/worldInterface";
import { AABB, AABBUtils, BlockFace } from "@nxg-org/mineflayer-util-plugin";
import { onceWithCleanup } from "../../utils";

type InteractType = "water" | "solid" | "replaceable";

interface InteractOpts {
  returnToStart?: boolean;
  returnToPos?: Vec3;
}

export abstract class InteractHandler {
  protected performing = false;
  protected readonly vec: Vec3;

  protected _done = false;

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

  public get done(): boolean {
    return this._done;
  }

  abstract getItem(bot: Bot, blockInfo: typeof BlockInfo, block?: Block): Item | undefined;
  abstract perform(bot: Bot, item: Item, opts?: InteractOpts): Promise<void>;
  abstract canPerform(bot: Bot): Promise<false | any>;

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
        return new Vec3(0, -1, 0);
      case BlockFace.TOP:
        return new Vec3(0, 1, 0);

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

  async canPerform(bot: Bot) {
    switch (this.type) {
      case "water": {
        throw new Error("Not implemented");
      }

      case "solid": {
        const bb = AABB.fromBlock(this.vec);
        const verts = bb.toVertices();
        const eyePos = bot.entity.position.offset(0, 1.62, 0);
        const works = [];
        for (const vert of verts) {
          const rayRes = await bot.world.raycast(eyePos, vert.minus(eyePos).normalize(), PlaceHandler.reach);
          if (rayRes === null) continue;
          const pos = (rayRes as any).position.plus(this.faceToVec(rayRes.face));
              if (pos.equals(this.vec)) {
                if (AABB.fromBlock(pos).intersects(bb)) continue;
                works.push(rayRes);
              }
        }

        return works;
      }

      case "replaceable": {
        throw new Error("Not implemented");
      }
    }

    return false
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
        const verts = bb.expand(0, 0.5, 0).toVertices(); // TODO: figure out what is doing this
        verts.push(this.vec.offset(0, 1, 0));

        const eyePos0 = bot.entity.position.offset(0, 1.62, 0);
        const viewDir = bot.util.getViewDir();
        verts.sort((a, b) => b.minus(eyePos0).normalize().dot(viewDir) - a.minus(eyePos0).normalize().dot(viewDir));

        const works: any[] = [];

        let triggered = false;

        let i = 0;

        let state: EntityState;
        outer: while (works.length === 0) {
          const ectx = EPhysicsCtx.FROM_BOT(bot.physicsUtil.engine, bot);
          state = ectx.state;
          const bb = state.getAABB();
          // console.log("state", state.pos, "vec", this.vec, "dist", state.pos.distanceTo(this.vec));
          for (i = 0; i < 7; i++) {
            const eyePos = state.pos.offset(0, 1.62, 0);
            inner: for (const vert of verts) {
              const rayRes = await bot.world.raycast(eyePos, vert.minus(eyePos).normalize(), PlaceHandler.reach);
              if (rayRes === null) continue inner;

              // console.log((rayRes as any).position, rayRes.face, (rayRes as any).intersect);
              // console.log(rayRes.face, this.faceToVec(rayRes.face), (rayRes as any).position.plus(this.faceToVec(rayRes.face)).equals(this.vec))
              const pos = (rayRes as any).position.plus(this.faceToVec(rayRes.face));
              if (pos.equals(this.vec)) {
                if (AABB.fromBlock(pos).intersects(bb)) continue inner;
                works.push(rayRes);
              }
            }

            if (works.length > 0) break outer;
            bot.physicsUtil.engine.simulate(ectx, bot.world);
          }

          if (i === 7) {
            // throw new Error("Invalid movement")
            triggered = true;
            bot.setControlState("sneak", true);
          }
          await bot.waitForTicks(1);
        }

        console.log(`done ${i} | ${works.length}\n\n`);

        const stateEyePos = state!.pos.offset(0, 1.62, 0);
        // works.sort((a, b) => a.intersect.minus(stateEyePos).norm() - b.intersect.minus(stateEyePos).norm());
        works.sort((a, b) => a.intersect.distanceTo(stateEyePos) - b.intersect.distanceTo(stateEyePos));
        
        let rayRes = works[0];

        if (rayRes === undefined) throw new Error("Invalid block");

        if (!triggered && i > 0) await bot.waitForTicks(i - 1);

        // while (true) {
        //   const bb1 = AABBUtils.getEntityAABB(bot.entity); 
        //   const eyePos = bot.entity.position.offset(0, 1.62, 0);
        //   const testCheck: any = await bot.world.raycast(eyePos, rayRes.intersect.minus(eyePos).normalize(), PlaceHandler.reach);
        //   if (!testCheck.position.equals(rayRes.position) || testCheck.face !== rayRes.face) {

        //     const pos = (testCheck as any).position.plus(this.faceToVec(rayRes.face));
        //     if (pos.equals(this.vec)) {
        //       if (!AABB.fromBlock(pos).intersects(bb1)) 
        //       rayRes = testCheck;
        //     break;
        //     }

        //     console.log("failed check", testCheck.position, rayRes.position, testCheck.face, rayRes.face);
        //     // await bot.lookAt((rayRes as any).intersect, true); // allow one tick to sync looking.
        //     bot.setControlState("sneak", true);
        //     triggered = true;
        //     await bot.waitForTicks(1);
        //   } else break;
        // }

        // bot.setControlState("sneak", true);
        // await bot.util.move.forceLookAt(rayRes.intersect, true); // allow one tick to sync looking.
        // if (!triggered && i > 0) await bot.waitForTicks(1);

        console.log('placing', rayRes.position, rayRes.face)
        console.log(AABBUtils.getEntityAABB(bot.entity), AABBUtils.getEntityAABB(bot.entity).containsVec(rayRes.position.plus(this.faceToVec(rayRes.face))))
        await bot._placeBlockWithOptions(rayRes as any, this.faceToVec(rayRes.face), { forceLook: "ignore" });
        if (triggered) bot.setControlState("sneak", false);
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

    this._done = true;
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
