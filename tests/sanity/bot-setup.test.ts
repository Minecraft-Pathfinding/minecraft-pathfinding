import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'

import { createCacheWorld } from '../setup'

test('fake bot exposes entity and control state tracking', () => {
  const rig = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0)).rig

  assert.equal(rig.bot.entity.position.y, 64)
  assert.equal(rig.bot.world.getBlock(new Vec3(0, 63, 0)).name, 'stone')
  assert.ok(rig.physics)
  assert.ok(rig.playerCtx)
  assert.ok(rig.playerState)
  rig.bot.setControlState('jump', true)
  assert.equal(rig.bot.getControlState('jump'), true)
  rig.stopPassivePhysics()
})

test('fake bot can load plugins onto the bot object', () => {
  const rig = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0)).rig
  let loadCount = 0

  function plugin(bot: any) {
    loadCount += 1
    bot.pluginMarker = 'loaded'
  }

  assert.equal(rig.bot.hasPlugin(plugin), false)

  rig.bot.loadPlugin(plugin)

  assert.equal(loadCount, 1)
  assert.equal((rig.bot as any).pluginMarker, 'loaded')
  assert.equal(rig.bot.hasPlugin(plugin), true)

  rig.bot.loadPlugin(plugin)

  assert.equal(loadCount, 1)
  rig.stopPassivePhysics()
})

test('fake bot can clear all control states', () => {
  const rig = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0)).rig

  rig.bot.setControlState('forward', true)
  rig.bot.setControlState('jump', true)
  rig.bot.clearControlStates()

  assert.equal(rig.bot.getControlState('forward'), false)
  assert.equal(rig.bot.getControlState('jump'), false)
  rig.stopPassivePhysics()
})
