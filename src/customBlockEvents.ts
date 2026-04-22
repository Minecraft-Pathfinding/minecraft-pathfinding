// blockEvents.ts
const createDebug = require('debug')
import type { Bot } from 'mineflayer'
import type { Block } from 'prismarine-block'
import type { Vec3 } from 'vec3'


export type BlockUpdateListener = (oldBlock: Block | null, newBlock: Block | null) => void

export type BlockPositionString = `(${number}, ${number}, ${number})`
export type BlockPositionEventName = `blockUpdate:(x, y, z)`
export type BlockEventName = 'blockUpdate' | BlockPositionEventName

type BlockEventListenerMap = {
  blockUpdate: BlockUpdateListener
} & {
  [K in BlockPositionEventName]: BlockUpdateListener
}

const debugIt = false;
const listenerCounts = new WeakMap<Bot, Map<BlockEventName, number>>()

function debug(...args: any[]) {
  const log = createDebug('minecraft-pathfinding:block-events')
  if (debugIt) {
    log(...args)
  }
}

function getTrackedListenerCounts(bot: Bot): Map<BlockEventName, number> {
  let counts = listenerCounts.get(bot)
  if (counts == null) {
    counts = new Map<BlockEventName, number>()
    listenerCounts.set(bot, counts)
  }
  return counts
}

function changeTrackedListenerCount(bot: Bot, eventName: BlockEventName, delta: number): number {
  const counts = getTrackedListenerCounts(bot)
  const next = Math.max(0, (counts.get(eventName) ?? 0) + delta)
  counts.set(eventName, next)
  return next
}

export function getBlockEventListenerCount(bot: Bot, eventName: BlockEventName): number {
  return getTrackedListenerCounts(bot).get(eventName) ?? 0
}

export function getTotalBlockEventListenerCount(bot: Bot): number {
  let total = 0
  for (const count of getTrackedListenerCounts(bot).values()) {
    total += count
  }
  return total
}

export function toBlockPositionEventName(position: Vec3): BlockPositionEventName {
  return `blockUpdate:${position.toString()}` as BlockPositionEventName
}

export function onBlockEvent<K extends BlockEventName>(
  bot: Bot,
  eventName: K,
  listener: BlockEventListenerMap[K]
): void {
  debug('on %s', eventName)
  bot.on(eventName, listener as (...args: any[]) => void)
  const active = changeTrackedListenerCount(bot, eventName, 1)
  debug('active listeners %s=%d total=%d', eventName, active, getTotalBlockEventListenerCount(bot))
  if (eventName === 'blockUpdate' && active > 10) {
    console.warn(
      `[block-events] blockUpdate listeners active=${active} emitter=${bot.listenerCount(eventName)} total=${getTotalBlockEventListenerCount(bot)}`
    )
  }
}

export function onceBlockEvent<K extends BlockEventName>(
  bot: Bot,
  eventName: K,
  listener: BlockEventListenerMap[K]
): void {
  debug('once %s', eventName)
  const wrapped = ((...args: any[]) => {
    changeTrackedListenerCount(bot, eventName, -1)
    debug(
      'active listeners %s=%d total=%d',
      eventName,
      getBlockEventListenerCount(bot, eventName),
      getTotalBlockEventListenerCount(bot)
    )
    ;(listener as (...args: any[]) => void)(...args)
  }) as (...args: any[]) => void

  bot.once(eventName, wrapped)
  const active = changeTrackedListenerCount(bot, eventName, 1)
  debug('active listeners %s=%d total=%d', eventName, active, getTotalBlockEventListenerCount(bot))
}

export function offBlockEvent<K extends BlockEventName>(
  bot: Bot,
  eventName: K,
  listener: BlockEventListenerMap[K]
): void {
  debug('off %s', eventName)
  bot.off(eventName, listener as (...args: any[]) => void)
  const active = changeTrackedListenerCount(bot, eventName, -1)
  debug('active listeners %s=%d total=%d', eventName, active, getTotalBlockEventListenerCount(bot))
}

export function handleBlockEvent<K extends BlockEventName>(
  bot: Bot,
  eventName: K,
  listener: BlockEventListenerMap[K]
): () => void {
  onBlockEvent(bot, eventName, listener)
  return () => offBlockEvent(bot, eventName, listener)
}

export function handleBlockPositionEvent(
  bot: Bot,
  position: Vec3,
  listener: BlockUpdateListener
): () => void {
  return handleBlockEvent(bot, toBlockPositionEventName(position), listener)
}

export interface WaitForBlockEventOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

