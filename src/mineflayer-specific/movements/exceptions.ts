export class CancelError extends Error {
  constructor (...args: any[]) {
    console.log('CancelError', args)
    super('Movement canceled: ' + args.join(' '))
  }
}
