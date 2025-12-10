---
name: dual-target-support
overview: Seamless dual Electron/web with local helper (Node default) for filesystem/agent parity, WSL-aware paths, mac/Win/Linux support, and simple default projects folder option.
todos:
  - id: t01-review-electron-preload
    content: Review electron main/preload IPC coverage
    status: pending
  - id: t02-review-renderer-electron-api
    content: Review renderer electron API usage paths
    status: pending
  - id: t03-review-project-init
    content: Review project-init flow and path usage
    status: pending
  - id: t04-review-build-configs
    content: Review next.config.ts and package scripts
    status: pending
  - id: t05-review-electron-builder
    content: Review electron-builder targets/mac/win/linux
    status: pending
  - id: t06-design-path-helper-api
    content: Design OS/WSL detection and path helper API
    status: pending
    dependencies:
      - t01-review-electron-preload
      - t02-review-renderer-electron-api
      - t03-review-project-init
  - id: t07-implement-os-detection
    content: Implement isMac/isWindows/isLinux/isWSL helpers
    status: pending
    dependencies:
      - t06-design-path-helper-api
  - id: t08-implement-path-normalize
    content: Implement separator normalization helper
    status: pending
    dependencies:
      - t06-design-path-helper-api
  - id: t09-implement-wsl-win-convert
    content: Implement toWindowsPath/toWSLPath opt-in converters
    status: pending
    dependencies:
      - t06-design-path-helper-api
  - id: t10-implement-default-roots
    content: Implement getDefaultProjectRoot per platform
    status: pending
    dependencies:
      - t06-design-path-helper-api
  - id: t11-wire-helpers-to-electron-main
    content: Use path helpers in electron/main path entry points
    status: pending
    dependencies:
      - t07-implement-os-detection
      - t08-implement-path-normalize
      - t09-implement-wsl-win-convert
      - t10-implement-default-roots
  - id: t12-wire-helpers-to-preload
    content: Use path helpers in preload IPC bridge
    status: pending
    dependencies:
      - t07-implement-os-detection
      - t08-implement-path-normalize
      - t09-implement-wsl-win-convert
  - id: t13-harden-appdata-temp
    content: Normalize app data/temp/image paths per platform
    status: pending
    dependencies:
      - t11-wire-helpers-to-electron-main
  - id: t14-add-mac-icons-handling
    content: Ensure mac dock/tray icons dev vs packaged
    status: pending
    dependencies:
      - t11-wire-helpers-to-electron-main
  - id: t15-add-wsl-guards
    content: Guard WSL Windows-path cases with clear errors
    status: pending
    dependencies:
      - t11-wire-helpers-to-electron-main
      - t12-wire-helpers-to-preload
  - id: t16-design-helper-service
    content: Design local helper HTTP/WebSocket surface
    status: pending
    dependencies:
      - t01-review-electron-preload
      - t02-review-renderer-electron-api
  - id: t17-implement-helper-core
    content: Implement helper service skeleton (HTTP/WebSocket)
    status: pending
    dependencies:
      - t16-design-helper-service
  - id: t18-helper-fs-endpoints
    content: Implement helper FS endpoints (read/write/list)
    status: pending
    dependencies:
      - t17-implement-helper-core
  - id: t19-helper-dialogs
    content: Implement helper dialog/open-file/open-dir handlers
    status: pending
    dependencies:
      - t17-implement-helper-core
  - id: t20-helper-agent
    content: Expose agent/auto-mode endpoints via helper
    status: pending
    dependencies:
      - t17-implement-helper-core
  - id: t21-helper-auth-health
    content: Add helper auth token + healthcheck
    status: pending
    dependencies:
      - t17-implement-helper-core
  - id: t22-helper-wsl-paths
    content: Apply path helpers inside helper service
    status: pending
    dependencies:
      - t07-implement-os-detection
      - t08-implement-path-normalize
      - t09-implement-wsl-win-convert
      - t10-implement-default-roots
      - t17-implement-helper-core
  - id: t23-create-helper-client
    content: Add helper client SDK in web app
    status: pending
    dependencies:
      - t17-implement-helper-core
  - id: t24-client-retry-auth
    content: Add retry/backoff and auth token handling
    status: pending
    dependencies:
      - t23-create-helper-client
  - id: t25-client-health-ui
    content: UI flow to connect helper, show status
    status: pending
    dependencies:
      - t23-create-helper-client
  - id: t26-remove-web-mocks
    content: Remove mock FS in getElectronAPI web path
    status: pending
    dependencies:
      - t23-create-helper-client
  - id: t27-renderer-path-choice
    content: Add WSL path choice + confirmation UI
    status: pending
    dependencies:
      - t23-create-helper-client
      - t09-implement-wsl-win-convert
      - t10-implement-default-roots
  - id: t28-simple-path-option
    content: Add simple-path option using default project root
    status: pending
    dependencies:
      - t10-implement-default-roots
      - t23-create-helper-client
  - id: t29-project-init-integration
    content: Wire project-init to helper + path helpers
    status: pending
    dependencies:
      - t23-create-helper-client
      - t27-renderer-path-choice
      - t28-simple-path-option
  - id: t30-align-ipc-helper
    content: Align Electron IPC surface with helper API
    status: pending
    dependencies:
      - t20-helper-agent
      - t11-wire-helpers-to-electron-main
      - t17-implement-helper-core
  - id: t31-build-scripts-check
    content: Validate dev:web/dev:electron/build scripts
    status: pending
    dependencies:
      - t04-review-build-configs
      - t17-implement-helper-core
  - id: t32-electron-builder-check
    content: Validate electron-builder targets mac/win/linux
    status: pending
    dependencies:
      - t05-review-electron-builder
  - id: t33-add-tests-path-helpers
    content: Add unit tests for OS/WSL/path helpers
    status: pending
    dependencies:
      - t07-implement-os-detection
      - t08-implement-path-normalize
      - t09-implement-wsl-win-convert
      - t10-implement-default-roots
  - id: t34-add-tests-helper-client
    content: Add tests for helper client retry/auth
    status: pending
    dependencies:
      - t23-create-helper-client
      - t24-client-retry-auth
  - id: t35-add-integration-test
    content: Add integration test for helper detection in web UI
    status: pending
    dependencies:
      - t25-client-health-ui
      - t26-remove-web-mocks
  - id: t36-docs-platforms
    content: Document mac/win/linux/WSL usage and simple paths
    status: pending
    dependencies:
      - t27-renderer-path-choice
      - t28-simple-path-option
  - id: t37-docs-helper
    content: Document running helper for web mode
    status: pending
    dependencies:
      - t17-implement-helper-core
      - t23-create-helper-client
  - id: t38-docs-signing
    content: Document mac signing/notarization TODOs
    status: pending
    dependencies:
      - t32-electron-builder-check
  - id: t39-choose-helper-runtime
    content: Decide helper runtime (Node default vs headless Electron)
    status: pending
    dependencies:
      - t16-design-helper-service
  - id: t40-secure-helper-surface
    content: Bind helper to localhost, set CORS rules
    status: pending
    dependencies:
      - t17-implement-helper-core
  - id: t41-shared-contract-types
    content: Define shared types/contracts for IPC+helper API
    status: pending
    dependencies:
      - t16-design-helper-service
  - id: t42-helper-port-strategy
    content: Add helper port selection and fallback strategy
    status: pending
    dependencies:
      - t17-implement-helper-core
  - id: t43-simple-path-smoke-test
    content: Add smoke test for simple-path project creation
    status: pending
    dependencies:
      - t28-simple-path-option
      - t33-add-tests-path-helpers
  - id: t44-mac-signing-checklist
    content: Produce mac signing/notarization checklist
    status: pending
    dependencies:
      - t32-electron-builder-check
