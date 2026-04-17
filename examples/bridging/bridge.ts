import { createBot } from 'mineflayer'
import { createPlugin, goals } from '../../src'
import { Vec3 } from 'vec3'
import { default as loader, EntityPhysics, EPhysicsCtx, EntityState } from '@nxg-org/mineflayer-physics-util'
import type { Entity } from 'prismarine-entity'
import type { Block } from 'prismarine-block'
import { createMouse } from 'mineflayer-mouse';
import { BridgeMode } from './bridge-movement'
import { applyBridgeSetup } from './bridge-movement'
import { RAD2DEG } from './bridge-movement/BridgeUtils'


const { GoalBlock } = goals

// ─── debug helpers ───────────────────────────────────────────────────────────

const DEBUG = true // flip to false to silence verbose logs

function dbg (...args: unknown[]): void {
  if (DEBUG) console.log('[bridge dbg]', ...args)
}

function dbgChat (msg: string): void {
  console.log('[bridge dbg]', msg)
  if (DEBUG) bot.chat(msg)
}

// ─── bot setup ───────────────────────────────────────────────────────────────

const bot = createBot({
  username: 'testing1',
  auth: 'offline',
  host: 'localhost',
  port: 63935
}) // Fixed: Added missing closing parenthesis here

function applyBridgeMode (mode: BridgeMode): number {
  return applyBridgeSetup(bot, dbg, { mode })
}

const pathfinder = createPlugin()

bot.loadPlugin(createMouse());

bot.on('error', (err) => console.error('[bridge] Bot error:', err))

bot.once('spawn', () => {
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(loader)

  bot.physics.yawSpeed = 6000;
  bot.physics.pitchSpeed = 6000;
  const physics = new EntityPhysics(bot.registry)

  // @ts-expect-error - modifying prototype for physics util compatibility
  EntityState.prototype.apply = function (b) {
    EntityState.prototype.applyToBot.call(this, b)
  };

  (bot.physics as any).autojumpCooldown = 0;

  (bot.physics as any).simulatePlayer = () => {
    (bot as any).jumpTicks = 0
    const ctx = EPhysicsCtx.FROM_BOT(physics, bot)
    ctx.state.jumpTicks = 0
    return physics.simulate(ctx, bot.world)
  }

  dbg('Spawned. Registering pathfinder event listeners.')

  // ── pathfinder lifecycle events ───────────────────────────────────────────
  bot.on('goalSet', (goal) => {
    dbg('goalSet:', JSON.stringify(goal))
  })

  bot.on('goalFinished', (goal) => {
    dbg('goalFinished:', JSON.stringify(goal))
  })

  bot.on('goalAborted', (goal) => {
    dbg('goalAborted (user cancelled):', JSON.stringify(goal))
  })

  bot.on('pathGenerated', (path) => {
    dbg(`pathGenerated: ${path.path.length} moves, status=${path.status}`)
  })

  bot.on('resetPath', (reason) => {
    dbg('resetPath — reason:', reason)
  })

  bot.on('enteredRecovery', (attempt) => {
    dbg(`enteredRecovery attempt #${attempt}`)
  })

  bot.on('exitedRecovery', (attempt) => {
    dbg(`exitedRecovery attempt #${attempt}`)
  })
})

bot.on("move", (pos) => {
  // console.log('moved to pos:', pos)
})

// ─── state ───────────────────────────────────────────────────────────────────

let lastStart: Vec3 | null = null

// ─── helpers ─────────────────────────────────────────────────────────────────

function elapsed (t0: number): string {
  const ms = performance.now() - t0
  return `${ms.toFixed(3)}ms | ${Math.ceil(ms / 50)} ticks | ${(ms / 1000).toFixed(3)}s`
}

function scaffoldInventorySummary (): string {
  const items = bot.inventory.items().filter(i => {
    const scaffoldNames = new Set(['dirt', 'cobblestone', 'stone', 'sand', 'gravel', 'netherrack'])
    return scaffoldNames.has(i.name)
  })
  if (items.length === 0) return 'NONE'
  return items.map(i => `${i.name}×${i.count}`).join(', ')
}


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

async function safeGoto (goal: goals.Goal, label: string): Promise<string> {
  const t0 = performance.now()
  dbg(`safeGoto START → ${label}  goal=${JSON.stringify(goal)}`)
  try {
    await bot.pathfinder.goto(goal)
    const time = elapsed(t0)
    dbg(`safeGoto DONE  → ${label}  ${time}`)
    return time
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? (err.stack ?? '') : ''
    console.error(`[bridge] safeGoto ERROR for "${label}":`, msg)
    if (stack) console.error(stack)
    bot.chat(`Error during "${label}": ${msg}`)
    throw err
  }
}

// ─── chat commands ───────────────────────────────────────────────────────────

bot.on('chat', (username, msg) => {
  void (async () => {
    try {
      await handleChat(username, msg)
    } catch (err: unknown) {
      const msg2 = err instanceof Error ? err.message : String(err)
      console.error('[bridge] Unhandled chat-command error:', msg2)
    }
  })()
})

bot.on('physicsTick', () => {
  // log every control


  // console.log(
  //   `yaw:${(bot.entity.yaw * RAD2DEG).toFixed(3)} ` +
  //   `pitch:${(bot.entity.pitch * RAD2DEG).toFixed(3)} ` +
  //   `sprint:${bot.getControlState('sprint')} ` +
  //   `left:${bot.getControlState('left')} ` + 
  //   `right:${bot.getControlState('right')} ` + 
  //   `position:${bot.entity.position}`
  // )
})

