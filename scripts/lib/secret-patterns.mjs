// Well-known credential formats: the secret check (scripts/check-secrets.mjs) scans
// versioned text with them, and the MCP Manager (scripts/lib/mcp.ts) refuses them
// written as values in a server's environment or headers. A separate module, so
// importing the patterns never runs the check.

export const PATTERNS = [
  ['private key', /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/],
  ['AWS access key id', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI API key', /\bsk-(proj-|svcacct-)?[A-Za-z0-9_-]{32,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Atlassian API token', /\bATATT[A-Za-z0-9_=-]{40,}/],
  ['JSON Web Token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['URL with embedded credentials', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s:/@]{3,}@[^\s/]+/i],
  ['hard-coded password', /\b(password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'\s<>{}$]{8,}["']/i],
];
