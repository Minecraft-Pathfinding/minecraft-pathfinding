const {
  Vec3,
  createPathRig,
  goals,
  printProfileSummary,
  profilePathGeneration
} = require('./profile-utils')

const start = new Vec3(0, 64, 0)
const goal = new goals.GoalBlock(1000, 264, 500)
const profileName = 'pathfinder-place-1000-right-500-forward-200-up-wall'
const wallZ = 300
const wallBaseY = 64
const wallHeight = 50

function prepareRig() {
  return createPathRig({
    start,
    configureWorld: ({ world }) => {
      const getBlock = world.getBlock.bind(world)

      world.getBlock = (pos) => {
        const blockPos = pos.floored()

        if (
          blockPos.z === wallZ &&
          blockPos.y >= wallBaseY &&
          blockPos.y < wallBaseY + wallHeight
        ) {
          return world.createBlock(blockPos, 'stone')
        }

        return getBlock(pos)
      }
    },
    inventoryItems: (mcData) => [{
      type: mcData.itemsByName.dirt.id,
      count: 10000,
      name: 'dirt'
    }]
  })
}

async function main() {
  const profile = await profilePathGeneration({
    name: profileName,
    goal,
    prepareRig,
    iterations: 1,
    freshRigPerIteration: true,
    timeoutMs: 60000
  })

  printProfileSummary({
    title: 'Profiled elevated placement pathfinder generation with wall',
    start,
    goal,
    ...profile
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
