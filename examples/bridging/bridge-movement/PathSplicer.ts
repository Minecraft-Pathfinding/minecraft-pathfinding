import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Move } from '../../../src/mineflayer-specific/move'
import { World } from '../../../src/mineflayer-specific/world/worldInterface'

export class PathSplicer {
  static computeSpliceEnd (
    bot: Bot,
    world: World,
    startIndex: number,
    path: Move[],
    maxLook = 10000
  ): number {
    if (startIndex >= path.length) return startIndex

    const anchor = path[startIndex]
    const orgY = anchor.exitPos.y
    const ctor = anchor.moveType.constructor

    const refDir = PathSplicer._xzDir(anchor.entryPos, anchor.exitPos)

    let best = startIndex

    for (let i = startIndex + 1; i <= Math.min(startIndex + maxLook, path.length - 1); i++) {
      const next = path[i]

      if (Math.abs(next.exitPos.y - orgY) > 0.01) break
      if (Math.abs(next.entryPos.y - orgY) > 0.01) break
      if (next.moveType.constructor !== ctor) break

      const nextDir = PathSplicer._xzDir(next.entryPos, next.exitPos)
      if (nextDir.norm() > 0.001 && refDir.norm() > 0.001) {
        if (nextDir.normalize().dot(refDir.normalize()) < 0.85) break
      }

      if (next.toBreak.length > 0) break
      if (!PathSplicer._hasSupportAt(world, path, startIndex, i)) break

      best = i
    }

    return best
  }

  private static _xzDir (from: Vec3, to: Vec3): Vec3 {
    return new Vec3(to.x - from.x, 0, to.z - from.z)
  }

  private static _hasSupportAt (
    world: World,
    path: Move[],
    startIndex: number,
    idx: number
  ): boolean {
    const exitPos = path[idx].exitPos
    const supportPos = new Vec3(
      Math.floor(exitPos.x),
      Math.floor(exitPos.y) - 1,
      Math.floor(exitPos.z)
    )

    if (world.getBlockInfo(supportPos).physical) return true

    for (let j = startIndex; j <= idx; j++) {
      for (const place of path[j].toPlace) {
        if (
          Math.floor(place.x) === supportPos.x &&
          Math.floor(place.y) === supportPos.y &&
          Math.floor(place.z) === supportPos.z
        ) {
          return true
        }
      }
    }

    return false
  }
}
