import { Bot } from "mineflayer";
import { Vec3 } from "vec3";

import type { Item } from "prismarine-item";
import type { Item as MdItem } from "minecraft-data";
import { BlockInfo } from "../world/cacheWorld";
import { EPhysicsCtx, EntityPhysics, EntityState } from "@nxg-org/mineflayer-physics-util";
import { World } from "../world/worldInterface";
import { AABB, AABBUtils, BlockFace } from "@nxg-org/mineflayer-util-plugin";
import { onceWithCleanup } from "../../utils";


import type {RaycastBlock} from 'prismarine-world/types/iterators'

type InteractType = "water" | "solid" | "replaceable";
type RayType = {
  intersect: Vec3;
  face: BlockFace;
} & Block


interface InteractOpts {
  returnToStart?: boolean;
  returnToPos?: Vec3;
}

export abstract class InteractHandler {
  protected performing = false;
  public readonly vec: Vec3;

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
  abstract performInfo(bot: Bot, ticks?: number): Promise<InteractionPerformInfo>;

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

  async performInfo(bot: Bot, ticks=7) {
    switch (this.type) {
      case "water": {
        throw new Error("Not implemented");
      }

      case "solid": {

        const works = [];
        const ectx = EPhysicsCtx.FROM_BOT(bot.physicsUtil.engine, bot);
        const state = ectx.state;
        const bb = AABB.fromBlock(this.vec);

        const dx = bot.entity.position.x - (this.vec.x + 0.5)
        const dy = bot.entity.position.y + bot.entity.height - (this.vec.y + 0.5)
        const dz = bot.entity.position.z - (this.vec.z + 0.5)
        // Check y first then x and z
        const visibleFaces = {
          y: Math.sign(Math.abs(dy) > 0.5 ? dy : 0),
          x: Math.sign(Math.abs(dx) > 0.5 ? dx : 0),
          z: Math.sign(Math.abs(dz) > 0.5 ? dz : 0)
        }
        
        const verts = bb.expand(0.1, 0.5, 0.1).toVertices();
        
        let shiftTick = Infinity;
        for (let i = 0; i < ticks; i++) {
          const eyePos = state.pos.offset(0, 1.62, 0);
          const bb1 = state.getAABB();
          for (const vert of verts) {
            const rayRes = await bot.world.raycast(eyePos, vert.minus(eyePos).normalize(), PlaceHandler.reach);
            if (rayRes === null) continue;
            const pos = (rayRes as any).position.plus(this.faceToVec(rayRes.face));
                if (pos.equals(this.vec)) {
                  if (AABB.fromBlock(pos).intersects(bb1)) {
                    
                    if (shiftTick !== Infinity) {
                      // i--;
                      shiftTick = i;
                      state.control.set('sneak', true)
                    }
                  
                    continue
                  };
                  works.push(rayRes as unknown as RayType);
                }
          }
          if (works.length !== 0) {
            return {ticks: i, shiftTick, raycasts: works}; 
          }

          // inaccurate, should reset physics sim, but whatever.
          bot.physicsUtil.engine.simulate(ectx, bot.world);
      }
        return {ticks: Infinity, shiftTick: Infinity, raycasts: works};
      }

      case "replaceable": {
        throw new Error("Not implemented");
      }
      default: {
        throw new Error("Not implemented");
      }
    }
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

        let works = await this.performInfo(bot, 0);

        while (works.raycasts.length === 0) {
          await bot.waitForTicks(1)
          works = await this.performInfo(bot)
        }
        
        // console.log('got works')


   
        const stateEyePos = bot.entity.position.offset(0, 1.62, 0);
        // works.raycasts.sort((a, b) => b.intersect.minus(stateEyePos).norm() - a.intersect.minus(stateEyePos).norm());
        works.raycasts.sort((a, b) => a.intersect.distanceTo(stateEyePos) - b.intersect.distanceTo(stateEyePos));
        
       
        let rayRes = works.raycasts[0];
        console.log(works.ticks, works.shiftTick, rayRes.intersect)

        if (rayRes === undefined) throw new Error("Invalid block");

        for (let i = 0; i < works.ticks; i++) {
          if (i === works.shiftTick) bot.setControlState('sneak', true)
          await bot.waitForTicks(1);
        }
    
        const pos = rayRes.position.plus(this.faceToVec(rayRes.face))
        const invalidPlacement =  AABBUtils.getEntityAABB(bot.entity).intersects(AABB.fromBlock(pos))
        if (invalidPlacement) throw new Error("Invalid placement");

        const testCheck = await bot.world.raycast(bot.entity.position.offset(0,1.62,0), bot.util.getViewDir(), PlaceHandler.reach) as unknown as RayType;
        if (!testCheck || !testCheck.position.equals(rayRes.position) || testCheck.face !== rayRes.face) {
          console.log('looking at ', rayRes.intersect)
          await bot.lookAt(rayRes.intersect, true);
        }

     
        let finished = false;
        let sneaking = false;
        const task = bot._placeBlockWithOptions(rayRes, this.faceToVec(rayRes.face), { forceLook: "ignore" });
        task.then(()=> {
          finished = true;
          if (!sneaking) return;
          bot.setControlState('sneak', false)
        })

        setTimeout(() => {
          if (finished) return;
          sneaking = true;
          bot.setControlState('sneak', true)
        }, 30)

        await task;
        if (works.shiftTick !== Infinity) bot.setControlState('sneak', false)
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

  async performInfo(bot: Bot) {
    return true as any;
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
        const block = await bot.world.getBlock(this.vec);
        if (!block) throw new Error("Invalid block");
        await bot.lookAt(this.vec, true);
        await bot.dig(block, false);
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
