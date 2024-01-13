import { Vec3 } from "vec3";
import type { World as WorldType } from "./WorldInterface";

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
  posCache: Map<string, any>;
  blocks: Map<number, any>;
  world: WorldType;
  cacheCalls = 0;
  enabled = true

  constructor(referenceWorld: any) {
    this.posCache = new Map();
    this.blocks = new Map();
    this.world = referenceWorld;

    // (this.world as any).on("blockUpdate", (oldBlock: any, newBlock: any) => {
    //   if (oldBlock == null) return;
    //   const key = `${oldBlock.position.x}:${oldBlock.position.y}:${oldBlock.position.z}`
    //   this.blocks.delete(key)
    //   if (newBlock !== null) this.blocks.set(key, newBlock)
    // })
  }

  getBlockFast(pos: Vec3) {
    const stateId = this.world.getBlockStateId(pos)
    if (this.blocks.has(stateId)) {
      return this.blocks.get(stateId)
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

  getBlockStateId(pos: Vec3): number {
    if (!this.enabled) {
      return this.world.getBlockStateId(pos)
    }
    this.cacheCalls++;
    pos = pos.floored();
    const key = `${pos.x}:${pos.y}:${pos.z}`
    if (this.posCache.has(key)) return this.posCache.get(key).stateId;
    const state = this.world.getBlock(pos).stateId
    if (state !== undefined) this.posCache.set(key, state)
    return state
  }

  getCacheSize() {
    const calls = this.cacheCalls
    this.cacheCalls = 0
    return `size = ${this.posCache.size}; calls = ${calls}`
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }
} 