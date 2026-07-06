import { EventEmitter } from 'node:events'
import registry from 'prismarine-registry'
import { Vec3 } from 'vec3'
import type { Item } from 'prismarine-item'

import type { Block, PlaceBlockOptions, RayType } from '../../src/types'
import type { World } from '../../src/mineflayer-specific/world/worldInterface'

const QUICK_BAR_START = 36
const QUICK_BAR_COUNT = 9
const DIG_TICK_MS = 50

type EquipmentDestination = 'hand' | 'head' | 'torso' | 'legs' | 'feet' | 'off-hand'
type FakePlugin = (bot: FakeBot, options?: any) => void
export type FakeBot = any

type FakeClient = EventEmitter & {
  write: (packet: string, payload: unknown) => void
}

export type EventedMutableWorld = World & EventEmitter & {
  setBlock: (pos: Vec3, blockRef: string | number) => Block
  clearBlock: (pos: Vec3) => Block | null
}

type FakeInventory = {
  slots: Array<Item | null>
  hotbarStart: number
  inventoryStart: number
  inventoryEnd: number
  selectedItem: Item | null
  items: () => Item[]
  findInventoryItem: (itemType: number, metadata?: number | null) => Item | null
  firstEmptySlotRange: (start: number, end: number) => number | null
  firstEmptyInventorySlot: () => number | null
}

function setInventorySlot(inventory: FakeInventory, slot: number, item: Item | null): void {
  inventory.slots[slot] = item
  if (item != null) item.slot = slot
}

function inventoryItemsFromSlots(inventory: FakeInventory): Item[] {
  return inventory.slots
    .filter((item): item is Item => item != null)
    .filter((item) => {
      const slot = item.slot
      return typeof slot !== 'number' || slot >= 9
    })
}

function createFakeInventory(items: Item[] = []): FakeInventory {
  const inventory: FakeInventory = {
    slots: Array<Item | null>(46).fill(null),
    hotbarStart: QUICK_BAR_START,
    inventoryStart: 9,
    inventoryEnd: 45,
    selectedItem: null,
    items: () => inventoryItemsFromSlots(inventory),
    findInventoryItem: (itemType: number, metadata?: number | null) => {
      const matches = (item: Item | null): item is Item => {
        if (item == null) return false
        if (item.type !== itemType) return false
        if (metadata == null) return true
        return item.metadata === metadata
      }

      return inventory.slots.find(matches) ?? inventory.items().find(matches) ?? null
    },
    firstEmptySlotRange: (start: number, end: number) => {
      for (let slot = start; slot < end; slot++) {
        if (inventory.slots[slot] == null) return slot
      }
      return null
    },
    firstEmptyInventorySlot: () => inventory.firstEmptySlotRange(inventory.inventoryStart, inventory.inventoryEnd)
  }

  let nextSlot = inventory.inventoryStart
  for (const item of items) {
    const wantedSlot = typeof item.slot === 'number' ? item.slot : nextSlot
    setInventorySlot(inventory, wantedSlot, item)
    nextSlot = Math.max(nextSlot, wantedSlot + 1)
  }

  return inventory
}

function getEquipmentSlot(destination: EquipmentDestination | string, quickBarSlot = 0): number {
  switch (destination) {
    case 'hand':
      return QUICK_BAR_START + quickBarSlot
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
      return QUICK_BAR_START + quickBarSlot
  }
}

function getViewDirection(pitch: number, yaw: number): Vec3 {
  return new Vec3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
}

