import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'

import { createPlugin, goals, Move } from '../src'
import type { ExclusionArea } from '../src'
import { buildMovementOptions, DEFAULT_MOVEMENT_OPTS } from '../src/mineflayer-specific/movements'
import { Optimizer } from '../src/mineflayer-specific/post'
import { createCacheWorld } from './setup'

// ---------------------------------------------------------------------------
// Local helpers (kept here so this file stands on its own). The library ships
// no zone-builders on purpose, so the tests define their own — just like a user
// would (see examples/exclusionZones.js).
// ---------------------------------------------------------------------------

type PathResult = {
  status: string
  path: Move[]
}

/** A hard/soft box zone between two corners (inclusive). */
function boxExclusion (min: Vec3, max: Vec3, cost = Infinity): ExclusionArea {
  return (block) => {
    const p = block.position
    const inside =
      p.x >= min.x && p.x <= max.x &&
      p.y >= min.y && p.y <= max.y &&
      p.z >= min.z && p.z <= max.z
    return inside ? cost : 0
  }
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

// ---------------------------------------------------------------------------
// Default-array safety: the three exclusion lists must never be shared/mutated.
// Without fresh copies, mutating one bot's defaultMoveSettings.exclusionAreasStep
// would leak zones into other bots and into later setMoveOptions calls.
// ---------------------------------------------------------------------------

test('buildMovementOptions gives every settings object its own exclusion arrays', () => {
  const a = buildMovementOptions()
  const b = buildMovementOptions()

  assert.notEqual(a.exclusionAreasStep, DEFAULT_MOVEMENT_OPTS.exclusionAreasStep)
  assert.notEqual(a.exclusionAreasStep, b.exclusionAreasStep)

  a.exclusionAreasStep.push(() => 0)
  assert.equal(a.exclusionAreasStep.length, 1)
  assert.equal(b.exclusionAreasStep.length, 0)
  assert.equal(DEFAULT_MOVEMENT_OPTS.exclusionAreasStep.length, 0)
})

test('buildMovementOptions copies a user-supplied array instead of holding its reference', () => {
  const mine: ExclusionArea[] = []
  const opts = buildMovementOptions({ exclusionAreasBreak: mine })

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
// Functional tests: run the real pathfinder over a flat world.
// ---------------------------------------------------------------------------

// A forbidden "wall" straddling the straight route from (0,64,0) to (20,64,0).
// The bot stands at y=64, so y 64-66 covers feet+head.
function makeWall (): { area: ExclusionArea, isInside: (x: number, y: number, z: number) => boolean } {
  const minX = 8; const maxX = 12
  const minZ = -3; const maxZ = 3
  const minY = 64; const maxY = 66
  return {
    area: boxExclusion(new Vec3(minX, minY, minZ), new Vec3(maxX, maxY, maxZ)),
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

    for (const node of result.path) {
      assert.ok(
        !wall.isInside(node.x, node.y, node.z),
        `path stepped into the excluded wall at ${node.x},${node.y},${node.z}`
      )
    }

    assert.ok(result.path.length > 21, `expected a detour longer than 21 moves, got ${result.path.length}`)
  } finally {
    rig.stopPassivePhysics()
  }
})

test('a soft step exclusion still reaches the goal (avoid, never forbid)', async () => {
  const softWall = boxExclusion(new Vec3(8, 64, -3), new Vec3(12, 66, 3), 40)
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
  const onGoal = boxExclusion(new Vec3(20, 64, 0), new Vec3(20, 64, 0))
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

// ---------------------------------------------------------------------------
// Post-processing: the optimizer must not straight-line a path through a hard
// zone the A* route went around. Driven with a synthetic path + an optimizer
// that always wants to merge everything, so the only thing that can stop the
// merge is the exclusion guard (no raycast/physics involved).
// ---------------------------------------------------------------------------

class DummyProvider {}

function makeMoveType (areas: ExclusionArea[]): any {
  const moveType: any = new DummyProvider()
  moveType.settings = { exclusionAreasStep: areas }
  return moveType
}

// Straight path (0,64,0) -> (4,64,0) -> (10,64,0). Merging it into one move
// sweeps x=0..10 at z=0, which crosses a hard wall at x in [5,7].
function makeStraightPath (moveType: any): Move[] {
  const start = Move.startMove(moveType, new Vec3(0, 64, 0), new Vec3(0, 0, 0), 5)
  const m1 = Move.fromPrevious(1, new Vec3(4, 64, 0), start, moveType)
  const m2 = Move.fromPrevious(1, new Vec3(10, 64, 0), m1, moveType)
  return [start, m1, m2]
}

const alwaysMergeOptimizer: any = {
  identEndOpt: (_currentIndex: number, path: Move[]) => path.length - 1,
  mergeMoves: (startIndex: number, endIndex: number, path: Move[]) => {
    const startMove = path[startIndex]
    const endMove = path[endIndex]
    return new Move(
      startMove.x, startMove.y, startMove.z,
      [], [],
      endMove.remainingBlocks, 99, startMove.moveType,
      startMove.entryPos, startMove.entryVel, endMove.exitPos, endMove.exitVel,
      startMove.parent
    )
  }
}

// getBlockInfo just needs to echo the position back; the zone functions only
// look at block.position.
const fakeWorld: any = { getBlockInfo: (pos: Vec3) => ({ position: pos }) }

function runOptimizer (path: Move[], moveType: any): Promise<Move[]> {
  const optMap: any = new Map([[DummyProvider, [{ optimizer: alwaysMergeOptimizer, priority: 100, order: 0 }]]])
  const optimizer = new Optimizer(null as any, fakeWorld, optMap)
  optimizer.loadPath(path)
  return optimizer.compute()
}

test('the optimizer refuses to straight-line a merge through a hard zone', async () => {
  const hardWall = boxExclusion(new Vec3(5, 64, -1), new Vec3(7, 66, 1))
  const moveType = makeMoveType([hardWall])

  const optimized = await runOptimizer(makeStraightPath(moveType), moveType)

  // Every candidate merge sweeps through the wall, so none may be applied:
  // the path stays unmerged (all 3 moves).
  assert.equal(optimized.length, 3, 'optimizer should not merge across a hard exclusion zone')
})

test('the optimizer still merges a straight path when no zone is in the way', async () => {
  const moveType = makeMoveType([])

  const optimized = await runOptimizer(makeStraightPath(moveType), moveType)

  // With no zones the always-merge optimizer collapses the whole run into one move.
  assert.equal(optimized.length, 1, 'optimizer should merge freely without exclusion zones')
})

test('the optimizer voxel-checks diagonal merges (single hard cell on the diagonal)', async () => {
  // A diagonal run (0,64,0) -> (6,64,6). One hard cell sits on the diagonal at
  // (3,64,3); the voxel traversal must catch it and refuse the straight-line merge.
  const hardCell = boxExclusion(new Vec3(3, 64, 3), new Vec3(3, 64, 3))
  const moveType = makeMoveType([hardCell])

  const start = Move.startMove(moveType, new Vec3(0, 64, 0), new Vec3(0, 0, 0), 5)
  const m1 = Move.fromPrevious(1, new Vec3(3, 64, 3), start, moveType)
  const m2 = Move.fromPrevious(1, new Vec3(6, 64, 6), m1, moveType)

  const optimized = await runOptimizer([start, m1, m2], moveType)
  assert.equal(optimized.length, 3, 'a diagonal merge across a hard cell must be refused')
})
