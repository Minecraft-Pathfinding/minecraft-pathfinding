import { Vec3 } from 'vec3'
import type { World as WorldType } from './worldInterface'
import { Bot } from 'mineflayer'
import { LRUCache } from 'lru-cache'

import { PCChunk } from 'prismarine-chunk'
import type { Biome } from 'prismarine-biome'

import interactables from './interactable.json'
import { Block, BlockType, MCData } from '../../types'

interface BlockInfoStatic {
  interactableBlocks: Set<string>;
  blocksCantBreak: Set<number>;
  blocksToAvoid: Set<number>;
  climbables: Set<number>;
  carpets: Set<number>;
  fences: Set<number>;
  replaceables: Set<number>;
  liquids: Set<number>;
  gravityBlocks: Set<number>;
  openable: Set<number>;
  emptyBlocks: Set<number>;
  scafoldingBlocks: Set<number>;
}

export class BlockInfo {


  static initialized = false;
  static readonly interactableBlocks = new Set();
  static readonly blocksCantBreak = new Set<number>();
  static readonly blocksToAvoid = new Set();
  static readonly climbables = new Set();
  static readonly carpets = new Set();
  static readonly fences = new Set();
  static readonly replaceables = new Set();
  static readonly liquids = new Set();
  static readonly gravityBlocks = new Set();
  static readonly openable = new Set();
  static readonly emptyBlocks = new Set();
  static readonly scaffoldingBlockItems = new Set<number>();
  static readonly mlgItems = new Set<number>();



  static DEFAULT: BlockInfo = new BlockInfo(false, false, false, false, false, false, 0, false, new Vec3(0,0,0), -1)

  public readonly substituteBlockStateId: number = 1;

  constructor(
    public readonly replaceable: boolean,
    public readonly canFall: boolean,
    public readonly safe: boolean,
    public readonly physical: boolean,
    public readonly liquid: boolean,
    public readonly climbable: boolean,
    public readonly height: number,
    public readonly openable: boolean,
    public readonly position: Vec3,
    // comp only
    public readonly type: number,
  ) { }


  static init(registry: MCData) {
    if (BlockInfo.initialized) return;
    BlockInfo.initialized = true;
    
    interactables.forEach(b=>BlockInfo.interactableBlocks.add(b))

    BlockInfo.blocksCantBreak.add(registry.blocksByName.chest.id);

    registry.blocksArray.forEach(block => {
      if (block.diggable) return
      BlockInfo.blocksCantBreak.add(block.id)
    })

    BlockInfo.blocksToAvoid.add(registry.blocksByName.fire.id)
    if (registry.blocksByName.cobweb) BlockInfo.blocksToAvoid.add(registry.blocksByName.cobweb.id)
    if (registry.blocksByName.web) BlockInfo.blocksToAvoid.add(registry.blocksByName.web.id)
    BlockInfo.blocksToAvoid.add(registry.blocksByName.lava.id)

    BlockInfo.liquids.add(registry.blocksByName.water.id)
    BlockInfo.liquids.add(registry.blocksByName.lava.id)

    BlockInfo.gravityBlocks.add(registry.blocksByName.sand.id)
    BlockInfo.gravityBlocks.add(registry.blocksByName.gravel.id)

    BlockInfo.climbables.add(registry.blocksByName.ladder.id)
    // BlockInfo.climbables.add(registry.blocksByName.vine.id)

    BlockInfo.replaceables.add(registry.blocksByName.air.id)
    if (registry.blocksByName.cave_air) BlockInfo.replaceables.add(registry.blocksByName.cave_air.id)
    if (registry.blocksByName.void_air) BlockInfo.replaceables.add(registry.blocksByName.void_air.id)
    BlockInfo.replaceables.add(registry.blocksByName.water.id)
    BlockInfo.replaceables.add(registry.blocksByName.lava.id)

    BlockInfo.scaffoldingBlockItems.add(registry.itemsByName.dirt.id)
    BlockInfo.scaffoldingBlockItems.add(registry.itemsByName.cobblestone.id)


    const Block: BlockType = require('prismarine-block')(registry);
    registry.blocksArray.filter(x => !x.minStateId).map(x => Block.fromStateId(x.minStateId!, 0)).forEach(block => {
      if (block.shapes.length > 0) {
        // Fences or any block taller than 1, they will be considered as non-physical to avoid
        // trying to walk on them
        if (block.shapes[0][4] > 1) BlockInfo.fences.add(block.type)
        // Carpets or any blocks smaller than 0.1, they will be considered as safe to walk in
        if (block.shapes[0][4] < 0.1) BlockInfo.carpets.add(block.type)
      } else if (block.shapes.length === 0) {
        BlockInfo.emptyBlocks.add(block.type)
      }
    });

    registry.blocksArray.forEach(block => {
      if (BlockInfo.interactableBlocks.has(block.name) && block.name.toLowerCase().includes('gate') && !block.name.toLowerCase().includes('iron')) {
        BlockInfo.openable.add(block.id)
      }
    });
  }


