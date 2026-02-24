/**
 * Worktree routes - HTTP API for git worktree operations
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { requireValidWorktree, requireValidProject, requireGitRepoOnly } from './middleware.js';
import { createInfoHandler } from './routes/info.js';
import { createStatusHandler } from './routes/status.js';
import { createListHandler } from './routes/list.js';
import { createDiffsHandler } from './routes/diffs.js';
import { createFileDiffHandler } from './routes/file-diff.js';
import { createMergeHandler } from './routes/merge.js';
import { createCreateHandler } from './routes/create.js';
import { createDeleteHandler } from './routes/delete.js';
import { createCreatePRHandler } from './routes/create-pr.js';
import { createPRInfoHandler } from './routes/pr-info.js';
import { createCommitHandler } from './routes/commit.js';
import { createGenerateCommitMessageHandler } from './routes/generate-commit-message.js';
import { createPushHandler } from './routes/push.js';
import { createPullHandler } from './routes/pull.js';
import { createCheckoutBranchHandler } from './routes/checkout-branch.js';
import { createListBranchesHandler } from './routes/list-branches.js';
import { createSwitchBranchHandler } from './routes/switch-branch.js';
import {
  createOpenInEditorHandler,
  createGetDefaultEditorHandler,
  createGetAvailableEditorsHandler,
  createRefreshEditorsHandler,
} from './routes/open-in-editor.js';
import {
  createOpenInTerminalHandler,
  createGetAvailableTerminalsHandler,
  createGetDefaultTerminalHandler,
  createRefreshTerminalsHandler,
  createOpenInExternalTerminalHandler,
} from './routes/open-in-terminal.js';
import { createInitGitHandler } from './routes/init-git.js';
import { createMigrateHandler } from './routes/migrate.js';
import { createStartDevHandler } from './routes/start-dev.js';
import { createStopDevHandler } from './routes/stop-dev.js';
import { createListDevServersHandler } from './routes/list-dev-servers.js';
import { createGetDevServerLogsHandler } from './routes/dev-server-logs.js';
import { createStartTestsHandler } from './routes/start-tests.js';
import { createStopTestsHandler } from './routes/stop-tests.js';
import { createGetTestLogsHandler } from './routes/test-logs.js';
import {
  createGetInitScriptHandler,
  createPutInitScriptHandler,
  createDeleteInitScriptHandler,
  createRunInitScriptHandler,
} from './routes/init-script.js';
import { createCommitLogHandler } from './routes/commit-log.js';
import { createDiscardChangesHandler } from './routes/discard-changes.js';
import { createListRemotesHandler } from './routes/list-remotes.js';
import { createAddRemoteHandler } from './routes/add-remote.js';
import { createStashPushHandler } from './routes/stash-push.js';
import { createStashListHandler } from './routes/stash-list.js';
import { createStashApplyHandler } from './routes/stash-apply.js';
import { createStashDropHandler } from './routes/stash-drop.js';
import { createCherryPickHandler } from './routes/cherry-pick.js';
import { createBranchCommitLogHandler } from './routes/branch-commit-log.js';
import { createGeneratePRDescriptionHandler } from './routes/generate-pr-description.js';
import { createRebaseHandler } from './routes/rebase.js';
import { createAbortOperationHandler } from './routes/abort-operation.js';
import { createContinueOperationHandler } from './routes/continue-operation.js';
import { createStageFilesHandler } from './routes/stage-files.js';
import { createCheckChangesHandler } from './routes/check-changes.js';
import { createSetTrackingHandler } from './routes/set-tracking.js';
import { createSyncHandler } from './routes/sync.js';
import { createUpdatePRNumberHandler } from './routes/update-pr-number.js';
import type { SettingsService } from '../../services/settings-service.js';

export function createWorktreeRoutes(
  events: EventEmitter,
  settingsService?: SettingsService
): Router {
  const router = Router();

  router.post('/info', validatePathParams('projectPath'), createInfoHandler());
  router.post('/status', validatePathParams('projectPath'), createStatusHandler());
  router.post('/list', createListHandler());
  router.post('/diffs', validatePathParams('projectPath'), createDiffsHandler());
  router.post('/file-diff', validatePathParams('projectPath', 'filePath'), createFileDiffHandler());
  router.post(
    '/merge',
    validatePathParams('projectPath'),
    requireValidProject,
    createMergeHandler(events)
  );
  router.post(
    '/create',
    validatePathParams('projectPath'),
    createCreateHandler(events, settingsService)
  );
  router.post('/delete', validatePathParams('projectPath', 'worktreePath'), createDeleteHandler());
  router.post('/create-pr', createCreatePRHandler());
  router.post('/pr-info', createPRInfoHandler());
  router.post(
    '/update-pr-number',
    validatePathParams('worktreePath', 'projectPath?'),
    requireValidWorktree,
    createUpdatePRNumberHandler()
  );
  router.post(
    '/commit',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createCommitHandler()
  );
  router.post(
    '/generate-commit-message',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createGenerateCommitMessageHandler(settingsService)
  );
  router.post(
    '/push',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createPushHandler()
  );
  router.post(
    '/pull',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createPullHandler()
  );
  router.post(
    '/sync',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createSyncHandler()
  );
  router.post(
    '/set-tracking',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createSetTrackingHandler()
  );
  router.post(
    '/checkout-branch',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createCheckoutBranchHandler(events)
  );
  router.post(
    '/check-changes',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createCheckChangesHandler()
  );
  router.post(
    '/list-branches',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createListBranchesHandler()
  );
  router.post(
    '/switch-branch',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createSwitchBranchHandler(events)
  );
  router.post('/open-in-editor', validatePathParams('worktreePath'), createOpenInEditorHandler());
  router.post(
    '/open-in-terminal',
    validatePathParams('worktreePath'),
    createOpenInTerminalHandler()
  );
  router.get('/default-editor', createGetDefaultEditorHandler());
  router.get('/available-editors', createGetAvailableEditorsHandler());
  router.post('/refresh-editors', createRefreshEditorsHandler());

  // External terminal routes
  router.get('/available-terminals', createGetAvailableTerminalsHandler());
  router.get('/default-terminal', createGetDefaultTerminalHandler());
  router.post('/refresh-terminals', createRefreshTerminalsHandler());
  router.post(
    '/open-in-external-terminal',
    validatePathParams('worktreePath'),
    createOpenInExternalTerminalHandler()
  );

  router.post('/init-git', validatePathParams('projectPath'), createInitGitHandler());
  router.post('/migrate', createMigrateHandler());
  router.post(
    '/start-dev',
    validatePathParams('projectPath', 'worktreePath'),
    createStartDevHandler(settingsService)
  );
  router.post('/stop-dev', createStopDevHandler());
  router.post('/list-dev-servers', createListDevServersHandler());
  router.get(
    '/dev-server-logs',
    validatePathParams('worktreePath'),
    createGetDevServerLogsHandler()
  );

  // Test runner routes
  router.post(
    '/start-tests',
    validatePathParams('worktreePath', 'projectPath?'),
    createStartTestsHandler(settingsService)
  );
  router.post('/stop-tests', createStopTestsHandler());
  router.get('/test-logs', validatePathParams('worktreePath?'), createGetTestLogsHandler());

  // Init script routes
  router.get('/init-script', createGetInitScriptHandler());
  router.put('/init-script', validatePathParams('projectPath'), createPutInitScriptHandler());
  router.delete('/init-script', validatePathParams('projectPath'), createDeleteInitScriptHandler());
  router.post(
    '/run-init-script',
    validatePathParams('projectPath', 'worktreePath'),
    createRunInitScriptHandler(events)
  );

  // Discard changes route
  router.post(
    '/discard-changes',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createDiscardChangesHandler()
  );

  // List remotes route
  router.post(
    '/list-remotes',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createListRemotesHandler()
  );

  // Add remote route
  router.post(
    '/add-remote',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createAddRemoteHandler()
  );

  // Commit log route
  router.post(
    '/commit-log',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createCommitLogHandler(events)
  );

  // Stash routes
  router.post(
    '/stash-push',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createStashPushHandler(events)
  );
  router.post(
    '/stash-list',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createStashListHandler(events)
  );
  router.post(
    '/stash-apply',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createStashApplyHandler(events)
  );
  router.post(
    '/stash-drop',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createStashDropHandler(events)
  );

  // Cherry-pick route
  router.post(
    '/cherry-pick',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createCherryPickHandler(events)
  );

  // Generate PR description route
  router.post(
    '/generate-pr-description',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createGeneratePRDescriptionHandler(settingsService)
  );

  // Branch commit log route (get commits from a specific branch)
  router.post(
    '/branch-commit-log',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createBranchCommitLogHandler(events)
  );

  // Rebase route
  router.post(
    '/rebase',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createRebaseHandler(events)
  );

  // Abort in-progress merge/rebase/cherry-pick
  router.post(
    '/abort-operation',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createAbortOperationHandler(events)
  );

  // Continue in-progress merge/rebase/cherry-pick after resolving conflicts
  router.post(
    '/continue-operation',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createContinueOperationHandler(events)
  );

  // Stage/unstage files route
  router.post(
    '/stage-files',
    validatePathParams('worktreePath', 'files[]'),
    requireGitRepoOnly,
    createStageFilesHandler()
  );

  return router;
}
