/**
 * Location selection utilities for random and weighted selection algorithms.
 * 
 * Provides functions for selecting locations from arrays with various strategies:
 * - Random selection without replacement (unique locations)
 * - Random selection with replacement (allows duplicates)
 * - Weighted random selection (probability-based)
 * 
 * All functions include comprehensive edge case handling and TypeScript type safety.
 */

/**
 * Perform a Fisher-Yates shuffle on an array in-place.
 * 
 * The Fisher-Yates shuffle (also known as the Knuth shuffle) is a well-known
 * algorithm for generating a random permutation of a finite sequence. It runs
 * in O(n) time and produces each possible permutation with equal probability.
 * 
 * @param array - The array to shuffle. Modified in-place.
 * @returns The same array reference, now shuffled.
 * 
 * @example
 * const items = [1, 2, 3, 4, 5];
 * shuffleArray(items);
 * // items might be [3, 1, 5, 2, 4] - a random permutation
 * 
 * @remarks
 * This implementation uses cryptographically weak random (Math.random).
 * For cryptographic security, replace with crypto.getRandomValues().
 */
export function shuffleArray<T>(array: T[]): T[] {
  // Create a shallow copy to avoid mutating the original array
  const result = [...array];
  
  // Work backwards through the array
  for (let i = result.length - 1; i > 0; i--) {
    // Pick a random index from 0 to i (inclusive)
    const j = Math.floor(Math.random() * (i + 1));
    
    // Swap elements at i and j
    [result[i], result[j]] = [result[j], result[i]];
  }
  
  return result;
}

/**
 * Select unique locations randomly from an array without replacement.
 * 
 * Each selected location is guaranteed to be unique within a single call.
 * If count exceeds array length, returns all available locations shuffled.
 * 
 * @param locations - Array of locations to select from.
 * @param count - Number of unique locations to select.
 * @returns Array containing the selected unique locations.
 * 
 * @throws {Error} Throws if locations is null or undefined.
 * 
 * @example
 * const locations = ['A', 'B', 'C', 'D', 'E'];
 * const selected = selectRandomLocationsWithoutReplacement(locations, 3);
 * // Returns 3 unique locations, e.g., ['C', 'A', 'E']
 * 
 * @remarks
 * - When count >= array.length, returns all locations shuffled
 * - Empty locations array returns empty array
 * - Negative count returns empty array
 */
export function selectRandomLocationsWithoutReplacement<T>(
  locations: T[],
  count: number
): T[] {
  // Handle edge cases
  if (!Array.isArray(locations)) {
    throw new Error('locations must be an array');
  }
  
  if (count <= 0) {
    return [];
  }
  
  if (locations.length === 0) {
    return [];
  }
  
  // When requesting more than available, return all shuffled
  if (count >= locations.length) {
    return shuffleArray(locations);
  }
  
  // Shuffle and take only the requested count
  return shuffleArray(locations).slice(0, count);
}

/**
 * Select locations randomly from an array with replacement.
 * 
 * The same location can be selected multiple times. Each selection is
 * independent, making this suitable for scenarios like random sampling
 * where repetitions are expected or desired.
 * 
 * @param locations - Array of locations to select from.
 * @param count - Number of locations to select (can exceed array length).
 * @returns Array containing the selected locations (may contain duplicates).
 * 
 * @throws {Error} Throws if locations is null or undefined.
 * 
 * @example
 * const locations = ['A', 'B'];
 * const selected = selectRandomLocationsWithReplacement(locations, 5);
 * // Returns 5 selections, possibly ['A', 'A', 'B', 'A', 'B']
 * 
 * @remarks
 * - Returns empty array when count <= 0 or locations is empty
 * - May return duplicate values
 * - Each position is independently and uniformly chosen
 */
export function selectRandomLocationsWithReplacement<T>(
  locations: T[],
  count: number
): T[] {
  // Handle edge cases
  if (!Array.isArray(locations)) {
    throw new Error('locations must be an array');
  }
  
  if (count <= 0) {
    return [];
  }
  
  if (locations.length === 0) {
    return [];
  }
  
  // Make independent random selections with replacement
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * locations.length);
    result.push(locations[randomIndex]);
  }
  
  return result;
}

