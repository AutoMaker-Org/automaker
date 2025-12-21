/**
 * Common utilities for running-agents routes
 */

import { createLogger } from "@automaker/utils";
import {
  getErrorMessage as getErrorMessageShared,
  createLogError,
} from "../common.js";

const logger = createLogger("RunningAgents");

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);