  static fromBlock(b: Block) {
    const b1 = {} as any;
    b1.climbable = BlockInfo.climbables.has(b.type)
    b1.safe = (b.boundingBox === 'empty' || b1.climbable || BlockInfo.carpets.has(b.type)) && !BlockInfo.blocksToAvoid.has(b.type)
    b1.physical = b.boundingBox === 'block' && !BlockInfo.fences.has(b.type)
    b1.replaceable = BlockInfo.replaceables.has(b.type) && !b1.physical
    b1.liquid = BlockInfo.liquids.has(b.type)
    b1.height = b.position.y;
    b1.canFall = BlockInfo.gravityBlocks.has(b.type)
    b1.openable = BlockInfo.openable.has(b.type)

    for (const shape of b.shapes) {
      b1.height = Math.max(b1.height, b.position.y + shape[4])
    }


    return new BlockInfo(b1.replaceable, b1.canFall, b1.safe, b1.physical, b1.liquid, b1.climbable, b1.height, b1.openable, b.position, b.type)
  }

  static SOLID1: BlockInfo = new BlockInfo(false, false, false, true, false, false, 0, false, new Vec3(0,0,0), -1)
  static SOLID(pos: Vec3) {
    return new BlockInfo(false, false, false, true, false, false, pos.y + 1, false, pos, -1)
  }

  static AIR1: BlockInfo = new BlockInfo(true, false, true, false, false, false, 0, false, new Vec3(0,0,0), -1)
  static AIR(pos: Vec3) {
    return new BlockInfo(true, false, true, false, false, false, 0, false, pos, -1)
  }

  static REPLACEABLE1: BlockInfo = new BlockInfo(true, false, true, false, false, false, 0, false, new Vec3(0,0,0), -1)
  static REPLACEABLE(pos: Vec3) {
    return new BlockInfo(true, false, true, false, false, false, 0, false, pos, -1)
  }

  static WATER1: BlockInfo = new BlockInfo(false, false, false, false, true, false, 0, false, new Vec3(0,0,0), -1)
  static WATER(pos: Vec3) {
    return new BlockInfo(false, false, false, false, true, false, 0, false, pos, -1)
  }

}


export class BlockInfoGroup implements BlockInfo {

  public readonly replaceable: boolean;
  public readonly canFall: boolean;
  public readonly safe: boolean;
  public readonly physical: boolean;
  public readonly liquid: boolean;
  public readonly climbable: boolean;
  public readonly height: number;
  public readonly openable: boolean;
  public substituteBlockStateId: number;

  constructor(...blockInfos: BlockInfo[]) {

    this.replaceable = true;
    this.canFall = false;
    this.safe = true;
    this.physical = false;
    this.liquid = true;
    this.climbable = false;
    this.height = 0;
    this.openable = false;
    this.substituteBlockStateId = 1;

    for (const blockInfo of blockInfos) {
      if (!blockInfo.replaceable) this.replaceable = false;
      if (blockInfo.canFall) this.canFall = true;
      if (!blockInfo.safe) this.safe = false;
      if (blockInfo.physical) this.physical = true;
      if (!blockInfo.liquid) this.liquid = false;
      if (blockInfo.climbable) this.climbable = true;
      if (!blockInfo.openable) this.openable = false;
      this.height = Math.max(this.height, blockInfo.height);
    }
  }

  public get position() {
    throw new Error("Method not implemented.");
    return null as any;
  }
  

  public get type() {
    throw new Error("Method not implemented.");
    return null as any;
  }
}

export class CacheSyncWorld implements WorldType {
  posCache: LRUCache<string, Block>;
  posCache1: LRUCache<string, number>;
  // blocks: LRUCache<number, Block>;
  // posCache: Record<string, Block>;
  blocks: LRUCache<number, Block>
  blockInfos: LRUCache<string, BlockInfo>
  world: WorldType
  cacheCalls = 0
  enabled = true

  static Block: BlockType

