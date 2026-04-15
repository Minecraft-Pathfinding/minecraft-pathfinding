import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { BlockInfo } from './mineflayer-specific/world/cacheWorld'
import { BlockFace } from '@nxg-org/mineflayer-util-plugin'

export function printBotControls (bot: Bot): void {
  // console.log('forward', bot.getControlState('forward'))
  // console.log('back', bot.getControlState('back'))
  // console.log('left', bot.getControlState('left'))
  // console.log('right', bot.getControlState('right'))
  // console.log('jump', bot.getControlState('jump'))
  // console.log('sprint', bot.getControlState('sprint'))
  // console.log('sneak', bot.getControlState('sneak'))
}

export function faceToVec(face: BlockFace): Vec3 {
    switch (face) {
      case BlockFace.BOTTOM: return new Vec3(0, -1, 0)
      case BlockFace.TOP: return new Vec3(0, 1, 0)
      case BlockFace.NORTH: return new Vec3(0, 0, -1)
      case BlockFace.SOUTH: return new Vec3(0, 0, 1)
      case BlockFace.WEST: return new Vec3(-1, 0, 0)
      case BlockFace.EAST: return new Vec3(1, 0, 0)
      default: throw new Error('Invalid face')
    }
  }

export function *interpolateStepPoints(start: Vec3, end: Vec3, step = 0.8): Generator<Vec3> {
  const delta = end.minus(start)
  const dist = delta.norm()

  if (dist < 1e-8) {
    yield start.clone()
    return
  }

  const dir = delta.scaled(1 / dist)
  const steps = Math.floor(dist / step)

  for (let i = 0; i <= steps; i++) {
    yield start.plus(dir.scaled(i * step))
  }

  if (steps * step < dist) {
    yield end.clone()
  }
}


export const debug = (bot: Bot | undefined, ...args: any[]): void => {
  if (bot != null) {
    bot.chat(args.join(' '))
  }
  console.trace(...args)
}

export const getScaffoldCount = (bot: Bot): number => {
  if (!BlockInfo.initialized) throw new Error('BlockInfo not initialized')
  const amt = bot.inventory.items().reduce((acc, item) => (BlockInfo.scaffoldingBlockItems.has(item.type) ? item.count + acc : acc), 0)
  if (bot.game.gameMode === 'creative') {
    return amt > 0 ? Infinity : 0
  }
  return amt
}

/**
   * Gen here, this code is alright.
   * Taken from: https://github.com/PrismarineJS/mineflayer-pathfinder/blob/d69a02904bc83f4c36598ae90d470a009a130105/index.js#L285
   */
export function closestPointOnLineSegment (point: Vec3, segmentStart: Vec3, segmentEnd: Vec3): Vec3 {
  const segmentLength = segmentEnd.minus(segmentStart).norm()

  if (segmentLength === 0) {
    return segmentStart
  }

  // given the start and end segment of a line that is of arbitrary length,
  // identify the closest point on the line to the given point.

  const t = point.minus(segmentStart).dot(segmentEnd.minus(segmentStart)) / segmentLength ** 2

  if (t < 0) {
    return segmentStart
  }

  if (t > 1) {
    return segmentEnd
  }

  return segmentStart.plus(segmentEnd.minus(segmentStart).scaled(t))
}

export function getNormalizedPos (bot: Bot, startPos?: Vec3): Vec3 {
  if (!BlockInfo.initialized) throw new Error('BlockInfo not initialized')
  // check if we are on carpet
  const pos = startPos ?? bot.entity.position.clone()

  const block = bot.pathfinder.world.getBlockInfo(pos)
  if (BlockInfo.carpets.has(block.type)) {
    return pos.floor()
  }

  return pos
}

export async function onceWithCleanup<T> (
  emitter: NodeJS.EventEmitter,
  event: string,
  options: { timeout?: number, checkCondition?: (data?: T) => boolean } = {}
): Promise<T> {
  return await new Promise((resolve, reject) => {
    const timeout = options.timeout ?? 10000

    let checkCondition: (data?: T) => boolean
    if (options.checkCondition != null) checkCondition = options.checkCondition
    else checkCondition = () => true

    const timeoutId = setTimeout(() => {
      emitter.removeListener(event, listener)
      reject(new Error(`Timeout waiting for ${event}`))
    }, timeout)
    const listener = (data: T): void => {
      if (checkCondition(data)) {
        clearTimeout(timeoutId)
        emitter.removeListener(event, listener)
        resolve(data)
      }
    }
    emitter.on(event, listener)
  })
}

export class Task<Res, Rej> {
  done: boolean = false
  canceled: boolean = false
  promise: Promise<Res>
  cancel!: (err: Rej) => void
  finish!: (result: Res) => void

  constructor () {
    this.promise = new Promise((resolve, reject) => {
      this.cancel = (err) => {
        if (!this.done) {
          this.done = true
          this.canceled = true
          reject(err)
          // throw err;
        }
      }
      this.finish = (result) => {
        if (!this.done) {
          this.done = true
          resolve(result)
          // return result;
        }
      }
    })
  }

  static doneTask<Rej>(): Task<void, Rej> {
    const task = new Task<void, Rej>()
    task.done = true
    task.promise = Promise.resolve()
    task.cancel = () => {}
    task.finish = () => {}
    return task
  }
}

export function getViewDir (info: { yaw: number, pitch: number }): Vec3 {
  return new Vec3(-Math.sin(info.yaw) * Math.cos(info.pitch), Math.sin(info.pitch), -Math.cos(info.yaw) * Math.cos(info.pitch))
}

export function dirToYawPitch (dir: Vec3): { yaw: number, pitch: number } {
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
  if (len === 0) throw new Error('Zero-length direction vector')

  const x = dir.x / len
  const y = dir.y / len
  const z = dir.z / len

  const pitch = Math.asin(y)

  // matches your forward mapping exactly
  const yaw = Math.atan2(-x, -z)

  return { yaw, pitch }
}

export function posToYawPitchFromEye (
  botPos: Vec3,
  eyeHeight: number,
  targetPos: Vec3
): { yaw: number, pitch: number } {
  const eyePos = botPos.offset(0, eyeHeight, 0)
  const dx = targetPos.x - eyePos.x
  const dy = targetPos.y - eyePos.y
  const dz = targetPos.z - eyePos.z

  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len === 0) throw new Error('Target is exactly at eye position')

  const x = dx / len
  const y = dy / len
  const z = dz / len

  const pitch = Math.asin(y)
  const yaw = Math.atan2(-x, -z)

  return { yaw, pitch }
}

// (async () => {
//   const task0 = new Task<number, Error>();
//   const task1 = new Task<number, Error>();
//   const task2 = new Task<number, Error>();
//   const task3 = new Task<number, Error>();

//   const data = task0.promise
//   task0.finish(1);

// console.log(await data)

// })()
