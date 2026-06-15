'use strict'

// ---------------------------------------------------------------------------
// Exclusion zones example
//
// This shows how to tell the bot "keep out of here" using the three exclusion
// lists in the movement settings. Run a local server, then:
//
//   node examples/exclusionZones.js
//
// In game, type these in chat:
//   goto <x> <y> <z>   -> walk there, but respecting the zones below
//   zones on           -> turn the example zones on
//   zones off          -> turn them all off again
// ---------------------------------------------------------------------------

const { createBot } = require('mineflayer')
const { Vec3 } = require('vec3')
const {
  createPlugin,
  goals,
  createBoxExclusion,
  createRadiusExclusion,
  createColumnRadiusExclusion
} = require('../dist')

const { GoalBlock } = goals

const bot = createBot({
  username: 'exclusion-demo',
  auth: 'offline',
  host: 'localhost',
  port: 25565
})

bot.loadPlugin(createPlugin())

// A few example zones. Tweak the coordinates to match your world.
//
//  - A HARD box the bot must never set foot in.
//  - A SOFT ball the bot prefers to stay out of, but may cross if it must.
//  - A pillar where the bot is never allowed to mine.
const noGoBox = createBoxExclusion(new Vec3(-8, 60, -8), new Vec3(8, 80, 8))
const softBall = createRadiusExclusion(new Vec3(30, 64, 30), 6, 50)
const noMinePillar = createColumnRadiusExclusion(new Vec3(0, 0, 0), 4)

function enableZones () {
  bot.pathfinder.setMoveOptions({
    exclusionAreasStep: [noGoBox, softBall],
    exclusionAreasBreak: [noMinePillar]
  })
  bot.chat('Exclusion zones: ON')
}

function disableZones () {
  bot.pathfinder.setMoveOptions({
    exclusionAreasStep: [],
    exclusionAreasBreak: [],
    exclusionAreasPlace: []
  })
  bot.chat('Exclusion zones: OFF')
}

bot.once('spawn', () => {
  enableZones()
  bot.chat('Ready. Try: "goto <x> <y> <z>", "zones on", "zones off".')
})

bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  const [cmd, ...args] = message.trim().split(/\s+/)

  if (cmd === 'zones') {
    if (args[0] === 'off') disableZones()
    else enableZones()
    return
  }

  if (cmd === 'goto') {
    const [x, y, z] = args.map(Number)
    if ([x, y, z].some(Number.isNaN)) {
      bot.chat('Usage: goto <x> <y> <z>')
      return
    }

    bot.chat(`Heading to ${x} ${y} ${z}, avoiding the zones...`)
    try {
      await bot.pathfinder.goto(new GoalBlock(x, y, z))
      bot.chat('Arrived!')
    } catch (err) {
      bot.chat(`Could not get there: ${err.message}`)
    }
  }
})

bot.on('kicked', console.log)
bot.on('error', console.log)
