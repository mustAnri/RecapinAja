/**
 * Controlled-concurrency helper (PRD §18, §19).
 *
 * Runs async workers with a hard upper bound so 500+ photos never exhaust
 * memory/CPU, while keeping results aligned with input order.
 */

export const DEFAULT_CONCURRENCY = 2;

/**
 * Map `items` through `worker` with at most `limit` tasks in flight.
 * `onItemDone` fires (in completion order) after each item settles.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onItemDone?: (index: number, result: R) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const maxInFlight = Math.max(1, Math.min(limit, items.length));
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const result = await worker(items[index], index);
      results[index] = result;
      onItemDone?.(index, result);
      // Yield to the event loop between items so the UI can repaint
      // progress even when workers resolve quickly (§18).
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  const runners: Promise<void>[] = [];
  for (let i = 0; i < maxInFlight; i += 1) {
    runners.push(runNext());
  }
  await Promise.all(runners);
  return results;
}
