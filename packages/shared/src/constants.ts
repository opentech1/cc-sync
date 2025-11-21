// Shared constants for cc-sync

export const CLAUDE_DATA_PATHS = {
  settings: ".claude/settings.json",
  settingsLocal: ".claude/settings.local.json",
  commands: ".claude/commands/",
  sessions: ".claude/projects/",
  mcp: ".mcp.json",
  claudeMd: ".claude/CLAUDE.md",
} as const;

export const STORAGE_TIERS = {
  free: 100 * 1024 * 1024, // 100MB
  pro: 1024 * 1024 * 1024, // 1GB
} as const;

export const RATE_LIMITS = {
  free: {
    requests: 100,
    windowMs: 60 * 1000, // 1 minute
  },
  pro: {
    requests: 1000,
    windowMs: 60 * 1000, // 1 minute
  },
} as const;

export const MAX_RECENT_SESSIONS = 5;
export const SESSION_MAX_AGE_DAYS = 30;
