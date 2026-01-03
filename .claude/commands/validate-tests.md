# Project Test and Fix Command

Run all tests and intelligently fix any failures based on what changed.

## Instructions

1. **Run all tests**

   ```bash
   npm run test:all
   ```

2. **If all tests pass**, report success and stop.

3. **If any tests fail**, analyze the failures:
   - Note which tests failed and their error messages
   - Run `git diff main` to see what code has changed

4. **Determine the nature of the change**:
   - **If the logic change is intentional** (new feature, refactor, behavior change):
     - Update the failing tests to match the new expected behavior
     - The tests should reflect what the code NOW does correctly

   - **If the logic change appears to be a bug** (regression, unintended side effect):
     - Fix the source code to restore the expected behavior
     - Do NOT modify the tests - they are catching a real bug

5. **How to decide if it's a bug vs intentional change**:
   - Look at the git diff and commit messages
   - If the change was deliberate and the test expectations are now outdated → update tests
   - If the change broke existing functionality that should still work → fix the code
   - When in doubt, ask the user

6. **After making fixes**, re-run the tests to verify everything passes.

7. **Report summary** of what was fixed (tests updated vs code fixed).
