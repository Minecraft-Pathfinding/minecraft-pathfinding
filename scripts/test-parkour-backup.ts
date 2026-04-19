#!/usr/bin/env node

import * as mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import { AABB } from '@nxg-org/mineflayer-util-plugin'
import { createPlugin } from '../src/index'
import { getUnderlyingBBs, ParkourJumpHelper } from '../src/mineflayer-specific/movements/movementUtils'

function readNumber(name: string, fallback?: number): number | undefined {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const value = Number(raw)
  if (Number.isNaN(value)) {
    throw new Error(`Invalid ${name}: ${raw}`)
  }
  return value
}

function readVec3(prefix: string): Vec3 {
  const x = readNumber(`${prefix}_X`)
  const y = readNumber(`${prefix}_Y`)
  const z = readNumber(`${prefix}_Z`)
  if (x == null || y == null || z == null) {
    throw new Error(`Set ${prefix}_X, ${prefix}_Y, and ${prefix}_Z.`)
  }
  return new Vec3(x, y, z)
}

function readAuth(): 'offline' | 'mojang' | 'microsoft' {
  const raw = process.env.MC_AUTH ?? 'offline'
  if (raw === 'offline' || raw === 'mojang' || raw === 'microsoft') return raw
  throw new Error(`Invalid MC_AUTH: ${raw}`)
}

async function main(): Promise<void> {
  const host = process.env.MC_HOST ?? 'localhost'
  const port = readNumber('MC_PORT', 25565) ?? 25565
  const username = process.env.MC_USERNAME ?? `parkour-${1}`
  const auth = readAuth()

  const startPos = readVec3('START')
  const exitPos = readVec3('EXIT')
  const goal = exitPos.offset(0, -1, 0)

  const bot = mineflayer.createBot({
    host,
    port,
    username,
    auth
  })


  bot.once('spawn', async () => {
    bot.loadPlugin(createPlugin())

    try {
      await bot.waitForTicks(100)

      console.log('expected start pos:', startPos.toString())
      console.log('actual start pos:', bot.entity.position.toString())
      if (bot.entity.position.distanceTo(startPos) > 0.25) {
        console.warn('WARNING: the bot is not at the requested start position.')
      }

      const helper = new ParkourJumpHelper(bot, bot.pathfinder.world)
      const eyeTarget = helper.findGoalVertex(AABB.fromBlockPos(goal))
      const bbs = getUnderlyingBBs(bot.pathfinder.world, startPos, 0.6)
      const fallbackBbs = bbs.length > 0 ? bbs : [AABB.fromBlockPos(startPos)]
      const backupTarget = helper.findBackupVertex(fallbackBbs, eyeTarget, startPos)

      const direct = helper.simForwardMove(goal, eyeTarget)
      const edge = helper.simJumpFromEdge(fallbackBbs, goal, eyeTarget)
      const fallOffEdge = helper.simFallOffEdge(goal, eyeTarget)
      const backupJump = helper.simBackupJump(goal, eyeTarget, backupTarget)
      const computedBackup = helper.getBackupJumpTarget(goal, eyeTarget, backupTarget)

      console.log('--- Parkour probe ---')
      console.log('bot pos:', bot.entity.position.toString())
      console.log('bot vel:', bot.entity.velocity.toString())
      console.log('bot yaw:', bot.entity.yaw)
      console.log('start pos env:', startPos.toString())
      console.log('exit pos env:', exitPos.toString())
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
