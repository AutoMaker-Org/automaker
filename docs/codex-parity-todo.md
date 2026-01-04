# Codex Parity Checklist

This tracks the remaining gaps between Codex and Claude provider behavior.

- [x] Tool stream parity: emit `tool_use` + `tool_result` with correlation IDs for Codex commands.
- [x] Per-request options parity: honor `maxTurns`, `allowedTools`, `sdkSessionId`, `outputFormat`, `mcpAutoApproveTools`, `mcpUnrestrictedTools`.
- [x] Instruction loading + sandbox safety parity: load user + project Codex instructions and add cloud-storage sandbox checks.
- [x] Auth verification parity: treat billing/rate-limit failures as unauthenticated in Codex auth verification.
- [x] MCP permission logic parity: apply per-request MCP approval/restriction settings for Codex.
- [x] Hybrid execution: SDK for no-tool requests (including vision), CLI for tool-enabled workflows.
