import { ControlState, createBot } from 'mineflayer'
import { createMouse } from 'mineflayer-mouse'
import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'
import { default as loader, EPhysicsCtx, EntityPhysics, EntityState } from '@nxg-org/mineflayer-physics-util'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../../src'
import { applyLadderSetup } from './ladder-movement'

const { GoalBlock } = goals

const bot = createBot({
  username: 'testing1',
  auth: 'microsoft',
  host: 'thedevsplayground.cosmos-ink.net',
  port: 25565,
  version: "1.21.4"
})

const pathfinder = createPlugin()
bot.loadPlugin(createMouse())

bot.once('spawn', () => {
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(loader)
  applyLadderSetup(bot)

  bot.physics.yawSpeed = 6000
  bot.physics.pitchSpeed = 6000

  bot.pathfinder.setMoveOptions({
    canDig: false,
    canPlace: false
  })

  const physics = new EntityPhysics(bot.registry)

  // Keep the physics util shim aligned with mineflayer's bot object.
  // @ts-expect-error - prototype patch is intentional here
  EntityState.prototype.apply = function (b) {
    EntityState.prototype.applyToBot.call(this, b)
  }

  ;(bot.physics as any).autojumpCooldown = 0
  ;(bot.physics as any).simulatePlayer = () => {
    ;(bot as any).jumpTicks = 0
    const ctx = EPhysicsCtx.FROM_BOT(physics, bot)
    ctx.state.jumpTicks = 0
    return physics.simulate(ctx, bot.world)
  }
})

function rayTraceEntitySight (entity: Entity): Block | null {
  if (!bot.world?.raycast) return null
  const { height, position, yaw, pitch } = entity
  const dir = new Vec3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  )
  return bot.world.raycast(position.offset(0, height, 0), dir, 120) as Block | null
}

async function safeGoto (goal: goals.Goal): Promise<void> {
  await bot.pathfinder.goto(goal)
}

bot.on('chat', (username, msg) => {
  void (async () => {
    if (username === bot.username) return

    const [cmd, ...args] = msg.split(' ')

    switch (cmd) {
      case "tickrate": {
        const rate = Number(args[0])
        if (Number.isNaN(rate)) {
          bot.chat(`Invalid rate: ${args[0]}`)
          return
        }
        const old = bot.physics.physicsIntervalMs
        bot.physics.physicsIntervalMs = rate;
        bot.chat(`Tick rate set to ${args[0]}, was ${old}.`)
        break
      }
      case 'goto': {
        const x = Math.floor(Number(args[0]))
        const y = Math.floor(Number(args[1]))
        const z = Math.floor(Number(args[2]))
        if (isNaN(x) || isNaN(y) || isNaN(z)) {
          bot.chat('goto <x> <y> <z>')
          return
        }

        bot.chat(`Going to ${x} ${y} ${z}`)
        await safeGoto(new GoalBlock(x, y, z))
        break
      }

      case 'control': {
        const test = args[0] as ControlState;
        bot.setControlState(test, !bot.getControlState(test))
        break
      }

      case 'come': {
        const target = bot.nearestEntity(e => e.username === username)
        if (!target) {
          bot.chat('cant see you')
          return
        }

        const { x, y, z } = target.position
        bot.chat(`Going to ${x} ${y} ${z}`)
        await safeGoto(new GoalBlock(x, y, z))
        break
      }

      case 'cancel':
      case 'stop': {
        await bot.pathfinder.cancel()
        bot.chat('Cancelled.')
        break
      }
    }
  })().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[neo] chat command failed:', msg)
  })
})

bot._client.on('animation', (data: { animation: number, entityId: number }) => {
  if (data.animation !== 0) return

  const entity = bot.entities[data.entityId]
  if (!entity || entity.type !== 'player') return
  if (!entity.heldItem || entity.heldItem.name !== 'stick') return

  const block = rayTraceEntitySight(entity)
  if (!block) return

  const goal = GoalBlock.fromVec(block.position.offset(0.5, 1, 0.5))
  void safeGoto(goal).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[neo] stick click failed:', msg)
  })
})

bot.on('kicked', (reason) => {
  if (typeof reason !== 'string') {
    console.error('[neo] Kicked:', JSON.stringify(reason))
  } else {
    console.error('[neo] Kicked:', reason)
  }
})
bot.on('error', (err) => console.error('[neo] Bot error:', err))
process.on('unhandledRejection', (reason) => console.error('[neo] Unhandled rejection:', reason))
