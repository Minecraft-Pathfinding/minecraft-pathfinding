const mineflayer = require('mineflayer')
const { Vec3 } = require('vec3')
const { AABB } = require('@nxg-org/mineflayer-util-plugin')
const { createPlugin } = require('../dist')
const { ParkourJumpHelper } = require('../dist/mineflayer-specific/movements/movementUtils')

function readNumber(name, fallback = undefined) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const value = Number(raw)
  if (Number.isNaN(value)) {
    throw new Error(`Invalid ${name}: ${raw}`)
  }
  return value
}

function readExitPos() {
  const x = readNumber('EXIT_X')
  const y = readNumber('EXIT_Y')
  const z = readNumber('EXIT_Z')
  if (x == null || y == null || z == null) {
    throw new Error('Set EXIT_X, EXIT_Y, and EXIT_Z to the block the parkour move exits onto.')
  }
  return new Vec3(x, y, z)
}

async function main() {
  const host = process.env.MC_HOST ?? 'localhost'
  const port = readNumber('MC_PORT', 25565)
  const username = process.env.MC_USERNAME ?? `parkour-debug-${Math.floor(Math.random() * 1000)}`
  const auth = process.env.MC_AUTH ?? 'offline'
  const exitPos = readExitPos()
  const goal = exitPos.offset(0, -1, 0)

  const bot = mineflayer.createBot({
    host,
    port,
    username,
    auth
  })

  bot.loadPlugin(createPlugin())

  bot.once('spawn', async () => {
    try {
      await bot.waitForTicks(10)

      const helper = new ParkourJumpHelper(bot, bot.pathfinder.world)
      const eyeTarget = helper.findGoalVertex(AABB.fromBlockPos(goal))
      const bbs = bot.pathfinder.world.getBlockInfo(goal).getBBs()
      const backupTarget = helper.findBackupVertex(
        bbs.length > 0 ? bbs : [AABB.fromBlockPos(exitPos)],
        goal
      )

      const direct = helper.simForwardMove(goal, eyeTarget)
      const edge = helper.simJumpFromEdge(bbs.length > 0 ? bbs : [AABB.fromBlockPos(exitPos)], goal, eyeTarget)
      const fallOffEdge = helper.simFallOffEdge(goal, eyeTarget)
      const backupJump = helper.simBackupJump(goal, eyeTarget, backupTarget)
      const computedBackup = helper.getBackupJumpTarget(goal, eyeTarget, backupTarget)

      console.log('--- Parkour probe ---')
      console.log('bot pos:', bot.entity.position.toString())
      console.log('bot vel:', bot.entity.velocity.toString())
      console.log('bot yaw:', bot.entity.yaw)
      console.log('exit pos:', exitPos.toString())
      console.log('goal block:', goal.toString())
      console.log('target eye vec:', eyeTarget.toString())
      console.log('backup target:', backupTarget.toString())
      console.log('direct jump:', direct)
      console.log('edge jump:', edge)
      console.log('fall off edge:', fallOffEdge)
      console.log('backup jump:', backupJump)
      console.log('validated backup target:', computedBackup == null ? 'null' : computedBackup.toString())
    } catch (err) {
      console.error('Probe failed:', err)
      process.exitCode = 1
    } finally {
      bot.quit()
    }
  })

  bot.on('error', (err) => {
    console.error('Bot error:', err)
    process.exitCode = 1
  })

  bot.on('kicked', (reason) => {
    console.error('Bot kicked:', reason)
    process.exitCode = 1
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
