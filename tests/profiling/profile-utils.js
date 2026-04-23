require('ts-node/register')
require('debug').disable()

const fs = require('node:fs/promises')
const inspector = require('node:inspector')
const path = require('node:path')
const { Vec3 } = require('vec3')

const { createPlugin, goals } = require('../../src')
const { createCacheWorld } = require('../setup')

const outputDir = path.resolve(__dirname, 'profiles')

function normalizeChunkRange (range) {
  if (range == null) return null

  if (typeof range.radius === 'number') {
    const center = range.center ?? new Vec3(0, 0, 0)
    const centerChunkX = Math.floor(center.x / 16)
    const centerChunkZ = Math.floor(center.z / 16)

    return {
      minX: centerChunkX - range.radius,
      maxX: centerChunkX + range.radius,
      minZ: centerChunkZ - range.radius,
      maxZ: centerChunkZ + range.radius
    }
  }

  return {
    minX: range.minX,
    maxX: range.maxX,
    minZ: range.minZ,
    maxZ: range.maxZ
  }
}

async function pregenerateWorld (world, range) {
  const chunkRange = normalizeChunkRange(range)
  if (chunkRange == null) return

  const { minX, maxX, minZ, maxZ } = chunkRange
  const chunkCount = (maxX - minX + 1) * (maxZ - minZ + 1)

  console.log(`pregenerating world chunks: x=${minX}..${maxX}, z=${minZ}..${maxZ} (${chunkCount} columns)`)

  if (typeof world.preloadColumns === 'function') {
    await world.preloadColumns(chunkRange, false)
  } else {
    for (let chunkX = minX; chunkX <= maxX; chunkX++) {
      for (let chunkZ = minZ; chunkZ <= maxZ; chunkZ++) {
        world.setColumn(chunkX, chunkZ)
      }
    }
  }
}

function post (session, method, params) {
  return new Promise((resolve, reject) => {
    session.post(method, params ?? {}, (error, result) => {
      if (error != null) reject(error)
      else resolve(result)
    })
  })
}

async function clearGarbageCollection () {
  if (typeof global.gc !== 'function') {
    throw new Error('profiling requires explicit GC; run node with --expose-gc')
  }

  global.gc()
  await new Promise((resolve) => setImmediate(resolve))
}

async function createPathRig (options) {
  const trackRenderDistance = options.trackRenderDistance ?? options.pregenerateChunks == null
  const sharedWorld = options.sharedWorld
  const existingWorld = options.world ?? sharedWorld?.world
  const shouldSetupWorld = existingWorld == null || options.setupReusedWorld === true
  const { world, rig } = createCacheWorld(
    options.version ?? '1.20.4',
    options.floorY ?? 64,
    options.start,
    {
      renderDistance: options.renderDistance ?? 96,
      trackRenderDistance,
      world: existingWorld
    }
  )

  if (sharedWorld != null && sharedWorld.world == null) {
    sharedWorld.world = world
  }

  if (shouldSetupWorld) {
    await pregenerateWorld(world, options.pregenerateChunks)

    if (options.configureWorld != null) {
      options.configureWorld({ world, rig })
    }
  }

  if (options.inventoryItems != null) {
    rig.bot.inventory.items = () => options.inventoryItems(rig.mcData)
  }

  rig.bot.loadPlugin(createPlugin({
    pathfinderSettings: {
      partialPathProducer: true,
      partialPathLength: 50,
      ...options.pathfinderSettings
    },
    moveSettings: options.moveSettings
  }))

  return rig
}

function createPathRigSetup (options) {
  const sharedWorld = options.reuseWorld === true ? {} : undefined
  let initialRigPromise

  return async () => {
    const resolvedSharedWorld = options.sharedWorld ?? sharedWorld
    if (resolvedSharedWorld == null) return await createPathRig(options)

    if (resolvedSharedWorld.world == null) {
      const isInitializer = initialRigPromise == null

      if (initialRigPromise == null) {
        initialRigPromise = createPathRig({
          ...options,
          sharedWorld: resolvedSharedWorld
        }).catch((error) => {
          initialRigPromise = undefined
          throw error
        })
      }

      if (isInitializer) return await initialRigPromise
      await initialRigPromise
    }

    return await createPathRig({
      ...options,
      sharedWorld: resolvedSharedWorld
    })
  }
}

