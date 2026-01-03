# Project Build and Fix Command

Run all builds and intelligently fix any failures based on what changed.

## Instructions

1. **Run the build**

   ```bash
   npm run build
   ```

   This builds all packages and the UI application.

2. **If the build succeeds**, report success and stop.

3. **If the build fails**, analyze the failures:
   - Note which build step failed and the error messages
   - Check for TypeScript compilation errors, missing dependencies, or configuration issues
   - Run `git diff main` to see what code has changed

4. **Determine the nature of the failure**:
   - **If the failure is due to intentional changes** (new features, refactoring, dependency updates):
     - Fix any TypeScript type errors introduced by the changes
     - Update build configuration if needed (e.g., tsconfig.json, vite.config.mts)
     - Ensure all new dependencies are properly installed
     - Fix import paths or module resolution issues

   - **If the failure appears to be a regression** (broken imports, missing files, configuration errors):
     - Fix the source code to restore the build
     - Check for accidentally deleted files or broken references
     - Verify build configuration files are correct

5. **Common build issues to check**:
   - **TypeScript errors**: Fix type mismatches, missing types, or incorrect imports
   - **Missing dependencies**: Run `npm install` if packages are missing
   - **Import/export errors**: Fix incorrect import paths or missing exports
   - **Build configuration**: Check tsconfig.json, vite.config.mts, or other build configs
   - **Package build order**: Ensure `build:packages` completes before building apps

6. **How to decide if it's intentional vs regression**:
   - Look at the git diff and commit messages
   - If the change was deliberate and introduced new code that needs fixing → fix the new code
   - If the change broke existing functionality that should still build → fix the regression
   - When in doubt, ask the user

7. **After making fixes**, re-run the build to verify everything compiles successfully.

8. **Report summary** of what was fixed (TypeScript errors, configuration issues, missing dependencies, etc.).
