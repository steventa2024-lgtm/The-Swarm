/** Registry of actual native capabilities. No external MCP execution is inferred
 * from provider login. Unknown connectors remain disabled pending implementation. */
export const TOOL_REGISTRY = [
  { id: 'project.read', command: 'fs_read_text', cost: 'local', scope: 'Native approved root + relative path', risk: 'read', enabled: true },
  { id: 'project.stage', command: 'fs_stage', cost: 'local', scope: 'Approved root + immutable proposal', risk: 'proposal', enabled: true },
  { id: 'project.apply', command: 'fs_apply', cost: 'local', scope: 'Exact revision + Zero decision + one-time authority', risk: 'write / owner only', enabled: true },
  { id: 'verify', command: 'run_check', cost: 'local', scope: 'Native fixed command allowlist + approved root', risk: 'bounded process', enabled: true },
  { id: 'evidence', command: 'capture_evidence', cost: 'local', scope: 'Own Swarm window + native per-use consent', risk: 'capture / owner only', enabled: true },
  { id: 'telegram.media', command: 'tg_send_media', cost: 'communication', scope: 'Immutable approved evidence + paired destination', risk: 'external sharing / owner only', enabled: true },
  { id: 'external.mcp', command: 'Unavailable', cost: 'unverified', scope: 'No server or tool schemas have been approved', risk: 'blocked / manual', enabled: false },
  { id: 'trading.live', command: 'Prohibited', cost: 'prohibited', scope: 'TradeAI is paper research only', risk: 'blocked', enabled: false },
] as const