export function waitForBlockEvent<K extends BlockEventName>(
  bot: Bot,
  eventName: K,
  opts: WaitForBlockEventOptions = {}
): Promise<Parameters<BlockEventListenerMap[K]>> {
  const { timeoutMs = 5000, signal } = opts

  return new Promise((resolve, reject) => {
    let finished = false
    let timeout: NodeJS.Timeout | undefined

    const cleanup = () => {
      if (timeout) clearTimeout(timeout)
      offBlockEvent(bot, eventName, listener)
      signal?.removeEventListener('abort', onAbort)
    }

    const succeed = (...args: Parameters<BlockEventListenerMap[K]>) => {
      if (finished) return
      finished = true
      cleanup()
      debug('resolved waitForBlockEvent %s', eventName)
      resolve(args)
    }

    const fail = (err: Error) => {
      if (finished) return
      finished = true
      cleanup()
      debug('rejected waitForBlockEvent %s: %s', eventName, err.message)
      reject(err)
    }

    const listener = ((...args: Parameters<BlockEventListenerMap[K]>) => {
      succeed(...args)
    }) as BlockEventListenerMap[K]

    const onAbort = () => {
      fail(new Error(`Aborted while waiting for ${eventName}`))
    }

    onBlockEvent(bot, eventName, listener)

    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        fail(new Error(`Timed out waiting for ${eventName}`))
      }, timeoutMs)
    }

    if (signal) {
      if (signal.aborted) {
        fail(new Error(`Aborted while waiting for ${eventName}`))
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

export interface WaitForSettledBlockPredicateOptions {
  timeoutMs?: number
  settleMs?: number
  signal?: AbortSignal
}

export interface WaitForSettledBlockUpdateOptions {
  timeoutMs?: number
  settleMs?: number
  signal?: AbortSignal
}

export interface HandleSettledBlockEventOptions {
  settleMs?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export type SettledBlockUpdateListener = (
  oldBlock: Block | null,
  newBlock: Block | null,
  settledBlock: Block | null
) => void | Promise<void>

type PositionSettleController<TResult> = {
  resolve: (value: TResult) => void
  reject: (err: Error) => void
  finishGuard: () => boolean
  position: Vec3
  eventName: BlockPositionEventName
  settleMs: number
  bot: Bot
}

function waitForPositionSettle<TResult>(
  bot: Bot,
  position: Vec3,
  opts: {
    timeoutMs?: number
    settleMs?: number
    signal?: AbortSignal
    debugLabel: string
    createListener: (
      controller: PositionSettleController<TResult> & {
        armSettleTimer: (fn: () => void) => void
        cancelSettleTimer: () => void
      }
    ) => BlockUpdateListener
  }
): Promise<TResult> {
  const targetPosition = position.floored()
  const eventName = toBlockPositionEventName(targetPosition)
  const timeoutMs = opts.timeoutMs ?? 5000
  const settleMs = opts.settleMs ?? 75
  const signal = opts.signal

  return new Promise<TResult>((resolve, reject) => {
    let finished = false
    let timeoutTimer: NodeJS.Timeout | undefined
    let settleTimer: NodeJS.Timeout | undefined

    const succeed = (value: TResult) => {
      if (finished) return
      finished = true
      cleanup()
      debug('resolved %s %s', opts.debugLabel, eventName)
      resolve(value)
    }

    const fail = (err: Error) => {
      if (finished) return
      finished = true
      cleanup()
      debug('rejected %s %s: %s', opts.debugLabel, eventName, err.message)
      reject(err)
    }

    const armSettleTimer = (fn: () => void) => {
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        if (finished) return
        fn()
      }, settleMs)
    }

    const cancelSettleTimer = () => {
      if (settleTimer) {
        clearTimeout(settleTimer)
        settleTimer = undefined
      }
    }

    const controller: PositionSettleController<TResult> & {
      armSettleTimer: (fn: () => void) => void
      cancelSettleTimer: () => void
    } = {
      resolve: succeed,
      reject: fail,
      finishGuard: () => finished,
      position,
      eventName,
      settleMs,
      bot,
      armSettleTimer,
      cancelSettleTimer
    }

    const baseListener = opts.createListener(controller)

    const onUpdate: BlockUpdateListener = (oldBlock, newBlock) => {
      const updatedPosition = oldBlock?.position ?? newBlock?.position
      if (updatedPosition == null) return
      if (!updatedPosition.floored().equals(targetPosition)) return

      baseListener(oldBlock, newBlock)
    }

    const onAbort = () => {
      fail(new Error(`Aborted while waiting for ${eventName}`))
    }

  const cleanup = () => {
    if (timeoutTimer) clearTimeout(timeoutTimer)
    cancelSettleTimer()
    offBlockEvent(bot, 'blockUpdate', onUpdate)
    signal?.removeEventListener('abort', onAbort)
  }

    onBlockEvent(bot, 'blockUpdate', onUpdate)

    // Seed the listener from the current world state so callers do not have to
    // wait for a second update before the settle timer can start.
    baseListener(null, bot.blockAt(targetPosition) ?? null)

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        fail(new Error(`Timed out waiting for ${opts.debugLabel} at ${position}`))
      }, timeoutMs)
    }

    if (signal) {
      if (signal.aborted) {
        fail(new Error(`Aborted while waiting for ${eventName}`))
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}
export async function waitForSettledBlockPredicate(
  bot: Bot,
  position: Vec3,
  predicate: (block: Block | null) => boolean,
  opts: WaitForSettledBlockPredicateOptions = {}
): Promise<Block | null> {
  return await waitForPositionSettle<Block | null>(bot, position, {
    timeoutMs: opts.timeoutMs,
    settleMs: opts.settleMs ?? 500,
    signal: opts.signal,
    debugLabel: 'waitForSettledBlockPredicate',
    createListener: (controller) => {
      let candidate: Block | null = null

      const cancel = () => {
        const settleTimer = (controller as any).settleTimer as NodeJS.Timeout | undefined
        if (settleTimer) {
          clearTimeout(settleTimer)
          ;(controller as any).settleTimer = undefined
        }
      }

      return (_oldBlock, newBlock) => {
        const matches = predicate(newBlock)

        debug(
          'event %s new=%s matches=%s',
          controller.eventName,
          newBlock?.name ?? 'null',
          matches
        )

        if (matches) {
          candidate = newBlock
          ;(controller as any).armSettleTimer(() => {
            debug(
              'settle check %s candidate=%s matches=%s',
              controller.eventName,
              candidate?.name ?? 'null',
              true
            )
            controller.resolve(candidate)
          })
        } else {
          candidate = null
          cancel()
        }
      }
    }
  })
}

export async function waitForSettledBlockStateAtPosition(
  bot: Bot,
  position: Vec3,
  predicate: (block: Block | null) => boolean,
  opts: WaitForSettledBlockPredicateOptions = {}
): Promise<Block | null> {
  return await waitForPositionSettle<Block | null>(bot, position, {
    timeoutMs: opts.timeoutMs,
    settleMs: opts.settleMs ?? 75,
    signal: opts.signal,
    debugLabel: 'waitForSettledBlockStateAtPosition',
    createListener: (controller) => {
      const cancel = () => {
        const settleTimer = (controller as any).settleTimer as NodeJS.Timeout | undefined
        if (settleTimer) {
          clearTimeout(settleTimer)
          ;(controller as any).settleTimer = undefined
        }
      }

      return (_oldBlock, _newBlock) => {
        const current = controller.bot.blockAt(controller.position) ?? null
        const matches = predicate(current)

        debug(
          'event %s current=%s matches=%s',
          controller.eventName,
          current?.name ?? 'null',
          matches
        )

        if (matches) {
          ;(controller as any).armSettleTimer(() => {
            const settled = controller.bot.blockAt(controller.position) ?? null
            const settledMatches = predicate(settled)

            debug(
              'settle check %s current=%s matches=%s',
              controller.eventName,
              settled?.name ?? 'null',
              settledMatches
            )

            if (settledMatches) {
              controller.resolve(settled)
            }
          })
        } else {
          cancel()
        }
      }
    }
  })
}

export async function waitForSettledBlockUpdateAtPosition(
  bot: Bot,
  position: Vec3,
  opts: WaitForSettledBlockUpdateOptions = {}
): Promise<Block | null> {
  return await waitForPositionSettle<Block | null>(bot, position, {
    timeoutMs: opts.timeoutMs,
    settleMs: opts.settleMs ?? 75,
    signal: opts.signal,
    debugLabel: 'waitForSettledBlockUpdateAtPosition',
    createListener: (controller) => {
      return () => {
        ;(controller as any).armSettleTimer(() => {
          const current = controller.bot.blockAt(controller.position) ?? null
          debug(
            'settle check %s current=%s',
            controller.eventName,
            current?.name ?? 'null'
          )
          controller.resolve(current)
        })
      }
    }
  })
}

/**
 * Listens to global blockUpdate events, but only calls the listener after the
 * affected position has gone quiet for `settleMs`.
 *
 * - Deduplicates concurrent checks per position
 * - Reads the final block from the world before invoking the listener
 */
export function handleSettledBlockEvent(
  bot: Bot,
  listener: SettledBlockUpdateListener,
  opts: HandleSettledBlockEventOptions = {}
): () => void {
  const pending = new Map<string, Promise<void>>()

  const keyOf = (pos: Vec3): string => `${pos.x},${pos.y},${pos.z}`

  const dispose = handleBlockEvent(bot, 'blockUpdate', (oldBlock, newBlock) => {
    if (oldBlock == null && newBlock == null) return

    const position = oldBlock?.position ?? newBlock?.position
    if (position == null) return

    const key = keyOf(position)
    if (pending.has(key)) return

    const task = (async () => {
      try {
        const settledBlock = await waitForSettledBlockUpdateAtPosition(bot, position, {
          settleMs: opts.settleMs,
          timeoutMs: opts.timeoutMs,
          signal: opts.signal
        })

        await listener(oldBlock, newBlock, settledBlock)
      } catch (err) {
        debug(
          'settled block listener failed for %s: %s',
          key,
          err instanceof Error ? err.message : String(err)
        )
      } finally {
        pending.delete(key)
      }
    })()

    pending.set(key, task)
  })

  return () => {
    dispose()
    pending.clear()
  }
}
