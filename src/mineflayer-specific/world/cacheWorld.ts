import { Vec3 } from 'vec3'
import type { World as WorldType } from './worldInterface'
import { Bot } from 'mineflayer'
import { LRUCache } from 'lru-cache'

import interactables from './interactable.json'
import { Block, BlockType, MCData } from '../../types'
import { AABB } from '@nxg-org/mineflayer-util-plugin'
import { RayType } from '../movements/interactionUtils'

export class BlockInfo {
  static initialized = false
  static readonly interactableBlocks = new Set()
  static readonly blocksCantBreak = new Set<number>()
  static readonly blocksToAvoid = new Set()
  static readonly climbables = new Set()
  static readonly carpets = new Set()
  static readonly fences = new Set()
  static readonly replaceables = new Set()
  static readonly liquids = new Set()
  static readonly gravityBlocks = new Set()
  static readonly openable = new Set()
  static readonly emptyBlocks = new Set()
  static readonly scaffoldingBlockItems = new Set<number>()
  static readonly mlgItems = new Set<number>()

  static DEFAULT: BlockInfo = new BlockInfo(false, false, false, false, false, false, 0, false, new Vec3(0, 0, 0), -1)
  static PBlock: BlockType

  static _waterBlock: Block
  static _solidBlock: Block
  static _airBlock: Block
  static _replaceableBlock: Block

  public static readonly substituteBlockStateId: number = 1

  public breakCost?: number

  constructor (
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
    public readonly block: Block | null = null
  ) {}

