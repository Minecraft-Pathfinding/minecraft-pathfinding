import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import itemLoader, { type Item } from 'prismarine-item'

import { createCacheWorld } from '../setup'
import type { FakeBot } from '../setup/fake-player'
import type { Block, MCData } from '../../src/types'

function fakeItem(mcData: MCData, name: string, count = 1): Item {
  const ItemCtor = itemLoader(mcData)
  return new ItemCtor(mcData.itemsByName[name].id, count)
}

function emitPhysicsTicks(bot: FakeBot, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    bot.emit('physicsTick')
  }
}

function assertBlock(block: Block | null): Block {
  if (block == null) throw new Error('Expected test block to exist')
  return block
}

test('fake bot equips and unequips held and armor items', async () => {
  const rig = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0)).rig

  try {
    const dirt = fakeItem(rig.mcData, 'dirt', 2)
    const boots = fakeItem(rig.mcData, 'diamond_boots')
    const heldChanges: Array<Item | null> = []

    rig.bot.on('heldItemChanged', (item: Item | null) => {
      heldChanges.push(item)
    })

    await rig.bot.equip(dirt, 'hand')

    assert.equal(rig.bot.heldItem, dirt)
    assert.equal(rig.bot.inventory.slots[rig.bot.getEquipmentDestSlot('hand')], dirt)
    assert.equal(rig.bot.entity.equipment[0], dirt)
    assert.equal(heldChanges[heldChanges.length - 1], dirt)

    await rig.bot.equip(boots, 'feet')

    assert.equal(rig.bot.inventory.slots[rig.bot.getEquipmentDestSlot('feet')], boots)
    assert.equal(rig.bot.entity.equipment[2], boots)

    await rig.bot.unequip('hand')

    assert.equal(rig.bot.heldItem, null)
    assert.equal(rig.bot.entity.equipment[0], null)
  } finally {
    rig.stopPassivePhysics()
  }
})

test('fake bot digTime reflects the equipped tool', async () => {
  const { world, rig } = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0))
  const pos = new Vec3(1, 64, 0)

  try {
    world.setBlock(pos, 'dirt')
    const block = assertBlock(world.getBlock(pos))

    const handTime = rig.bot.digTime(block)
    await rig.bot.equip(fakeItem(rig.mcData, 'diamond_shovel'), 'hand')
    const shovelTime = rig.bot.digTime(block)

    assert(shovelTime < handTime, `expected diamond shovel (${shovelTime}) to beat hand (${handTime})`)
  } finally {
    rig.stopPassivePhysics()
  }
})

test('fake bot digging completes after the required simulated tick count', async () => {
  const { world, rig, cacheWorld } = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0))
  const pos = new Vec3(1, 64, 0)
  const updates: Array<[string | null, string | null]> = []

  try {
    world.setBlock(pos, 'dirt')
    const block = assertBlock(world.getBlock(pos))

    rig.bot.on('blockUpdate', (oldBlock: Block | null, newBlock: Block | null) => {
      if ((oldBlock?.position ?? newBlock?.position)?.equals(pos) === true) {
        updates.push([oldBlock?.name ?? null, newBlock?.name ?? null])
      }
    })

    const ticksRequired = Math.max(1, Math.ceil(rig.bot.digTime(block) / 50))
    const digPromise = rig.bot.dig(block, 'ignore', 'raycast')

    emitPhysicsTicks(rig.bot, ticksRequired - 1)
    assert.equal(world.getBlock(pos)?.name, 'dirt')
    assert.equal(cacheWorld.getBlockInfo(pos).block?.name, 'dirt')

    emitPhysicsTicks(rig.bot, 1)
    await digPromise

    assert.equal(world.getBlock(pos)?.name, 'air')
    assert.equal(cacheWorld.getBlockInfo(pos).block?.name, 'air')
    assert(updates.some(([oldName, newName]) => oldName === 'dirt' && newName === 'air'))
  } finally {
    rig.stopPassivePhysics()
  }
})

test('fake bot can abort an active dig before the required tick count', async () => {
  const { world, rig } = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0))
  const pos = new Vec3(1, 64, 0)

  try {
    world.setBlock(pos, 'dirt')
    const block = assertBlock(world.getBlock(pos))

    const digPromise = rig.bot.dig(block, 'ignore', 'raycast')
    rig.bot.stopDigging()

    await assert.rejects(digPromise, /Digging aborted/)
    assert.equal(world.getBlock(pos)?.name, 'dirt')
  } finally {
    rig.stopPassivePhysics()
  }
})

test('fake bot places held block items into the in-memory world', async () => {
  const { world, rig, cacheWorld } = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0))
  const reference = new Vec3(0, 63, 0)
  const dest = new Vec3(0, 64, 0)

  try {
    const dirt = fakeItem(rig.mcData, 'dirt', 2)
    const placed: Array<[string | null, string | null]> = []

    rig.bot.on('blockPlaced', (oldBlock: Block | null, newBlock: Block | null) => {
      placed.push([oldBlock?.name ?? null, newBlock?.name ?? null])
    })

    await rig.bot.equip(dirt, 'hand')
    await rig.bot._placeBlockWithOptions(assertBlock(world.getBlock(reference)), new Vec3(0, 1, 0), { forceLook: 'ignore' })

    assert.equal(world.getBlock(dest)?.name, 'dirt')
    assert.equal(cacheWorld.getBlockInfo(dest).block?.name, 'dirt')
    assert.equal(dirt.count, 1)
    assert.deepEqual(placed, [['air', 'dirt']])
  } finally {
    rig.stopPassivePhysics()
  }
})

test('fake bot raycasts from the current look direction', async () => {
  const { world, rig } = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0))
  const target = new Vec3(0, 64, -3)

  try {
    world.setBlock(target, 'stone')

    await rig.bot.lookAt(target.offset(0.5, 0.5, 0.5), true)
    const block = rig.bot.blockAtCursor(6)

    assert.equal(block?.position.toString(), target.toString())
  } finally {
    rig.stopPassivePhysics()
  }
})
