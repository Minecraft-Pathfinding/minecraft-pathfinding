import { Vec3 } from "vec3";
import type { World as WorldType } from "./worldInterface";
import { Bot } from "mineflayer";

type BlockType = ReturnType<typeof import('prismarine-block')>
type Block = InstanceType<BlockType>

// class FastBlock implements Block {
//   static AirId = 0;
//   static CaveAirId = 726; // 1.19
//   static VoidAirId = 725; // 1.19

//   static Block: ReturnType<typeof import('prismarine-block')>

//   private internal: number;



//   constructor() {
//     this.internal = 0;
//   }


//   public get diggable(): boolean {
//     return ((this.internal << 8) >> 1) as unknown as boolean; // fast conversion of guaranteed 0 | 1 to boolean.
//   }

//   public get isAir(): boolean {
//     switch (this.internal) {
//       case FastBlock.AirId:
//       case FastBlock.CaveAirId:
//       case FastBlock.VoidAirId:
//         return true;
//       default:
//         return false
//     }
//   }



//   static fromBlock(block: Block) {
//     return new FastBlock();
//   }

// }


export class CacheSyncWorld implements WorldType {
  posCache: Map<string, Block>;
  blocks: Map<number, Block>;
  world: WorldType;
  cacheCalls = 0;
  enabled = true

  static Block: ReturnType<typeof import('prismarine-block')>

  constructor(bot: Bot, referenceWorld: any) {
    this.posCache = new Map();
    this.blocks = new Map();
    this.world = referenceWorld;
    if (!CacheSyncWorld.Block) {
      CacheSyncWorld.Block = require('prismarine-block')(bot.registry)
    }

    // (this.world as any).on("blockUpdate", (oldBlock: any, newBlock: any) => {
    //   if (oldBlock == null) return;
    //   const key = `${oldBlock.position.x}:${oldBlock.position.y}:${oldBlock.position.z}`
    //   this.blocks.delete(key)
    //   if (newBlock !== null) this.blocks.set(key, newBlock)
    // })
  }

  getBlockSlow(pos: Vec3) {
    if (!this.enabled) {
      return this.world.getBlock(pos)
    }

    this.cacheCalls++;
    const stateId = this.world.getBlockStateId(pos)!
    // console.log(this.blocks.has(stateId))
    if (this.blocks.has(stateId)) {
      const got = this.blocks.get(stateId);
      if (got === undefined) return null;
      // const ret = CacheSyncWorld.Block.fromStateId(stateId, 0)
      const ret = Object.create(got)
      ret.getProperties = got.getProperties.bind(got)
      ret.position = pos.floored()
      return ret
    }
    
    const b = this.world.getBlock(pos)
    if (b !== null) this.blocks.set(stateId, b)
    return b
  }

  getBlock(pos: Vec3) {
    if (!this.enabled) {
      return this.world.getBlock(pos)
    }
    this.cacheCalls++;
    pos = pos.floored()
    const key = `${pos.x}:${pos.y}:${pos.z}`
    if (this.posCache.has(key)) return this.posCache.get(key);
    const block = this.world.getBlock(pos)
    if (block !== undefined) this.posCache.set(key, block)
    return block
  }

  getBlockStateId(pos: Vec3): number | undefined {
    if (!this.enabled) {
      return this.world.getBlockStateId(pos)
    }
    this.cacheCalls++;
    pos = pos.floored();
    const key = `${pos.x}:${pos.y}:${pos.z}`
    if (this.posCache.has(key)) return this.posCache.get(key)!.stateId;
    const state = this.world.getBlock(pos).stateId
    if (state !== undefined) this.posCache.set(key, state)
    return state
  }

  getCacheSize() {
    const calls = this.cacheCalls
    this.cacheCalls = 0
    const used = this.posCache.size === 0 ?  this.blocks : this.posCache
    return `size = ${used.size}; calls = ${calls}`
  }

  clearCache() {
    this.posCache.clear();
    this.blocks.clear();
    this.cacheCalls = 0;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }
} 