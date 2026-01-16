/**
 * Request utility functions for handling Express request parameters
 */

/**
 * Extracts a string parameter from req.params, handling both string and string[] types.
 * If the parameter is an array, returns the first element.
 *
 * @param param - The parameter value from req.params (string | string[])
 * @returns The parameter as a string
 */
export function getStringParam(param: string | string[]): string {
  if (Array.isArray(param)) {
    return param[0];
  }
  return param;
}
