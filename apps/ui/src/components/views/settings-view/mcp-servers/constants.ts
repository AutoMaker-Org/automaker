// Patterns that indicate sensitive values in URLs or config
export const SENSITIVE_PARAM_PATTERNS = [
  /api[-_]?key/i,
  /api[-_]?token/i,
  /auth/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /bearer/i,
];

// Maximum recommended MCP tools before performance degradation
export const MAX_RECOMMENDED_TOOLS = 80;