/**
 * Selection weights for weighted random selection.
 * 
 * Higher weight values increase the probability of being selected.
 * Weights are automatically normalized to probabilities.
 */
export interface LocationWeightPair<T> {
  location: T;
  weight: number;
}

/**
 * Select a single location using weighted random probability.
 * 
 * Locations with higher weights have proportionally higher chances
 * of being selected. Weights are automatically normalized to sum to 1.
 * 
 * @param weightedLocations - Array of locations with their weights.
 * @returns The selected location.
 * 
 * @throws {Error} Throws if weightedLocations is null or undefined.
 * 
 * @example
 * const options: LocationWeightPair<string>[] = [
 *   { location: 'Beach', weight: 5 },
 *   { location: 'Mountain', weight: 2 },
 *   { location: 'City', weight: 3 }
 * ];
 * // Beach has 50% chance, Mountain 20%, City 30%
 * const selected = weightedRandomSelection(weightedLocations);
 * 
 * @remarks
 * - Weights can be any non-negative numbers
 * - Zero-weight locations have no chance of being selected
 * - When all weights are 0 or invalid, returns first location
 * - Invalid weights (negative) are treated as 0
 */
export function weightedRandomSelection<T>(
  weightedLocations: LocationWeightPair<T>[]
): T | undefined {
  // Handle edge cases
  if (!Array.isArray(weightedLocations)) {
    throw new Error('weightedLocations must be an array');
  }
  
  if (weightedLocations.length === 0) {
    return undefined;
  }
  
  // Filter out invalid weights and calculate total
  const validItems: { location: T; weight: number }[] = [];
  let totalWeight = 0;
  
  for (const item of weightedLocations) {
    if (!item || typeof item.location === 'undefined') {
      continue;
    }
    
    const weight = item.weight ?? 0;
    const safeWeight = Math.max(0, weight); // Treat negative as 0
    
    if (safeWeight > 0) {
      validItems.push({ location: item.location, weight: safeWeight });
      totalWeight += safeWeight;
    }
  }
  
  // If no valid weights, return first location
  if (validItems.length === 0) {
    return weightedLocations[0]?.location;
  }
  
  // Generate random threshold and find selected location
  const randomThreshold = Math.random() * totalWeight;
  let cumulativeWeight = 0;
  
  for (const item of validItems) {
    cumulativeWeight += item.weight;
    if (randomThreshold < cumulativeWeight) {
      return item.location;
    }
  }
  
  // Fallback to last item (handles floating-point precision issues)
  return validItems[validItems.length - 1].location;
}

/**
 * Select k locations using weighted random sampling without replacement.
 * 
 * Similar to Fisher-Yates but maintains weighted probabilities at each
 * step. More computationally expensive than simple shuffle.
 * 
 * @param weightedLocations - Array of locations with their weights.
 * @param count - Number of unique locations to select.
 * @returns Array of selected unique locations.
 * 
 * @remarks
 * - When count exceeds array length, returns all locations with preserved order
 * - Handles edge cases similar to weightedRandomSelection
 */
export function weightedRandomSampleWithoutReplacement<T>(
  weightedLocations: LocationWeightPair<T>[],
  count: number
): T[] {
  if (!Array.isArray(weightedLocations)) {
    throw new Error('weightedLocations must be an array');
  }
  
  if (count <= 0) {
    return [];
  }
  
  if (weightedLocations.length === 0) {
    return [];
  }
  
  // Clone array to work with (don't mutate input)
  const remaining: LocationWeightPair<T>[] = JSON.parse(
    JSON.stringify(weightedLocations, (key, value) => {
      if (key === 'location' && typeof value !== 'object') {
        return value;
      }
      return value;
    })
  ) as LocationWeightPair<T>[];
  
  const result: T[] = [];
  
  for (let i = 0; i < Math.min(count, remaining.length); i++) {
    const selectedLocation = weightedRandomSelection(remaining);
    
    if (selectedLocation === undefined) {
      break;
    }
    
    result.push(selectedLocation);
    
    // Remove selected location from remaining pool
    const selectedIndex = remaining.findIndex(item => item.location === selectedLocation);
    if (selectedIndex !== -1) {
      remaining.splice(selectedIndex, 1);
    }
  }
  
  return result;
}