export function createFakePlayer(
  version: string,
  mcData: ReturnType<typeof registry>,
  world: EventedMutableWorld,
  pos: Vec3,
  groundLevel: number,
  username = 'test-bot'
): FakeBot {
  const onGround = pos.y === groundLevel
  const inventory = createFakeInventory()
  const pluginList = new Set<unknown>()
  const fakePlayer = new EventEmitter() as FakeBot
  const fakeClient: FakeClient = Object.assign(new EventEmitter(), {
    write: (_packet: string, _payload: unknown) => undefined
  })
  let activeDig: {
    block: Block
    ticksRemaining: number
    onTick: () => void
    resolve: () => void
    reject: (err: Error) => void
  } | null = null

  function hasPlugin(plugin: FakePlugin) {
    return pluginList.has(plugin)
  }

  function loadPlugin(plugin: FakePlugin, options?: any) {
    if (typeof plugin !== 'function') {
      throw new TypeError('plugin needs to be a function')
    }

    if (hasPlugin(plugin)) return

    pluginList.add(plugin)
    plugin(fakePlayer, options)
  }

  function loadPlugins(plugins: FakePlugin[], options?: any) {
    if (!Array.isArray(plugins) || plugins.some((plugin) => typeof plugin !== 'function')) {
      throw new TypeError('plugins need to be an array of functions')
    }

    for (const plugin of plugins) {
      loadPlugin(plugin, options)
    }
  }

  function syncEntityEquipment(): void {
    const handSlot = getEquipmentSlot('hand', fakePlayer.quickBarSlot)
    fakePlayer.equipment = [
      inventory.slots[handSlot],
      inventory.slots[45],
      inventory.slots[8],
      inventory.slots[7],
      inventory.slots[6],
      inventory.slots[5]
    ]

    if (fakePlayer.entity != null) {
      fakePlayer.entity.equipment = fakePlayer.equipment
    }
  }

  function updateHeldItem(): void {
    syncEntityEquipment()
    fakePlayer.usingHeldItem = false
    fakePlayer.emit('heldItemChanged', fakePlayer.heldItem ?? null)
  }

  function setQuickBarSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= QUICK_BAR_COUNT) {
      throw new Error(`Invalid quick bar slot: ${slot}`)
    }

    if (fakePlayer.quickBarSlot === slot) return
    fakePlayer.quickBarSlot = slot
    fakeClient.write('held_item_slot', { slotId: slot })
    updateHeldItem()
  }

  function findItemSlot(item: Item): number | null {
    const itemSlot = item.slot
    if (typeof itemSlot === 'number' && inventory.slots[itemSlot] === item) return itemSlot

    const slot = inventory.slots.findIndex((candidate) => candidate === item)
    return slot >= 0 ? slot : null
  }

  function moveItemToSlot(item: Item, destSlot: number): void {
    const sourceSlot = findItemSlot(item)
    if (sourceSlot === destSlot) {
      setInventorySlot(inventory, destSlot, item)
      return
    }

    if (sourceSlot != null) setInventorySlot(inventory, sourceSlot, null)
    setInventorySlot(inventory, destSlot, item)
  }

  async function equip(itemOrType: Item | number, destination: EquipmentDestination = 'hand'): Promise<void> {
    const item = typeof itemOrType === 'number'
      ? inventory.findInventoryItem(itemOrType)
      : itemOrType

    if (item == null || typeof item !== 'object') {
      throw new Error('Invalid item object in equip (item is null or typeof item is not object)')
    }

    if (destination === 'hand') {
      const sourceSlot = findItemSlot(item)
      if (sourceSlot != null && sourceSlot >= QUICK_BAR_START && sourceSlot < QUICK_BAR_START + QUICK_BAR_COUNT) {
        setQuickBarSlot(sourceSlot - QUICK_BAR_START)
      } else {
        moveItemToSlot(item, getEquipmentSlot('hand', fakePlayer.quickBarSlot))
      }
    } else {
      moveItemToSlot(item, getEquipmentSlot(destination, fakePlayer.quickBarSlot))
    }

    updateHeldItem()
  }

  async function unequip(destination: EquipmentDestination = 'hand'): Promise<void> {
    const slot = getEquipmentSlot(destination, fakePlayer.quickBarSlot)
    setInventorySlot(inventory, slot, null)
    updateHeldItem()
  }

  function blockAtCursor(maxDistance = 256, matcher?: ((block: Block) => boolean) | null): RayType | null {
    const eyeHeight = fakePlayer.entity.eyeHeight ?? 1.62
    const eyePosition = fakePlayer.entity.position.offset(0, eyeHeight, 0)
    const viewDirection = getViewDirection(fakePlayer.entity.pitch, fakePlayer.entity.yaw)

    return world.raycast(eyePosition, viewDirection.normalize(), maxDistance, matcher ?? undefined)
  }

  function digTime(block: Block): number {
    const heldItem = fakePlayer.heldItem
    const heldType = heldItem?.type ?? null
    const heldEnchants = heldItem?.enchants ?? []
    const helmet = inventory.slots[getEquipmentSlot('head', fakePlayer.quickBarSlot)]
    const helmetEnchants = helmet?.enchants ?? []
    const eyeBlock = fakePlayer._getBlockAtEyeLevel()

    return block.digTime(
      heldType,
      fakePlayer.game.gameMode === 'creative',
      eyeBlock?.name === 'water' || eyeBlock?.name === 'flowing_water',
      !fakePlayer.entity.onGround,
      heldEnchants.concat(helmetEnchants),
      fakePlayer.entity.effects ?? {}
    )
  }

  function stopDigging(): void {
    if (activeDig == null) return

    const dig = activeDig
    activeDig = null
    fakePlayer.off('physicsTick', dig.onTick)
    fakePlayer.targetDigBlock = null
    fakePlayer.targetDigFace = null
    fakePlayer.lastDigTime = performance.now()
    fakePlayer.emit('diggingAborted', dig.block)
    dig.reject(new Error('Digging aborted'))
  }

  async function dig(block: Block, forceLook?: boolean | 'ignore', _digFace?: unknown): Promise<void> {
    if (block == null) throw new Error('dig was called with an undefined or null block')
    if (activeDig != null) stopDigging()

    const waitTime = digTime(block)
    if (waitTime === Infinity) throw new Error(`dig time for ${block.name} is Infinity`)
    if (forceLook !== 'ignore') await fakePlayer.lookAt(block.position.offset(0.5, 0.5, 0.5), forceLook)

    const ticksRequired = Math.max(1, Math.ceil(waitTime / DIG_TICK_MS))
    fakePlayer.targetDigBlock = block
    fakePlayer.targetDigFace = 1

    await new Promise<void>((resolve, reject) => {
      const onTick = () => {
        const currentDig = activeDig
        if (currentDig == null) return
        currentDig.ticksRemaining--
        if (currentDig.ticksRemaining > 0) return

        activeDig = null
        fakePlayer.off('physicsTick', onTick)
        const newBlock = world.clearBlock(block.position)
        fakePlayer.targetDigBlock = null
        fakePlayer.targetDigFace = null
        fakePlayer.lastDigTime = performance.now()
        fakePlayer.emit('diggingCompleted', newBlock)
        currentDig.resolve()
      }

      activeDig = {
        block,
        ticksRemaining: ticksRequired,
        onTick,
        resolve,
        reject
      }
      fakePlayer.on('physicsTick', onTick)
    })
  }

  function decrementHeldItem(item: Item): void {
    if (fakePlayer.game.gameMode === 'creative') return
    if (typeof item.count !== 'number') return

    item.count--
    if (item.count > 0) return

    const slot = findItemSlot(item)
    if (slot != null) setInventorySlot(inventory, slot, null)
    updateHeldItem()
  }

  async function placeBlockWithOptions(
    referenceBlock: Block,
    faceVector: Vec3,
    _options: PlaceBlockOptions = {}
  ): Promise<void> {
    const heldItem = fakePlayer.heldItem
    if (heldItem == null) throw new Error('must be holding an item to place')

    const blockDescriptor = mcData.blocksByName[heldItem.name]
    if (blockDescriptor == null) throw new Error(`held item ${heldItem.name} is not placeable by the fake rig`)

    const dest = referenceBlock.position.plus(faceVector).floored()
    const oldBlock = world.getBlock(dest)
    await Promise.resolve()
    const newBlock = world.setBlock(dest, blockDescriptor.minStateId ?? blockDescriptor.id)
    decrementHeldItem(heldItem)
    fakePlayer.emit('blockPlaced', oldBlock, newBlock)
  }

  function activateItem(_offhand = false): void {
    fakePlayer.usingHeldItem = true
  }

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
    equipment: Array(6).fill(null),
    QUICK_BAR_START,
    quickBarSlot: 0,
    currentWindow: null,
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
      eyeHeight: 1.62,
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
    blockAtCursor,
    blockAtEntityCursor: (_entity: unknown, maxDistance = 256, matcher?: ((block: Block) => boolean) | null) => blockAtCursor(maxDistance, matcher),
    getEquipmentDestSlot: (destination: string) => getEquipmentSlot(destination, fakePlayer.quickBarSlot),
    setQuickBarSlot,
    equip,
    unequip,
    updateHeldItem,
    activateItem,
    dig,
    stopDigging,
    digTime,
    targetDigBlock: null,
    targetDigFace: null,
    lastDigTime: null,
    _placeBlockWithOptions: placeBlockWithOptions,
    _getBlockAtEyeLevel: () => fakePlayer.entity.position != null ? fakePlayer.blockAt(fakePlayer.entity.position.offset(0, fakePlayer.entity.eyeHeight, 0)) : null,
    swingArm: () => undefined,
    loadPlugin,
    loadPlugins,
    hasPlugin,
    nearestEntity: () => null,
    chat: () => undefined,
    whisper: () => undefined
  })

  Object.defineProperty(fakePlayer, 'heldItem', {
    get: () => inventory.slots[getEquipmentSlot('hand', fakePlayer.quickBarSlot)],
    configurable: true
  })

  syncEntityEquipment()

  const eventedWorld = world
  if (typeof eventedWorld.on === 'function' && typeof eventedWorld.off === 'function') {
    const forwardBlockUpdate = (oldBlock: Block | null, newBlock: Block | null) => {
      fakePlayer.emit('blockUpdate', oldBlock, newBlock)
      const position = oldBlock?.position ?? newBlock?.position
      if (position != null) fakePlayer.emit(`blockUpdate:${position.toString()}`, oldBlock, newBlock)
    }
    const forwardChunkColumnLoad = (point: Vec3) => fakePlayer.emit('chunkColumnLoad', point)
    const forwardChunkColumnUnload = (point: Vec3) => fakePlayer.emit('chunkColumnUnload', point)
    const cleanupForwarding = () => {
      eventedWorld.off('blockUpdate', forwardBlockUpdate)
      eventedWorld.off('chunkColumnLoad', forwardChunkColumnLoad)
      eventedWorld.off('chunkColumnUnload', forwardChunkColumnUnload)
    }

    eventedWorld.on('blockUpdate', forwardBlockUpdate)
    eventedWorld.on('chunkColumnLoad', forwardChunkColumnLoad)
    eventedWorld.on('chunkColumnUnload', forwardChunkColumnUnload)
    fakePlayer.once('end', cleanupForwarding)
  }

  return fakePlayer
}