async function collectPathResult (bot, goal, timeoutMs = 30000) {
  let timer
  let final

  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out while planning to ${goal.constructor.name}`)), timeoutMs)
  })

  const run = (async () => {
    for await (const res of bot.pathfinder.getPathTo(goal)) {
      final = res.result
    }
  })()

  await Promise.race([run, timeout]).finally(() => clearTimeout(timer))

  if (final == null) {
    throw new Error('path planner finished without a final result')
  }

  return final
}

function normalizeCpuProfileTiming (profile, measuredDurationMicros) {
  if (!Array.isArray(profile.timeDeltas) || profile.timeDeltas.length === 0) return profile

  const sortedDeltas = profile.timeDeltas
    .slice(1)
    .filter((delta) => delta > 0)
    .sort((a, b) => a - b)

  const replacementFirstDelta = sortedDeltas.length > 0
    ? sortedDeltas[Math.floor(sortedDeltas.length / 2)]
    : 1000

  const skippedMicros = Math.max(0, profile.timeDeltas[0] - replacementFirstDelta)
  profile.startTime += skippedMicros
  profile.timeDeltas[0] = replacementFirstDelta

  if (Number.isFinite(measuredDurationMicros) && measuredDurationMicros > 0) {
    let totalMicros = 0
    let keepCount = profile.timeDeltas.length

    for (let i = 0; i < profile.timeDeltas.length; i++) {
      const nextTotal = totalMicros + profile.timeDeltas[i]

      if (nextTotal > measuredDurationMicros) {
        profile.timeDeltas[i] = Math.max(1, measuredDurationMicros - totalMicros)
        keepCount = i + 1
        break
      }

      totalMicros = nextTotal
    }

    profile.timeDeltas = profile.timeDeltas.slice(0, keepCount)
    if (Array.isArray(profile.samples)) {
      profile.samples = profile.samples.slice(0, keepCount)
    }
  }

  profile.endTime = profile.startTime + profile.timeDeltas.reduce((sum, delta) => sum + delta, 0)

  return profile
}

function remapCpuProfileNode (node, idOffset) {
  return {
    ...node,
    id: node.id + idOffset,
    children: (node.children ?? []).map((childId) => childId + idOffset)
  }
}

function mergeCpuProfiles (profiles) {
  if (profiles.length === 1) return profiles[0]

  const merged = {
    nodes: [{
      id: 1,
      callFrame: {
        functionName: '(root)',
        scriptId: '0',
        url: '',
        lineNumber: -1,
        columnNumber: -1
      },
      hitCount: 0,
      children: []
    }],
    startTime: profiles[0]?.startTime ?? 0,
    endTime: profiles[0]?.startTime ?? 0,
    samples: [],
    timeDeltas: []
  }
  let nextIdOffset = 1

  for (const profile of profiles) {
    const idOffset = nextIdOffset
    const root = profile.nodes.find((node) => node.id === 1)

    merged.nodes[0].children.push(1 + idOffset)
    merged.nodes.push(...profile.nodes.map((node) => remapCpuProfileNode(node, idOffset)))
    merged.timeDeltas.push(...(profile.timeDeltas ?? []))

    if (Array.isArray(profile.samples)) {
      merged.samples.push(...profile.samples.map((sampleId) => sampleId + idOffset))
    }

    if (root != null) {
      nextIdOffset += Math.max(...profile.nodes.map((node) => node.id))
    }
  }

  merged.endTime = merged.startTime + merged.timeDeltas.reduce((sum, delta) => sum + delta, 0)

  return merged
}

function isProfilerArtifactFrame (callFrame) {
  const url = callFrame?.url ?? ''
  return url === 'node:inspector'
}

function removeCpuProfileArtifacts (profile) {
  if (!Array.isArray(profile.samples) || !Array.isArray(profile.timeDeltas)) return profile

  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]))
  const parentById = new Map()

  for (const node of profile.nodes) {
    for (const childId of node.children ?? []) {
      parentById.set(childId, node.id)
    }
  }

  function sampleHasArtifact (sampleId) {
    const seen = new Set()
    let currentId = sampleId

    while (currentId != null && !seen.has(currentId)) {
      seen.add(currentId)
      const node = nodesById.get(currentId)
      if (node == null) break
      if (isProfilerArtifactFrame(node.callFrame)) return true
      currentId = parentById.get(currentId)
    }

    return false
  }

  const samples = []
  const timeDeltas = []

  for (let i = 0; i < profile.samples.length; i++) {
    if (sampleHasArtifact(profile.samples[i])) continue

    samples.push(profile.samples[i])
    timeDeltas.push(profile.timeDeltas[i])
  }

  profile.samples = samples
  profile.timeDeltas = timeDeltas
  profile.endTime = profile.startTime + timeDeltas.reduce((sum, delta) => sum + delta, 0)

  const keptNodeIds = new Set()

  for (const sampleId of profile.samples) {
    const seen = new Set()
    let currentId = sampleId

    while (currentId != null && !seen.has(currentId)) {
      seen.add(currentId)
      keptNodeIds.add(currentId)
      currentId = parentById.get(currentId)
    }
  }

  profile.nodes = profile.nodes
    .filter((node) => keptNodeIds.has(node.id))
    .map((node) => ({
      ...node,
      children: (node.children ?? []).filter((childId) => keptNodeIds.has(childId))
    }))

  return profile
}

function removeHeapProfileArtifacts (profile) {
  function pruneNode (node) {
    if (isProfilerArtifactFrame(node.callFrame)) return null

    node.children = (node.children ?? [])
      .map(pruneNode)
      .filter((child) => child != null)

    return node
  }

  if (profile.head != null) {
    pruneNode(profile.head)
  }

  return profile
}

async function runOnce (prepareRig, goal, timeoutMs) {
  const rig = await prepareRig()

  try {
    return await collectPathResult(rig.bot, goal, timeoutMs)
  } finally {
    rig.stopPassivePhysics()
  }
}

async function profilePathGeneration (options) {
  await fs.mkdir(outputDir, { recursive: true })
  const iterations = options.iterations ?? 100
  const freshRigPerIteration = options.freshRigPerIteration === true

  if (options.warmup != null && options.warmup !== false) {
    await runOnce(options.prepareRig, options.goal, options.timeoutMs)
    await clearGarbageCollection()
  }

  const rigs = freshRigPerIteration
    ? await Promise.all(Array.from({ length: iterations }, () => options.prepareRig()))
    : [await options.prepareRig()]
  const session = new inspector.Session()
  session.connect()

  let result
  let elapsedNs = 0n
  const cpuProfiles = []
  let heap

  try {
    await post(session, 'Profiler.enable')
    await post(session, 'HeapProfiler.enable')
    await post(session, 'HeapProfiler.startSampling', { samplingInterval: options.heapSamplingInterval ?? 32768 })

    for (let i = 0; i < iterations; i++) {
      const rig = freshRigPerIteration ? rigs[i] : rigs[0]

      await post(session, 'Profiler.start')
      const iterationStartedAt = process.hrtime.bigint()
      result = await collectPathResult(rig.bot, options.goal, options.timeoutMs)
      const iterationEndedAt = process.hrtime.bigint()
      const cpu = await post(session, 'Profiler.stop')

      const iterationElapsedNs = iterationEndedAt - iterationStartedAt
      const iterationElapsedMicros = Math.max(1, Math.round(Number(iterationElapsedNs) / 1000))

      elapsedNs += iterationElapsedNs
      cpuProfiles.push(normalizeCpuProfileTiming(removeCpuProfileArtifacts(cpu.profile), iterationElapsedMicros))

      if (i < iterations - 1) {
        await clearGarbageCollection()
      }
    }

    heap = await post(session, 'HeapProfiler.stopSampling')
  } finally {
    session.disconnect()
    for (const rig of rigs) {
      rig.stopPassivePhysics()
    }
  }

  const cpuPath = path.join(outputDir, `${options.name}.cpuprofile`)
  const heapPath = path.join(outputDir, `${options.name}.heapprofile`)
  const elapsedMs = Number(elapsedNs) / 1e6

  const cpuProfile = mergeCpuProfiles(cpuProfiles)
  const heapProfile = removeHeapProfileArtifacts(heap.profile)

  await fs.writeFile(cpuPath, JSON.stringify(cpuProfile))
  await fs.writeFile(heapPath, JSON.stringify(heapProfile))

  return {
    result,
    elapsedMs,
    iterations,
    cpuPath,
    heapPath
  }
}

function printProfileSummary (summary) {
  const last = summary.result.path[summary.result.path.length - 1]

  console.log(summary.title ?? 'Profiled pathfinder generation')
  console.log(`start: ${summary.start.x},${summary.start.y},${summary.start.z}`)
  console.log(`goal: ${summary.goal.x},${summary.goal.y},${summary.goal.z}`)
  console.log(`status: ${summary.result.status}`)
  console.log(`path length: ${summary.result.path.length}`)
  console.log(`last node: ${last?.x},${last?.y},${last?.z}`)
  console.log(`iterations: ${summary.iterations}`)
  console.log(`elapsed: ${summary.elapsedMs.toFixed(2)}ms`)
  console.log(`average: ${(summary.elapsedMs / summary.iterations).toFixed(2)}ms`)
  console.log(`cpu profile: ${summary.cpuPath}`)
  console.log(`heap profile: ${summary.heapPath}`)
}

module.exports = {
  Vec3,
  createPathRig,
  createPathRigSetup,
  goals,
  printProfileSummary,
  profilePathGeneration
}
