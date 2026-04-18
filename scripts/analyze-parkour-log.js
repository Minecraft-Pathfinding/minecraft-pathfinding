#!/usr/bin/env node

const fs = require('fs')

function readInput () {
  const file = process.argv[2]
  if (file != null) {
    return fs.readFileSync(file, 'utf8')
  }

  return fs.readFileSync(0, 'utf8')
}

function parseVec3 (text) {
  const match = text.match(/Vec3\s*\{\s*x:\s*([-\d.eE]+),\s*y:\s*([-\d.eE]+),\s*z:\s*([-\d.eE]+)\s*\}/)
  if (match == null) return null

  return {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3])
  }
}

function delta (a, b) {
  return {
    x: b.x - a.x,
    y: b.y - a.y,
    z: b.z - a.z
  }
}

function norm (v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}

function fmt (v) {
  return `(${v.x.toFixed(6)}, ${v.y.toFixed(6)}, ${v.z.toFixed(6)})`
}

const input = readInput()

const blocks = []
const blockRegex = /current bot info:[\s\S]*?(?=\n\s*minecraft-pathfinding:movementExecutors:Parkour (?:current bot info:|yaw info:)|\n\s*minecraft-pathfinding:main|\s*$)/g

for (const blockMatch of input.matchAll(blockRegex)) {
  const block = blockMatch[0]
  const yawMatch = block.match(/current bot info:\s*([-\d.eE]+)/)
  const vecMatches = [...block.matchAll(/Vec3\s*\{\s*x:\s*([-\d.eE]+),\s*y:\s*([-\d.eE]+),\s*z:\s*([-\d.eE]+)\s*\}/g)]
  if (yawMatch == null || vecMatches.length < 2) continue

  const pos = {
    x: Number(vecMatches[0][1]),
    y: Number(vecMatches[0][2]),
    z: Number(vecMatches[0][3])
  }
  const vel = {
    x: Number(vecMatches[1][1]),
    y: Number(vecMatches[1][2]),
    z: Number(vecMatches[1][3])
  }

  const yaw = Number(yawMatch[1])
  blocks.push({ yaw, pos, vel })
}

if (blocks.length === 0) {
  console.error('No parkour "current bot info" blocks found.')
  process.exit(1)
}

console.log(`samples: ${blocks.length}`)
for (let i = 0; i < blocks.length; i++) {
  const cur = blocks[i]
  const prev = blocks[i - 1]
  console.log(`\n#${i + 1}`)
  console.log(`yaw: ${cur.yaw.toFixed(12)}`)
  console.log(`pos: ${fmt(cur.pos)}`)
  console.log(`vel: ${fmt(cur.vel)}`)
  if (prev != null) {
    const dp = delta(prev.pos, cur.pos)
    const dv = delta(prev.vel, cur.vel)
    console.log(`Δpos: ${fmt(dp)} |len|=${norm(dp).toFixed(6)}`)
    console.log(`Δvel: ${fmt(dv)} |len|=${norm(dv).toFixed(6)}`)
  }
}

