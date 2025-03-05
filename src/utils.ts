import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { BlockInfo } from './mineflayer-specific/world/cacheWorld'

export function printBotControls (bot: Bot): void {
  // console.log('forward', bot.getControlState('forward'))
  // console.log('back', bot.getControlState('back'))
  // console.log('left', bot.getControlState('left'))
  // console.log('right', bot.getControlState('right'))
  // console.log('jump', bot.getControlState('jump'))
  // console.log('sprint', bot.getControlState('sprint'))
  // console.log('sneak', bot.getControlState('sneak'))
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
  cancelled: boolean = false
  promise: Promise<Res>
  cancel!: (err: Rej) => void
  finish!: (result: Res) => void

  constructor () {
    this.promise = new Promise((resolve, reject) => {
      this.cancel = (err) => {
        if (!this.done) {
          this.done = true
          this.cancelled = true
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

// (async () => {
//   const task0 = new Task<number, Error>();
//   const task1 = new Task<number, Error>();
//   const task2 = new Task<number, Error>();
//   const task3 = new Task<number, Error>();

//   const data = task0.promise
//   task0.finish(1);

// console.log(await data)

// })()
