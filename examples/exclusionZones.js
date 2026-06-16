'use strict'

// ---------------------------------------------------------------------------
// Exclusion zones example
//
// An "exclusion area" is just a function (block) => number that returns the
// extra cost of using a block: 0 = fine, a positive number = soft avoid,
// Infinity = hard "keep out". The library ships no ready-made shapes on
// purpose, so the small box/radius builders below are yours to copy and adapt.
//
// They go into three movement settings:
//   exclusionAreasStep  -> blocks the bot may stand in / walk into
//   exclusionAreasBreak -> blocks the bot may break (mine)
//   exclusionAreasPlace -> blocks the bot may place (build on)
//
// Run a local server, then: node examples/exclusionZones.js
// In chat: "goto <x> <y> <z>", "zones on", "zones off".
// ---------------------------------------------------------------------------

const { createBot } = require('mineflayer')
const { Vec3 } = require('vec3')
const { createPlugin, goals } = require('../dist')

const { GoalBlock } = goals

// --- copy these helpers into your own project ------------------------------

// A box between two opposite corners (inclusive, any order).
function boxExclusion (corner1, corner2, cost = Infinity) {
  const minX = Math.min(corner1.x, corner2.x)
  const minY = Math.min(corner1.y, corner2.y)
  const minZ = Math.min(corner1.z, corner2.z)
  const maxX = Math.max(corner1.x, corner2.x)
  const maxY = Math.max(corner1.y, corner2.y)
  const maxZ = Math.max(corner1.z, corner2.z)
  return (block) => {
    const p = block.position
    const inside =
      p.x >= minX && p.x <= maxX &&
      p.y >= minY && p.y <= maxY &&
      p.z >= minZ && p.z <= maxZ
    return inside ? cost : 0
  }
}

// A ball (sphere) of the given radius around a center point.
function radiusExclusion (center, radius, cost = Infinity) {
  const r2 = radius * radius
  return (block) => {
    const dx = block.position.x - center.x
    const dy = block.position.y - center.y
    const dz = block.position.z - center.z
    return dx * dx + dy * dy + dz * dz <= r2 ? cost : 0
  }
}

// ---------------------------------------------------------------------------

const bot = createBot({
  username: 'exclusion-demo',
  auth: 'offline',
  host: 'localhost',
  port: 25565
})

bot.loadPlugin(createPlugin())

// Example zones (tweak the coordinates to match your world):
const noGoBox = boxExclusion(new Vec3(-8, 60, -8), new Vec3(8, 80, 8)) // hard
const softBall = radiusExclusion(new Vec3(30, 64, 30), 6, 50) // soft

function enableZones () {
  bot.pathfinder.setMoveOptions({
    exclusionAreasStep: [noGoBox, softBall]
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
