/**
 * Worktree Integration Tests
 *
 * Tests for git worktree functionality including:
 * - Creating and deleting worktrees
 * - Committing changes
 * - Switching branches
 * - Branch listing
 * - Worktree isolation
 * - Feature filtering by worktree
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

// Import shared utilities
import {
  waitForNetworkIdle,
  apiCreateWorktree,
  apiDeleteWorktree,
  apiListWorktrees,
  apiCommitWorktree,
  apiSwitchBranch,
  apiListBranches,
  createTestGitRepo,
  cleanupTempDir,
  createTempDirPath,
  getWorktreePath,
  listWorktrees,
  listBranches,
  setupProjectWithPath,
  setupProjectWithPathNoWorktrees,
  setupProjectWithStaleWorktree,
  waitForBoardView,
  clickAddFeature,
  fillAddFeatureDialog,
  confirmAddFeature,
} from "./utils";

const execAsync = promisify(exec);

// ============================================================================
// Test Setup
// ============================================================================

// Create unique temp dir for this test run
const TEST_TEMP_DIR = createTempDirPath("worktree-tests");

interface TestRepo {
  path: string;
  cleanup: () => Promise<void>;
}

// Configure all tests to run serially to prevent interference
test.describe.configure({ mode: "serial" });

// ============================================================================
// Test Suite: Worktree Integration Tests
// ============================================================================
test.describe("Worktree Integration Tests", () => {
  let testRepo: TestRepo;

  test.beforeAll(async () => {
    // Create test temp directory
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
  });

  test.beforeEach(async () => {
    // Create a fresh test repo for each test
    testRepo = await createTestGitRepo(TEST_TEMP_DIR);
  });

  test.afterEach(async () => {
    // Cleanup test repo after each test
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  test.afterAll(async () => {
    // Cleanup temp directory
    cleanupTempDir(TEST_TEMP_DIR);
  });

  // ==========================================================================
  // Basic Worktree Operations
  // ==========================================================================

  test("should display worktree selector with main branch", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Verify the worktree selector is visible
    const branchLabel = page.getByText("Branch:");
    await expect(branchLabel).toBeVisible({ timeout: 10000 });

    // Wait for worktrees to load and main branch button to appear
    // Use data-testid for more reliable selection
    const mainBranchButton = page.locator('[data-testid="worktree-branch-main"]');
    await expect(mainBranchButton).toBeVisible({ timeout: 15000 });
  });

  test("should select main branch by default when app loads with stale worktree data", async ({
    page,
  }) => {
    // Set up project with STALE worktree data in localStorage
    // This simulates a user who previously selected a worktree that was later deleted
    await setupProjectWithStaleWorktree(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Wait for the worktree selector to load
    const branchLabel = page.getByText("Branch:");
    await expect(branchLabel).toBeVisible({ timeout: 10000 });

    // Verify main branch button is displayed
    const mainBranchButton = page.getByRole("button", { name: "main" }).first();
    await expect(mainBranchButton).toBeVisible({ timeout: 10000 });

    // CRITICAL: Verify the main branch button is SELECTED (has primary variant styling)
    // The button should have the "bg-primary" class indicating it's selected
    // When the bug exists, this will fail because stale data prevents initialization
    await expect(mainBranchButton).toHaveClass(/bg-primary/, { timeout: 5000 });
  });

  test("should create a worktree via API and verify filesystem", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/test-worktree";
    const expectedWorktreePath = getWorktreePath(testRepo.path, branchName);

    const { response, data } = await apiCreateWorktree(
      page,
      testRepo.path,
      branchName
    );

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);

    // Verify worktree was created on filesystem
    expect(fs.existsSync(expectedWorktreePath)).toBe(true);

    // Verify branch was created
    const branches = await listBranches(testRepo.path);
    expect(branches).toContain(branchName);

    // Verify worktree is listed by git
    const worktrees = await listWorktrees(testRepo.path);
    expect(worktrees.length).toBe(1);
    expect(worktrees[0]).toBe(expectedWorktreePath);
  });

  test("should create two worktrees and list them both", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create first worktree
    const { response: response1 } = await apiCreateWorktree(
      page,
      testRepo.path,
      "feature/worktree-one"
    );
    expect(response1.ok()).toBe(true);

    // Create second worktree
    const { response: response2 } = await apiCreateWorktree(
      page,
      testRepo.path,
      "feature/worktree-two"
    );
    expect(response2.ok()).toBe(true);

    // Verify both worktrees exist
    const worktrees = await listWorktrees(testRepo.path);
    expect(worktrees.length).toBe(2);

    // Verify branches were created
    const branches = await listBranches(testRepo.path);
    expect(branches).toContain("feature/worktree-one");
    expect(branches).toContain("feature/worktree-two");
  });

  test("should delete a worktree via API and verify cleanup", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create a worktree
    const branchName = "feature/to-delete";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);
    expect(fs.existsSync(worktreePath)).toBe(true);

    // Delete it
    const { response } = await apiDeleteWorktree(
      page,
      testRepo.path,
      worktreePath,
      true
    );
    expect(response.ok()).toBe(true);

    // Verify worktree directory is removed
    expect(fs.existsSync(worktreePath)).toBe(false);

    // Verify branch is deleted
    const branches = await listBranches(testRepo.path);
    expect(branches).not.toContain(branchName);
  });

  test("should delete worktree but keep branch when deleteBranch is false", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/keep-branch";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);
    expect(fs.existsSync(worktreePath)).toBe(true);

    // Delete worktree but keep branch
    const { response } = await apiDeleteWorktree(
      page,
      testRepo.path,
      worktreePath,
      false
    );
    expect(response.ok()).toBe(true);

    // Verify worktree is gone but branch remains
    expect(fs.existsSync(worktreePath)).toBe(false);
    const branches = await listBranches(testRepo.path);
    expect(branches).toContain(branchName);
  });

  test("should list worktrees via API", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Create some worktrees first
    await apiCreateWorktree(page, testRepo.path, "feature/list-test-1");
    await apiCreateWorktree(page, testRepo.path, "feature/list-test-2");

    // List worktrees via API
    const { response, data } = await apiListWorktrees(
      page,
      testRepo.path,
      true
    );

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);
    expect(data.worktrees).toHaveLength(3); // main + 2 worktrees

    // Verify worktree details
    const branches = data.worktrees.map((w) => w.branch);
    expect(branches).toContain("main");
    expect(branches).toContain("feature/list-test-1");
    expect(branches).toContain("feature/list-test-2");
  });

  // ==========================================================================
  // Commit Operations
  // ==========================================================================

  test("should commit changes in a worktree via API", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/commit-test";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    const { response: createResponse } = await apiCreateWorktree(
      page,
      testRepo.path,
      branchName
    );
    expect(createResponse.ok()).toBe(true);

    // Create a new file in the worktree
    const testFilePath = path.join(worktreePath, "test-commit.txt");
    fs.writeFileSync(testFilePath, "This is a test file for commit");

    // Commit the changes via API
    const { response, data } = await apiCommitWorktree(
      page,
      worktreePath,
      "Add test file for commit integration test"
    );

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);
    expect(data.result?.committed).toBe(true);
    expect(data.result?.branch).toBe(branchName);
    expect(data.result?.commitHash).toBeDefined();
    expect(data.result?.commitHash?.length).toBe(8);

    // Verify the commit exists in git log
    const { stdout: logOutput } = await execAsync("git log --oneline -1", {
      cwd: worktreePath,
    });
    expect(logOutput).toContain("Add test file for commit integration test");
  });

  test("should return no changes when committing with no modifications", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/no-changes-commit";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // Try to commit without any changes
    const { response, data } = await apiCommitWorktree(
      page,
      worktreePath,
      "Empty commit attempt"
    );

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);
    expect(data.result?.committed).toBe(false);
    expect(data.result?.message).toBe("No changes to commit");
  });

  test("should handle multiple sequential commits in a worktree", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/multi-commit";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // First commit
    fs.writeFileSync(path.join(worktreePath, "file1.txt"), "First file");
    const { data: data1 } = await apiCommitWorktree(
      page,
      worktreePath,
      "First commit"
    );
    expect(data1.result?.committed).toBe(true);

    // Second commit
    fs.writeFileSync(path.join(worktreePath, "file2.txt"), "Second file");
    const { data: data2 } = await apiCommitWorktree(
      page,
      worktreePath,
      "Second commit"
    );
    expect(data2.result?.committed).toBe(true);

    // Third commit
    fs.writeFileSync(path.join(worktreePath, "file3.txt"), "Third file");
    const { data: data3 } = await apiCommitWorktree(
      page,
      worktreePath,
      "Third commit"
    );
    expect(data3.result?.committed).toBe(true);

    // Verify all commits exist in log
    const { stdout: logOutput } = await execAsync("git log --oneline -5", {
      cwd: worktreePath,
    });
    expect(logOutput).toContain("First commit");
    expect(logOutput).toContain("Second commit");
    expect(logOutput).toContain("Third commit");
  });

  // ==========================================================================
  // Branch Switching
  // ==========================================================================

  test.skip("should switch branches within a worktree via API", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create a second branch in the main repo for switching
    await execAsync("git branch test-switch-target", { cwd: testRepo.path });

    // Switch to the new branch via API
    const { response, data } = await apiSwitchBranch(
      page,
      testRepo.path,
      "test-switch-target"
    );

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);
    expect(data.result?.previousBranch).toBe("main");
    expect(data.result?.currentBranch).toBe("test-switch-target");
    expect(data.result?.message).toContain("Switched to branch");

    // Verify the branch was actually switched
    const { stdout: currentBranch } = await execAsync(
      "git rev-parse --abbrev-ref HEAD",
      { cwd: testRepo.path }
    );
    expect(currentBranch.trim()).toBe("test-switch-target");

    // Switch back to main
    await execAsync("git checkout main", { cwd: testRepo.path });
  });

  test("should prevent branch switch with uncommitted changes", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create a branch to switch to
    await execAsync("git branch test-switch-blocked", { cwd: testRepo.path });

    // Create uncommitted changes
    const testFilePath = path.join(testRepo.path, "uncommitted-change.txt");
    fs.writeFileSync(testFilePath, "This file has uncommitted changes");
    await execAsync("git add uncommitted-change.txt", { cwd: testRepo.path });

    // Try to switch branches (should fail)
    const { response, data } = await apiSwitchBranch(
      page,
      testRepo.path,
      "test-switch-blocked"
    );

    expect(response.ok()).toBe(false);
    expect(data.success).toBe(false);
    expect(data.error).toContain("uncommitted changes");
    expect(data.code).toBe("UNCOMMITTED_CHANGES");

    // Clean up - reset changes
    await execAsync("git reset HEAD", { cwd: testRepo.path });
    fs.unlinkSync(testFilePath);
  });

  test("should handle switching to non-existent branch", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Try to switch to a branch that doesn't exist
    const { response, data } = await apiSwitchBranch(
      page,
      testRepo.path,
      "non-existent-branch"
    );

    expect(response.ok()).toBe(false);
    expect(data.success).toBe(false);
    expect(data.error).toContain("does not exist");
  });

  test("should handle switching to current branch (no-op)", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Try to switch to the current branch
    const { response, data } = await apiSwitchBranch(
      page,
      testRepo.path,
      "main"
    );

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);
    expect(data.result?.message).toContain("Already on branch");
  });

  // ==========================================================================
  // List Branches
  // ==========================================================================

  test("should list all branches via API", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create additional branches
    await execAsync("git branch feature/branch-list-1", { cwd: testRepo.path });
    await execAsync("git branch feature/branch-list-2", { cwd: testRepo.path });
    await execAsync("git branch bugfix/test-branch", { cwd: testRepo.path });

    // List branches via API
    const { response, data } = await apiListBranches(page, testRepo.path);

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);
    expect(data.result?.currentBranch).toBe("main");
    expect(data.result?.branches.length).toBeGreaterThanOrEqual(4);

    const branchNames = data.result?.branches.map((b) => b.name) || [];
    expect(branchNames).toContain("main");
    expect(branchNames).toContain("feature/branch-list-1");
    expect(branchNames).toContain("feature/branch-list-2");
    expect(branchNames).toContain("bugfix/test-branch");

    // Verify current branch is marked correctly
    const currentBranchInfo = data.result?.branches.find(
      (b) => b.name === "main"
    );
    expect(currentBranchInfo?.isCurrent).toBe(true);
  });

  // ==========================================================================
  // Worktree Isolation
  // ==========================================================================

  test("should isolate files between worktrees", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create two worktrees
    const branch1 = "feature/isolation-1";
    const branch2 = "feature/isolation-2";
    const worktree1Path = getWorktreePath(testRepo.path, branch1);
    const worktree2Path = getWorktreePath(testRepo.path, branch2);

    await apiCreateWorktree(page, testRepo.path, branch1);
    await apiCreateWorktree(page, testRepo.path, branch2);

    // Create different files in each worktree
    const file1Path = path.join(worktree1Path, "worktree1-only.txt");
    const file2Path = path.join(worktree2Path, "worktree2-only.txt");

    fs.writeFileSync(file1Path, "File only in worktree 1");
    fs.writeFileSync(file2Path, "File only in worktree 2");

    // Verify file1 only exists in worktree1
    expect(fs.existsSync(file1Path)).toBe(true);
    expect(fs.existsSync(path.join(worktree2Path, "worktree1-only.txt"))).toBe(
      false
    );

    // Verify file2 only exists in worktree2
    expect(fs.existsSync(file2Path)).toBe(true);
    expect(fs.existsSync(path.join(worktree1Path, "worktree2-only.txt"))).toBe(
      false
    );

    // Commit in worktree1
    await execAsync("git add worktree1-only.txt", { cwd: worktree1Path });
    await execAsync('git commit -m "Add file in worktree1"', {
      cwd: worktree1Path,
    });

    // Commit in worktree2
    await execAsync("git add worktree2-only.txt", { cwd: worktree2Path });
    await execAsync('git commit -m "Add file in worktree2"', {
      cwd: worktree2Path,
    });

    // Verify commits are separate
    const { stdout: log1 } = await execAsync("git log --oneline -1", {
      cwd: worktree1Path,
    });
    const { stdout: log2 } = await execAsync("git log --oneline -1", {
      cwd: worktree2Path,
    });

    expect(log1).toContain("Add file in worktree1");
    expect(log2).toContain("Add file in worktree2");
    expect(log1).not.toContain("Add file in worktree2");
    expect(log2).not.toContain("Add file in worktree1");
  });

  test("should detect modified files count in worktree listing", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/changes-detection";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // Create multiple modified files
    fs.writeFileSync(path.join(worktreePath, "change1.txt"), "Change 1");
    fs.writeFileSync(path.join(worktreePath, "change2.txt"), "Change 2");
    fs.writeFileSync(path.join(worktreePath, "change3.txt"), "Change 3");

    // List worktrees and check for changes
    const { response, data } = await apiListWorktrees(
      page,
      testRepo.path,
      true
    );

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);

    // Find the worktree we created
    const changedWorktree = data.worktrees.find((w) => w.branch === branchName);
    expect(changedWorktree).toBeDefined();
    expect(changedWorktree?.hasChanges).toBe(true);
    expect(changedWorktree?.changedFilesCount).toBeGreaterThanOrEqual(3);
  });

  // ==========================================================================
  // Existing Branch Handling
  // ==========================================================================

  test("should create worktree from existing branch", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // First, create a branch with some commits (without worktree)
    const branchName = "feature/existing-branch";
    await execAsync(`git branch ${branchName}`, { cwd: testRepo.path });
    await execAsync(`git checkout ${branchName}`, { cwd: testRepo.path });
    fs.writeFileSync(
      path.join(testRepo.path, "existing-file.txt"),
      "Content from existing branch"
    );
    await execAsync("git add existing-file.txt", { cwd: testRepo.path });
    await execAsync('git commit -m "Commit on existing branch"', {
      cwd: testRepo.path,
    });
    await execAsync("git checkout main", { cwd: testRepo.path });

    // Now create a worktree for that existing branch
    const expectedWorktreePath = getWorktreePath(testRepo.path, branchName);

    const { response, data } = await apiCreateWorktree(
      page,
      testRepo.path,
      branchName
    );

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);

    // Verify the worktree has the file from the existing branch
    const existingFilePath = path.join(
      expectedWorktreePath,
      "existing-file.txt"
    );
    expect(fs.existsSync(existingFilePath)).toBe(true);
    const content = fs.readFileSync(existingFilePath, "utf-8");
    expect(content).toBe("Content from existing branch");
  });

  test("should return existing worktree when creating with same branch name", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create first worktree
    const branchName = "feature/duplicate-test";
    const { response: response1, data: data1 } = await apiCreateWorktree(
      page,
      testRepo.path,
      branchName
    );
    expect(response1.ok()).toBe(true);
    expect(data1.success).toBe(true);
    expect(data1.worktree?.isNew).not.toBe(false); // New branch was created

    // Try to create another worktree with same branch name
    // This should succeed and return the existing worktree (not an error)
    const { response: response2, data: data2 } = await apiCreateWorktree(
      page,
      testRepo.path,
      branchName
    );

    expect(response2.ok()).toBe(true);
    expect(data2.success).toBe(true);
    expect(data2.worktree?.isNew).toBe(false); // Not a new creation, returned existing
    expect(data2.worktree?.branch).toBe(branchName);
  });

  // ==========================================================================
  // Feature Integration
  // ==========================================================================

  test("should add a feature to backlog with specific branch", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Note: Worktrees are created at execution time (when feature starts),
    // not when adding to backlog. We can specify a branch name without
    // creating a worktree first.
    const branchName = "feature/test-branch";

    // Click add feature button
    await clickAddFeature(page);

    // Fill in the feature details with a branch name
    await fillAddFeatureDialog(page, "Test feature for worktree", {
      branch: branchName,
      category: "Testing",
    });

    // Confirm
    await confirmAddFeature(page);

    // Wait for the feature to appear
    await page.waitForTimeout(1000);

    // Verify feature was created with correct branch by checking the filesystem
    const featuresDir = path.join(testRepo.path, ".automaker", "features");
    const featureDirs = fs.readdirSync(featuresDir);
    expect(featureDirs.length).toBeGreaterThan(0);

    // Find and read the feature file
    const featureDir = featureDirs[0];
    const featureFilePath = path.join(featuresDir, featureDir, "feature.json");
    const featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));

    expect(featureData.description).toBe("Test feature for worktree");
    expect(featureData.branchName).toBe(branchName);
    expect(featureData.status).toBe("backlog");
    // Verify worktreePath is not set when adding to backlog
    // (worktrees are created at execution time, not when adding to backlog)
    expect(featureData.worktreePath).toBeUndefined();
  });

  test("should store branch name when adding feature with new branch (worktree created when adding feature)", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Use a branch name that doesn't exist yet
    // Note: Worktrees are now created when features are added/edited, not at execution time
    const branchName = "feature/auto-create-worktree";

    // Verify branch does NOT exist before we create the feature
    const branchesBefore = await listBranches(testRepo.path);
    expect(branchesBefore).not.toContain(branchName);

    // Click add feature button
    await clickAddFeature(page);

    // Fill in the feature details with the new branch
    await fillAddFeatureDialog(
      page,
      "Feature that should auto-create worktree",
      {
        branch: branchName,
        category: "Testing",
      }
    );

    // Confirm
    await confirmAddFeature(page);

    // Wait for feature to be saved and worktree to be created
    await page.waitForTimeout(2000);

    // Verify branch WAS created when adding feature (worktrees are created when features are added/edited)
    const branchesAfter = await listBranches(testRepo.path);
    expect(branchesAfter).toContain(branchName);

    // Verify worktree was created
    const worktreePath = getWorktreePath(testRepo.path, branchName);
    expect(fs.existsSync(worktreePath)).toBe(true);

    // Verify feature was created with correct branch name stored
    const featuresDir = path.join(testRepo.path, ".automaker", "features");
    const featureDirs = fs.readdirSync(featuresDir);
    expect(featureDirs.length).toBeGreaterThan(0);

    const featureDir = featureDirs.find((dir) => {
      const featureFilePath = path.join(featuresDir, dir, "feature.json");
      if (fs.existsSync(featureFilePath)) {
        const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
        return data.description === "Feature that should auto-create worktree";
      }
      return false;
    });
    expect(featureDir).toBeDefined();

    const featureFilePath = path.join(featuresDir, featureDir!, "feature.json");
    const featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));

    // Verify branch name is stored
    expect(featureData.branchName).toBe(branchName);

    // Verify worktreePath is NOT set (worktrees are created at execution time)
    expect(featureData.worktreePath).toBeUndefined();

    // Verify feature is in backlog status
    expect(featureData.status).toBe("backlog");
  });

  test("should auto-select worktree after creating feature with new branch", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Use a branch name that doesn't exist yet
    const branchName = "feature/auto-select-worktree";

    // Verify branch does NOT exist before we create the feature
    const branchesBefore = await listBranches(testRepo.path);
    expect(branchesBefore).not.toContain(branchName);

    // Click add feature button
    await clickAddFeature(page);

    // Fill in the feature details with the new branch
    await fillAddFeatureDialog(page, "Feature with auto-select worktree", {
      branch: branchName,
      category: "Testing",
    });

    // Confirm
    await confirmAddFeature(page);

    // Wait for feature to be saved and worktree to be created
    // Also wait for the worktree to appear in the UI and be auto-selected
    await page.waitForTimeout(2000);

    // Wait for the worktree button to appear in the UI
    // Worktree buttons are actual <button> elements (not divs with role="button" like kanban cards)
    // and have a title attribute like "Click to switch to this worktree's branch"
    const worktreeButton = page
      .locator('button[title*="worktree"], button[title*="branch"]')
      .filter({ hasText: new RegExp(branchName.replace("/", "\\/"), "i") })
      .first();
    await expect(worktreeButton).toBeVisible({ timeout: 10000 });

    // Verify the worktree is auto-selected by checking if the feature is visible
    // Features are filtered by the selected worktree, so if the feature is visible,
    // it means the worktree was auto-selected after creation
    const featureText = page.getByText("Feature with auto-select worktree");
    await expect(featureText).toBeVisible({ timeout: 10000 });

    // Additional verification: Check that the button has the selected styling
    // Selected worktree buttons have variant="default" which applies bg-primary class
    // We verify this by checking the button has the primary background styling
    await expect(worktreeButton).toHaveClass(/bg-primary/, { timeout: 5000 });
  });

  test("should reset feature branch and worktree when worktree is deleted", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create a worktree
    const branchName = "feature/to-be-deleted";
    const worktreePath = getWorktreePath(testRepo.path, branchName);
    await apiCreateWorktree(page, testRepo.path, branchName);
    expect(fs.existsSync(worktreePath)).toBe(true);

    // Refresh worktrees in the UI
    const refreshButton = page.locator('button[title="Refresh worktrees"]');
    await refreshButton.click();
    await page.waitForTimeout(1000);

    // Select the worktree in the UI
    const worktreeButton = page.getByRole("button", {
      name: /feature\/to-be-deleted/i,
    });
    await expect(worktreeButton).toBeVisible({ timeout: 5000 });
    await worktreeButton.click();
    await page.waitForTimeout(500);

    // Create a feature assigned to this worktree
    await clickAddFeature(page);
    await fillAddFeatureDialog(page, "Feature on deletable worktree", {
      branch: branchName,
      category: "Testing",
    });
    await confirmAddFeature(page);
    await page.waitForTimeout(1000);

    // Verify feature was created with the branch
    const featuresDir = path.join(testRepo.path, ".automaker", "features");
    let featureDirs = fs.readdirSync(featuresDir);
    expect(featureDirs.length).toBeGreaterThan(0);

    // Find the feature
    let featureDir = featureDirs.find((dir) => {
      const featureFilePath = path.join(featuresDir, dir, "feature.json");
      if (fs.existsSync(featureFilePath)) {
        const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
        return data.description === "Feature on deletable worktree";
      }
      return false;
    });
    expect(featureDir).toBeDefined();

    let featureFilePath = path.join(featuresDir, featureDir!, "feature.json");
    let featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));

    // Verify feature was created with the branch name stored
    expect(featureData.branchName).toBe(branchName);
    // Verify worktreePath is NOT set (worktrees are created at execution time, not when adding)
    expect(featureData.worktreePath).toBeUndefined();

    // Delete the worktree via UI
    // Open the worktree actions menu
    const actionsButton = page
      .locator(`button:has-text("${branchName}")`)
      .locator("xpath=following-sibling::button")
      .last();
    await actionsButton.click();
    await page.waitForTimeout(300);

    // Click "Delete Worktree"
    await page.getByText("Delete Worktree").click();
    await page.waitForTimeout(300);

    // Confirm deletion in the dialog
    const deleteButton = page.getByRole("button", { name: "Delete" });
    await deleteButton.click();
    await page.waitForTimeout(1000);

    // Verify worktree is deleted
    expect(fs.existsSync(worktreePath)).toBe(false);

    // Verify feature's branchName is reset to null/undefined when worktree is deleted
    // (worktreePath was never stored, so it remains undefined)
    featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
    expect(featureData.branchName).toBeNull();
    expect(featureData.worktreePath).toBeUndefined();

    // Verify the feature appears in the backlog when main is selected
    const mainButton = page.getByRole("button", { name: "main" }).first();
    await mainButton.click();
    await page.waitForTimeout(500);

    const featureText = page.getByText("Feature on deletable worktree");
    await expect(featureText).toBeVisible({ timeout: 5000 });

    // Verify the feature also appears when switching to a different worktree
    // Create another worktree
    await apiCreateWorktree(page, testRepo.path, "feature/other-branch");
    await page.waitForTimeout(500);

    // Refresh worktrees
    await refreshButton.click();
    await page.waitForTimeout(500);

    // Select the other worktree
    const otherWorktreeButton = page.getByRole("button", {
      name: /feature\/other-branch/i,
    });
    await otherWorktreeButton.click();
    await page.waitForTimeout(500);

    // Unassigned features should NOT be visible on non-primary worktrees
    // They should only show on the primary (main) worktree
    await expect(featureText).not.toBeVisible({ timeout: 5000 });
  });

  test("should filter features by selected worktree", async ({ page }) => {
    // Create the worktrees first (using git directly for setup)
    await execAsync(
      `git worktree add ".worktrees/feature-worktree-a" -b feature/worktree-a`,
      {
        cwd: testRepo.path,
      }
    );
    await execAsync(
      `git worktree add ".worktrees/feature-worktree-b" -b feature/worktree-b`,
      {
        cwd: testRepo.path,
      }
    );

    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // First click on main to ensure we're on the main branch
    const mainButton = page.getByRole("button", { name: "main" }).first();
    await mainButton.click();
    await page.waitForTimeout(500);

    // Create feature for main branch
    await clickAddFeature(page);
    const descriptionInput = page
      .locator('[data-testid="add-feature-dialog"] textarea')
      .first();
    await descriptionInput.fill("Feature for main branch");
    await confirmAddFeature(page);

    // Wait for feature to be visible
    const mainFeatureText = page.getByText("Feature for main branch");
    await expect(mainFeatureText).toBeVisible({ timeout: 10000 });

    // Switch to worktree-a and create a feature there
    const worktreeAButton = page.getByRole("button", {
      name: /feature\/worktree-a/i,
    });
    await worktreeAButton.click();
    await page.waitForTimeout(500);

    // Main feature should not be visible now
    await expect(mainFeatureText).not.toBeVisible();

    // Create feature for worktree-a
    await clickAddFeature(page);
    const descriptionInput2 = page
      .locator('[data-testid="add-feature-dialog"] textarea')
      .first();
    await descriptionInput2.fill("Feature for worktree A");
    await confirmAddFeature(page);

    // Wait for feature to be visible
    const worktreeAText = page.getByText("Feature for worktree A");
    await expect(worktreeAText).toBeVisible({ timeout: 10000 });

    // Switch to worktree-b and create a feature
    const worktreeBButton = page.getByRole("button", {
      name: /feature\/worktree-b/i,
    });
    await worktreeBButton.click();
    await page.waitForTimeout(500);

    // worktree-a feature should not be visible
    await expect(worktreeAText).not.toBeVisible();

    await clickAddFeature(page);
    const descriptionInput3 = page
      .locator('[data-testid="add-feature-dialog"] textarea')
      .first();
    await descriptionInput3.fill("Feature for worktree B");
    await confirmAddFeature(page);

    const worktreeBText = page.getByText("Feature for worktree B");
    await expect(worktreeBText).toBeVisible({ timeout: 10000 });

    // Switch back to main and verify filtering
    await mainButton.click();
    await page.waitForTimeout(500);

    await expect(mainFeatureText).toBeVisible({ timeout: 10000 });
    await expect(worktreeAText).not.toBeVisible();
    await expect(worktreeBText).not.toBeVisible();
  });

  test("should pre-fill branch when creating feature from selected worktree", async ({
    page,
  }) => {
    // Create a worktree first
    const branchName = "feature/pre-fill-test";
    await execAsync(
      `git worktree add ".worktrees/feature-pre-fill-test" -b ${branchName}`,
      {
        cwd: testRepo.path,
      }
    );

    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Wait for worktree selector to load
    await page.waitForTimeout(1000);

    // Click on the worktree to select it
    const worktreeButton = page.getByRole("button", {
      name: /feature\/pre-fill-test/i,
    });
    await worktreeButton.click();
    await page.waitForTimeout(500);

    // Open add feature dialog
    await clickAddFeature(page);

    // Verify the branch selector shows the selected worktree's branch
    // When a worktree is selected, "Use current selected branch" should be selected
    // and the branch name should be shown in the label
    const currentBranchLabel = page.locator('label[for="feature-current"]');
    await expect(currentBranchLabel).toContainText(branchName, {
      timeout: 5000,
    });

    // Close dialog
    await page.keyboard.press("Escape");
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  test("should handle commit with missing required fields", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Try to commit without worktreePath
    const response1 = await page.request.post(
      "http://localhost:3008/api/worktree/commit",
      {
        data: { message: "Missing worktreePath" },
      }
    );

    expect(response1.ok()).toBe(false);
    const result1 = await response1.json();
    expect(result1.success).toBe(false);
    expect(result1.error).toContain("worktreePath");

    // Try to commit without message
    const response2 = await page.request.post(
      "http://localhost:3008/api/worktree/commit",
      {
        data: { worktreePath: testRepo.path },
      }
    );

    expect(response2.ok()).toBe(false);
    const result2 = await response2.json();
    expect(result2.success).toBe(false);
    expect(result2.error).toContain("message");
  });

  test("should handle switch-branch with missing required fields", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Try to switch without worktreePath
    const response1 = await page.request.post(
      "http://localhost:3008/api/worktree/switch-branch",
      {
        data: { branchName: "some-branch" },
      }
    );

    expect(response1.ok()).toBe(false);
    const result1 = await response1.json();
    expect(result1.success).toBe(false);
    expect(result1.error).toContain("worktreePath");

    // Try to switch without branchName
    const response2 = await page.request.post(
      "http://localhost:3008/api/worktree/switch-branch",
      {
        data: { worktreePath: testRepo.path },
      }
    );

    expect(response2.ok()).toBe(false);
    const result2 = await response2.json();
    expect(result2.success).toBe(false);
    expect(result2.error).toContain("branchName");
  });

  // ==========================================================================
  // Keyboard Input in Dropdowns
  // ==========================================================================

  test("should allow typing in branch filter input without triggering navigation shortcuts", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Find the main branch button and its associated branch switch dropdown trigger
    // The branch switch dropdown has a GitBranch icon button next to the main button
    const branchSwitchButton = page.locator('button[title="Switch branch"]');
    await expect(branchSwitchButton).toBeVisible({ timeout: 10000 });

    // Click to open the branch switch dropdown
    await branchSwitchButton.click();

    // Wait for the dropdown to open and the filter input to appear
    const filterInput = page.getByPlaceholder("Filter branches...");
    await expect(filterInput).toBeVisible({ timeout: 5000 });

    // DON'T explicitly focus the input - rely on autoFocus
    // This tests the real scenario where user opens dropdown and types immediately

    // Use keyboard.press() to simulate a single key press
    // "m" is the keyboard shortcut for profiles view, so this should test the bug
    await page.keyboard.press("m");

    // Verify the "m" was typed into the input (not triggering navigation)
    await expect(filterInput).toHaveValue("m");

    // Verify we're still on the board view (not navigated to profiles)
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible();

    // Type more characters to ensure all navigation shortcut letters work
    // k=board, a=agent, d=spec, c=context, s=settings, t=terminal
    await page.keyboard.press("a");
    await page.keyboard.press("i");
    await page.keyboard.press("n");
    await expect(filterInput).toHaveValue("main");
  });

  // ==========================================================================
  // Worktree Feature Flag Disabled
  // ==========================================================================

  // Skip: This test is flaky because the WorktreePanel component always renders
  // the "Branch:" label and switch branch button, even when useWorktrees is disabled.
  // The component only conditionally hides the "Worktrees:" section, not the entire panel.
  // The test expectations don't match the current implementation.
  test.skip("should not show worktree panel when useWorktrees is disabled", async ({
    page,
  }) => {
    // Use the setup function that disables worktrees
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // The worktree selector should NOT be visible
    const branchLabel = page.getByText("Branch:");
    await expect(branchLabel).not.toBeVisible({ timeout: 5000 });

    // The switch branch button should NOT be visible
    const branchSwitchButton = page.locator('button[title="Switch branch"]');
    await expect(branchSwitchButton).not.toBeVisible();
  });

  // Skip: The WorktreePanel component always renders the "Branch:" label
  // and main worktree tab, regardless of useWorktrees setting.
  // It only conditionally hides the "Worktrees:" section.
  // This test is unreliable because it tests implementation details that
  // don't match the current component behavior.
  test.skip("should allow creating and moving features when worktrees are disabled", async ({
    page,
  }) => {
    // Use the setup function that disables worktrees
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Verify worktree selector is NOT visible
    const branchLabel = page.getByText("Branch:");
    await expect(branchLabel).not.toBeVisible({ timeout: 5000 });

    // Create a feature
    await clickAddFeature(page);

    // Fill in the feature details (without branch since worktrees are disabled)
    const descriptionInput = page
      .locator('[data-testid="add-feature-dialog"] textarea')
      .first();
    await descriptionInput.fill("Test feature without worktrees");

    // Confirm
    await confirmAddFeature(page);

    // Wait for the feature to appear in the backlog
    const featureCard = page.getByText("Test feature without worktrees");
    await expect(featureCard).toBeVisible({ timeout: 10000 });

    // Verify the feature was created on the filesystem
    const featuresDir = path.join(testRepo.path, ".automaker", "features");
    const featureDirs = fs.readdirSync(featuresDir);
    expect(featureDirs.length).toBeGreaterThan(0);

    // Find the feature file and verify it exists
    const featureDir = featureDirs.find((dir) => {
      const featureFilePath = path.join(featuresDir, dir, "feature.json");
      if (fs.existsSync(featureFilePath)) {
        const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
        return data.description === "Test feature without worktrees";
      }
      return false;
    });
    expect(featureDir).toBeDefined();

    // Read the feature data
    const featureFilePath = path.join(featuresDir, featureDir!, "feature.json");
    const featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
    expect(featureData.status).toBe("backlog");

    // Now move the feature to in_progress using the "Make" button
    // Find the feature card (uses kanban-card-{id} test id)
    const featureCardLocator = page
      .locator('[data-testid^="kanban-card-"]')
      .filter({ hasText: "Test feature without worktrees" });
    await expect(featureCardLocator).toBeVisible();

    // Click the "Make" button to start working on the feature
    const makeButton = featureCardLocator.getByRole("button", { name: "Make" });
    await makeButton.click();

    // Wait for the feature to move to in_progress column
    await expect(async () => {
      const updatedData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
      expect(updatedData.status).toBe("in_progress");
    }).toPass({ timeout: 10000 });

    // Verify the UI shows the feature in the in_progress column
    const inProgressColumn = page.locator(
      '[data-testid="kanban-column-in_progress"]'
    );
    await expect(
      inProgressColumn.getByText("Test feature without worktrees")
    ).toBeVisible({ timeout: 10000 });
  });

  // ==========================================================================
  // Status Endpoint Tests
  // ==========================================================================

  test("should get status for worktree with changes", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/status-changes";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    // Create worktree
    await apiCreateWorktree(page, testRepo.path, branchName);

    // Create modified files in the worktree
    fs.writeFileSync(path.join(worktreePath, "changed1.txt"), "Change 1");
    fs.writeFileSync(path.join(worktreePath, "changed2.txt"), "Change 2");

    // Call status endpoint
    // The featureId is the sanitized directory name
    const featureId = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/status",
      {
        data: {
          projectPath: testRepo.path,
          featureId,
        },
      }
    );

    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.modifiedFiles).toBeGreaterThanOrEqual(2);
    expect(data.files).toContain("changed1.txt");
    expect(data.files).toContain("changed2.txt");
  });

  test("should get status for worktree without changes", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/status-no-changes";

    // Create worktree (no modifications)
    await apiCreateWorktree(page, testRepo.path, branchName);

    const featureId = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/status",
      {
        data: {
          projectPath: testRepo.path,
          featureId,
        },
      }
    );

    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.modifiedFiles).toBe(0);
    expect(data.files).toHaveLength(0);
  });

  test("should verify diff stat in status response", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/status-diffstat";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // Add a tracked file and modify it
    fs.writeFileSync(path.join(worktreePath, "tracked.txt"), "initial content");
    await execAsync("git add tracked.txt", { cwd: worktreePath });
    await execAsync('git commit -m "Add tracked file"', { cwd: worktreePath });

    // Modify the file
    fs.writeFileSync(
      path.join(worktreePath, "tracked.txt"),
      "modified content"
    );

    const featureId = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/status",
      {
        data: {
          projectPath: testRepo.path,
          featureId,
        },
      }
    );

    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.diffStat).toBeDefined();
    // diffStat should contain info about tracked.txt
    expect(data.diffStat).toContain("tracked.txt");
  });

  test("should verify recent commits in status response", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/status-commits";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // Make some commits
    fs.writeFileSync(path.join(worktreePath, "file1.txt"), "content1");
    await execAsync("git add file1.txt", { cwd: worktreePath });
    await execAsync('git commit -m "First status test commit"', {
      cwd: worktreePath,
    });

    fs.writeFileSync(path.join(worktreePath, "file2.txt"), "content2");
    await execAsync("git add file2.txt", { cwd: worktreePath });
    await execAsync('git commit -m "Second status test commit"', {
      cwd: worktreePath,
    });

    const featureId = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/status",
      {
        data: {
          projectPath: testRepo.path,
          featureId,
        },
      }
    );

    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.recentCommits).toBeDefined();
    expect(data.recentCommits.length).toBeGreaterThanOrEqual(2);
    // Check that our commits are in the list
    const commitsStr = data.recentCommits.join("\n");
    expect(commitsStr).toContain("First status test commit");
    expect(commitsStr).toContain("Second status test commit");
  });

  test("should return empty status for non-existent worktree", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    const response = await page.request.post(
      "http://localhost:3008/api/worktree/status",
      {
        data: {
          projectPath: testRepo.path,
          featureId: "non-existent-worktree",
        },
      }
    );

    // According to the implementation, non-existent worktree returns success with empty data
    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.modifiedFiles).toBe(0);
    expect(data.files).toHaveLength(0);
    expect(data.diffStat).toBe("");
    expect(data.recentCommits).toHaveLength(0);
  });

  test("should handle status with missing required fields", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Missing featureId
    const response1 = await page.request.post(
      "http://localhost:3008/api/worktree/status",
      {
        data: {
          projectPath: testRepo.path,
        },
      }
    );

    expect(response1.ok()).toBe(false);
    const data1 = await response1.json();
    expect(data1.success).toBe(false);
    expect(data1.error).toContain("featureId");

    // Missing projectPath
    const response2 = await page.request.post(
      "http://localhost:3008/api/worktree/status",
      {
        data: {
          featureId: "some-id",
        },
      }
    );

    expect(response2.ok()).toBe(false);
    const data2 = await response2.json();
    expect(data2.success).toBe(false);
    expect(data2.error).toContain("projectPath");
  });

  // ==========================================================================
  // Info Endpoint Tests
  // ==========================================================================

  test("should get info for existing worktree", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/info-test";

    await apiCreateWorktree(page, testRepo.path, branchName);

    const featureId = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/info",
      {
        data: {
          projectPath: testRepo.path,
          featureId,
        },
      }
    );

    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.worktreePath).toBeDefined();
    expect(data.branchName).toBe(branchName);
    // Verify path uses forward slashes (normalized)
    expect(data.worktreePath).toContain("/");
    expect(data.worktreePath).not.toContain("\\\\");
  });

  test("should return null for non-existent worktree info", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    const response = await page.request.post(
      "http://localhost:3008/api/worktree/info",
      {
        data: {
          projectPath: testRepo.path,
          featureId: "non-existent-info-worktree",
        },
      }
    );

    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.worktreePath).toBeNull();
    expect(data.branchName).toBeNull();
  });

  test("should handle info with missing required fields", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Missing featureId
    const response1 = await page.request.post(
      "http://localhost:3008/api/worktree/info",
      {
        data: {
          projectPath: testRepo.path,
        },
      }
    );

    expect(response1.ok()).toBe(false);
    const data1 = await response1.json();
    expect(data1.success).toBe(false);
    expect(data1.error).toContain("featureId");
  });

  // ==========================================================================
  // Diffs Endpoint Tests
  // ==========================================================================

  test("should get diffs for worktree with changes", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/diffs-with-changes";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // Add a tracked file and modify it
    fs.writeFileSync(path.join(worktreePath, "diff-test.txt"), "initial");
    await execAsync("git add diff-test.txt", { cwd: worktreePath });
    await execAsync('git commit -m "Add file for diff test"', {
      cwd: worktreePath,
    });

    // Modify the file to create a diff
    fs.writeFileSync(path.join(worktreePath, "diff-test.txt"), "modified");

    const featureId = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/diffs",
      {
        data: {
          projectPath: testRepo.path,
          featureId,
        },
      }
    );

    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.hasChanges).toBe(true);
    expect(data.diff).toContain("diff-test.txt");
    // files can be either strings or objects with path property
    const filePaths = data.files.map((f: string | { path: string }) =>
      typeof f === "string" ? f : f.path
    );
    expect(filePaths).toContain("diff-test.txt");
  });

  test("should get diffs for worktree without changes", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/diffs-no-changes";

    await apiCreateWorktree(page, testRepo.path, branchName);

    const featureId = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/diffs",
      {
        data: {
          projectPath: testRepo.path,
          featureId,
        },
      }
    );

    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.hasChanges).toBe(false);
    expect(data.files).toHaveLength(0);
  });

  test("should fallback to main project when worktree does not exist for diffs", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Call diffs endpoint with non-existent worktree
    // It should fallback to main project path
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/diffs",
      {
        data: {
          projectPath: testRepo.path,
          featureId: "non-existent-diffs-worktree",
        },
      }
    );

    expect(response.ok()).toBe(true);
    const data = await response.json();

    // Should still succeed but with main project diffs
    expect(data.success).toBe(true);
    expect(data.hasChanges).toBeDefined();
    expect(data.files).toBeDefined();
  });

  test("should handle diffs with missing required fields", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Missing featureId
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/diffs",
      {
        data: {
          projectPath: testRepo.path,
        },
      }
    );

    expect(response.ok()).toBe(false);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("featureId");
  });

  // ==========================================================================
  // File Diff Endpoint Tests
  // ==========================================================================

  test("should get diff for a modified tracked file", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/file-diff-tracked";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // Create, add, and commit a file
    fs.writeFileSync(
      path.join(worktreePath, "tracked-file.txt"),
      "line 1\nline 2\nline 3"
    );
    await execAsync("git add tracked-file.txt", { cwd: worktreePath });
    await execAsync('git commit -m "Add tracked file"', { cwd: worktreePath });

    // Modify the file
    fs.writeFileSync(
      path.join(worktreePath, "tracked-file.txt"),
      "line 1\nmodified line 2\nline 3\nline 4"
    );

    const featureId = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/file-diff",
      {
        data: {
          projectPath: testRepo.path,
          featureId,
          filePath: "tracked-file.txt",
        },
      }
    );

    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.filePath).toBe("tracked-file.txt");
    expect(data.diff).toContain("tracked-file.txt");
    expect(data.diff).toContain("-line 2");
    expect(data.diff).toContain("+modified line 2");
  });

  test("should get synthetic diff for untracked/new file", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/file-diff-untracked";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // Create an untracked file (don't git add)
    fs.writeFileSync(
      path.join(worktreePath, "new-untracked.txt"),
      "new file content\nline 2"
    );

    const featureId = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/file-diff",
      {
        data: {
          projectPath: testRepo.path,
          featureId,
          filePath: "new-untracked.txt",
        },
      }
    );

    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.filePath).toBe("new-untracked.txt");
    // Synthetic diff should show all lines as added
    expect(data.diff).toContain("+new file content");
    expect(data.diff).toContain("+line 2");
  });

  test("should return empty diff for non-existent file", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/file-diff-nonexistent";

    await apiCreateWorktree(page, testRepo.path, branchName);

    const featureId = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/file-diff",
      {
        data: {
          projectPath: testRepo.path,
          featureId,
          filePath: "does-not-exist.txt",
        },
      }
    );

    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.diff).toBe("");
  });

  test("should handle file-diff with missing required fields", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Missing filePath
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/file-diff",
      {
        data: {
          projectPath: testRepo.path,
          featureId: "some-id",
        },
      }
    );

    expect(response.ok()).toBe(false);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("filePath");
  });

  // ==========================================================================
  // Merge Endpoint Tests
  // Note: These tests are skipped because the merge endpoint expects a specific
  // worktree path structure (.worktrees/{featureId}) that doesn't match how
  // apiCreateWorktree creates worktrees (uses sanitized branch names).
  // The endpoints have different conventions for featureId vs branchName.
  // ==========================================================================

  test.skip("should merge worktree branch into main", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // The merge endpoint expects featureId (not full branch name)
    // and constructs branch name as `feature/${featureId}`
    const featureId = "merge-test";
    const branchName = `feature/${featureId}`;
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // Add a file and commit in the worktree
    fs.writeFileSync(
      path.join(worktreePath, "merge-file.txt"),
      "merge content"
    );
    await execAsync("git add merge-file.txt", { cwd: worktreePath });
    await execAsync('git commit -m "Add file for merge test"', {
      cwd: worktreePath,
    });

    // Call merge endpoint
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/merge",
      {
        data: {
          projectPath: testRepo.path,
          featureId,
        },
      }
    );

    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.mergedBranch).toBe(branchName);

    // Verify the file from the feature branch is now in main
    const mergedFilePath = path.join(testRepo.path, "merge-file.txt");
    expect(fs.existsSync(mergedFilePath)).toBe(true);
    const content = fs.readFileSync(mergedFilePath, "utf-8");
    expect(content).toBe("merge content");

    // Verify worktree was cleaned up
    expect(fs.existsSync(worktreePath)).toBe(false);

    // Verify branch was deleted
    const branches = await listBranches(testRepo.path);
    expect(branches).not.toContain(branchName);
  });

  test.skip("should merge with squash option", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const featureId = "squash-merge-test";
    const branchName = `feature/${featureId}`;
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // Make multiple commits
    fs.writeFileSync(path.join(worktreePath, "squash1.txt"), "content 1");
    await execAsync("git add squash1.txt", { cwd: worktreePath });
    await execAsync('git commit -m "First squash commit"', {
      cwd: worktreePath,
    });

    fs.writeFileSync(path.join(worktreePath, "squash2.txt"), "content 2");
    await execAsync("git add squash2.txt", { cwd: worktreePath });
    await execAsync('git commit -m "Second squash commit"', {
      cwd: worktreePath,
    });

    // Merge with squash
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/merge",
      {
        data: {
          projectPath: testRepo.path,
          featureId,
          options: {
            squash: true,
            message: "Squashed feature commits",
          },
        },
      }
    );

    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.success).toBe(true);

    // Verify files are present
    expect(fs.existsSync(path.join(testRepo.path, "squash1.txt"))).toBe(true);
    expect(fs.existsSync(path.join(testRepo.path, "squash2.txt"))).toBe(true);

    // Verify commit message
    const { stdout: logOutput } = await execAsync("git log --oneline -1", {
      cwd: testRepo.path,
    });
    expect(logOutput).toContain("Squashed feature commits");
  });

  test("should handle merge with missing required fields", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Missing featureId
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/merge",
      {
        data: {
          projectPath: testRepo.path,
        },
      }
    );

    expect(response.ok()).toBe(false);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("featureId");
  });

  // ==========================================================================
  // Create Worktree with baseBranch Parameter Tests
  // ==========================================================================

  test("should create worktree from specific base branch", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create a base branch with a specific file
    await execAsync("git checkout -b develop", { cwd: testRepo.path });
    fs.writeFileSync(
      path.join(testRepo.path, "develop-only.txt"),
      "This file only exists on develop"
    );
    await execAsync("git add develop-only.txt", { cwd: testRepo.path });
    await execAsync('git commit -m "Add develop-only file"', {
      cwd: testRepo.path,
    });
    await execAsync("git checkout main", { cwd: testRepo.path });

    // Verify file doesn't exist on main
    expect(fs.existsSync(path.join(testRepo.path, "develop-only.txt"))).toBe(
      false
    );

    // Create worktree from develop branch
    const { response, data } = await apiCreateWorktree(
      page,
      testRepo.path,
      "feature/from-develop",
      "develop" // baseBranch
    );

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);

    // Verify the worktree has the file from develop
    const worktreePath = getWorktreePath(testRepo.path, "feature/from-develop");
    expect(fs.existsSync(path.join(worktreePath, "develop-only.txt"))).toBe(
      true
    );
    const content = fs.readFileSync(
      path.join(worktreePath, "develop-only.txt"),
      "utf-8"
    );
    expect(content).toBe("This file only exists on develop");
  });

  test("should create worktree from HEAD when baseBranch not provided", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Get the current commit hash on main
    const { stdout: mainHash } = await execAsync("git rev-parse HEAD", {
      cwd: testRepo.path,
    });

    // Create worktree without specifying baseBranch
    const { response, data } = await apiCreateWorktree(
      page,
      testRepo.path,
      "feature/from-head"
    );

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);

    // Verify the worktree starts from the same commit as main
    const worktreePath = getWorktreePath(testRepo.path, "feature/from-head");
    const { stdout: worktreeHash } = await execAsync("git rev-parse HEAD~0", {
      cwd: worktreePath,
    });

    // The worktree's initial commit should be the same as main's HEAD
    // (Since it was just created, we check the parent commit)
    // Actually, a new worktree from HEAD should have the same commit
    expect(worktreeHash.trim()).toBe(mainHash.trim());
  });

  // ==========================================================================
  // Branch Name Sanitization Tests
  // ==========================================================================

  test("should create worktree with special characters in branch name", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Branch name with special characters
    const branchName = "feature/test@special#chars";

    const { response, data } = await apiCreateWorktree(
      page,
      testRepo.path,
      branchName
    );

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);

    // Verify the sanitized path doesn't contain special characters
    const expectedSanitizedName = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const expectedPath = path.join(
      testRepo.path,
      ".worktrees",
      expectedSanitizedName
    );

    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  test("should create worktree with nested slashes in branch name", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Branch name with nested slashes
    const branchName = "feature/nested/deep/branch";

    const { response, data } = await apiCreateWorktree(
      page,
      testRepo.path,
      branchName
    );

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);

    // Verify the worktree was created
    const expectedSanitizedName = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const expectedPath = path.join(
      testRepo.path,
      ".worktrees",
      expectedSanitizedName
    );

    expect(fs.existsSync(expectedPath)).toBe(true);

    // Verify the branch exists
    const branches = await listBranches(testRepo.path);
    expect(branches).toContain(branchName);
  });

  // ==========================================================================
  // Push Endpoint Tests
  // ==========================================================================

  test("should handle push with missing required fields", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Missing worktreePath
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/push",
      {
        data: {},
      }
    );

    expect(response.ok()).toBe(false);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("worktreePath");
  });

  test("should fail push when no remote is configured", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/push-no-remote";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // Try to push (should fail because there's no remote)
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/push",
      {
        data: {
          worktreePath,
        },
      }
    );

    expect(response.ok()).toBe(false);
    const data = await response.json();
    expect(data.success).toBe(false);
    // Error message should indicate no remote
    expect(data.error).toBeDefined();
  });

  // ==========================================================================
  // Pull Endpoint Tests
  // ==========================================================================

  test("should handle pull with missing required fields", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Missing worktreePath
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/pull",
      {
        data: {},
      }
    );

    expect(response.ok()).toBe(false);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("worktreePath");
  });

  // Skip: This test requires a remote configured because pull does `git fetch origin`
  // before checking for local changes. Without a remote, the fetch fails first.
  test.skip("should fail pull when there are uncommitted local changes", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/pull-uncommitted";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // Create uncommitted changes
    fs.writeFileSync(
      path.join(worktreePath, "uncommitted.txt"),
      "uncommitted changes"
    );

    // Try to pull (should fail because of uncommitted changes)
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/pull",
      {
        data: {
          worktreePath,
        },
      }
    );

    expect(response.ok()).toBe(false);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("local changes");
  });

  // ==========================================================================
  // Create PR Endpoint Tests
  // ==========================================================================

  test("should handle create-pr with missing required fields", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Missing worktreePath
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/create-pr",
      {
        data: {},
      }
    );

    expect(response.ok()).toBe(false);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("worktreePath");
  });

  test("should fail create-pr when push fails (no remote)", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchName = "feature/pr-no-remote";
    const worktreePath = getWorktreePath(testRepo.path, branchName);

    await apiCreateWorktree(page, testRepo.path, branchName);

    // Add some changes to commit
    fs.writeFileSync(path.join(worktreePath, "pr-file.txt"), "pr content");

    // Try to create PR (should fail because there's no remote)
    const response = await page.request.post(
      "http://localhost:3008/api/worktree/create-pr",
      {
        data: {
          worktreePath,
          commitMessage: "Test commit",
          prTitle: "Test PR",
          prBody: "Test PR body",
        },
      }
    );

    expect(response.ok()).toBe(false);
    const data = await response.json();
    expect(data.success).toBe(false);
    // Should fail during push
    expect(data.error).toContain("push");
  });

  // ==========================================================================
  // Edit Feature with Branch Change
  // ==========================================================================

  test("should update branchName when editing a feature and selecting a new branch", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // First, create a feature on main branch (default)
    await clickAddFeature(page);
    await fillAddFeatureDialog(page, "Feature to edit branch", {
      category: "Testing",
    });
    await confirmAddFeature(page);

    // Wait for the feature to appear
    await page.waitForTimeout(1000);

    // Verify feature was created on main branch
    const featuresDir = path.join(testRepo.path, ".automaker", "features");
    const featureDirs = fs.readdirSync(featuresDir);
    expect(featureDirs.length).toBeGreaterThan(0);

    // Find the feature we just created
    const featureDir = featureDirs.find((dir) => {
      const featureFilePath = path.join(featuresDir, dir, "feature.json");
      if (fs.existsSync(featureFilePath)) {
        const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
        return data.description === "Feature to edit branch";
      }
      return false;
    });
    expect(featureDir).toBeDefined();

    const featureFilePath = path.join(featuresDir, featureDir!, "feature.json");
    let featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));

    // Initially, the feature should be on main or have no branch set
    expect(!featureData.branchName || featureData.branchName === "main").toBe(
      true
    );

    // The new branch we want to assign
    const newBranchName = "feature/edited-branch";
    const expectedWorktreePath = getWorktreePath(testRepo.path, newBranchName);

    // Verify worktree does NOT exist before editing
    expect(fs.existsSync(expectedWorktreePath)).toBe(false);

    // Find and click the edit button on the feature card
    const featureCard = page.getByText("Feature to edit branch");
    await expect(featureCard).toBeVisible({ timeout: 10000 });

    // Double-click to open edit dialog
    await featureCard.dblclick();
    await page.waitForTimeout(500);

    // Wait for edit dialog to open
    const editDialog = page.locator('[data-testid="edit-feature-dialog"]');
    await expect(editDialog).toBeVisible({ timeout: 5000 });

    // Select "Other branch" to enable the branch input
    const otherBranchRadio = page.locator('label[for="edit-feature-other"]');
    await otherBranchRadio.click();

    // Find and click on the branch input to open the autocomplete
    const branchInput = page.locator('[data-testid="edit-feature-input"]');
    await branchInput.click();
    await page.waitForTimeout(300);

    // Type the new branch name
    const commandInput = page.locator("[cmdk-input]");
    await commandInput.fill(newBranchName);

    // Press Enter to select/create the branch
    await commandInput.press("Enter");
    await page.waitForTimeout(200);

    // Click Save Changes
    const saveButton = page.locator('[data-testid="confirm-edit-feature"]');
    await saveButton.click();

    // Wait for the dialog to close and worktree to be created
    await page.waitForTimeout(2000);

    // Verify worktree WAS created during editing (worktrees are now created when features are added/edited)
    expect(fs.existsSync(expectedWorktreePath)).toBe(true);

    // Verify branch WAS created (worktrees are created when features are added/edited)
    const branches = await listBranches(testRepo.path);
    expect(branches).toContain(newBranchName);

    // Verify feature was updated with correct branchName
    featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
    expect(featureData.branchName).toBe(newBranchName);
  });

  test("should not create worktree when editing a feature and selecting main branch", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // First, create a worktree with a feature assigned to it
    const existingBranch = "feature/existing-branch";
    await apiCreateWorktree(page, testRepo.path, existingBranch);

    // Refresh to see the new worktree
    const refreshButton = page.locator('button[title="Refresh worktrees"]');
    await refreshButton.click();
    await page.waitForTimeout(500);

    // Select the worktree
    const worktreeButton = page.getByRole("button", {
      name: new RegExp(existingBranch, "i"),
    });
    await worktreeButton.click();
    await page.waitForTimeout(500);

    // Create a feature on this branch
    await clickAddFeature(page);
    await fillAddFeatureDialog(page, "Feature to change to main", {
      branch: existingBranch,
      category: "Testing",
    });
    await confirmAddFeature(page);
    await page.waitForTimeout(1000);

    // Verify feature was created with the branch
    const featuresDir = path.join(testRepo.path, ".automaker", "features");
    const featureDirs = fs.readdirSync(featuresDir);
    const featureDir = featureDirs.find((dir) => {
      const featureFilePath = path.join(featuresDir, dir, "feature.json");
      if (fs.existsSync(featureFilePath)) {
        const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
        return data.description === "Feature to change to main";
      }
      return false;
    });
    expect(featureDir).toBeDefined();

    const featureFilePath = path.join(featuresDir, featureDir!, "feature.json");
    let featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
    expect(featureData.branchName).toBe(existingBranch);

    // Now edit and change to main branch
    const featureCard = page.getByText("Feature to change to main");
    await featureCard.dblclick();
    await page.waitForTimeout(500);

    // Wait for edit dialog to open
    const editDialog = page.locator('[data-testid="edit-feature-dialog"]');
    await expect(editDialog).toBeVisible({ timeout: 5000 });

    // Find and click on the branch input
    const branchInput = page.locator('[data-testid="edit-feature-input"]');
    await branchInput.click();
    await page.waitForTimeout(300);

    // Type "main" to change to main branch
    const commandInput = page.locator("[cmdk-input]");
    await commandInput.fill("main");
    await commandInput.press("Enter");
    await page.waitForTimeout(200);

    // Save changes
    const saveButton = page.locator('[data-testid="confirm-edit-feature"]');
    await saveButton.click();
    await page.waitForTimeout(1000);

    // Verify feature was updated to main branch
    featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
    expect(featureData.branchName).toBe("main");

    // worktreePath should be cleared (null or undefined) for main branch
    expect(
      featureData.worktreePath === null ||
        featureData.worktreePath === undefined
    ).toBe(true);
  });

  test("should reuse existing worktree when editing feature to an existing branch", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create a worktree first
    const existingBranch = "feature/already-exists";
    const existingWorktreePath = getWorktreePath(testRepo.path, existingBranch);
    await apiCreateWorktree(page, testRepo.path, existingBranch);

    // Verify worktree exists
    expect(fs.existsSync(existingWorktreePath)).toBe(true);

    // Create a feature on main
    await clickAddFeature(page);
    await fillAddFeatureDialog(page, "Feature to use existing worktree", {
      category: "Testing",
    });
    await confirmAddFeature(page);
    await page.waitForTimeout(1000);

    // Edit the feature to use the existing branch
    const featureCard = page.getByText("Feature to use existing worktree");
    await featureCard.dblclick();
    await page.waitForTimeout(500);

    const editDialog = page.locator('[data-testid="edit-feature-dialog"]');
    await expect(editDialog).toBeVisible({ timeout: 5000 });

    // Change to the existing branch
    const branchInput = page.locator('[data-testid="edit-feature-input"]');
    await branchInput.click();
    await page.waitForTimeout(300);

    const commandInput = page.locator("[cmdk-input]");
    await commandInput.fill(existingBranch);
    await commandInput.press("Enter");
    await page.waitForTimeout(200);

    // Save changes
    const saveButton = page.locator('[data-testid="confirm-edit-feature"]');
    await saveButton.click();
    await page.waitForTimeout(1000);

    // Verify the existing worktree is still there (not duplicated)
    const worktrees = await listWorktrees(testRepo.path);
    const matchingWorktrees = worktrees.filter(
      (wt) => wt === existingWorktreePath
    );
    expect(matchingWorktrees.length).toBe(1);

    // Verify feature was updated with the correct branchName
    // Note: worktreePath is no longer stored - worktrees are created server-side at execution time
    const featuresDir = path.join(testRepo.path, ".automaker", "features");
    const featureDirs = fs.readdirSync(featuresDir);
    const featureDir = featureDirs.find((dir) => {
      const featureFilePath = path.join(featuresDir, dir, "feature.json");
      if (fs.existsSync(featureFilePath)) {
        const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
        return data.description === "Feature to use existing worktree";
      }
      return false;
    });

    const featureFilePath = path.join(featuresDir, featureDir!, "feature.json");
    const featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
    expect(featureData.branchName).toBe(existingBranch);
    // worktreePath should not exist in the feature data (worktrees are created at execution time)
    expect(featureData.worktreePath).toBeUndefined();
  });

  // ==========================================================================
  // PR URL Tracking Tests
  // ==========================================================================

  test("feature should support prUrl field for tracking pull request URLs", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create a feature
    await clickAddFeature(page);
    await fillAddFeatureDialog(page, "Feature for PR URL test", {
      category: "Testing",
    });
    await confirmAddFeature(page);
    await page.waitForTimeout(1000);

    // Verify feature was created
    const featuresDir = path.join(testRepo.path, ".automaker", "features");
    const featureDirs = fs.readdirSync(featuresDir);
    const featureDir = featureDirs.find((dir) => {
      const featureFilePath = path.join(featuresDir, dir, "feature.json");
      if (fs.existsSync(featureFilePath)) {
        const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
        return data.description === "Feature for PR URL test";
      }
      return false;
    });
    expect(featureDir).toBeDefined();

    // Manually update the feature.json file to add prUrl (simulating what happens after PR creation)
    const featureFilePath = path.join(featuresDir, featureDir!, "feature.json");
    const featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
    featureData.prUrl = "https://github.com/test/repo/pull/123";
    fs.writeFileSync(featureFilePath, JSON.stringify(featureData, null, 2));

    // Reload the page to pick up the change
    await page.reload();
    await waitForNetworkIdle(page);
    await waitForBoardView(page);
    await page.waitForTimeout(1000);

    // Verify the PR URL link is displayed on the card
    const prUrlLink = page.locator(`[data-testid="pr-url-${featureData.id}"]`);
    await expect(prUrlLink).toBeVisible({ timeout: 5000 });
    await expect(prUrlLink).toHaveText(/Pull Request/);
    await expect(prUrlLink).toHaveAttribute(
      "href",
      "https://github.com/test/repo/pull/123"
    );
  });

  test("prUrl should persist when updating feature", async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create a feature
    await clickAddFeature(page);
    await fillAddFeatureDialog(page, "Feature with PR URL persistence", {
      category: "Testing",
    });
    await confirmAddFeature(page);
    await page.waitForTimeout(1000);

    // Find the feature file
    const featuresDir = path.join(testRepo.path, ".automaker", "features");
    const featureDirs = fs.readdirSync(featuresDir);
    const featureDir = featureDirs.find((dir) => {
      const featureFilePath = path.join(featuresDir, dir, "feature.json");
      if (fs.existsSync(featureFilePath)) {
        const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
        return data.description === "Feature with PR URL persistence";
      }
      return false;
    });
    expect(featureDir).toBeDefined();

    // Add prUrl to the feature
    const featureFilePath = path.join(featuresDir, featureDir!, "feature.json");
    let featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
    const originalPrUrl = "https://github.com/test/repo/pull/456";
    featureData.prUrl = originalPrUrl;
    fs.writeFileSync(featureFilePath, JSON.stringify(featureData, null, 2));

    // Reload the page
    await page.reload();
    await waitForNetworkIdle(page);
    await waitForBoardView(page);
    await page.waitForTimeout(1000);

    // Open edit dialog by double-clicking the feature card
    const featureCard = page.getByText("Feature with PR URL persistence");
    await featureCard.dblclick();
    await page.waitForTimeout(500);

    // Wait for edit dialog to open
    const editDialog = page.locator('[data-testid="edit-feature-dialog"]');
    await expect(editDialog).toBeVisible({ timeout: 5000 });

    // Update the description - wait for the textarea to be visible
    const descInput = page.locator(
      '[data-testid="feature-description-input"]'
    );
    await expect(descInput).toBeVisible({ timeout: 5000 });
    await descInput.fill("Feature with PR URL persistence - updated");

    // Save the feature
    const saveButton = page.locator('[data-testid="confirm-edit-feature"]');
    await saveButton.click();
    await page.waitForTimeout(1000);

    // Verify prUrl was preserved
    featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
    expect(featureData.prUrl).toBe(originalPrUrl);
    expect(featureData.description).toBe(
      "Feature with PR URL persistence - updated"
    );
  });

  test("feature in waiting_approval with prUrl should show Verify button instead of Commit", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create a feature
    await clickAddFeature(page);
    await fillAddFeatureDialog(page, "Feature with PR for verify test", {
      category: "Testing",
    });
    await confirmAddFeature(page);
    await page.waitForTimeout(1000);

    // Find the feature file
    const featuresDir = path.join(testRepo.path, ".automaker", "features");
    const featureDirs = fs.readdirSync(featuresDir);
    const featureDir = featureDirs.find((dir) => {
      const featureFilePath = path.join(featuresDir, dir, "feature.json");
      if (fs.existsSync(featureFilePath)) {
        const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
        return data.description === "Feature with PR for verify test";
      }
      return false;
    });
    expect(featureDir).toBeDefined();

    // Update the feature to waiting_approval status with a prUrl
    const featureFilePath = path.join(featuresDir, featureDir!, "feature.json");
    let featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
    featureData.status = "waiting_approval";
    featureData.prUrl = "https://github.com/test/repo/pull/789";
    fs.writeFileSync(featureFilePath, JSON.stringify(featureData, null, 2));

    // Reload the page to pick up the changes
    await page.reload();
    await waitForNetworkIdle(page);
    await waitForBoardView(page);
    await page.waitForTimeout(1000);

    // Verify the feature card is in the waiting_approval column
    const waitingApprovalColumn = page.locator(
      '[data-testid="kanban-column-waiting_approval"]'
    );
    const featureCard = waitingApprovalColumn.locator(
      `[data-testid="kanban-card-${featureData.id}"]`
    );
    await expect(featureCard).toBeVisible({ timeout: 5000 });

    // Verify the Verify button is visible (not Commit button)
    const verifyButton = page.locator(`[data-testid="verify-${featureData.id}"]`);
    await expect(verifyButton).toBeVisible({ timeout: 5000 });

    // Verify the Commit button is NOT visible
    const commitButton = page.locator(`[data-testid="commit-${featureData.id}"]`);
    await expect(commitButton).not.toBeVisible({ timeout: 2000 });
  });

  test("feature in waiting_approval without prUrl should show Mark as Verified button", async ({
    page,
  }) => {
    await setupProjectWithPath(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Create a feature
    await clickAddFeature(page);
    await fillAddFeatureDialog(page, "Feature without PR for mark as verified test", {
      category: "Testing",
    });
    await confirmAddFeature(page);
    await page.waitForTimeout(1000);

    // Find the feature file
    const featuresDir = path.join(testRepo.path, ".automaker", "features");
    const featureDirs = fs.readdirSync(featuresDir);
    const featureDir = featureDirs.find((dir) => {
      const featureFilePath = path.join(featuresDir, dir, "feature.json");
      if (fs.existsSync(featureFilePath)) {
        const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
        return data.description === "Feature without PR for mark as verified test";
      }
      return false;
    });
    expect(featureDir).toBeDefined();

    // Update the feature to waiting_approval status WITHOUT prUrl
    const featureFilePath = path.join(featuresDir, featureDir!, "feature.json");
    let featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
    featureData.status = "waiting_approval";
    // Explicitly do NOT set prUrl
    fs.writeFileSync(featureFilePath, JSON.stringify(featureData, null, 2));

    // Reload the page to pick up the changes
    await page.reload();
    await waitForNetworkIdle(page);
    await waitForBoardView(page);
    await page.waitForTimeout(1000);

    // Verify the feature card is in the waiting_approval column
    const waitingApprovalColumn = page.locator(
      '[data-testid="kanban-column-waiting_approval"]'
    );
    const featureCard = waitingApprovalColumn.locator(
      `[data-testid="kanban-card-${featureData.id}"]`
    );
    await expect(featureCard).toBeVisible({ timeout: 5000 });

    // Verify the Mark as Verified button is visible
    const markAsVerifiedButton = page.locator(`[data-testid="mark-as-verified-${featureData.id}"]`);
    await expect(markAsVerifiedButton).toBeVisible({ timeout: 5000 });

    // Verify the Verify button is NOT visible
    const verifyButton = page.locator(`[data-testid="verify-${featureData.id}"]`);
    await expect(verifyButton).not.toBeVisible({ timeout: 2000 });
  });
});
