import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'

import { createPlugin, goals } from '../src'
import {
  createBoxExclusion,
  createRadiusExclusion,
  createColumnRadiusExclusion,
  EXCLUSION_NEVER,
  type ExclusionArea
} from '../src'
import { BlockInfo } from '../src/mineflayer-specific/world/cacheWorld'
import { buildMovementOptions, DEFAULT_MOVEMENT_OPTS } from '../src/mineflayer-specific/movements'
import { createCacheWorld } from './setup'

// ---------------------------------------------------------------------------
// Small shared helpers (kept local so this file stands on its own), mirroring
// the style of tests/pathfinder.test.ts.
// ---------------------------------------------------------------------------

type PathResult = {
  status: string
  path: Array<{ x: number, y: number, z: number }>
}

function withTimeout<T> (promise: Promise<T>, ms: number, message: string): Promise<T> {
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

function preparePathRig (moveSettings?: Record<string, unknown>) {
  const rig = createCacheWorld('1.20.4', 64, new Vec3(0, 64, 0)).rig
  rig.bot.loadPlugin(createPlugin({
    pathfinderSettings: { partialPathProducer: true, partialPathLength: 50 },
    moveSettings: moveSettings as any
  }))
  return rig
}

async function collectPathResult (
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

/** Build a fake BlockInfo that only carries a position (all the helpers look at). */
function blockAt (x: number, y: number, z: number): BlockInfo {
  return { position: new Vec3(x, y, z) } as unknown as BlockInfo
}

// ---------------------------------------------------------------------------
// Unit tests for the zone-builder helpers. These are pure functions, so we can
// check their math directly without spinning up the pathfinder.
// ---------------------------------------------------------------------------

test('createBoxExclusion forbids blocks inside the box and ignores blocks outside', () => {
  const box = createBoxExclusion(new Vec3(0, 64, 0), new Vec3(4, 68, 4))

  // corners and an interior point are inside -> forbidden.
  assert.equal(box(blockAt(0, 64, 0)), EXCLUSION_NEVER)
  assert.equal(box(blockAt(4, 68, 4)), EXCLUSION_NEVER)
  assert.equal(box(blockAt(2, 66, 2)), EXCLUSION_NEVER)

  // just outside on each axis -> free.
  assert.equal(box(blockAt(-1, 66, 2)), 0)
  assert.equal(box(blockAt(5, 66, 2)), 0)
  assert.equal(box(blockAt(2, 63, 2)), 0)
  assert.equal(box(blockAt(2, 69, 2)), 0)
})

test('createBoxExclusion accepts the two corners in any order', () => {
  const ordered = createBoxExclusion(new Vec3(0, 64, 0), new Vec3(4, 68, 4))
  const swapped = createBoxExclusion(new Vec3(4, 68, 4), new Vec3(0, 64, 0))

  for (const p of [blockAt(0, 64, 0), blockAt(2, 66, 2), blockAt(5, 66, 2)]) {
    assert.equal(ordered(p), swapped(p))
  }
})

test('createBoxExclusion supports a custom soft cost', () => {
  const soft = createBoxExclusion(new Vec3(0, 0, 0), new Vec3(2, 2, 2), 25)
  assert.equal(soft(blockAt(1, 1, 1)), 25)
  assert.equal(soft(blockAt(9, 9, 9)), 0)
})

test('createRadiusExclusion forbids blocks within the radius (a ball)', () => {
  const ball = createRadiusExclusion(new Vec3(0, 0, 0), 3)

  assert.equal(ball(blockAt(0, 0, 0)), EXCLUSION_NEVER) // center
  assert.equal(ball(blockAt(3, 0, 0)), EXCLUSION_NEVER) // on the radius
  assert.equal(ball(blockAt(0, 3, 0)), EXCLUSION_NEVER) // height counts
  assert.equal(ball(blockAt(4, 0, 0)), 0) // just outside
})

test('createColumnRadiusExclusion ignores height (a pillar)', () => {
  const pillar = createColumnRadiusExclusion(new Vec3(0, 64, 0), 3)

  // Same X/Z, wildly different Y -> still inside the pillar.
  assert.equal(pillar(blockAt(0, -40, 0)), EXCLUSION_NEVER)
  assert.equal(pillar(blockAt(2, 250, 0)), EXCLUSION_NEVER)
  // Outside the X/Z radius -> free, regardless of height.
  assert.equal(pillar(blockAt(4, 64, 0)), 0)
})

// ---------------------------------------------------------------------------
// Regression tests: the default arrays must never be shared/mutated. Without
// fresh copies, mutating one bot's defaultMoveSettings.exclusionAreasStep would
// leak zones into other bots and into later setMoveOptions calls.
// ---------------------------------------------------------------------------

test('buildMovementOptions gives every settings object its own exclusion arrays', () => {
  const a = buildMovementOptions()
  const b = buildMovementOptions()

  // Fresh arrays, not the shared default instance, and not shared with each other.
  assert.notEqual(a.exclusionAreasStep, DEFAULT_MOVEMENT_OPTS.exclusionAreasStep)
  assert.notEqual(a.exclusionAreasStep, b.exclusionAreasStep)

  // Mutating one must not leak into the other, nor back into the defaults.
  a.exclusionAreasStep.push(() => 0)
  assert.equal(a.exclusionAreasStep.length, 1)
  assert.equal(b.exclusionAreasStep.length, 0)
  assert.equal(DEFAULT_MOVEMENT_OPTS.exclusionAreasStep.length, 0)
})

test('buildMovementOptions copies a user-supplied array instead of holding its reference', () => {
  const mine: ExclusionArea[] = []
  const opts = buildMovementOptions({ exclusionAreasBreak: mine })

  // The settings hold a copy, so edits to either side stay independent.
  assert.notEqual(opts.exclusionAreasBreak, mine)
  mine.push(() => 0)
  assert.equal(opts.exclusionAreasBreak.length, 0)
})

test('the default exclusion arrays are frozen so they cannot be mutated in place', () => {
  assert.ok(Object.isFrozen(DEFAULT_MOVEMENT_OPTS.exclusionAreasStep))
  assert.ok(Object.isFrozen(DEFAULT_MOVEMENT_OPTS.exclusionAreasBreak))
  assert.ok(Object.isFrozen(DEFAULT_MOVEMENT_OPTS.exclusionAreasPlace))
})

// ---------------------------------------------------------------------------
// Functional tests: run the real pathfinder over a flat world and confirm the
// zones change the chosen path.
// ---------------------------------------------------------------------------

// A solid "wall" of forbidden blocks straddling the straight-line route from
// (0,64,0) to (20,64,0). The bot stands at y=64, so y 64-66 covers feet+head.
function makeWall (): { area: ExclusionArea, isInside: (x: number, y: number, z: number) => boolean } {
  const minX = 8; const maxX = 12
  const minZ = -3; const maxZ = 3
  const minY = 64; const maxY = 66
  return {
    area: createBoxExclusion(new Vec3(minX, minY, minZ), new Vec3(maxX, maxY, maxZ)),
    isInside: (x, y, z) => x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ
  }
}

test('a hard step exclusion forces the bot to detour around a wall', async () => {
  const wall = makeWall()
  const rig = preparePathRig({ exclusionAreasStep: [wall.area] })

  try {
    const result = await collectPathResult(rig.bot, new goals.GoalBlock(20, 64, 0))
    const last = result.path[result.path.length - 1]

    assert.equal(result.status, 'success')
    assert.equal(last?.x, 20)
    assert.equal(last?.y, 64)
    assert.equal(last?.z, 0)

    // The whole point: no step in the plan lands inside the forbidden wall.
    for (const node of result.path) {
      assert.ok(
        !wall.isInside(node.x, node.y, node.z),
        `path stepped into the excluded wall at ${node.x},${node.y},${node.z}`
      )
    }

    // Going around is strictly longer than the unobstructed straight line (21).
    assert.ok(result.path.length > 21, `expected a detour longer than 21 moves, got ${result.path.length}`)
  } finally {
    rig.stopPassivePhysics()
  }
})

test('a soft step exclusion still reaches the goal (avoid, never forbid)', async () => {
  // A soft, finite cost makes the zone undesirable but not impossible to cross.
  const softWall = createBoxExclusion(new Vec3(8, 64, -3), new Vec3(12, 66, 3), 40)
  const rig = preparePathRig({ exclusionAreasStep: [softWall] })

  try {
    const result = await collectPathResult(rig.bot, new goals.GoalBlock(20, 64, 0))
    const last = result.path[result.path.length - 1]

    assert.equal(result.status, 'success')
    assert.equal(last?.x, 20)
    assert.equal(last?.y, 64)
    assert.equal(last?.z, 0)
  } finally {
    rig.stopPassivePhysics()
  }
})

test('a hard step exclusion on the only goal block makes the goal unreachable', async () => {
  // Forbid standing on the exact goal block; the bot can never finish.
  const onGoal = createBoxExclusion(new Vec3(20, 64, 0), new Vec3(20, 64, 0))
  const rig = preparePathRig({ exclusionAreasStep: [onGoal] })

  try {
    await assert.rejects(
      collectPathResult(rig.bot, new goals.GoalBlock(20, 64, 0), 4000),
      /timed out while planning to GoalBlock/
    )
  } finally {
    rig.stopPassivePhysics()
  }
})
