const {
  Vec3,
  createDefaultPrepareRig,
  createWallConfigurer,
  goals,
  runPathfinderScenario
} = require('./pathfinder-scenarios')

const start = new Vec3(0, 64, 0)
const goal = new goals.GoalBlock(1000, 84, 500)
const wallZ = 300
const wallBaseY = 64
const wallHeight = 20

const prepareRig = createDefaultPrepareRig({
  start,
  configureWorld: createWallConfigurer({
    z: wallZ,
    baseY: wallBaseY,
    height: wallHeight
  })
})

runPathfinderScenario({
  title: 'Profiled shallow elevated placement pathfinder generation with wall',
  profileName: 'pathfinder-place-1000-right-500-forward-20-up-wall',
  start,
  goal,
  prepareRig
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
