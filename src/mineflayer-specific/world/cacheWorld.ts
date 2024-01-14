import { Vec3 } from 'vec3'
import type { World as WorldType } from './worldInterface'
import { Bot } from 'mineflayer'
import { LRUCache } from 'lru-cache'

import { PCChunk } from 'prismarine-chunk'
import type { Biome } from 'prismarine-biome'

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
  posCache: LRUCache<string, Block>
  // blocks: LRUCache<number, Block>;
  // posCache: Record<string, Block>;
  blocks: LRUCache<number, Block>
  world: WorldType
  cacheCalls = 0
  enabled = true

  static Block: ReturnType<typeof import('prismarine-block')>

  constructor (bot: Bot, referenceWorld: any) {
    // this.posCache = {};
    this.posCache = new LRUCache({ max: 10000, ttl: 2000 })
    this.blocks = new LRUCache({ size: 2500, max: 500 })
    this.world = referenceWorld
    if (!CacheSyncWorld.Block) {
      CacheSyncWorld.Block = require('prismarine-block')(bot.registry)
    }
  }

  getBlock1 (pos: Vec3) {
    if (!this.enabled) {
      return this.world.getBlock(pos)
    }

    this.cacheCalls++
    const stateId = this.world.getBlockStateId(pos)!
    // console.log(this.blocks.has(stateId))
    if (this.blocks.has(stateId)) {
      const got = this.blocks.get(stateId)
      if (got === undefined) return null
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

  getBlock (pos: Vec3) {
    if (!this.enabled) {
      return this.world.getBlock(pos)
    }
    this.cacheCalls++
    pos = pos.floored()
    const key = `${pos.x}:${pos.y}:${pos.z}`
    // const block = this.posCache[key]
    // if (block !== undefined) return block
    // const block1 = this.world.getBlock(pos);
    // if (block1 !== null) this.posCache[key] = block1
    // return block1
    if (this.posCache.has(key)) return this.posCache.get(key)
    const block = this.world.getBlock(pos)
    if (block !== undefined) this.posCache.set(key, block)
    return block
  }

  getBlockStateId (pos: Vec3): number | undefined {
    if (!this.enabled) {
      return this.world.getBlockStateId(pos)
    }
    this.cacheCalls++
    pos = pos.floored()
    const key = `${pos.x}:${pos.y}:${pos.z}`
    // const state = this.posCache[key]?.stateId
    // if (state !== undefined) return state
    // const state1 = this.world.getBlockStateId(pos);
    // if (state1 !== undefined) this.posCache[key] = CacheSyncWorld.Block.fromStateId(state1, 0)
    // return state1
    if (this.posCache.has(key)) return this.posCache.get(key)!.stateId
    const state = this.world.getBlock(pos).stateId
    if (state !== undefined) this.posCache.set(key, state)
    return state
  }

  getCacheSize () {
    const calls = this.cacheCalls
    this.cacheCalls = 0
    // const used = Object.keys(this.posCache).length === 0 ?  this.blocks : this.posCache
    const used = this.posCache.size === 0 ? this.blocks : this.posCache
    return `size = ${used.size}; calls = ${calls}`
  }

  clearCache () {
    // this.posCache = {};
    this.posCache.clear()
    this.blocks.clear()
    this.cacheCalls = 0
  }

  setEnabled (enabled: boolean) {
    this.enabled = enabled
  }
}

function columnKey (x: number, z: number) {
  return `${x},${z}`
}

function posInChunk (pos: Vec3) {
  pos = pos.floored()
  pos.x &= 15
  pos.z &= 15
  return pos
}

function isCube (shapes: number[][]) {
  if (!shapes || shapes.length !== 1) return false
  const shape = shapes[0]
  return shape[0] === 0 && shape[1] === 0 && shape[2] === 0 && shape[3] === 1 && shape[4] === 1 && shape[5] === 1
}

class World {
  public Chunk: typeof PCChunk
  public columns: Record<string, PCChunk>
  public blockCache: Record<number, Block>
  public biomeCache: Record<number, Biome>

  constructor (version: string) {
    this.Chunk = require('prismarine-chunk')(version)
    this.columns = {}
    this.blockCache = {}
    this.biomeCache = require('minecraft-data')(version).biomes
  }

  addColumn (x: number, z: number, json: string) {
    const chunk = this.Chunk.fromJson(json)
    this.columns[columnKey(x, z)] = chunk as any
    return chunk
  }

  removeColumn (x: number, z: number) {
    delete this.columns[columnKey(x, z)]
  }

  getColumn (x: number, z: number) {
    return this.columns[columnKey(x, z)]
  }

  setBlockStateId (pos: Vec3, stateId: number) {
    const key = columnKey(Math.floor(pos.x / 16) * 16, Math.floor(pos.z / 16) * 16)

    const column = this.columns[key]
    // null column means chunk not loaded
    if (!column) return false

    column.setBlockStateId(posInChunk(pos.floored()), stateId)

    return true
  }

  getBlock (pos: Vec3) {
    const key = columnKey(Math.floor(pos.x / 16) * 16, Math.floor(pos.z / 16) * 16)

    const column = this.columns[key]
    // null column means chunk not loaded
    if (!column) return null

    const loc = pos.floored()
    const locInChunk = posInChunk(loc)
    const stateId = column.getBlockStateId(locInChunk)

    if (!this.blockCache[stateId]) {
      const b = column.getBlock(locInChunk);
      (b as any).isCube = isCube(b.shapes)
      this.blockCache[stateId] = b
    }

    const block = this.blockCache[stateId]
    block.position = loc
    block.biome = this.biomeCache[column.getBiome(locInChunk)]
    if (block.biome === undefined) {
      block.biome = this.biomeCache[1]
    }
    return block
  }
}
