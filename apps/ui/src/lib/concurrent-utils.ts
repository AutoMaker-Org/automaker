/**
 * Concurrency Utilities
 *
 * Provides utilities for executing promises with controlled concurrency.
 * Used for bulk operations like parallel API calls with rate limiting
 * to preserve UI responsiveness.
 */

/**
 * Result type that preserves the order of results and distinguishes
 * between successful and failed operations.
 */
export type ConcurrencyResult<R> = PromiseSettledResult<R>;

/**
 * Executes promises with a concurrency limit, preserving result order.
 *
 * This function processes items in parallel but limits the number of
 * concurrent executions to prevent overwhelming the server or UI.
 * Results are returned in the same order as the input items.
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Maximum concurrent executions (default: 5)
 * @returns Promise resolving to an array of settled results in input order
 *
 * @example
 * // Bulk delete with concurrency cap of 5
 * const results = await mapWithConcurrency(
 *   featureIds,
 *   (id) => api.features.delete(id),
 *   5
 * );
 *
 * // Check results
 * results.forEach((result, index) => {
 *   if (result.status === 'fulfilled') {
 *     console.log(`Item ${index} succeeded:`, result.value);
 *   } else {
 *     console.log(`Item ${index} failed:`, result.reason);
 *   }
 * });
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 5
): Promise<ConcurrencyResult<R>[]> {
  // Handle edge cases
  if (items.length === 0) {
    return [];
  }

  // Cap concurrency to the number of items
  const effectiveConcurrency = Math.min(concurrency, items.length);

  // Pre-allocate results array to preserve order
  const results: ConcurrencyResult<R>[] = new Array(items.length);

  // Index for the next item to process
  let nextIndex = 0;

  /**
   * Worker function that processes items sequentially until all are done.
   * Multiple workers run in parallel up to the concurrency limit.
   */
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      // Capture current index before incrementing
      const currentIndex = nextIndex++;

      try {
        const result = await fn(items[currentIndex]);
        results[currentIndex] = { status: 'fulfilled', value: result };
      } catch (error) {
        results[currentIndex] = { status: 'rejected', reason: error };
      }
    }
  }

  // Start worker pool
  const workers = Array.from({ length: effectiveConcurrency }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Executes promises with a concurrency limit and returns only successful results.
 *
 * Similar to mapWithConcurrency but filters out failed results and returns
 * only the successful values. Useful when you want to continue processing
 * even if some items fail.
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Maximum concurrent executions (default: 5)
 * @returns Promise resolving to an array of successful results (may be shorter than input)
 *
 * @example
 * // Import files, collecting only successful results
 * const createdFeatures = await mapWithConcurrencyFiltered(
 *   files,
 *   (file) => createFeatureFromFile(file),
 *   5
 * );
 */
export async function mapWithConcurrencyFiltered<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 5
): Promise<R[]> {
  const results = await mapWithConcurrency(items, fn, concurrency);
  return results
    .filter((r): r is PromiseFulfilledResult<R> => r.status === 'fulfilled')
    .map((r) => r.value);
}

/**
 * Executes promises with a concurrency limit and collects errors.
 *
 * Returns both successful results and errors in separate arrays,
 * useful for reporting partial failures to the user.
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Maximum concurrent executions (default: 5)
 * @returns Object with successes array and errors array (with original item)
 *
 * @example
 * // Bulk operation with error collection
 * const { successes, errors } = await mapWithConcurrencyCollectErrors(
 *   files,
 *   async (file) => {
 *     const content = await file.text();
 *     return api.features.create({ description: content });
 *   },
 *   5
 * );
 *
 * if (errors.length > 0) {
 *   console.log(`Failed to process ${errors.length} files`);
 *   errors.forEach(({ item, error }) => {
 *     console.log(`  ${item.name}: ${error.message}`);
 *   });
 * }
 */
export async function mapWithConcurrencyCollectErrors<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 5
): Promise<{
  successes: Array<{ item: T; result: R }>;
  errors: Array<{ item: T; error: unknown }>;
}> {
  const results = await mapWithConcurrency(items, fn, concurrency);

  const successes: Array<{ item: T; result: R }> = [];
  const errors: Array<{ item: T; error: unknown }> = [];

  results.forEach((result, index) => {
    const item = items[index];
    if (result.status === 'fulfilled') {
      successes.push({ item, result: result.value });
    } else {
      errors.push({ item, error: result.reason });
    }
  });

  return { successes, errors };
}
