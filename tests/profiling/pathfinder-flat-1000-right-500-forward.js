const {
  Vec3,
  goals,
  runPathfinderScenario
} = require('./pathfinder-scenarios')

const start = new Vec3(0, 64, 0)
const goal = new goals.GoalBlock(1000, 64, 500)

runPathfinderScenario({
  title: 'Profiled flat diagonal pathfinder generation',
  profileName: 'pathfinder-flat-1000-right-500-forward',
  start,
  goal
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
