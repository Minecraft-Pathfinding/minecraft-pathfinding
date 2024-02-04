import { Bot } from "mineflayer";
import { Vec3 } from "vec3";

import type { Item } from "prismarine-item";
import type { Item as MdItem } from "minecraft-data";
import { BlockInfo } from "../world/cacheWorld";
import { EPhysicsCtx, EntityPhysics, EntityState } from "@nxg-org/mineflayer-physics-util";
import { World } from "../world/worldInterface";
import { AABB, AABBUtils, BlockFace } from "@nxg-org/mineflayer-util-plugin";

import { CancelError } from "./exceptions";
import { Movement, MovementOptions } from "./movement";
import { MovementExecutor } from "./movementExecutor";
import { Block } from "../../types";

export type InteractType = "water" | "solid" | "replaceable";
export type RayType = {
  intersect: Vec3;
  face: BlockFace;
} & Block;

type InteractionPerformInfo = {
  ticks: number;
  tickAllowance: number;
  shiftTick: number;
  raycasts: RayType[];
};

export interface InteractOpts {
  info?: InteractionPerformInfo;
  returnToStart?: boolean;
  returnToPos?: Vec3;
  predictBlock?: boolean;
}

/**
 * TODO: Predict time of rotation for looking.
 *
 * Allow looking sooner than the actual block placement.
 */
export abstract class InteractHandler {
  protected performing = false;
  public readonly vec: Vec3;

  protected _done = false;

  protected _internalLock = true;

  public readonly blockInfo: BlockInfo;
  public readonly bb: AABB;

  protected readonly move!: MovementExecutor;

  protected get settings() {
    return this.move.settings;
  }

  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly type: InteractType,
    public readonly offhand = false
  ) {
    this.vec = new Vec3(x, y, z);
    this.bb = AABB.fromBlock(this.vec);
    this.blockInfo = this.toBlockInfo();
  }

  public get isPerforming(): boolean {
    return this.performing;
  }

  public get done(): boolean {
    return this._done;
  }

  public get allowExit(): boolean {
    return !this._internalLock;
  }

  public loadMove(move: Movement) {
    (this as any).move = move;
  }

  abstract getItem(bot: Bot, blockInfo: typeof BlockInfo, block?: Block): Item | null;
  abstract perform(bot: Bot, item: Item | null, opts?: InteractOpts): Promise<void>;
  abstract performInfo(bot: Bot, ticks?: number): Promise<InteractionPerformInfo>;
  abstract toBlockInfo(): BlockInfo;

  getCurrentItem(bot: Bot) {
    if (this.offhand) return bot.inventory.slots[bot.getEquipmentDestSlot("off-hand")]; // could be wrong lol
    return bot.inventory.slots[bot.getEquipmentDestSlot("hand")];
  }

  async equipItem(bot: Bot, item: Item | null) {
    if (item === null) {
      bot.unequip(this.offhand ? "off-hand" : "hand");
    } else if (this.offhand) {
      await bot.equip(item, "off-hand");
    } else {
      await bot.equip(item, "hand");
    }
    bot.updateHeldItem();
  }

  /**
   * TODO: FUCK
   */
  async allowExternalInfluence(bot: Bot, ticks = 1, sneak = false) {
    if (!this.performing) return true;
    if (!this._internalLock) return true;

    const res = await this.performInfo(bot, ticks);
    if (res.ticks < Infinity) return true;

    const ectx = new EntityPhysics(bot.registry);
    const state = EPhysicsCtx.FROM_BOT(ectx, bot);

    // state.state.control.set('sneak', sneak)

    const flag0 = bot.entity.onGround
    for (let i = 0; i < ticks; i++) {
      ectx.simulate(state, bot.pathfinder.world);
    }

    if (flag0) if (state.position.y < bot.entity.position.y) return false;

    // TODO: add raycast check to see if block is still visible.
    if (state.state.pos.y < bot.entity.position.y) return false;
    return this.bb.distanceToVec(state.state.pos) < PlaceHandler.reach;
    // return this.vec.distanceTo(state.position) < PlaceHandler.reach;
  }
}

export class PlaceHandler extends InteractHandler {
  static reach = 4;

  static fromVec(vec: Vec3, type: InteractType, offhand = false) {
    return new PlaceHandler(vec.x, vec.y, vec.z, type, offhand);
  }

