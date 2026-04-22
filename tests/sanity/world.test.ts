import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'

import { createCacheWorld, createFlatWorld, loadMcData } from '../setup'

test('fake world returns floor and air blocks', () => {
  const world = createFlatWorld('1.20.4', 64)

  assert.equal(world.getBlock(new Vec3(0, 63, 0)).name, 'stone')
  assert.equal(world.getBlock(new Vec3(0, 64, 0)).name, 'air')
  assert.equal(world.getBlockStateId(new Vec3(0, 63, 0)), world.getBlock(new Vec3(0, 63, 0)).stateId)
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
