const {
  Vec3,
  goals,
  runPathfinderScenario
} = require('./pathfinder-scenarios')

const start = new Vec3(0, 64, 0)
const goal = new goals.GoalBlock(1000, 64, 0)

runPathfinderScenario({
  title: 'Profiled flat pathfinder generation',
  profileName: 'pathfinder-flat-1000-right',
  start,
  goal,
  pregenerateChunks: {
    minX: -1,
    maxX: 64,
    minZ: -1,
    maxZ: 1
  }
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
