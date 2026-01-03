# Release Command

Bump the package.json version (major, minor, or patch) and build the Electron app with the new version.

## Usage

This command accepts a version bump type as input:

- `patch` - Bump patch version (0.1.0 -> 0.1.1)
- `minor` - Bump minor version (0.1.0 -> 0.2.0)
- `major` - Bump major version (0.1.0 -> 1.0.0)

## Instructions

1. **Get the bump type from the user**
   - The bump type should be provided as an argument (patch, minor, or major)
   - If no type is provided, ask the user which type they want

2. **Bump the version**
   - Run the version bump script:
     ```bash
     node apps/ui/scripts/bump-version.mjs <type>
     ```
   - This updates both `apps/ui/package.json` and `apps/server/package.json` with the new version (keeps them in sync)
   - Verify the version was updated correctly by checking the output

3. **Build the Electron app**
   - Run the electron build:
     ```bash
     npm run build:electron --workspace=apps/ui
     ```
   - The build process automatically:
     - Uses the version from `package.json` for artifact names (e.g., `Automaker-1.2.3-x64.zip`)
     - Injects the version into the app via Vite's `__APP_VERSION__` constant
     - Displays the version below the logo in the sidebar

4. **Commit the version bump**
   - Stage the updated package.json files:
     ```bash
     git add apps/ui/package.json apps/server/package.json
     ```
   - Commit with a release message:
     ```bash
     git commit -m "chore: release v<version>"
     ```

5. **Create and push the git tag**
   - Create an annotated tag for the release:
     ```bash
     git tag -a v<version> -m "Release v<version>"
     ```
   - Push the commit and tag to remote:
     ```bash
     git push && git push --tags
     ```

6. **Verify the release**
   - Check that the build completed successfully
   - Confirm the version appears correctly in the built artifacts
   - The version will be displayed in the app UI below the logo
   - Verify the tag is visible on the remote repository

## Version Centralization

The version is centralized and synchronized in both `apps/ui/package.json` and `apps/server/package.json`:

- **Electron builds**: Automatically read from `apps/ui/package.json` via electron-builder's `${version}` variable in `artifactName`
- **App display**: Injected at build time via Vite's `define` config as `__APP_VERSION__` constant (defined in `apps/ui/vite.config.mts`)
- **Server API**: Read from `apps/server/package.json` via `apps/server/src/lib/version.ts` utility (used in health check endpoints)
- **Type safety**: Defined in `apps/ui/src/vite-env.d.ts` as `declare const __APP_VERSION__: string`

This ensures consistency across:

- Build artifact names (e.g., `Automaker-1.2.3-x64.zip`)
- App UI display (shown as `v1.2.3` below the logo in `apps/ui/src/components/layout/sidebar/components/automaker-logo.tsx`)
- Server health endpoints (`/` and `/detailed`)
- Package metadata (both UI and server packages stay in sync)
