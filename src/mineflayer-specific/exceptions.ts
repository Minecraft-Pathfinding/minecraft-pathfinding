import { ResetReason } from '../types'

export class CancelError extends Error {
  constructor (...args: any[]) {
    // console.log('CancelError', args)
    super('Movement canceled: ' + args.join(' '))
  }
}

export class AbortError extends Error {
  constructor (...args: any[]) {
    // console.log('AbortError', args)
    super('Movement aborted: ' + args.join(' '))
  }
}

export class ResetError extends Error {

  static fromReason(reason: ResetReason, ...args: any[]) {
    if (reason === "goalReassignment") return new ManualResetError(...args)
    else return new ResetError(reason, ...args)
  }

  constructor (public readonly reason: ResetReason, ...args: any[]) {
    // console.log('ResetError', reason, args)
    const extra = args.length > 0 ? `: ${args.join(' ')}` : '.'
    super(`Movement was reset${extra}`)
  }
}

export class ManualResetError extends ResetError {
  constructor (...args: any[]) {
    // console.log('ResetError', reason, args)
    super('goalReassignment', 'manual reset.')
  }
}



export class TickAdvanceError extends Error {
  constructor(label: string, beforeTick: number, afterTick: number) {
    super(`[tick-guard] Tick advanced during await for ${label}: ${beforeTick} -> ${afterTick}`)
    this.name = 'TickAdvanceError'
  }
}