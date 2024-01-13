export class CancelError extends Error {
  constructor(...args: any[]) {
    super("Movement canceled: " + args.join(" "));
  }
}