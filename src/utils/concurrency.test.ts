import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './concurrency';

describe('mapWithConcurrency', () => {
  it('keeps results aligned with input order', async () => {
    const results = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      3,
      async (item) => item * 2,
    );
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let maxObserved = 0;
    await mapWithConcurrency(
      Array.from({ length: 12 }, (_, i) => i),
      3,
      async (item) => {
        inFlight += 1;
        maxObserved = Math.max(maxObserved, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return item;
      },
    );
    expect(maxObserved).toBeLessThanOrEqual(3);
    expect(maxObserved).toBeGreaterThan(1); // actually runs in parallel
  });

  it('fires onItemDone once per item', async () => {
    const done: number[] = [];
    await mapWithConcurrency(
      ['a', 'b', 'c'],
      2,
      async (item) => item.toUpperCase(),
      (index) => done.push(index),
    );
    expect(done.sort()).toEqual([0, 1, 2]);
  });

  it('handles an empty input', async () => {
    const results = await mapWithConcurrency([], 4, async (item: number) => item);
    expect(results).toEqual([]);
  });
});
