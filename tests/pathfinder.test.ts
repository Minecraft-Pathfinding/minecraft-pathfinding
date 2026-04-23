import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'

import { createPlugin, goals } from '../src'
import { createCacheWorld } from './setup'

// require('debug').disable()

type PathResult = {
  status: string
  path: Array<{ x: number, y: number, z: number, moveType?: { constructor?: { name?: string } } }>
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

function preparePathRig(options: {
  inventoryItems?: (mcData: any) => Array<{ type: number, count: number, name: string }>
  moveSettings?: Record<string, unknown>
} = {}) {
  const rig = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0)).rig

  if (options.inventoryItems != null) {
    rig.bot.inventory.items = () => options.inventoryItems!(rig.mcData) as any
  }

  rig.bot.loadPlugin(createPlugin({
    pathfinderSettings: { partialPathProducer: true, partialPathLength: 50 },
    moveSettings: options.moveSettings as any
  }))

  return rig
}

async function collectPathResult(
  bot: ReturnType<typeof preparePathRig>['bot'],
  goal: goals.Goal,
  timeoutMs = 15000
): Promise<PathResult> {
  let final: { result: PathResult } | undefined

  await withTimeout((async () => {
    for await (const res of bot.pathfinder.getPathTo(goal)) {
      final = res as { result: PathResult }
    }
  })(), timeoutMs, `timed out while planning to ${goal.constructor.name}`)

  if (final == null) {
    throw new Error('path planner finished without a final result')
  }

  return final.result
}

test('getPathTo succeeds on an unobstructed flat path', async () => {
  const rig = preparePathRig()

  try {
    const result = await collectPathResult(rig.bot, new goals.GoalBlock(20, 64, 0))
    const last = result.path[result.path.length - 1]

    assert.equal(result.status, 'success')
    assert.equal(last?.x, 20)
    assert.equal(last?.y, 64)
    assert.equal(last?.z, 0)
    assert.equal(result.path.length, 21)
  } finally {
    rig.stopPassivePhysics()
  }
})

test('getPathTo succeeds when it needs a one-block tower and the bot has a block to place', async () => {
  const rig = preparePathRig({
    inventoryItems: (mcData) => [{ type: mcData.itemsByName.dirt.id, count: 2, name: 'dirt' }]
  })

  try {
    const result = await collectPathResult(rig.bot, new goals.GoalBlock(0, 66, 0))
    const last = result.path[result.path.length - 1]

    assert.equal(result.status, 'success')
    assert.equal(last?.x, 0)
    assert.equal(last?.y, 66)
    assert.equal(last?.z, 0)
    assert(result.path.some((move) => move.moveType?.constructor?.name === 'StraightUp'), 'expected the plan to use a vertical tower move')
  } finally {
    rig.stopPassivePhysics()
  }
})

test('getPathTo fails when a one-block tower is required but the bot has no blocks to place', async () => {
  const rig = preparePathRig()

  try {
    await assert.rejects(
      collectPathResult(rig.bot, new goals.GoalBlock(0, 65, 0), 4000),
      /timed out while planning to GoalBlock/
    )
  } finally {
    rig.stopPassivePhysics()
  }
})

test('getPathTo fails when a one-block tower is required but placement is disabled', async () => {
  const rig = preparePathRig({
    inventoryItems: (mcData) => [{ type: mcData.itemsByName.dirt.id, count: 1, name: 'dirt' }],
    moveSettings: { canPlace: false }
  })

  try {
    await assert.rejects(
      collectPathResult(rig.bot, new goals.GoalBlock(0, 65, 0), 4000),
      /timed out while planning to GoalBlock/
    )
  } finally {
    rig.stopPassivePhysics()
  }
})
