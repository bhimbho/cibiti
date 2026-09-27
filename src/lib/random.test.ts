import { describe, expect, it } from "vitest";
import { newSeed, seededRandom } from "./random";

describe("newSeed", () => {
  it("is 128 bits of hex", () => {
    expect(newSeed()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("does not repeat", () => {
    const seeds = new Set(Array.from({ length: 200 }, () => newSeed()));
    expect(seeds.size).toBe(200);
  });
});

describe("seededRandom", () => {
  it("replays the same sequence for the same seed", () => {
    const first = Array.from({ length: 10 }, seededRandom("abc123"));
    const second = Array.from({ length: 10 }, seededRandom("abc123"));
    expect(first).toEqual(second);
  });

  it("gives different sequences for different seeds", () => {
    const a = Array.from({ length: 10 }, seededRandom("seed-a"));
    const b = Array.from({ length: 10 }, seededRandom("seed-b"));
    expect(a).not.toEqual(b);
  });

  it("notices a one-character change in the seed", () => {
    const a = seededRandom("0000000000000000000000000000000a")();
    const b = seededRandom("0000000000000000000000000000000b")();
    expect(a).not.toBe(b);
  });

  it("stays inside [0, 1)", () => {
    const random = seededRandom("range-check");
    for (let i = 0; i < 5000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("spreads roughly evenly across ten buckets", () => {
    const random = seededRandom("distribution");
    const buckets = new Array(10).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i++) buckets[Math.floor(random() * 10)] += 1;
    // Each bucket should hold about a tenth; allow a wide margin so the test is
    // about gross bias, not luck.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(draws / 10 * 0.9);
      expect(count).toBeLessThan(draws / 10 * 1.1);
    }
  });
});
