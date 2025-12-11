import path from 'path';

/**
 * Bridge to Electron services - provides access to the same services
 * used by Electron, ensuring single source of truth for all logic
 */

// Import existing Electron services
const agentService = require(path.join(__dirname, '../../../app/electron/agent-service.js'));
const autoModeService = require(path.join(__dirname, '../../../app/electron/auto-mode-service.js'));

// Import Electron utilities if needed
const fsUtils = require('fs').promises;
const fsSync = require('fs');

export {
  agentService,
  autoModeService,
  fsUtils,
  fsSync
};