  static async init (registry: MCData): Promise<void> {
    if (BlockInfo.initialized) return
    BlockInfo.initialized = true

    BlockInfo.PBlock = (await import('prismarine-block')).default(registry) // require('prismarine-block')(registry)

    BlockInfo._waterBlock = BlockInfo.PBlock.fromString('minecraft:water', 0)
    BlockInfo._waterBlock.position = new Vec3(0, 0, 0)
    BlockInfo._solidBlock = BlockInfo.PBlock.fromString('minecraft:dirt', 0)
    BlockInfo._solidBlock.position = new Vec3(0, 0, 0)
    BlockInfo._airBlock = BlockInfo.PBlock.fromString('minecraft:air', 0)
    BlockInfo._airBlock.position = new Vec3(0, 0, 0)
    BlockInfo._replaceableBlock = BlockInfo.PBlock.fromString('minecraft:air', 0) // also replaceable
    BlockInfo._replaceableBlock.position = new Vec3(0, 0, 0)

    // console.log(BlockInfo._waterBlock)
    BlockInfo.WATER1 = BlockInfo.fromBlock(BlockInfo._waterBlock)
    BlockInfo.SOLID1 = BlockInfo.fromBlock(BlockInfo._solidBlock)
    BlockInfo.AIR1 = BlockInfo.fromBlock(BlockInfo._airBlock)
    BlockInfo.REPLACEABLE1 = BlockInfo.fromBlock(BlockInfo._replaceableBlock)

    interactables.forEach((b) => BlockInfo.interactableBlocks.add(b))

    BlockInfo.blocksCantBreak.add(registry.blocksByName.chest.id)

    registry.blocksArray.forEach((block) => {
      if (block.diggable) return
      BlockInfo.blocksCantBreak.add(block.id)
    })

    BlockInfo.blocksToAvoid.add(registry.blocksByName.fire.id)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (registry.blocksByName.cobweb) BlockInfo.blocksToAvoid.add(registry.blocksByName.cobweb.id)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (registry.blocksByName.web) BlockInfo.blocksToAvoid.add(registry.blocksByName.web.id)

    BlockInfo.blocksToAvoid.add(registry.blocksByName.lava.id)

    BlockInfo.liquids.add(registry.blocksByName.water.id)
    BlockInfo.liquids.add(registry.blocksByName.lava.id)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (registry.blocksByName.seagrass) BlockInfo.liquids.add(registry.blocksByName.seagrass.id)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (registry.blocksByName.tall_seagrass) BlockInfo.liquids.add(registry.blocksByName.tall_seagrass.id)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (registry.blocksByName.kelp_plant) BlockInfo.liquids.add(registry.blocksByName.kelp_plant.id)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (registry.blocksByName.kelp) BlockInfo.liquids.add(registry.blocksByName.kelp.id)

    BlockInfo.gravityBlocks.add(registry.blocksByName.sand.id)
    BlockInfo.gravityBlocks.add(registry.blocksByName.gravel.id)

    BlockInfo.climbables.add(registry.blocksByName.ladder.id)
    // BlockInfo.climbables.add(registry.blocksByName.vine.id)

    BlockInfo.replaceables.add(registry.blocksByName.air.id)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (registry.blocksByName.cave_air) BlockInfo.replaceables.add(registry.blocksByName.cave_air.id)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (registry.blocksByName.void_air) BlockInfo.replaceables.add(registry.blocksByName.void_air.id)

    BlockInfo.replaceables.add(registry.blocksByName.water.id)
    BlockInfo.replaceables.add(registry.blocksByName.lava.id)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (registry.blocksByName.tall_grass) BlockInfo.replaceables.add(registry.blocksByName.tall_grass.id)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (registry.blocksByName.grass) BlockInfo.replaceables.add(registry.blocksByName.grass.id)

    BlockInfo.scaffoldingBlockItems.add(registry.itemsByName.dirt.id)
    BlockInfo.scaffoldingBlockItems.add(registry.itemsByName.cobblestone.id)

    // this code is stolen from original pathfinder and it makes no sense.
    registry.blocksArray
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .filter((x) => x.minStateId !== undefined)

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .map((x) => BlockInfo.PBlock.fromStateId(x.minStateId!, 0))
      .forEach((block) => {
        if (block.shapes.length > 0) {
          // Fences or any block taller than 1, they will be considered as non-physical to avoid
          // trying to walk on them
          if (block.shapes[0][4] > 1) BlockInfo.fences.add(block.type)
          // Carpets or any blocks smaller than 0.1, they will be considered as safe to walk in
          if (block.shapes[0][4] < 0.1) BlockInfo.carpets.add(block.type)
        } else if (block.shapes.length === 0) {
          BlockInfo.emptyBlocks.add(block.type)
        }
      })

    registry.blocksArray.forEach((block) => {
      if (
        BlockInfo.interactableBlocks.has(block.name) &&
        block.name.toLowerCase().includes('gate') &&
        !block.name.toLowerCase().includes('iron')
      ) {
        BlockInfo.openable.add(block.id)
      }
    })
  }

  static fromBlock (b: Block | null): BlockInfo {
    if (b === null) return BlockInfo.DEFAULT

    const b1 = {} as any
    b1.climbable = BlockInfo.climbables.has(b.type)

    // bug here, safe is not correct. Breaking climbables (ladders) is not cost of zero.
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    b1.safe = (b.boundingBox === 'empty' || b1.climbable || BlockInfo.carpets.has(b.type)) && !BlockInfo.blocksToAvoid.has(b.type)
    b1.physical = b.boundingBox === 'block' && !BlockInfo.fences.has(b.type)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    b1.replaceable = BlockInfo.replaceables.has(b.type) && !b1.physical
    b1.liquid = BlockInfo.liquids.has(b.type) || ((b as any)._properties?.waterlogged as boolean && b.boundingBox === 'empty')
    b1.height = b.position.y
    b1.canFall = BlockInfo.gravityBlocks.has(b.type)
    b1.openable = BlockInfo.openable.has(b.type)

    for (const shape of b.shapes) {
      b1.height = Math.max(b1.height, b.position.y + shape[4])
    }

    return new BlockInfo(
      b1.replaceable,
      b1.canFall,
      b1.safe,
      b1.physical,
      b1.liquid,
      b1.climbable,
      b1.height,
      b1.openable,
      b.position,
      b.type,
      b
    )
  }