  toBlockInfo(): BlockInfo {
    switch (this.type) {
      case "solid":
        return BlockInfo.SOLID(this.vec);
      case "water":
        return BlockInfo.WATER(this.vec);
      case "replaceable":
        return BlockInfo.REPLACEABLE(this.vec);
      default:
        throw new Error("Invalid type");
    }
  }

  /**
   * TODO: Move block static info to its own class.
   * @param bot
   * @param blockInfo
   */
  getItem(bot: Bot, blockInfo: typeof BlockInfo) {
    switch (this.type) {
      case "water": {
        return bot.inventory.items().find((item) => item.name === "water_bucket") ?? null;
      }
      case "solid": {
        return bot.inventory.items().find((item) => blockInfo.scaffoldingBlockItems.has(item.type)) ?? null;
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

  async performInfo(bot: Bot, ticks = 15, scale = 0.5) {
    // bot.chat(`/particle flame ${this.vec.x} ${this.vec.y} ${this.vec.z} 0 0 0 0 1 force`);
    // bot.chat(`pointed to: ${this.vec}`);
    // console.log(this.vec)
    switch (this.type) {
      case "water": {
        throw new Error("Not implemented");
      }

      case "solid": {
        const works = [];

        let startTick = 0;
        let shiftTick = Infinity;
        let i = 0;
        for (; i <= ticks; i++) {
          const ectx = EPhysicsCtx.FROM_BOT(bot.physicsUtil.engine, bot);

          const state = ectx.state;

          state.control.set("sneak", shiftTick < Infinity);
          for (let j = 0; j < i; j++) {
            // inaccurate, should reset physics sim, but whatever.
            bot.physicsUtil.engine.simulate(ectx, bot.world);
          }

          const eyePos = state.pos.offset(0, 1.62, 0);
          const bb0 = AABB.fromBlock(this.vec);
          const bb1 = AABBUtils.getEntityAABBRaw({ position: state.pos, width: 0.6, height: 1.8 });

          const dx = state.pos.x - (this.vec.x + 0.5);
          const dy = state.pos.y + bot.entity.height - (this.vec.y + 0.5);
          const dz = state.pos.z - (this.vec.z + 0.5);
          // Check y first then x and z
          const visibleFaces: any = {
            y: Math.sign(Math.abs(dy) >= 0 ? dy : 0),
            x: Math.sign(Math.abs(dx) >= 0 ? dx : 0),
            z: Math.sign(Math.abs(dz) >= 0 ? dz : 0),
          };

          // i need these to be perfect, but they're not lmao
          // I don't have logic for these to be perfect, otherwise I believe this would be working fully
          const verts = Object.entries(visibleFaces).flatMap(([k, v]) => {
            return [
              this.vec.offset(
                0.5 + (k === "x" ? visibleFaces[k] * 0.49 : 0),
                0.5 + (k === "y" ? visibleFaces[k] * 0.49 : 0),
                0.5 + (k === "z" ? visibleFaces[k] * 0.49 : 0)
              ),
            ];
          });

          // verts.push(...bb0.expand(-0.01, -0.01, -0.01).toVertices())
          // verts.push(this.vec.offset(0.5, 0.1, 0.5));

          // console.log(state.pos, this.vec, verts)
          let good = 0;
          for (const vert of verts) {
            const rayRes: RayType | null = (await bot.world.raycast(
              eyePos,
              vert.minus(eyePos).normalize().scale(scale),
              PlaceHandler.reach / scale
            )) as unknown as RayType;
            if (rayRes === null) continue;
            const pos = (rayRes as any).position.plus(this.faceToVec(rayRes.face));
            if (pos.equals(this.vec)) {
              if (bb1.containsVec(rayRes.intersect)) continue;
              if (AABB.fromBlock(pos).intersects(bb1)) {
                if (shiftTick === Infinity) {
                  shiftTick = i;
                  i--;
                }

                continue;
              }
              good++;
              if (startTick === 0) startTick = i;
              works.push(rayRes as unknown as RayType);
            }
          }
          if (works.length !== 0) {
            if (good === 0) return { ticks: Math.floor((i + startTick) / 2), tickAllowance: i - startTick, shiftTick, raycasts: works };
          }
        }
        // console.log('RAN I', i)
        return { ticks: Infinity, tickAllowance: Infinity, shiftTick: Infinity, raycasts: works };
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
    this._internalLock = true;
    const curInfo = { yaw: bot.entity.yaw, pitch: bot.entity.pitch };

    if (item === null) throw new Error("Invalid item");

    let start = performance.now();
    switch (this.type) {
      case "water": {
        if (item.name !== "water_bucket") throw new Error("Invalid item");
        if (this.getCurrentItem(bot) !== item) await this.equipItem(bot, item);

        await bot.lookAt(this.vec, this.settings.forceLook);
        bot.activateItem(this.offhand);
        break; // not necessary.
      }

      case "solid": {
        if (this.getCurrentItem(bot) !== item) await this.equipItem(bot, item);

        const predictBlock = opts.predictBlock ?? true;
        let works = opts.info || (await this.performInfo(bot));

        while (works.raycasts.length === 0) {
          await bot.waitForTicks(1);
          const start = performance.now();
          works = await this.performInfo(bot);
          const end = performance.now();
          // console.log("info took", end - start, "ms");
        }

        const stateEyePos = bot.entity.position.offset(0, 1.62, 0);
        const lookDir = bot.util.getViewDir();
        // works.raycasts.sort((a, b) => b.intersect.minus(stateEyePos).norm() - a.intersect.minus(stateEyePos).norm());
        // works.raycasts.sort((a, b) => a.intersect.distanceTo(stateEyePos) - b.intersect.distanceTo(stateEyePos));
        works.raycasts.sort((a, b) => b.intersect.minus(stateEyePos).dot(lookDir) - a.intersect.minus(stateEyePos).dot(lookDir));

        let rayRes = works.raycasts[0];
        if (rayRes === undefined) throw new Error("Invalid block");

        const pos = rayRes.position.plus(this.faceToVec(rayRes.face));
        const posBlRef = AABB.fromBlockPos(rayRes.position);
        const posBl = AABB.fromBlock(pos);

        let invalidPlacement1 = AABBUtils.getEntityAABB(bot.entity).intersects(AABB.fromBlock(pos));

        let i = 0;
        for (; i < works.ticks; i++) {
          if (i === works.shiftTick) bot.setControlState("sneak", true);
          const ectx = EPhysicsCtx.FROM_BOT(bot.physicsUtil.engine, bot);
          const state = ectx.state;
          bot.physicsUtil.engine.simulate(ectx, bot.world);
          // console.log(bb.pos, bot.entity.position)
          const sPos = state.pos.offset(0, 1.62, 0);
          const testCheck = (await bot.world.raycast(
            sPos,
            rayRes.intersect.minus(sPos).normalize().scale(0.5),
            PlaceHandler.reach * 2
          )) as unknown as RayType;

          if (testCheck === null) break;

          const pos1 = testCheck.position.plus(this.faceToVec(testCheck.face));
          const pos1Bl = AABB.fromBlock(pos1);
          if (testCheck.position.equals(rayRes.position) && testCheck.face === rayRes.face && !state.getAABB().intersects(pos1Bl)) {
            // console.log("skipping on tick", i);
            if (i < works.ticks - 1 && i !== 0) {
              await bot.waitForTicks(1);
            }
            break;
          }
          await bot.waitForTicks(1);
        }

        const botBB = AABBUtils.getEntityAABBRaw({ position: bot.entity.position, width: 0.6, height: 1.8 });

        if (this.settings.forceLook) {
          if (!this.move.isLookingAt(rayRes.intersect)) {
            // const start = performance.now();
            // const old0 = bot.getControlState('jump')
            // const old1 = bot.getControlState('sneak')
            // const flag = bot.entity.onGround
            // // bot.setControlState('jump', false)
            // if (flag) bot.setControlState("sneak", true);
            await bot.lookAt(rayRes.intersect, this.settings.forceLook);
            // if (flag) bot.setControlState("sneak", old1);

            // console.log("look took", performance.now() - start, "ms");
            // bot.setControlState('jump', old0)
          }
        }

        const invalidPlacement = botBB.intersects(posBl);
        if (invalidPlacement) {
          // console.log("invalid placement", bot.entity.position, invalidPlacement1, invalidPlacement);
          // console.log(botBB, posBl);
          await bot.lookAt(rayRes.intersect, this.settings.forceLook);
          throw new CancelError("Invalid placement");
        }

        // console.log(i, works.ticks, works.tickAllowance, works.shiftTick, rayRes.intersect, this.faceToVec(rayRes.face));
        // console.log(bot.entity.position, bot.entity.velocity);

        let finished = false;
        let sneaking = false;
        let direction = this.faceToVec(rayRes.face);
        // console.log("looking at", rayRes.intersect);
        start = performance.now();
        const task = bot._placeBlockWithOptions(rayRes, direction, { forceLook: "ignore", swingArm: "right" });
        if (predictBlock) {
          bot.world.setBlockStateId(rayRes.position.plus(direction), BlockInfo.substituteBlockStateId);
        }

        this._internalLock = false;

        task.then(() => {
          finished = true;
          if (!sneaking) return;
          bot.setControlState("sneak", false);
        });

        setTimeout(() => {
          if (finished) return;
          sneaking = true;
          bot.setControlState("sneak", true);
        }, Math.max(30 - bot._client.latency, 0));

        try {
          await task;
        } catch (err: any) {
          throw new CancelError("Invalid placement " + err.message);
        }

        if (works.shiftTick !== Infinity) bot.setControlState("sneak", false);
        break;
      }
      case "replaceable":
      default: {
        throw new Error("Not implemented");
        break; // not necessary.
      }
    }

    if (opts.returnToPos !== undefined) {
      await bot.lookAt(opts.returnToPos, this.settings.forceLook);
    } else if (opts.returnToStart) {
      await bot.look(curInfo.yaw, curInfo.pitch, this.settings.forceLook);
    }

    this._done = true;
    this.performing = false;
    console.log("done in ", performance.now() - start, "ms");
  }
}

export class BreakHandler extends InteractHandler {
  static reach = 4;

  static fromVec(vec: Vec3, type: InteractType, offhand = false) {
    return new BreakHandler(vec.x, vec.y, vec.z, type, offhand);
  }

  toBlockInfo(): BlockInfo {
    return BlockInfo.AIR1;
  }

  getBlock(world: World) {
    return world.getBlock(this.vec);
  }

  getItem(bot: Bot, blockInfo: typeof BlockInfo, block: Block): Item | null {
    switch (this.type) {
      case "water": {
        return bot.inventory.items().find((item) => item.name === "bucket") ?? null; // empty bucket
      }
      case "solid": {
        // TODO: identify best tool for block.
        return bot.pathingUtil.bestHarvestingTool(block);
      }
      case "replaceable": {
        throw new Error("Not implemented");
      }
      default:
        throw new Error("Not implemented");
    }
  }

  async performInfo(bot: Bot, ticks = 15) {
    const bb = AABB.fromBlock(this.vec);

    return bb.distanceToVec(bot.entity.position.offset(0, 1.62, 0)) < BreakHandler.reach + 5
      ? { ticks: 0, tickAllowance: 0, shiftTick: 0, raycasts: [] }
      : { ticks: Infinity, tickAllowance: Infinity, shiftTick: Infinity, raycasts: [] };
  }

  async perform(bot: Bot, item: Item | null = null, opts: InteractOpts = {}): Promise<void> {
    if (this.performing) throw new Error("Already performing");
    this.performing = true;
    this._internalLock = true;
    const curInfo = { yaw: bot.entity.yaw, pitch: bot.entity.pitch };

    switch (this.type) {
      case "water": {
        if (item === null) throw new Error("No item");
        if (item.name !== "bucket") throw new Error("Invalid item");
        if (this.getCurrentItem(bot) !== item) await this.equipItem(bot, item);
        await bot.lookAt(this.vec, this.settings.forceLook);
        bot.activateItem(this.offhand);
        break; // not necessary.
      }

      case "solid": {
        if (item === null) {
          if (this.getCurrentItem(bot) !== null) await bot.unequip(this.offhand ? "off-hand" : "hand");
        } else if (this.getCurrentItem(bot) !== item!) await this.equipItem(bot, item!);
        const block = await bot.world.getBlock(this.vec);
        if (!block) throw new Error("Invalid block");
        await bot.lookAt(this.vec, this.settings.forceLook);
        const task = bot.dig(block, 'ignore', 'auto');
        this._internalLock = false;

        await task;
        console.log('done')
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
      await bot.lookAt(opts.returnToPos, this.settings.forceLook);
    } else if (opts.returnToStart) {
      await bot.look(curInfo.yaw, curInfo.pitch, this.settings.forceLook);
    }

    this.performing = false;
    this._done = true;
  }
}
