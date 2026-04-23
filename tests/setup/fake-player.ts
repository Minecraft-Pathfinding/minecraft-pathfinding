import { EventEmitter } from 'node:events'
import registry from 'prismarine-registry'
import { Vec3 } from 'vec3'

import type { Block } from '../../src/types'
import type { World } from '../../src/mineflayer-specific/world/worldInterface'

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
