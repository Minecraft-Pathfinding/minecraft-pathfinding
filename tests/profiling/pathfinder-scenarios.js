const {
  Vec3,
  createPathRigSetup,
  goals,
  printProfileSummary,
  profilePathGeneration
} = require('./profile-utils')

const defaultStart = new Vec3(0, 64, 0)
const defaultPregenerateChunks = {
  minX: -1,
  maxX: 64,
  minZ: -1,
  maxZ: 32
}

function createWallConfigurer ({ z, baseY, height }) {
  return ({ world }) => {
    const getBlock = world.getBlock.bind(world)

    world.getBlock = (pos) => {
      const blockPos = pos.floored()

      if (
        blockPos.z === z &&
        blockPos.y >= baseY &&
        blockPos.y < baseY + height
      ) {
        return world.createBlock(blockPos, 'stone')
      }

      return getBlock(pos)
    }
  }
}

function createDefaultPrepareRig (options) {
  return createPathRigSetup({
    start: options.start ?? defaultStart,
    reuseWorld: options.reuseWorld ?? true,
    pregenerateChunks: options.pregenerateChunks ?? defaultPregenerateChunks,
    configureWorld: options.configureWorld,
    inventoryItems: (mcData) => [{
      type: mcData.itemsByName.dirt.id,
      count: 10000,
      name: 'dirt'
    }],
    pathfinderSettings: {
      partialPathProducer: false,
      ...options.pathfinderSettings
    },
    moveSettings: options.moveSettings
  })
}

async function runPathfinderScenario (scenario) {
  const start = scenario.start ?? defaultStart
  const goal = scenario.goal
  const prepareRig = scenario.prepareRig ?? createDefaultPrepareRig(scenario)

  const profile = await profilePathGeneration({
    name: scenario.profileName,
    goal,
    prepareRig,
    iterations: scenario.iterations ?? 10,
    freshRigPerIteration: scenario.freshRigPerIteration ?? true,
    timeoutMs: scenario.timeoutMs ?? 60000,
    warmup: scenario.warmup
  })

  printProfileSummary({
    title: scenario.title,
    start,
    goal,
    ...profile
  })
}

module.exports = {
  Vec3,
  createDefaultPrepareRig,
  createWallConfigurer,
  goals,
  runPathfinderScenario
}
