import { EventEmitter } from 'node:events'
import type { Bot } from 'mineflayer'
import registry from 'prismarine-registry'
import block, { Block as PBlock } from 'prismarine-block'
import { Vec3 } from 'vec3'
import { initSetup } from '@nxg-org/mineflayer-physics-util/dist'
import { BotcraftPhysics } from '@nxg-org/mineflayer-physics-util/dist/physics/engines'
import { ControlStateHandler } from '@nxg-org/mineflayer-physics-util/dist/physics/player'
import { EPhysicsCtx } from '@nxg-org/mineflayer-physics-util/dist/physics/settings'
import { PlayerState } from '@nxg-org/mineflayer-physics-util/dist/physics/states'
import { applyMdToNewEntity } from '@nxg-org/mineflayer-physics-util/dist/util/physicsUtils'

import { BlockInfo, CacheSyncWorld } from '../src/mineflayer-specific/world/cacheWorld'
import type { Block, RayType } from '../src/types'
import type { World } from '../src/mineflayer-specific/world/worldInterface'

const mineflayerPhysicsPlugin = require('mineflayer/lib/plugins/physics') as (bot: any, options?: { physicsEnabled?: boolean }) => void
const { InterceptFunctions } = require('@nxg-org/mineflayer-util-plugin') as {
  InterceptFunctions: new (bot: any) => { raycast: (from: Vec3, direction: Vec3, range: number) => { block: Block | null, iterations: Array<{ x: number, y: number, z: number, face: number }>, intersect?: { pos: Vec3, face: number } } }
}

const initializedVersions = new Set<string>()

