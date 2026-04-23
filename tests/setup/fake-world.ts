import { EventEmitter } from 'node:events'
import registry from 'prismarine-registry'
import { Block as PBlock } from 'prismarine-block'
import { Vec3 } from 'vec3'

import { BlockInfo } from '../../src/mineflayer-specific/world/cacheWorld'
import type { Block, RayType } from '../../src/types'
import type { World } from '../../src/mineflayer-specific/world/worldInterface'
import { loadMcData } from './mc-data'

const { InterceptFunctions } = require('@nxg-org/mineflayer-util-plugin') as {
  InterceptFunctions: new (bot: any) => { raycast: (from: Vec3, direction: Vec3, range: number) => { block: Block | null, iterations: Array<{ x: number, y: number, z: number, face: number }>, intersect?: { pos: Vec3, face: number } } }
}

function resolveStateId(mcData: ReturnType<typeof registry>, blockRef: string | number): number {
  if (typeof blockRef === 'number') return blockRef

  const blockInfo = mcData.blocksByName[blockRef]
  if (blockInfo == null) {
    throw new Error(`Unknown block name: ${blockRef}`)
  }

  return blockInfo.minStateId ?? blockInfo.id
}

function keyFor(pos: Vec3): string {
  const floored = pos.floored()
  return `${floored.x},${floored.y},${floored.z}`
}

function columnKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`
}

function chunkX(pos: Vec3): number {
  return Math.floor(pos.x / 16)
}

function chunkZ(pos: Vec3): number {
  return Math.floor(pos.z / 16)
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

export interface FakeWorldOptions {
  renderDistance?: number
  center?: Vec3
}

export interface FakeColumn {
  chunkX: number
  chunkZ: number
}

export class FakeWorld extends EventEmitter implements World {
  private readonly overrides = new Map<string, Block>()
  private readonly columns = new Map<string, FakeColumn>()
  private readonly raycastBot: any
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
    this.raycastBot = {
      blockAt: (position: Vec3) => this.getBlock(position)
    }
    this.updateLoadedColumns(options.center ?? new Vec3(0, minY, 0), false)
  }

  setBlock(pos: Vec3, blockRef: string | number): Block {
    const block = this.createBlock(pos, blockRef)
    const key = keyFor(pos)
    const oldBlock = this.getBlock(pos)
    this.overrides.set(key, block)
    this.emit('blockUpdate', oldBlock, block)
    return block
  }

  clearBlock(pos: Vec3): Block | null {
    const key = keyFor(pos)
    const oldBlock = this.getBlock(pos)
    this.overrides.delete(key)
    const next = this.getBlock(pos)
    this.emit('blockUpdate', oldBlock, next)
    return next
  }

  setOverrideBlock(pos: Vec3, type: number) {
    this.setBlock(pos, type)
  }

  clearOverrides() {
    for (const posKey of [...this.overrides.keys()]) {
      this.overrides.delete(posKey)
    }
  }

  getBlock(pos: Vec3) {
    const blockPos = pos.floored()
    if (!this.isColumnLoadedAt(blockPos)) return null

    const override = this.overrides.get(keyFor(blockPos))
    if (override != null) return override

    const stateId = blockPos.y < this.minY ? this.mcData.blocksByName.stone.minStateId : this.mcData.blocksByName.air.minStateId
    return this.createBlock(blockPos, stateId)
  }

  getBlockInfo(pos: Vec3) {
    return BlockInfo.fromBlock(this.getBlock(pos))
  }

  getBlockStateId(pos: Vec3) {
    return this.getBlock(pos)?.stateId
  }

  raycast(from: Vec3, direction: Vec3, range: number, matcher?: (block: Block) => boolean): RayType | null {
    const result = new InterceptFunctions(this.raycastBot).raycast(from, direction, range)
    if (result.block == null || result.intersect == null) return null
    if (matcher != null && !matcher(result.block)) return null

    return Object.assign(result.block, {
      intersect: result.intersect.pos.clone(),
      face: result.intersect.face,
      iterations: result.iterations
    }) as RayType
  }

  createBlock(pos: Vec3, blockRef: string | number): Block {
    return createBlockAt(this.Block, resolveStateId(this.mcData, blockRef), pos)
  }

  isColumnLoaded(chunkX: number, chunkZ: number): boolean {
    return this.columns.has(columnKey(chunkX, chunkZ))
  }

  isColumnLoadedAt(pos: Vec3): boolean {
    return this.isColumnLoaded(chunkX(pos), chunkZ(pos))
  }

  getColumn(chunkX: number, chunkZ: number): FakeColumn | undefined {
    return this.columns.get(columnKey(chunkX, chunkZ))
  }

  getLoadedColumn(chunkX: number, chunkZ: number): FakeColumn | undefined {
    return this.getColumn(chunkX, chunkZ)
  }

  getColumnAt(pos: Vec3): FakeColumn | undefined {
    return this.getColumn(chunkX(pos), chunkZ(pos))
  }

  getLoadedColumnAt(pos: Vec3): FakeColumn | undefined {
    return this.getColumnAt(pos)
  }

  getColumns(): Array<{ chunkX: number, chunkZ: number, column: FakeColumn }> {
    return [...this.columns.values()].map((column) => ({
      chunkX: column.chunkX,
      chunkZ: column.chunkZ,
      column
    }))
  }

  setColumn(chunkX: number, chunkZ: number, column: FakeColumn = { chunkX, chunkZ }): void {
    const key = columnKey(chunkX, chunkZ)
    this.columns.set(key, column)
    this.emit('chunkColumnLoad', columnCorner(chunkX, chunkZ))
  }

  setLoadedColumn(chunkX: number, chunkZ: number, column: FakeColumn = { chunkX, chunkZ }): void {
    this.setColumn(chunkX, chunkZ, column)
  }

  unloadColumn(chunkX: number, chunkZ: number): void {
    const key = columnKey(chunkX, chunkZ)
    if (!this.columns.has(key)) return

    this.columns.delete(key)
    this.emit('chunkColumnUnload', columnCorner(chunkX, chunkZ))
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
      if (this.columns.has(key)) continue

      const [x, z] = key.split(',').map(Number)
      this.columns.set(key, { chunkX: x, chunkZ: z })
      if (emitEvents) this.emit('chunkColumnLoad', columnCorner(x, z))
    }

    for (const [key, column] of [...this.columns.entries()]) {
      if (wanted.has(key)) continue

      this.columns.delete(key)
      if (emitEvents) this.emit('chunkColumnUnload', columnCorner(column.chunkX, column.chunkZ))
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
  }
}

export function createFlatWorld(version: string, floorY: number, options: FakeWorldOptions = {}) {
  const { mcData, Block } = loadMcData(version)
  return new FakeWorld(mcData, Block, floorY, options)
}
