export class CancelError extends Error {
  constructor (...args: any[]) {
    console.log('CancelError', args)
    super('Movement canceled: ' + args.join(' '))
  }
}

export class AbortError extends Error {
  constructor (...args: any[]) {
    console.log('AbortError', args)
    super('Movement aborted: ' + args.join(' '))
  }
}
