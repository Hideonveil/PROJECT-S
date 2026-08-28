import { describe, expect, it, vi } from "vitest";
import { KeyedSerialQueue } from "./keyed-serial-queue";

describe("KeyedSerialQueue", () => {
  it("runs different operations for the same user in order without swallowing either", async () => {
    const queue = new KeyedSerialQueue();
    let release!: () => void;
    const firstWork = vi.fn(() => new Promise<string>((resolve) => {
      release = () => resolve("started");
    }));
    const secondWork = vi.fn().mockResolvedValue("cancelled");

    const first = queue.run("user-a", firstWork);
    const second = queue.run("user-a", secondWork);
    await Promise.resolve();
    expect(firstWork).toHaveBeenCalledTimes(1);
    expect(secondWork).not.toHaveBeenCalled();

    release();
    await expect(Promise.all([first, second])).resolves.toEqual(["started", "cancelled"]);
    expect(secondWork).toHaveBeenCalledTimes(1);
  });

  it("allows different users to progress independently", async () => {
    const queue = new KeyedSerialQueue();
    const workA = vi.fn().mockResolvedValue("a");
    const workB = vi.fn().mockResolvedValue("b");

    await expect(Promise.all([
      queue.run("user-a", workA),
      queue.run("user-b", workB),
    ])).resolves.toEqual(["a", "b"]);
  });
});
