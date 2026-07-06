const {
  Vec3,
  createDefaultPrepareRig,
  goals,
  runPathfinderScenario
} = require('./pathfinder-scenarios')

const start = new Vec3(0, 64, 0)

function createSpanWallConfigurer ({ x, minZ, maxZ, baseY, height, blockName }) {
  return ({ world }) => {
    const getBlock = world.getBlock.bind(world)

    world.getBlock = (pos) => {
      const blockPos = pos.floored()

      if (
        blockPos.x === x &&
        blockPos.z >= minZ &&
        blockPos.z <= maxZ &&
        blockPos.y >= baseY &&
        blockPos.y < baseY + height
      ) {
        return world.createBlock(blockPos, blockName)
      }

      return getBlock(pos)
    }
  }
}

function toolAndScaffoldInventory (mcData) {
  return [
    {
      type: mcData.itemsByName.diamond_shovel.id,
      count: 1,
      name: 'diamond_shovel'
    },
    {
      type: mcData.itemsByName.dirt.id,
      count: 10000,
      name: 'dirt'
    }
  ]
}

async function main () {
  await runPathfinderScenario({
    title: 'Profiled digging pathfinder generation with tool inventory',
    profileName: 'pathfinder-dig-64-forward-dirt-wall-tool',
    start,
    goal: new goals.GoalBlock(64, 64, 0),
    prepareRig: createDefaultPrepareRig({
      start,
      pregenerateChunks: {
        minX: -1,
        maxX: 8,
        minZ: -8,
        maxZ: 8
      },
      configureWorld: createSpanWallConfigurer({
        x: 24,
        minZ: -96,
        maxZ: 96,
        baseY: 64,
        height: 2,
        blockName: 'dirt'
      }),
      inventoryItems: toolAndScaffoldInventory,
      moveSettings: {
        canPlace: false
      }
    }),
    iterations: 10,
    freshRigPerIteration: false
  })

  await runPathfinderScenario({
    title: 'Profiled placement pathfinder generation with scaffold inventory',
    profileName: 'pathfinder-place-64-forward-12-up',
    start,
    goal: new goals.GoalBlock(64, 76, 0),
    prepareRig: createDefaultPrepareRig({
      start,
      pregenerateChunks: {
        minX: -1,
        maxX: 8,
        minZ: -2,
        maxZ: 2
      },
      inventoryItems: toolAndScaffoldInventory
    }),
    iterations: 10,
    freshRigPerIteration: false
  })

  await runPathfinderScenario({
    title: 'Profiled combined digging and placement pathfinder generation',
    profileName: 'pathfinder-dig-place-64-forward-12-up-dirt-wall',
    start,
    goal: new goals.GoalBlock(64, 76, 0),
    prepareRig: createDefaultPrepareRig({
      start,
      pregenerateChunks: {
        minX: -1,
        maxX: 8,
        minZ: -8,
        maxZ: 8
      },
      configureWorld: createSpanWallConfigurer({
        x: 24,
        minZ: -96,
        maxZ: 96,
        baseY: 64,
        height: 2,
        blockName: 'dirt'
      }),
      inventoryItems: toolAndScaffoldInventory
    }),
    iterations: 10,
    freshRigPerIteration: false
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
