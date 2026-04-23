import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'

import { createCacheWorld, createFlatWorld, loadMcData } from '../setup'

test('fake world returns floor and air blocks', () => {
  const world = createFlatWorld('1.20.4', 64)
  const floor = world.getBlock(new Vec3(0, 63, 0))
  const air = world.getBlock(new Vec3(0, 64, 0))

  assert.equal(floor?.name, 'stone')
  assert.equal(air?.name, 'air')
  assert.equal(world.getBlockStateId(new Vec3(0, 63, 0)), floor?.stateId)
})

test('fake world emits blockUpdate events when blocks change', () => {
  const world = createFlatWorld('1.20.4', 64)
  const pos = new Vec3(1, 64, 1)
  const updates: Array<[string | null, string | null]> = []

  world.on('blockUpdate', (oldBlock, newBlock) => {
    updates.push([oldBlock?.name ?? null, newBlock?.name ?? null])
  })

  world.setBlock(pos, 'stone')
  world.clearBlock(pos)

  assert.deepEqual(updates, [
    ['air', 'stone'],
    ['stone', 'air']
  ])
})

test('fake world returns null for unloaded chunks', () => {
  const world = createFlatWorld('1.20.4', 64, { renderDistance: 0, center: new Vec3(0, 64, 0) })

  assert.equal(world.getBlock(new Vec3(0, 63, 0))?.name, 'stone')
  assert.equal(world.getBlock(new Vec3(16, 63, 0)), null)
  assert.equal(world.getBlockStateId(new Vec3(16, 63, 0)), undefined)
})

test('fake world emits prismarine-world style chunk column events', () => {
  const world = createFlatWorld('1.20.4', 64, { renderDistance: 0, center: new Vec3(0, 64, 0) })
  const loaded: Vec3[] = []
  const unloaded: Vec3[] = []

  world.on('chunkColumnLoad', (point) => loaded.push(point))
  world.on('chunkColumnUnload', (point) => unloaded.push(point))

  world.updateLoadedColumns(new Vec3(16, 64, 0))

  assert.deepEqual(loaded.map((point) => point.toString()), ['(16, 0, 0)'])
  assert.deepEqual(unloaded.map((point) => point.toString()), ['(0, 0, 0)'])
  assert.equal(world.getBlock(new Vec3(0, 63, 0)), null)
  assert.equal(world.getBlock(new Vec3(16, 63, 0))?.name, 'stone')
})

test('fake world tracks bot movement with render distance', () => {
  const { world, rig } = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0), { renderDistance: 0 })
  const loaded: Vec3[] = []
  const unloaded: Vec3[] = []

  world.on('chunkColumnLoad', (point) => loaded.push(point))
  world.on('chunkColumnUnload', (point) => unloaded.push(point))

  rig.bot.entity.position = new Vec3(16, 64, 0)
  const bot = rig.bot as any
  bot.emit('move')

  assert.deepEqual(loaded.map((point) => point.toString()), ['(16, 0, 0)'])
  assert.deepEqual(unloaded.map((point) => point.toString()), ['(0, 0, 0)'])
  assert.equal(world.getBlock(new Vec3(0, 63, 0)), null)
  assert.equal(world.getBlock(new Vec3(16, 63, 0))?.name, 'stone')

  rig.stopPassivePhysics()
})

test('CacheSyncWorld updates cached block info from blockUpdate events', () => {
  const version = '1.20.4'
  const floorY = 64
  const pos = new Vec3(2, 64, 2)
  const { world, rig, cacheWorld } = createCacheWorld(version, floorY, pos)
  const { mcData } = loadMcData(version)

  const initial = cacheWorld.getBlockInfo(pos)
  assert.equal(initial.block?.name, 'air')

  world.setBlock(pos, mcData.blocksByName.stone.minStateId)

  const updated = cacheWorld.getBlockInfo(pos)
  assert.equal(updated.block?.name, 'stone')
  assert.equal(rig.bot.blockAt(pos)?.name, 'stone')
  rig.stopPassivePhysics()
})
