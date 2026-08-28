export class KeyedSingleFlight {
  private readonly flights = new Map<string, Promise<unknown>>();

  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const running = this.flights.get(key);
    if (running) return running as Promise<T>;

    const flight = Promise.resolve().then(work).finally(() => {
      if (this.flights.get(key) === flight) this.flights.delete(key);
    });
    this.flights.set(key, flight);
    return flight;
  }
}