  constructor(bot: Bot, referenceWorld: any) {
    // this.posCache = {};
    this.posCache = new LRUCache({ max: 10000, ttl: 2000 })
    this.posCache1 = new LRUCache({ max: 10000, ttl: 2000 })
    this.blocks = new LRUCache({ size: 10000, max: 2000 })
    this.blockInfos = new LRUCache({ max: 10000, ttl: 2000 })
    this.world = referenceWorld
    if (!CacheSyncWorld.Block) {
      CacheSyncWorld.Block = require('prismarine-block')(bot.registry)
    }
    
    referenceWorld.on('blockUpdate', (oldBlock: Block, newBlock: Block) => {
      const pos = newBlock.position
      if (this.blockInfos.has(`${pos.x}:${pos.y}:${pos.z}`)) this.blockInfos.set(`${pos.x}:${pos.y}:${pos.z}`, BlockInfo.fromBlock(newBlock))
    })
  }

  getBlock1(pos: Vec3) {
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

  getBlock(pos: Vec3) {
    if (!this.enabled) {
      return this.world.getBlock(pos)
    }
    this.cacheCalls++
    pos = pos.floored()
    const key = `${pos.x}:${pos.y}:${pos.z}`
    if (this.posCache.has(key)) return this.posCache.get(key)!
    const block = this.world.getBlock(pos)
    if (block !== null) this.posCache.set(key, block)
    return block
  }

  getBlockInfo(pos: Vec3) {
    if (!this.enabled) {
      const block = this.world.getBlock(pos)
      if (!block) return BlockInfo.DEFAULT
      return BlockInfo.fromBlock(block);
    }
    this.cacheCalls++
    pos = pos.floored()
    const key = `${pos.x}:${pos.y}:${pos.z}`
    if (this.blockInfos.has(key)) return this.blockInfos.get(key)!
    const block = this.world.getBlock(pos)
    if (block === null) return BlockInfo.DEFAULT;
    const blockInfo = BlockInfo.fromBlock(block)
    this.blockInfos.set(key, blockInfo)
    return blockInfo

  }

  getBlockStateId(pos: Vec3): number | undefined {
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
    if (this.posCache.has(key)) return this.posCache1.get(key)!
    const state = this.world.getBlockStateId(pos)
    if (state !== undefined) this.posCache1.set(key, state)
    return state
  }

  getCacheSize() {
    const calls = this.cacheCalls
    this.cacheCalls = 0
    // const used = Object.keys(this.posCache).length === 0 ?  this.blocks : this.posCache
    const used = this.posCache.size !== 0 ?  this.posCache : this.blocks.size !== 0 ? this.blocks : this.blockInfos
    return `size = ${used.size}; calls = ${calls}`
  }

  clearCache() {
    // this.posCache = {};
    this.posCache.clear()
    this.blocks.clear()
    this.cacheCalls = 0
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }
}

function columnKey(x: number, z: number) {
  return `${x},${z}`
}

function posInChunk(pos: Vec3) {
  pos = pos.floored()
  pos.x &= 15
  pos.z &= 15
  return pos
}

function isCube(shapes: number[][]) {
  if (!shapes || shapes.length !== 1) return false
  const shape = shapes[0]
  return shape[0] === 0 && shape[1] === 0 && shape[2] === 0 && shape[3] === 1 && shape[4] === 1 && shape[5] === 1
}

class World {
  public Chunk: typeof PCChunk
  public columns: Record<string, PCChunk>
  public blockCache: Record<number, Block>
  public biomeCache: Record<number, Biome>

  constructor(version: string) {
    this.Chunk = require('prismarine-chunk')(version)
    this.columns = {}
    this.blockCache = {}
    this.biomeCache = require('minecraft-data')(version).biomes
  }

  addColumn(x: number, z: number, json: string) {
    const chunk = this.Chunk.fromJson(json)
    this.columns[columnKey(x, z)] = chunk as any
    return chunk
  }

  removeColumn(x: number, z: number) {
    delete this.columns[columnKey(x, z)]
  }

  getColumn(x: number, z: number) {
    return this.columns[columnKey(x, z)]
  }

  setBlockStateId(pos: Vec3, stateId: number) {
    const key = columnKey(Math.floor(pos.x / 16) * 16, Math.floor(pos.z / 16) * 16)

    const column = this.columns[key]
    // null column means chunk not loaded
    if (!column) return false

    column.setBlockStateId(posInChunk(pos.floored()), stateId)

    return true
  }

  getBlock(pos: Vec3) {
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
