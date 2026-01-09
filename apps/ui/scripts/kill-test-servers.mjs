/**
 * Kill any existing servers on test ports before running tests
 * This ensures the test server starts fresh with the correct API key
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SERVER_PORT = process.env.TEST_SERVER_PORT || 3008;
const UI_PORT = process.env.TEST_PORT || 3007;
const USE_EXTERNAL_SERVER = !!process.env.VITE_SERVER_URL;

async function killProcessOnPort(port) {
  try {
    const hasLsof = await execAsync('command -v lsof').then(
      () => true,
      () => false
    );

    if (hasLsof) {
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pids = stdout.trim().split('\n').filter(Boolean);

      if (pids.length > 0) {
        console.log(`[KillTestServers] Found process(es) on port ${port}: ${pids.join(', ')}`);
        for (const pid of pids) {
          try {
            await execAsync(`kill -9 ${pid}`);
            console.log(`[KillTestServers] Killed process ${pid}`);
          } catch (error) {
            // Process might have already exited
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return;
    }

    const hasFuser = await execAsync('command -v fuser').then(
      () => true,
      () => false
    );
    if (hasFuser) {
      await execAsync(`fuser -k -9 ${port}/tcp`).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return;
    }
  } catch (error) {
    // No process on port, which is fine
  }
}

async function main() {
  console.log('[KillTestServers] Checking for existing test servers...');
  if (!USE_EXTERNAL_SERVER) {
    await killProcessOnPort(Number(SERVER_PORT));
  }
  await killProcessOnPort(Number(UI_PORT));
  console.log('[KillTestServers] Done');
}

main().catch(console.error);
