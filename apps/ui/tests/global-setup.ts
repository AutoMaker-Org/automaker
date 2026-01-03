/**
 * Global setup for all e2e tests
 * This runs once before all tests start
 */

async function globalSetup() {
  // Note: Server killing is handled by the pretest script in package.json
  // GlobalSetup runs AFTER webServer starts, so we can't kill the server here
  console.log('[GlobalSetup] Setup complete');
}

export default globalSetup;