  static SOLID1: BlockInfo = new BlockInfo(false, false, false, true, false, false, 0, false, new Vec3(0, 0, 0), -1)
  static SOLID (pos: Vec3): BlockInfo {
    return new BlockInfo(false, false, false, true, false, false, pos.y + 1, false, pos, BlockInfo._solidBlock.type, BlockInfo._solidBlock)
  }

  static AIR1: BlockInfo = new BlockInfo(true, false, true, false, false, false, 0, false, new Vec3(0, 0, 0), -1)
  static AIR (pos: Vec3): BlockInfo {
    return new BlockInfo(true, false, true, false, false, false, 0, false, pos, BlockInfo._airBlock.type, BlockInfo._airBlock)
  }

  static REPLACEABLE1: BlockInfo = new BlockInfo(true, false, true, false, false, false, 0, false, new Vec3(0, 0, 0), -1)
  static REPLACEABLE (pos: Vec3): BlockInfo {
    return new BlockInfo(
      true,
      false,
      true,
      false,
      false,
      false,
      0,
      false,
      pos,
      BlockInfo._replaceableBlock.type, // functionally identical for mining.
      BlockInfo._replaceableBlock
    )
  }

  static WATER1: BlockInfo = new BlockInfo(false, false, false, false, true, false, 0, false, new Vec3(0, 0, 0), -1)

  static WATER (pos: Vec3): BlockInfo {
    return new BlockInfo(false, false, false, false, true, false, pos.y + 1, false, pos, BlockInfo._waterBlock.type, BlockInfo._waterBlock)
  }

  public getBBs (): AABB[] {
    if (this.block != null) {
      return this.block.shapes.map((shape) => AABB.fromShape(shape, this.position))
    } else {
      const hW = 0.5 // TODO: account for fences, chains, etc.
      return [
        new AABB(
          this.position.x - hW,
          this.position.y,
          this.position.z - hW,
          this.position.x + hW,
          this.height, // height is already y + certain elevation
          this.position.z + hW
        )
      ]
    }
  }
}

// class Fuck {
//   // private arr: BlockInfo[];
//   private keyMap: { [key: string]: BlockInfo } = {}
//   private _size: number = 0

//   public get size () {
//     return this._size
//   }

//   constructor (public readonly maxSize: number) {
//     // this.arr = new Array<BlockInfo>(size);
//   }

//   get (key: string) {
//     return this.keyMap[key]
//   }

//   has (key: string) {
//     return !!this.keyMap[key]
//   }

//   set (key: string, block: BlockInfo) {
//     if (this.keyMap[key] == null) {
//       if (++this._size > this.maxSize) this.clear()
//       this.keyMap[key] = block
//     } else this.keyMap[key] = block
//   }

//   clear () {
//     console.log('resetting')
//     this.keyMap = {}
//     this._size = 0
//   }
// }

export class CacheSyncWorld implements WorldType {
  posCache: LRUCache<string, Block>
  posCache1: LRUCache<string, number>
  // blocks: LRUCache<number, Block>;
  // posCache: Record<string, Block>;
  blocks: LRUCache<number, Block>
  blockInfos: LRUCache<string, BlockInfo>
  world: Bot['world']
  cacheCalls = 0
  enabled = false

  constructor (bot: Bot, referenceWorld: Bot['world']) {
    // this.posCache = {};
    this.posCache = new LRUCache({ max: 10000, ttl: 2000 })
    this.posCache1 = new LRUCache({ max: 10000, ttl: 2000 })
    this.blocks = new LRUCache({ size: 10000, max: 2000 })

    this.blockInfos = this.makeLRUCache(100000)

    this.world = referenceWorld

    referenceWorld.on('blockUpdate', (oldBlock: Block, newBlock: Block) => {
      // console.log(newBlock.position)
      const pos = newBlock.position
      if (this.blockInfos.has(`${pos.x}:${pos.y}:${pos.z}`)) {
        this.blockInfos.set(`${pos.x}:${pos.y}:${pos.z}`, BlockInfo.fromBlock(newBlock))
      }
    })
  }