export function loadMcData(version: string) {
  const mcData = registry(version)
  if (!initializedVersions.has(version)) {
    initSetup(mcData)
    BlockInfo.init(mcData)
    initializedVersions.add(version)
  }

  return {
    mcData,
    Block: block(version) as typeof PBlock
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

function keyFor(pos: Vec3): string {
  const floored = pos.floored()
  return `${floored.x},${floored.y},${floored.z}`
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

export class FakeWorld extends EventEmitter implements World {
  private readonly overrides = new Map<string, Block>()
  private readonly raycastBot: any

  constructor(
    private readonly mcData: ReturnType<typeof registry>,
    private readonly Block: typeof PBlock,
    public readonly minY: number = 0
  ) {
    super()
    this.raycastBot = {
      blockAt: (position: Vec3) => this.getBlock(position)
    }
  }

  setBlock(pos: Vec3, blockRef: string | number): Block {
    const block = this.createBlock(pos, blockRef)
    const key = keyFor(pos)
    const oldBlock = this.getBlock(pos)
    this.overrides.set(key, block)
    this.emit('blockUpdate', oldBlock, block)
    return block
  }

  clearBlock(pos: Vec3): Block {
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
    const override = this.overrides.get(keyFor(blockPos))
    if (override != null) return override

    const stateId = blockPos.y < this.minY ? this.mcData.blocksByName.stone.minStateId : this.mcData.blocksByName.air.minStateId
    return this.createBlock(blockPos, stateId)
  }

  getBlockInfo(pos: Vec3) {
    return BlockInfo.fromBlock(this.getBlock(pos))
  }

  getBlockStateId(pos: Vec3) {
    return this.getBlock(pos).stateId
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

  private createBlock(pos: Vec3, blockRef: string | number): Block {
    return createBlockAt(this.Block, resolveStateId(this.mcData, blockRef), pos)
  }
}

function createFakeInventory(items: Block[] = []) {
  return {
    slots: Array(46).fill(null),
    items: () => items
  }
}

function getEquipmentSlot(destination: string): number {
  switch (destination) {
    case 'hand':
      return 36
    case 'head':
      return 5
    case 'torso':
      return 6
    case 'legs':
      return 7
    case 'feet':
      return 8
    case 'off-hand':
      return 45
    default:
      return 36
  }
}

export function createFakePlayer(
  version: string,
  mcData: ReturnType<typeof registry>,
  world: World,
  pos: Vec3,
  groundLevel: number,
  username = 'test-bot'
): any {
  const onGround = pos.y === groundLevel
  const inventory = createFakeInventory()
  const pluginList: Array<(bot: any, options?: unknown) => void> = []
  const fakePlayer = new EventEmitter() as any
  const fakeClient = new EventEmitter() as any

  function hasPlugin(plugin: (bot: any, options?: unknown) => void) {
    return pluginList.includes(plugin)
  }

  function loadPlugin(plugin: (bot: any, options?: unknown) => void, options?: unknown) {
    if (typeof plugin !== 'function') {
      throw new TypeError('plugin needs to be a function')
    }

    if (hasPlugin(plugin)) return

    pluginList.push(plugin)
    plugin(fakePlayer as any, options)
  }

  function loadPlugins(plugins: Array<(bot: any, options?: unknown) => void>, options?: unknown) {
    if (!Array.isArray(plugins) || plugins.some((plugin) => typeof plugin !== 'function')) {
      throw new TypeError('plugins need to be an array of functions')
    }

    for (const plugin of plugins) {
      loadPlugin(plugin, options)
    }
  }

  fakeClient.write = (_packet: string, _payload: unknown) => undefined

  const supportFeatures = new Set<string>()
  function supportFeature(name: string) {
    return supportFeatures.has(name)
  }

  Object.assign(fakePlayer, {
    username,
    uuid: '00000000-0000-0000-0000-000000000000',
    version,
    world,
    registry: mcData,
    game: { gameMode: 'survival', dimension: 'overworld', minY: groundLevel },
    inventory,
    equipment: [],
    food: 20,
    entities: {},
    players: {},
    _client: fakeClient,
    supportFeature,
    inConfigurationPhase: false,
    physicsEnabled: true,
    isAlive: true,
    fireworkRocketDuration: 0,
    jumpTicks: 0,
    jumpQueued: false,
    flyJumpTriggerTime: 0,
    sprintTriggerTime: 0,
    usingHeldItem: false,
    vehicle: null,
    moveVehicle: () => undefined,
    dismount: () => undefined,
    entity: {
      id: 1,
      username,
      position: pos.clone(),
      velocity: new Vec3(0, onGround ? -0.08 : 0, 0),
      onGround,
      lastOnGround: onGround,
      onClimbable: false,
      isInWater: false,
      isUnderWater: false,
      isInLava: false,
      isUnderLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedHorizontallyMinor: false,
      isCollidedVertically: false,
      yaw: 0,
      pitch: 0,
      height: 1.8,
      width: 0.6,
      effects: [],
      attributes: {},
      supportingBlockPos: null,
      equipment: Array(6).fill(null),
      metadata: [],
      type: 'player'
    },
    blockAt: (point: Vec3) => world.getBlock(point),
    getEquipmentDestSlot: (destination: string) => getEquipmentSlot(destination),
    loadPlugin,
    loadPlugins,
    hasPlugin,
    nearestEntity: () => null,
    chat: () => undefined,
    whisper: () => undefined
  })

  return fakePlayer
}

export function createFlatWorld(version: string, floorY: number) {
  const { mcData, Block } = loadMcData(version)
  return new FakeWorld(mcData, Block, floorY)
}

export function createPlayerRig(world: World, options: {
  version: string
  position: Vec3
  groundLevel?: number
  username?: string
}) {
  const { version, position } = options
  const groundLevel = options.groundLevel ?? position.y
  const { mcData } = loadMcData(version)

  const fakePlayer: any = createFakePlayer(version, mcData, world, position.clone(), groundLevel, options.username)
  fakePlayer.entity = applyMdToNewEntity(EPhysicsCtx, mcData.entitiesByName.player, fakePlayer.entity)
  fakePlayer.entity.height = 1.8
  fakePlayer.entity.width = 0.6

  fakePlayer.loadPlugin(mineflayerPhysicsPlugin, { physicsEnabled: true })
  fakePlayer.emit('login')
  fakePlayer._client.emit('position', {
    x: fakePlayer.entity.position.x,
    y: fakePlayer.entity.position.y,
    z: fakePlayer.entity.position.z,
    yaw: 0,
    pitch: 0,
    flags: 0,
    teleportId: 0
  })

  const physics = new BotcraftPhysics(mcData)
  const playerCtx = EPhysicsCtx.FROM_BOT(physics, fakePlayer as Bot)
  const playerState = playerCtx.state as PlayerState
  playerState.control = ControlStateHandler.DEFAULT()

  return {
    mcData,
    fakePlayer,
    bot: fakePlayer as Bot,
    physics,
    playerCtx,
    playerState,
    stopPassivePhysics: () => fakePlayer.emit('end')
  }
}

export function createCacheWorld(version: string, floorY: number, position: Vec3) {
  const world = createFlatWorld(version, floorY)
  const rig = createPlayerRig(world, { version, position, groundLevel: floorY })
  const cacheWorld = new CacheSyncWorld(rig.bot, world as any)

  return {
    world,
    rig,
    cacheWorld
  }
}
