'use strict'
const { createBot } = require('mineflayer')
const { createPlugin, goals } = require('../dist')
const { GoalBlock } = goals
const { Vec3 } = require('vec3')

const { default: loader, EntityPhysics, EPhysicsCtx, EntityState, ControlStateHandler } = require('@nxg-org/mineflayer-physics-util')

const bot = createBot({ username: 'testing' })
const pathfinder = createPlugin()

bot.on('inject_allowed', () => {

})

bot.once('spawn', () => {
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(loader)
  bot.physics.yawSpeed = 3000

  // apply hot-fix to mineflayer's physics engine.
  const val = new EntityPhysics(bot.registry)
  EntityState.prototype.apply = function (bot) {
    this.applyToBot(bot)
  }

  // bot.physics.simulatePlayer = (...args) => {
  //   const ctx = EPhysicsCtx.FROM_BOT(val, bot)
  //   // ctx.state.control.set('sneak', true)
  //   return val.simulate(ctx, bot.world)
  // }
})

/** @type { Vec3 | null } */
let lastStart = null

bot.on('chat', async (username, msg) => {
  const [cmd, ...args] = msg.split(' ')
  const author = bot.nearestEntity((e) => e.username === username)

  if (cmd === 'lookat') {
    bot.lookAt(new Vec3(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2])))
  }

  if (cmd == 'placeblock') {
    await bot.equip(bot.registry.itemsByName.dirt.id, 'hand')
    await bot.placeBlock(bot.blockAtCursor(5), new Vec3(parseInt(args[0]), parseInt(args[1]), parseInt(args[2])))
  }
  else if (cmd === 'pos') {
    bot.chat(`I am at ${bot.entity.position}`)
    console.log(`/tp ${bot.username} ${bot.entity.position.x} ${bot.entity.position.y} ${bot.entity.position.z}`)
  } else if (cmd === 'path') {
    lastStart = bot.entity.position.clone()
    const res = bot.pathfinder.getPathTo(new GoalBlock(Number(args[0]), Number(args[1]), Number(args[2])))
    let test
    while ((test = await res.next()).done === false) {
      console.log(test)
    }
  } else if (cmd === 'goto') {
    const x = Math.floor(Number(args[0])); const y = Math.floor(Number(args[1])); const z = Math.floor(Number(args[2]))
    if (isNaN(x) || isNaN(y) || isNaN(z)) return bot.chat('goto <x> <y> <z> failed | invalid args')
    bot.chat(`going to ${args[0]} ${args[1]} ${args[2]}`)

    const startTime = performance.now()
    await bot.pathfinder.goto(new GoalBlock(x, y, z))
    const endTime = performance.now()
    bot.chat(`took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${((endTime - startTime) / 1000).toFixed(3)} seconds`)
  } else if (cmd === 'pathtome') {
    if (!author) return bot.chat('failed to find player.')
    bot.chat('hi')
    const startTime = performance.now()
    const res1 = bot.pathfinder.getPathTo(GoalBlock.fromVec(author.position))
    let test1
    let test2 = []
    while ((test1 = await res1.next()).done === false) {
      test2.concat(test1.value.result.path)
    }
    const endTime = performance.now()
    bot.chat(`took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${((endTime - startTime) / 1000).toFixed(3)} seconds`)
    bot.chat(bot.pathfinder.world.getCacheSize())
    console.log(test2.length)
  } else if (cmd === 'test') {
    if (!author) return bot.chat('failed to find player.')
    lastStart = author.position.clone()
    bot.chat('hi')
    const startTime = performance.now()
    await bot.pathfinder.goto(GoalBlock.fromVec(author.position))
    const endTime = performance.now()
    bot.chat(`took ${(endTime - startTime).toFixed(3)} ms, ${Math.ceil((endTime - startTime) / 50)} ticks, ${((endTime - startTime) / 1000).toFixed(3)} seconds`)
  } else if (cmd === 'repath') {
    if (!lastStart) {
      bot.chat('no last start')
      return
    }
    const res = bot.pathfinder.getPathFromTo(lastStart, bot.entity.velocity, GoalBlock.fromVec(author.position))
    let test
    while ((test = await res.next()).done === false) {
      console.log(test)
    }
  } else if (cmd === 'cachesize') {
    bot.chat(bot.pathfinder.getCacheSize())
  } else if (cmd == 'togglecache' || cmd == 'cache') {
    bot.pathfinder.setCacheEnabled(!bot.pathfinder.isCacheEnabled())
    bot.chat(`pathfinder cache is now ${bot.pathfinder.isCacheEnabled() ? 'enabled' : 'disabled'}`)
  }
})


bot.on('kicked', console.log)