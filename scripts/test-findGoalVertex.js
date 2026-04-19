#!/usr/bin/env node

const { Vec3 } = require('vec3')

function findGoalVertex(goal, pos) {
  const closerX = goal.minX - pos.x < pos.x - goal.maxX ? goal.maxX : goal.minX
  const closerZ = goal.minZ - pos.z < pos.z - goal.maxZ ? goal.maxZ : goal.minZ

  const verts = [
    new Vec3(closerX, goal.maxY, closerZ),
    new Vec3(closerX, goal.maxY, goal.minZ),
    new Vec3(closerX, goal.maxY, goal.maxZ),
    new Vec3(goal.minX, goal.maxY, closerZ),
    new Vec3(goal.maxX, goal.maxY, closerZ)
  ]

  if (goal.minX - pos.x < 1 && pos.x - goal.maxX < 1) {
    verts.push(new Vec3(goal.maxX - pos.x + goal.minX, goal.maxY, goal.minZ))
    verts.push(new Vec3(goal.maxX - pos.x + goal.minX, goal.maxY, goal.maxZ))
  }

  if (goal.minZ - pos.z < 1 && pos.z - goal.maxZ < 1) {
    verts.push(new Vec3(goal.minX, goal.maxY, goal.maxZ - pos.z + goal.minZ))
    verts.push(new Vec3(goal.maxX, goal.maxY, goal.maxZ - pos.z + goal.minZ))
  }

  let minDist = Infinity
  let minVert = verts[0]

  for (const vert of verts) {
    const dist = vert.distanceTo(pos)
    console.log(`candidate ${vert.toString()} dist=${dist.toFixed(6)}`)
    if (dist < minDist) {
      minDist = dist
      minVert = vert
    }
  }

  return minVert
}

function main() {
  const pos = new Vec3(-14.5, 9, -2.5)

  // AABB.fromBlockPos(Vec3(-12, 8, -7)) is represented here as the block
  // bounds for a 1x1x1 block occupying x=[-12,-11], y=[8,9], z=[-7,-6].
  const goal = {
    minX: -12,
    maxX: -11,
    minY: 8,
    maxY: 8,
    minZ: -7,
    maxZ: -6
  }

  const result = findGoalVertex(goal, pos)

  console.log('\nresult:', result.toString())
  console.log('expected:', new Vec3(-12, 8, -6).toString())
}

main()
