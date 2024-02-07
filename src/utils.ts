import { Vec3 } from 'vec3'

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

// (async () => {
//   const task0 = new Task<number, Error>();
//   const task1 = new Task<number, Error>();
//   const task2 = new Task<number, Error>();
//   const task3 = new Task<number, Error>();

//   const data = task0.promise
//   task0.finish(1);

//   console.log(await data)

// })()
