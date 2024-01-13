import { Vec3 } from "vec3";
import type { World as WorldType } from "./WorldInterface";

export class CacheSynchWorld implements WorldType {
  blocks: Map<string, any>;
  world: WorldType;
  cacheCalls = 0;
  enabled = true

  constructor(referenceWorld: any) {
    this.blocks = new Map();
    this.world = referenceWorld;

    (this.world as any).on("blockUpdate", (oldBlock: any, newBlock: any) => {
      if (oldBlock == null) return;
      const key = `${oldBlock.position.x}:${oldBlock.position.y}:${oldBlock.position.z}`
      this.blocks.delete(key)
      if (newBlock !== null) this.blocks.set(key, newBlock)
    })
  }

  getBlock(pos: Vec3) {
    if (!this.enabled) {
      return this.world.getBlock(pos)
    }
    this.cacheCalls++;
    pos = pos.floored()
    const key = `${pos.x}:${pos.y}:${pos.z}`
    if (this.blocks.has(key)) return this.blocks.get(key);
    const block = this.world.getBlock(pos)
    if (block !== undefined) this.blocks.set(key, block)
    return block
  }

  getBlockStateId(pos: Vec3): number {
    if (!this.enabled) {
      return this.world.getBlockStateId(pos)
    }
    this.cacheCalls++;
    pos = pos.floored();
    const key = `${pos.x}:${pos.y}:${pos.z}`
    if (this.blocks.has(key)) return this.blocks.get(key).stateId;
    const state = this.world.getBlockStateId(pos)
    if (state !== undefined) this.blocks.set(key, state)
    return state
  }

  getCacheSize() {
    const calls = this.cacheCalls
    this.cacheCalls = 0
    return `size = ${this.blocks.size}; calls = ${calls}`
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }
} 