async function handleChat (username: string, msg: string): Promise<void> {
  if (username === bot.username) return
  const [cmd, ...args] = msg.split(' ')
  const author = bot.nearestEntity(e => e.username === username)

  switch (cmd) {
    case 'cancel':
    case 'stop': {
      dbg('Cancelling pathfinder.')
      await bot.pathfinder.cancel()
      bot.chat('Cancelled.')
      break
    }

    case 'lookat': {
      await bot.lookAt(new Vec3(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2])))
      break
    }

    case 'pos': {
      const { x, y, z } = bot.entity.position
      bot.chat(`${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)}`)
      console.log(`/tp ${bot.username} ${x} ${y} ${z}`)
      break
    }

    case 'goto':
    case '#goto': {
      const x = Math.floor(Number(args[0]))
      const y = Math.floor(Number(args[1]))
      const z = Math.floor(Number(args[2]))
      if (isNaN(x) || isNaN(y) || isNaN(z)) { bot.chat('goto <x> <y> <z>'); return }
      bot.chat(`Going to ${x} ${y} ${z}`)
      const time = await safeGoto(new GoalBlock(x, y, z), `goto ${x} ${y} ${z}`)
      bot.chat(time)
      break
    }

    case 'bridge': {
      const x = Math.floor(Number(args[0]))
      const y = Math.floor(Number(args[1]))
      const z = Math.floor(Number(args[2]))
      const mode = (args[3] as BridgeMode) ?? 'godbridge'

      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        bot.chat('bridge <x> <y> <z> [normal|godbridge|breezily]')
        return
      }

      if (!['normal', 'godbridge', 'breezily'].includes(mode)) {
        bot.chat(`Unknown bridge mode "${mode}". Use: normal | godbridge | breezily`)
        return
      }

      const inv = scaffoldInventorySummary()
      if (inv === 'NONE') {
        bot.chat('Warning: no scaffold blocks detected.')
      } else {
        bot.chat(`Scaffold blocks: ${inv}`)
      }

      applyBridgeMode(mode)
      bot.chat(`Bridging [${mode}] to ${x} ${y} ${z}`)

      try {
        const time = await safeGoto(new GoalBlock(x, y, z), `bridge[${mode}] ${x} ${y} ${z}`)
        bot.chat(time)
      } catch {
        // Handled in safeGoto
      }
      break
    }

    case 'bridgemode': {
      const mode = args[0] as BridgeMode
      if (!['normal', 'godbridge', 'breezily'].includes(mode)) {
        bot.chat('bridgemode <normal|godbridge|breezily>')
        return
      }
      const count = applyBridgeMode(mode)
      bot.chat(`Bridge mode: ${mode} (${count} executors set)`)
      break
    }

    case 'inventory':
    case 'inv': {
      const items = bot.inventory.items()
      if (items.length === 0) {
        bot.chat('Inventory is empty.')
      } else {
        bot.chat(`Inventory (${items.length} stacks): ${items.map(i => `${i.name}×${i.count}`).join(', ')}`)
      }
      break
    }

    case 'scaffold': {
      bot.chat(`Scaffold blocks: ${scaffoldInventorySummary()}`)
      break
    }

    case 'path': {
      lastStart = bot.entity.position.clone()
      const goal = new GoalBlock(Number(args[0]), Number(args[1]), Number(args[2]))
      const gen = bot.pathfinder.getPathTo(goal)
      let step
      let stepCount = 0
      while (!(step = await gen.next()).done) {
        stepCount++
        const res = step.value
        console.log(`[path step ${stepCount}] status=${res.result.status} moves=${res.result.path.length}`)
      }
      break
    }

    case 'pathtome': {
      if (!author) { bot.chat('Player not found.'); return }
      const t0 = performance.now()
      const gen = bot.pathfinder.getPathTo(GoalBlock.fromVec(author.position))
      let stepCount = 0
      while (!(await gen.next()).done) stepCount++
      bot.chat(elapsed(t0))
      break
    }

    case 'therepos': {
      if (!author) { bot.chat('Player not found.'); return }
      const block = rayTraceEntitySight(author)
      if (!block) { bot.chat('No block in sight.'); return }
      bot.chat(`${block.position.x} ${block.position.y} ${block.position.z}`)
      break
    }

    case 'placeblock': {
      const cursor = bot.blockAtCursor(5)
      if (!cursor) return
      const dirt = bot.registry.itemsByName.dirt
      if (!dirt) return
      await bot.equip(dirt.id, 'hand')
      await bot.placeBlock(cursor, new Vec3(parseInt(args[0]), parseInt(args[1]), parseInt(args[2])))
      break
    }

    case 'jump': {
      bot.setControlState('jump', true)
      bot.setControlState('jump', false)
      break
    }
  }
}

// ─── stick click → goto ───────────────────────────────────────────────────────

bot._client.on('animation', (data: { animation: number, entityId: number }) => {
  if (data.animation !== 0) return
  const entity = bot.entities[data.entityId]
  if (!entity || entity.type !== 'player') return
  if (!entity.heldItem || entity.heldItem.name !== 'stick') return
  const block = rayTraceEntitySight(entity)
  if (!block) return
  const goal = GoalBlock.fromVec(block.position.offset(0.5, 1, 0.5))
  void safeGoto(goal, 'stick-click').catch(() => {})
})

// ─── global error handlers ────────────────────────────────────────────────────

bot.on('kicked', (reason) => console.error('[bridge] Kicked:', reason))
bot.on('error', (err) => console.error('[bridge] Bot error:', err))
process.on('unhandledRejection', (reason) => console.error('[bridge] Unhandled rejection:', reason))