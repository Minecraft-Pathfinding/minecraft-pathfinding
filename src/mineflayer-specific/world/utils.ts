import { Vec3 } from 'vec3'
import { Block } from '../../types'
import { Bot } from 'mineflayer'

export function fasterGetBlock (this: Bot['world'], pos: Vec3): Block {
  const cX = pos.x >> 4
  const cZ = pos.z >> 4

  const colKey = `${cX},${cZ}`
  const col = (this.async as any).columns[colKey]

  if (col == null) {
    return null as unknown as Block
  }

  const colPos = new Vec3(pos.x & 0xf, pos.y, pos.z & 0xf).floor();

  const ret1 = col.getBlock(colPos)
  ret1.position = pos
  return ret1
}
