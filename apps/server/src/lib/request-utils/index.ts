/**
 * Request utility functions for handling Express request parameters
 */

/**
 * Extracts a string parameter from req.params, handling both string and string[] types.
 * If the parameter is an array, returns the first element.
 *
 * @param param - The parameter value from req.params (string | string[] | undefined)
 * @returns The parameter as a string, or undefined if not present
 */
export function getStringParam(param: string | string[] | undefined): string | undefined {
  if (Array.isArray(param)) {
    return param[0];
  }
  return param;
}

/**
 * Extracts a required string parameter from req.params.
 * Throws an error if the parameter is missing.
 *
 * @param param - The parameter value from req.params
 * @param paramName - The name of the parameter (for error messages)
 * @returns The parameter as a string
 * @throws Error if parameter is undefined
 */
export function getRequiredStringParam(
  param: string | string[] | undefined,
  paramName: string
): string {
  const value = getStringParam(param);
  if (!value) {
    throw new Error(`Required parameter '${paramName}' is missing`);
  }
  return value;
}
