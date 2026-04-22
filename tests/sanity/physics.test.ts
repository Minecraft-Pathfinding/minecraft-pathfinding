import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'

import { createCacheWorld } from '../setup'

type ControlName = 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sneak' | 'sprint'

function prepareLiveRig() {
  const { world, rig } = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0))
  const { bot, playerCtx } = rig

  bot.entity.position = new Vec3(0, 64, 0)
  bot.entity.velocity = new Vec3(0, 0, 0)
  bot.entity.yaw = 0
  bot.entity.pitch = 0

  playerCtx.state.pos.set(0, 64, 0)
  playerCtx.state.vel.set(0, 0, 0)
  playerCtx.state.yaw = 0
  playerCtx.state.pitch = 0
  playerCtx.state.control.reset()

  for (const control of ['forward', 'back', 'left', 'right', 'jump', 'sneak', 'sprint'] as ControlName[]) {
    bot.setControlState(control, false)
  }

  return {
    bot,
    playerCtx,
    world,
    rig,
    cleanup: rig.stopPassivePhysics
  }
}

async function moveWithControls(controls: ControlName[], ticks = 3) {
  const { bot, cleanup } = prepareLiveRig()
  try {
    const start = bot.entity.position.clone()

    for (const control of controls) {
      bot.setControlState(control, true)
    }

    await bot.waitForTicks(ticks)

    const end = bot.entity.position.clone()

    for (const control of controls) {
      bot.setControlState(control, false)
    }

    return { bot, start, end }
  } finally {
    cleanup()
  }
}

test('physics rig moves forward, back, left, and right on the expected axes', async () => {
  const forward = await moveWithControls(['forward'])
  const back = await moveWithControls(['back'])
  const left = await moveWithControls(['left'])
  const right = await moveWithControls(['right'])

  assert(forward.end.z < forward.start.z, `expected forward to decrease z, got start=${forward.start} end=${forward.end}`)
  assert(back.end.z > back.start.z, `expected back to increase z, got start=${back.start} end=${back.end}`)
  assert(left.end.x < left.start.x, `expected left to decrease x, got start=${left.start} end=${left.end}`)
  assert(right.end.x > right.start.x, `expected right to increase x, got start=${right.start} end=${right.end}`)
})

test('physics rig handles jump, sprint, and sneak controls', async () => {
  const walk = await moveWithControls(['forward'], 4)
  const sprint = await moveWithControls(['forward', 'sprint'], 4)
  const jumpRig = prepareLiveRig()

  try {
    jumpRig.bot.setControlState('jump', true)
    const jumpStart = jumpRig.bot.entity.position.clone()
    await jumpRig.bot.waitForTicks(3)
    const jumpEnd = jumpRig.bot.entity.position.clone()
    jumpRig.bot.setControlState('jump', false)

    const sneakRig = prepareLiveRig()
    try {
      sneakRig.bot.setControlState('sneak', true)
      await sneakRig.bot.waitForTicks(2)
      const sneakEnd = sneakRig.bot.entity.position.clone()
      const sneakPose = (sneakRig.bot.entity as any).pose
      sneakRig.bot.setControlState('sneak', false)

      assert(sprint.end.z < walk.end.z, `expected sprint to travel farther than walk, got walk=${walk.end} sprint=${sprint.end}`)
      assert(jumpEnd.y > jumpStart.y, `expected jump to raise y, got start=${jumpStart} end=${jumpEnd}`)
      assert.equal(jumpRig.bot.entity.onGround, false)
      assert.notEqual(sneakPose, 0, 'expected sneak to change the player pose')
      assert.equal(sneakEnd.x, 0)
      assert.equal(sneakEnd.z, 0)
    } finally {
      sneakRig.cleanup()
    }
  } finally {
    jumpRig.cleanup()
  }
})

test('physics rig keeps applying held controls across multiple live ticks until release', async () => {
  const { bot, cleanup } = prepareLiveRig()
  const positions: Vec3[] = []

  try {
    bot.on('physicsTick', () => {
      positions.push(bot.entity.position.clone())
    })

    bot.setControlState('forward', true)
    await bot.waitForTicks(3)
    bot.setControlState('forward', false)
    await bot.waitForTicks(2)

    assert(positions.length >= 5, `expected at least 5 physics samples, got ${positions.length}`)
    assert(positions[1].z < positions[0].z, `expected forward movement on tick 1, got ${positions[0]} -> ${positions[1]}`)
    assert(positions[2].z < positions[1].z, `expected forward movement on tick 2, got ${positions[1]} -> ${positions[2]}`)
    assert.equal(bot.getControlState('forward'), false)
  } finally {
    cleanup()
  }
})
