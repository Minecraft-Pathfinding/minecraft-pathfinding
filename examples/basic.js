'use strict'
const { createBot } = require('mineflayer')
const { createPlugin, goals } = require('../dist')
const { GoalBlock } = goals
const { Vec3 } = require('vec3')

const { default: loader, EntityState } = require('@nxg-org/mineflayer-physics-util')

const bot = createBot({
  username: 'testing1',
  auth: 'offline',
  host: 'it-mil-1.halex.gg',
  port: 25046
  
  // host: "node2.endelon-hosting.de", port: 31997
  // host: 'Ic3TankD2HO.aternos.me',
  // port: 44656
  // host: "us1.node.minecraft.sneakyhub.com", port: 25607
})
const pathfinder = createPlugin()

bot.on('inject_allowed', () => {})

bot.once('spawn', () => {
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(loader)
  // bot.physics.yawSpeed = 3;
  // bot.physics.pitchSpeed = 3

  // apply hot-fix to mineflayer's physics engine.
  // const val = new EntityPhysics(bot.registry)
  EntityState.prototype.apply = function (bot) {
    this.applyToBot(bot)
  }

  // EntityPhysics.prototype.simulate = function (ctx, world) {
  //   bot.physics.simulatePlayer(ctx.state, world);
  // }

  bot.physics.autojumpCooldown = 0
  // (bot.physics).jumpTicks = 0;

  // bot.jumpTicks = 0;
  const oldSim = bot.physics.simulatePlayer
  bot.physics.simulatePlayer = (...args) => {
    // bot.jumpTicks = 0
    // const ctx = EPhysicsCtx.FROM_BOT(val, bot)
    // ctx.state.jumpTicks = 0; // allow immediate jumping
    // // ctx.state.control.set('sneak', true)
    // return val.simulate(ctx, bot.world)
    return oldSim(...args)
  }
})

/** @type { Vec3 | null } */
let lastStart = null

