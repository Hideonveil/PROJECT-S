export class KeyedSerialQueue {
  private readonly tails = new Map<string, Promise<void>>();

  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) || Promise.resolve();
    const result = previous.then(work, work);
    const tail = result.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    this.tails.set(key, tail);
    return result;
  }
}