  private makeLRUCache (size: number): LRUCache<string, BlockInfo, unknown> {
    // return new Fuck(size);

    let count = 0
    return new LRUCache<string, BlockInfo, unknown>({
      max: size,
      ttl: 1000,
      updateAgeOnHas: false,
      updateAgeOnGet: true,
      dispose: (key, value, reason) => {
        if (reason === 'set') {
          console.log(`${count++} disposed ${key.position.toString()} ${reason}`, this.blockInfos.size)
          this.blockInfos.clear()
        } else if (reason === 'evict') {
          console.log('resetting', this.blockInfos.size)
          this.blockInfos.clear()
          this.blockInfos = this.makeLRUCache(size)
        }
      }
    })
  }

  raycast (from: Vec3, direction: Vec3, range: number, matcher?: ((block: Block) => boolean) | undefined): RayType | null {
    return this.world.raycast(from, direction, range, matcher) as unknown as RayType | null
  }

  getBlock (pos: Vec3): Block | null {
    if (!this.enabled) {
      return this.world.getBlock(pos) as unknown as Block
    }
    this.cacheCalls++
    pos = pos.floored()
    const key = `${pos.x}:${pos.y}:${pos.z}`

    // guaranteed behavior.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (this.posCache.has(key)) return this.posCache.get(key)!
    const block = this.world.getBlock(pos) as unknown as Block
    if (block !== null) this.posCache.set(key, block)
    return block
  }

  getBlockInfo (pos: Vec3): BlockInfo {
    // this.cacheCalls++
    // return BlockInfo.fromBlock(this.world.getBlock(pos))

    if (!this.enabled) {
      return BlockInfo.fromBlock(this.world.getBlock(pos))
    }
    this.cacheCalls++
    pos = pos.floored()
    const key = `${pos.x}:${pos.y}:${pos.z}`

    if (!this.blockInfos.has(key)) {
      const block = this.world.getBlock(pos) as unknown as Block
      if (block === null) return BlockInfo.DEFAULT
      const blockInfo = BlockInfo.fromBlock(block)
      this.blockInfos.set(key, blockInfo)
      // console.log('didnt have info:', key, blockInfo, this.blockInfos.get(key))
      return blockInfo
      // console.log("already have info:", key, this.blockInfos.get(key))
    }

    // guaranteed behavior.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.blockInfos.get(key)!
  }

  getBlockStateId (pos: Vec3): number | undefined {
    if (!this.enabled) {
      return this.world.getBlockStateId(pos) as unknown as number
    }
    this.cacheCalls++
    pos = pos.floored()
    const key = `${pos.x}:${pos.y}:${pos.z}`
    // const state = this.posCache[key]?.stateId
    // if (state !== undefined) return state
    // const state1 = this.world.getBlockStateId(pos);
    // if (state1 !== undefined) this.posCache[key] = CacheSyncWorld.Block.fromStateId(state1, 0)
    // return state1
    if (this.posCache.has(key)) return this.posCache1.get(key)
    const state = this.world.getBlockStateId(pos) as unknown as number
    if (state !== undefined) this.posCache1.set(key, state)
    return state
  }

  getCacheSize (): string {
    const calls = this.cacheCalls
    this.cacheCalls = 0
    // const used = Object.keys(this.posCache).length === 0 ?  this.blocks : this.posCache
    const used = this.posCache.size !== 0 ? this.posCache : this.blocks.size !== 0 ? this.blocks : this.blockInfos
    return `size = ${used.size}; calls = ${calls}`
  }

  clearCache (): void {
    // this.posCache = {};
    this.posCache.clear()
    this.blocks.clear()
    this.cacheCalls = 0
  }

  setEnabled (enabled: boolean): void {
    this.enabled = enabled
  }
}
