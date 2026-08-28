import { describe, expect, it, vi } from "vitest";
import { KeyedSingleFlight } from "./single-flight";

describe("KeyedSingleFlight", () => {
  it("shares one in-flight operation for the same user", async () => {
    const flights = new KeyedSingleFlight();
    let release!: (value: string) => void;
    const work = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));

    const first = flights.run("user-a", work);
    const second = flights.run("user-a", work);
    await Promise.resolve();
    release("done");

    await expect(Promise.all([first, second])).resolves.toEqual(["done", "done"]);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("allows different users to progress independently", async () => {
    const flights = new KeyedSingleFlight();
    const workA = vi.fn().mockResolvedValue("a");
    const workB = vi.fn().mockResolvedValue("b");

    await expect(Promise.all([
      flights.run("user-a", workA),
      flights.run("user-b", workB),
    ])).resolves.toEqual(["a", "b"]);
  });
});
