import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'

import { createPlugin, goals } from '../../src'
import { createCacheWorld } from '../setup'

require('debug').disable()


function preparePathRig() {
  const rig = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0)).rig
  rig.bot.loadPlugin(createPlugin())
  return rig
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    promise.finally(() => {
      if (timer != null) clearTimeout(timer)
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    })
  ])
}

test('pathfinder walks from 0,64,0 to 20,64,0', async () => {
  const rig = preparePathRig()

  try {
    const goal = new goals.GoalBlock(20, 64, 0)
    let goalFinished = 0

    rig.bot.on('goalFinished', (finishedGoal) => {
      if (finishedGoal instanceof goals.GoalBlock && finishedGoal.x === 20 && finishedGoal.y === 64 && finishedGoal.z === 0) {
        goalFinished += 1
      }
    })

    await withTimeout(
      rig.bot.pathfinder.goto(goal),
      15000,
      'timed out while waiting for the bot to pathfind to 20,64,0'
    )

    const end = rig.bot.entity.position
    assert.equal(goalFinished, 1)
    assert(end.distanceTo(new Vec3(20, 64, 0)) < 1, `expected bot to finish near 20,65,0, got ${end}`)
  } finally {
    rig.stopPassivePhysics()
  }
})