---

# Dual Electron/Web with Local Helper & Cross-Platform (mac/Win/Linux/WSL)

## Scope

- Full Electron support (mac/Win/Linux/WSL), correct app data paths, packaging, icons.
- Browser-based web UI gains Electron parity by talking to a local helper (Node default; headless Electron optional) over HTTP/WebSocket for filesystem/agent; remove mock FS.
- WSL-aware path handling with safe, opt-in conversions; mac support emphasized; simple-path defaults.
- Security: helper bound to localhost, auth token, minimal CORS; clear helper availability UX.

## Steps

1) **Cross-platform review**

- Review platform/IPC/path handling in [`app/src/lib/electron.ts`](app/src/lib/electron.ts), [`app/src/app/page.tsx`](app/src/app/page.tsx), [`app/src/lib/project-init.ts`](app/src/lib/project-init.ts), [`app/electron/main.js`](app/electron/main.js), [`app/electron/preload.js`](app/electron/preload.js); note mac/Win/Linux/WSL gaps.

2) **Platform & WSL/mac detection + path helpers**

- Add [`app/src/lib/path.ts`](app/src/lib/path.ts) with `isMac/isWindows/isLinux/isWSL`, separator normalization, opt-in `toWindowsPath`/`toWSLPath`, and `getDefaultProjectRoot()` (mac `~/Documents/Automaker/projects`, Win `%USERPROFILE%\Automaker\projects`, Linux/WSL `~/automaker/projects`).

3) **Local helper service for web UI (Node default)**

- Implement lightweight helper (HTTP/WebSocket) exposing IPC-equivalent ops (FS, dialogs, agent, auto-mode), bound to localhost with auth token and healthcheck; allow headless-Electron mode if needed.
- Provide helper client SDK in `app/src/lib/helper-client.ts` (retries, auth, health) and UX to connect; clear fallback message if unreachable.

4) **Electron/main & preload hardening (mac/Win/Linux/WSL)**

- Use path helpers to normalize/guard incoming paths; default roots via `getDefaultProjectRoot()`; handle WSL Windows-path cases explicitly.
- Ensure app data/temp/image storage uses platform bases; verify mac dock/tray icons dev/packaged.
- Keep IPC surface aligned with helper API.

5) **Renderer integration (no mocks)**

- Remove mock FS paths in `getElectronAPI`; route to helper when not in Electron.
- Add UX for helper URL/port, connection state, WSL path choice (default WSL, optional convert), and “simple path” auto-create under default root.
- Project init/load flows use helper client; confirm resolved paths with user.

6) **Build & packaging checks (mac included)**

- Validate `next.config.ts` and scripts for web+helper and Electron (`dev:web`, `dev:electron`, `build`, `build:electron`).
- Confirm `electron-builder` targets: mac (dmg/zip x64+arm64), Win (nsis), Linux (AppImage/deb); capture mac signing/notarization TODOs.

7) **Validation**

- Unit tests: path helpers (WSL↔Windows), OS detection, helper client retry/auth, default path selection.
- Integration: web UI detects helper, no mock banner, simple-path creation smoke.
- Docs: helper usage for web, WSL notes, mac specifics, simple-path defaults.