async function cmdHandler (username, msg) {
  if (username === bot.username) return

  const [cmd1, ...args] = msg.split(' ')
  const author = bot.nearestEntity((e) => e.username === username)

  const cmd = cmd1.toLowerCase().replace(prefix, '')

  switch (cmd) {
    case 'hi': {
      bot.whisper(username, 'hi')
      break
    }

    case 'set':
    case 'setting': {
      const stuff = Object.entries(bot.pathfinder.defaultSettings)
      const stuff1 = Object.entries(bot.physics)
      const keys = stuff.map(([key]) => key)
      const keys1 = stuff1.map(([key]) => key)
      const [key, value] = args

      if (key === 'list') {
        bot.whisper(username, 'Pathfinder settings: ' + keys.join(', '))
        bot.whisper(username, 'Physics settings: ' + keys1.join(', '))
        break
      }

      if (!keys.includes(key) && !keys1.includes(key)) return bot.whisper(username, `Invalid setting ${key}`)

      let setter = null

      if (value === 'true') {
        setter = true
      }

      if (value === 'false') {
        setter = false
      }

      if (!isNaN(Number(value))) {
        setter = Number(value)
      }

      if (keys.includes(key)) {
        if (value === undefined) {
          bot.whisper(username, `${key} is ${bot.pathfinder.defaultSettings[key]}`)
          break
        }
        const newSets = { ...bot.pathfinder.defaultSettings }

        bot.whisper(username, `${key} is now ${value}, was ${bot.pathfinder.defaultSettings[key]}`)
        newSets[key] = setter
        bot.pathfinder.setDefaultOptions(newSets)
      } else {
        if (value === undefined) {
          bot.whisper(username, `${key} is ${bot.physics[key]}`)
          break
        }
        bot.whisper(username, `${key} is now ${value}, was ${bot.physics[key]}`)
        bot.physics[key] = setter
      }
      break
    }

    case 'walkto': {
      if (args.length === 0) {
        if (!author) return bot.whisper(username, 'failed to find player')
        bot.lookAt(author.position)
      } else if (args.length === 3) {
        bot.lookAt(new Vec3(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2])))
      } else {
        bot.whisper(username, 'walkto <x> <y> <z> | walkto <player>')
      }
      bot.setControlState('forward', true)
      break
    }
    case 'cancel':
    case 'stop': {
      bot.whisper(username, 'Canceling path')
      bot.pathfinder.cancel()
      bot.clearControlStates()
      break
    }
    case 'lookat': {
      bot.lookAt(new Vec3(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2])))
      break
    }

    case 'pos': {
      bot.whisper(username, `I am at ${bot.entity.position}`)
      console.log(`/tp ${bot.username} ${bot.entity.position.x} ${bot.entity.position.y} ${bot.entity.position.z}`)
      break
    }

    case 'path': {
      lastStart = bot.entity.position.clone()
      const res = bot.pathfinder.getPathTo(new GoalBlock(Number(args[0]), Number(args[1]), Number(args[2])))
      let test
      while ((test = await res.next()).done === false) {
        console.log(test)
      }
      break
    }

    case 'goto':
    case '#goto': {
      const x = Math.floor(Number(args[0]))
      const y = Math.floor(Number(args[1]))
      const z = Math.floor(Number(args[2]))
      if (isNaN(x) || isNaN(y) || isNaN(z)) return bot.whisper(username, 'goto <x> <y> <z> failed | invalid args')
      bot.whisper(username, `going to ${args[0]} ${args[1]} ${args[2]}`)

      const startTime = performance.now()
      await bot.pathfinder.goto(new GoalBlock(x, y, z))
      const endTime = performance.now()
      bot.whisper(username,
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      )
      break
    }

    case 'pathtome': {
      if (!author) return bot.whisper(username, 'failed to find player.')
      bot.whisper(username, 'hi')
      const startTime = performance.now()
      const res1 = bot.pathfinder.getPathTo(GoalBlock.fromVec(author.position))
      let test1
      const test2 = []
      while ((test1 = await res1.next()).done === false) {
        test2.concat(test1.value.result.path)
      }
      const endTime = performance.now()
      bot.whisper(username,
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      )
      bot.whisper(username, bot.pathfinder.world.getCacheSize())
      console.log(test2.length)
      break
    }

    case 'pathtothere': {
      const startTime = performance.now()

      let rayBlock
      if (args.length === 3) {
        rayBlock = bot.blockAt(new Vec3(Number(args[0]), Number(args[1]), Number(args[2])))
      } else if (args.length === 0) {
        if (!author) return bot.whisper(username, 'failed to find player.')

        rayBlock = await rayTraceEntitySight({ entity: author })
      } else {
        bot.whisper(username, 'pathtothere <x> <y> <z> | pathtothere')
        return
      }

      if (!rayBlock) return bot.whisper(username, 'No block in sight')

      bot.whisper(username, `pathing to ${rayBlock.position.x} ${rayBlock.position.y} ${rayBlock.position.z}`)
      const res1 = bot.pathfinder.getPathTo(GoalBlock.fromVec(rayBlock.position.offset(0, 1, 0)))
      let test1
      const test2 = []
      while ((test1 = await res1.next()).done === false) {
        test2.concat(test1.value.result.path)
      }
      const endTime = performance.now()
      bot.whisper(username,
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      )
      bot.whisper(username, bot.pathfinder.world.getCacheSize())
      console.log(test2.length)
      break
    }

    case 'cachesize': {
      bot.whisper(username, bot.pathfinder.getCacheSize())
      break
    }

    case 'togglecache':
    case 'cache': {
      bot.pathfinder.setCacheEnabled(!bot.pathfinder.isCacheEnabled())
      bot.whisper(username, `pathfinder cache is now ${bot.pathfinder.isCacheEnabled() ? 'enabled' : 'disabled'}`)
      break
    }

    case 'therepos': {
      if (!author) return bot.whisper(username, 'failed to find player')
      const rayBlock = rayTraceEntitySight({ entity: author })
      if (!rayBlock) return bot.whisper(username, 'No block in sight')
      else return bot.whisper(username, `Block in sight: ${rayBlock.position.x} ${rayBlock.position.y} ${rayBlock.position.z}`)
    }
    case 'there': {
      if (!author) return bot.whisper(username, 'failed to find player')
      const rayBlock = rayTraceEntitySight({ entity: author })
      if (!rayBlock) return bot.whisper(username, 'No block in sight')
      lastStart = rayBlock.position.clone().offset(0.5, 1, 0.5)
      const startTime = performance.now()
      await bot.pathfinder.goto(GoalBlock.fromVec(lastStart))
      const endTime = performance.now()
      bot.whisper(username,
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      )
      break
    }

    case 'test': {
      if (!author) return bot.whisper(username, 'failed to find player.')
      lastStart = author.position.clone()
      bot.whisper(username, 'hi')
      const startTime = performance.now()
      await bot.pathfinder.goto(GoalBlock.fromVec(author.position))
      const endTime = performance.now()
      bot.whisper(username,
        `took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${(
          (endTime - startTime) /
          1000
        ).toFixed(3)} seconds`
      )
      break
    }

    case 'placeblock': {
      await bot.equip(bot.registry.itemsByName.dirt.id, 'hand')
      await bot.placeBlock(bot.blockAtCursor(5), new Vec3(parseInt(args[0]), parseInt(args[1]), parseInt(args[2])))
      break
    }

    case 'jump': {
      bot.physics.jump()
      break
    }
  }
}
const prefix = '!'
bot.on('chat', async (username, msg) => {
  await cmdHandler(username, msg)
})

bot.on('messagestr', async (msg, pos, jsonMsg) => {
  const username = bot.nearestEntity(e => e.type === 'player' && e !== bot.entity)?.username ?? 'unknown'
  await cmdHandler(username, msg)
})

bot._client.on('animation', (data) => {
  if (data.animation !== 0) return
  const entity = bot.entities[data.entityId]
  if (!entity || entity.type !== 'player') return
  if (!entity.heldItem || entity.heldItem.name !== 'stick') return
  const block = rayTraceEntitySight({ entity })
  if (!block) return
  bot.pathfinder.goto(GoalBlock.fromVec(block.position.offset(0.5, 1, 0.5)))
})

/**
 * @param { { entity: import('mineflayer').Entity } } options
 */
function rayTraceEntitySight (options) {
  if (bot.world?.raycast) {
    const { height, position, yaw, pitch } = options.entity
    const x = -Math.sin(yaw) * Math.cos(pitch)
    const y = Math.sin(pitch)
    const z = -Math.cos(yaw) * Math.cos(pitch)
    const rayBlock = bot.world.raycast(position.offset(0, height, 0), new Vec3(x, y, z), Infinity)
    if (rayBlock) {
      return rayBlock
    }
  }
  return null
}

bot.on('kicked', console.log)
