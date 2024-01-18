export function onceWithCleanup<T>(
    emitter: NodeJS.EventEmitter,
    event: string,
    options: { timeout?: number; checkCondition?: (data?: T) => boolean } = {}
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 10000;
      const checkCondition = options.checkCondition || (() => true);
      const timeoutId = setTimeout(() => {
        emitter.removeListener(event, listener);
        reject(new Error(`Timeout waiting for ${event}`));
      }, timeout);
      const listener = (data: T) => {
        if (checkCondition(data)) {
          clearTimeout(timeoutId);
          emitter.removeListener(event, listener);
          resolve(data);
        }
      };
      emitter.on(event, listener);
    });
  }