import { EventEmitter } from 'node:events'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import registry from 'prismarine-registry'
import { Block as PBlock } from 'prismarine-block'
import { Vec3 } from 'vec3'
import type { Chunk } from 'prismarine-world/types/world'

import { BlockInfo } from '../../src/mineflayer-specific/world/cacheWorld'
import type { Block, RayType } from '../../src/types'
import type { World } from '../../src/mineflayer-specific/world/worldInterface'
import { loadMcData } from './mc-data'

const WorldLoader = require('prismarine-world') as (version: string) => any
const ChunkLoader = require('prismarine-chunk') as (versionOrRegistry: string | ReturnType<typeof registry>) => new (options?: { minY?: number, worldHeight?: number }) => Chunk
const AnvilProvider = require('prismarine-provider-anvil') as {
  Anvil: (version: string) => new (regionPath: string) => {
    load: (chunkX: number, chunkZ: number) => Promise<Chunk | null>
    save: (chunkX: number, chunkZ: number, chunk: Chunk) => Promise<void>
    close?: () => Promise<unknown>
  }
}

function resolveStateId(mcData: ReturnType<typeof registry>, blockRef: string | number): number {
  if (typeof blockRef === 'number') return blockRef

  const blockInfo = mcData.blocksByName[blockRef]
  if (blockInfo == null) {
    throw new Error(`Unknown block name: ${blockRef}`)
  }

  return blockInfo.minStateId ?? blockInfo.id
}

function chunkX(pos: Vec3): number {
  return Math.floor(pos.x / 16)
}

function chunkZ(pos: Vec3): number {
  return Math.floor(pos.z / 16)
}

function columnKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`
}

function columnCorner(chunkX: number, chunkZ: number): Vec3 {
  return new Vec3(chunkX * 16, 0, chunkZ * 16)
}

function createBlockAt(
  Block: typeof PBlock,
  stateId: number,
  pos: Vec3
): Block {
  const block = Block.fromStateId(stateId, 0)
  block.position = pos.floored()
  return block as unknown as Block
}

function getChunkVerticalBounds(mcData: ReturnType<typeof registry>): { minY: number, worldHeight: number } {
  if (mcData.version['>=']('1.18')) {
    return { minY: -64, worldHeight: 384 }
  }

  return { minY: 0, worldHeight: 256 }
}

function resolveRegionFolder(options: FakeWorldOptions): string | undefined {
  if (options.regionFolder != null) return options.regionFolder
  if (options.worldFolder == null) return undefined

  const regionFolder = join(options.worldFolder, 'region')
  if (existsSync(regionFolder) && statSync(regionFolder).isDirectory()) return regionFolder

  return options.worldFolder
}

export interface ChunkRange {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface FakeWorldOptions {
  renderDistance?: number
  center?: Vec3
  worldFolder?: string
  regionFolder?: string
  generateMissingChunks?: boolean
}

export class FakeWorld extends EventEmitter implements World {
  private readonly world: any
  private readonly sync: any
  private readonly Chunk: new (options?: { minY?: number, worldHeight?: number }) => Chunk
  private readonly storageProvider?: InstanceType<ReturnType<typeof AnvilProvider.Anvil>>
  private readonly generateMissingChunks: boolean
  private readonly chunkMinY: number
  private readonly worldHeight: number
  private readonly pendingColumnLoads = new Set<string>()
  private trackedBot?: EventEmitter & { entity?: { position?: Vec3 } }
  private readonly trackedBotListeners: Array<() => void> = []
  public renderDistance: number

  constructor(
    private readonly mcData: ReturnType<typeof registry>,
    private readonly Block: typeof PBlock,
    public readonly minY: number = 0,
    options: FakeWorldOptions = {}
  ) {
    super()
    this.renderDistance = options.renderDistance ?? 10

    const mcVersion = mcData.version.minecraftVersion
    if (mcVersion == null) throw new Error('Cannot create FakeWorld without a Minecraft version')

    const WorldImpl = WorldLoader(mcVersion)
    this.Chunk = ChunkLoader(mcData) as any
    this.generateMissingChunks = options.generateMissingChunks === true
    const verticalBounds = getChunkVerticalBounds(mcData)
    this.chunkMinY = verticalBounds.minY
    this.worldHeight = verticalBounds.worldHeight

    const regionFolder = resolveRegionFolder(options)
    if (regionFolder != null) {
      const Anvil = AnvilProvider.Anvil(mcVersion)
      this.storageProvider = new Anvil(regionFolder)
    }

    const generator = this.storageProvider == null || this.generateMissingChunks
      ? (chunkX: number, chunkZ: number) => this.generateColumn(chunkX, chunkZ)
      : null

    this.world = new WorldImpl(generator, this.storageProvider ?? null, 0)
    this.sync = this.world.sync

    this.sync.on('blockUpdate', (oldBlock: Block | null, newBlock: Block | null) => this.emit('blockUpdate', oldBlock, newBlock))
    this.sync.on('chunkColumnLoad', (point: Vec3) => this.emit('chunkColumnLoad', point))
    this.sync.on('chunkColumnUnload', (point: Vec3) => this.emit('chunkColumnUnload', point))

    if (this.canGenerateSync()) {
      this.updateLoadedColumns(options.center ?? new Vec3(0, minY, 0), false)
    }
  }

  setBlock(pos: Vec3, blockRef: string | number): Block {
    const block = this.createBlock(pos, blockRef)
    this.sync.setBlock(pos, block)
    return block
  }

  clearBlock(pos: Vec3): Block | null {
    this.sync.setBlock(pos, this.createBlock(pos, 'air'))
    return this.getBlock(pos)
  }

  getBlock(pos: Vec3) {
    return this.sync.getBlock(pos) as Block | null
  }

  getBlockInfo(pos: Vec3) {
    return BlockInfo.fromBlock(this.getBlock(pos))
  }

  getBlockStateId(pos: Vec3) {
    return this.sync.getBlockStateId(pos) as number
  }

  raycast(from: Vec3, direction: Vec3, range: number, matcher?: (block: Block) => boolean): RayType | null {
    return this.sync.raycast(from, direction, range, matcher) as RayType | null
  }

  createBlock(pos: Vec3, blockRef: string | number): Block {
    return createBlockAt(this.Block, resolveStateId(this.mcData, blockRef), pos)
  }

  isColumnLoaded(chunkX: number, chunkZ: number): boolean {
    return this.sync.getColumn(chunkX, chunkZ) != null
  }

  isColumnLoadedAt(pos: Vec3): boolean {
    return this.isColumnLoaded(chunkX(pos), chunkZ(pos))
  }

  getColumn(chunkX: number, chunkZ: number): Chunk | undefined {
    return this.sync.getColumn(chunkX, chunkZ) as Chunk | undefined
  }

  getLoadedColumn(chunkX: number, chunkZ: number): Chunk | undefined {
    return this.getColumn(chunkX, chunkZ)
  }

  getColumnAt(pos: Vec3): Chunk | undefined {
    return this.sync.getColumnAt(pos) as Chunk | undefined
  }

  getLoadedColumnAt(pos: Vec3): Chunk | undefined {
    return this.getColumnAt(pos)
  }

  getColumns(): Array<{ chunkX: number, chunkZ: number, column: Chunk }> {
    return this.sync.getColumns() as Array<{ chunkX: number, chunkZ: number, column: Chunk }>
  }

  setColumn(chunkX: number, chunkZ: number, column: Chunk = this.generateColumn(chunkX, chunkZ)): void {
    this.sync.setColumn(chunkX, chunkZ, column, false)
  }

  setLoadedColumn(chunkX: number, chunkZ: number, column: Chunk = this.generateColumn(chunkX, chunkZ)): void {
    this.setColumn(chunkX, chunkZ, column)
  }

  unloadColumn(chunkX: number, chunkZ: number): void {
    this.sync.unloadColumn(chunkX, chunkZ)
  }

  async loadColumn(chunkX: number, chunkZ: number, emitEvent = true): Promise<Chunk | undefined> {
    const loaded = this.getColumn(chunkX, chunkZ)
    if (loaded != null) return loaded

    const column = await this.world.getColumn(chunkX, chunkZ) as Chunk | undefined
    if (column != null && emitEvent) this.emit('chunkColumnLoad', columnCorner(chunkX, chunkZ))
    return column
  }

  async preloadColumns(range: ChunkRange, emitEvents = true): Promise<void> {
    for (let chunkX = range.minX; chunkX <= range.maxX; chunkX++) {
      for (let chunkZ = range.minZ; chunkZ <= range.maxZ; chunkZ++) {
        await this.loadColumn(chunkX, chunkZ, emitEvents)
      }
    }
  }

  async preloadRenderDistance(center: Vec3, renderDistance = this.renderDistance, emitEvents = true): Promise<void> {
    const centerChunkX = chunkX(center)
    const centerChunkZ = chunkZ(center)
    await this.preloadColumns({
      minX: centerChunkX - renderDistance,
      maxX: centerChunkX + renderDistance,
      minZ: centerChunkZ - renderDistance,
      maxZ: centerChunkZ + renderDistance
    }, emitEvents)
  }

  setRenderDistance(renderDistance: number, center?: Vec3): void {
    if (!Number.isFinite(renderDistance) || renderDistance < 0) {
      throw new Error(`Invalid render distance: ${renderDistance}`)
    }

    const updateCenter = center ?? this.trackedBot?.entity?.position
    if (updateCenter == null) {
      throw new Error('FakeWorld.setRenderDistance requires a center when no bot is being tracked')
    }

    this.renderDistance = Math.floor(renderDistance)
    this.updateLoadedColumns(updateCenter)
  }

  updateLoadedColumns(center: Vec3, emitEvents = true): void {
    const centerChunkX = chunkX(center)
    const centerChunkZ = chunkZ(center)
    const wanted = new Set<string>()

    for (let x = centerChunkX - this.renderDistance; x <= centerChunkX + this.renderDistance; x++) {
      for (let z = centerChunkZ - this.renderDistance; z <= centerChunkZ + this.renderDistance; z++) {
        wanted.add(columnKey(x, z))
      }
    }

    for (const key of wanted) {
      const [x, z] = key.split(',').map(Number)
      if (this.isColumnLoaded(x, z)) continue

      if (emitEvents) {
        if (this.canGenerateSync()) {
          this.setColumn(x, z)
        } else {
          this.queueColumnLoad(x, z)
        }
      } else {
        if (this.canGenerateSync()) {
          this.world.setLoadedColumn(x, z, this.generateColumn(x, z), false)
        }
      }
    }

    for (const { chunkX, chunkZ } of this.getColumns()) {
      if (wanted.has(columnKey(chunkX, chunkZ))) continue
      if (emitEvents) {
        this.unloadColumn(chunkX, chunkZ)
      } else {
        this.world.forceUnloadColumn(columnKey(chunkX, chunkZ), chunkX, chunkZ)
      }
    }
  }

  trackBot(bot: EventEmitter & { entity?: { position?: Vec3 } }): void {
    this.untrackBot()
    this.trackedBot = bot
    const update = () => {
      const position = bot.entity?.position
      if (position != null) this.updateLoadedColumns(position)
    }

    bot.on('physicsTick', update)
    bot.on('move', update)
    this.trackedBotListeners.push(
      () => bot.off('physicsTick', update),
      () => bot.off('move', update)
    )
    update()
  }

  untrackBot(): void {
    for (const dispose of this.trackedBotListeners.splice(0)) dispose()
    this.trackedBot = undefined
  }

  cleanup(): void {
    this.untrackBot()
    void this.storageProvider?.close?.()
  }

  private canGenerateSync(): boolean {
    return this.storageProvider == null || this.generateMissingChunks
  }

  private queueColumnLoad(chunkX: number, chunkZ: number): void {
    const key = columnKey(chunkX, chunkZ)
    if (this.pendingColumnLoads.has(key)) return

    this.pendingColumnLoads.add(key)
    void this.loadColumn(chunkX, chunkZ).finally(() => {
      this.pendingColumnLoads.delete(key)
    })
  }

  private generateColumn(_chunkX: number, _chunkZ: number): Chunk {
    const chunk = new this.Chunk({ minY: this.chunkMinY, worldHeight: this.worldHeight })
    const floorY = this.minY - 1

    if (floorY < this.chunkMinY || floorY >= this.chunkMinY + this.worldHeight) return chunk

    const stoneStateId = this.mcData.blocksByName.stone.minStateId
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        chunk.setBlockStateId(new Vec3(x, floorY, z), stoneStateId)
      }
    }

    return chunk
  }
}

export function createFlatWorld(version: string, floorY: number, options: FakeWorldOptions = {}) {
  const { mcData, Block } = loadMcData(version)
  return new FakeWorld(mcData, Block, floorY, options)
}

export function createWorldFromFolder(version: string, floorY: number, worldFolder: string, options: Omit<FakeWorldOptions, 'worldFolder'> = {}) {
  return createFlatWorld(version, floorY, { ...options, worldFolder })
}
