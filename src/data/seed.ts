import type {
  AgentDefinition,
  Integration,
  Preferences,
  Project,
  ProjectMemory,
  Provider,
  RunSummary,
  Template,
} from '@/types'

const now = Date.now()
const H = 3_600_000
const D = 24 * H

export const seedProviders: Provider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    endpoint: 'https://api.anthropic.com',
    local: false,
    status: 'connected',
    credentialRef: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', tier: 'frontier', contextWindow: 500_000, inputCostPer1M: 15, outputCostPer1M: 75, tokensPerSecond: 55 },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', tier: 'balanced', contextWindow: 500_000, inputCostPer1M: 3, outputCostPer1M: 15, tokensPerSecond: 95 },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'fast', contextWindow: 200_000, inputCostPer1M: 1, outputCostPer1M: 5, tokensPerSecond: 190 },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI-compatible',
    kind: 'openai-compatible',
    endpoint: 'https://api.openai.com/v1',
    local: false,
    status: 'connected',
    credentialRef: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-4.1', label: 'GPT-4.1', tier: 'frontier', contextWindow: 1_000_000, inputCostPer1M: 2, outputCostPer1M: 8, tokensPerSecond: 85 },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', tier: 'fast', contextWindow: 1_000_000, inputCostPer1M: 0.4, outputCostPer1M: 1.6, tokensPerSecond: 160 },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1',
    local: false,
    status: 'connected',
    credentialRef: 'OPENROUTER_API_KEY',
    models: [
      { id: 'qwen/qwen3-coder', label: 'Qwen3 Coder', tier: 'balanced', contextWindow: 256_000, inputCostPer1M: 0.3, outputCostPer1M: 1.2, tokensPerSecond: 110 },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', tier: 'fast', contextWindow: 128_000, inputCostPer1M: 0.27, outputCostPer1M: 1.1, tokensPerSecond: 120 },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    kind: 'ollama',
    endpoint: 'http://localhost:11434',
    local: true,
    status: 'connected',
    models: [
      { id: 'qwen2.5-coder:14b', label: 'Qwen2.5 Coder 14B', tier: 'local', contextWindow: 32_000, inputCostPer1M: 0, outputCostPer1M: 0, tokensPerSecond: 42 },
      { id: 'llama3.1:8b', label: 'Llama 3.1 8B', tier: 'local', contextWindow: 128_000, inputCostPer1M: 0, outputCostPer1M: 0, tokensPerSecond: 68 },
    ],
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp server',
    kind: 'llamacpp',
    endpoint: 'http://localhost:8080/v1',
    local: true,
    status: 'disconnected',
    models: [
      { id: 'local-gguf', label: 'Local GGUF', tier: 'local', contextWindow: 16_000, inputCostPer1M: 0, outputCostPer1M: 0, tokensPerSecond: 36 },
    ],
  },
]

export const seedAgents: AgentDefinition[] = [
  {
    id: 'agent-planner', role: 'planner', name: 'Planner', core: true, enabled: true,
    description: 'Decomposes the master task into dependency-ordered subtasks and routes them.',
    providerId: 'anthropic', modelId: 'claude-opus-5-5',
    capabilities: ['Task decomposition', 'Dependency graph', 'Complexity scoring', 'Model routing'],
  },
  {
    id: 'agent-frontend', role: 'frontend', name: 'Frontend Builder', enabled: true,
    description: 'Builds UI components, pages, styling and client-side state.',
    providerId: 'anthropic', modelId: 'claude-sonnet-5-5',
    capabilities: ['React / TypeScript', 'Tailwind & design systems', 'Accessibility', 'Client state'],
  },
  {
    id: 'agent-backend', role: 'backend', name: 'Backend Builder', enabled: true,
    description: 'Implements APIs, data models, auth flows and integrations.',
    providerId: 'openai', modelId: 'gpt-4.1',
    capabilities: ['REST / RPC design', 'Database schemas', 'Auth & sessions', 'Background jobs'],
  },
  {
    id: 'agent-researcher', role: 'researcher', name: 'Researcher', enabled: true,
    description: 'Reads docs and the repository to gather context before and during a run.',
    providerId: 'openrouter', modelId: 'qwen/qwen3-coder',
    capabilities: ['Repo indexing', 'Docs lookup', 'Dependency audit', 'Prior-art search'],
  },
  {
    id: 'agent-docs', role: 'docs', name: 'Documentation Writer', enabled: true,
    description: 'Writes READMEs, changelogs, API docs and inline comments.',
    providerId: 'anthropic', modelId: 'claude-haiku-4-5',
    capabilities: ['Markdown', 'API reference', 'Changelogs', 'Code comments'],
  },
  {
    id: 'agent-qa', role: 'qa', name: 'Tester / QA', enabled: true,
    description: 'Writes and runs tests, reproduces failures and verifies fixes.',
    providerId: 'openrouter', modelId: 'deepseek/deepseek-chat',
    capabilities: ['Unit & integration tests', 'Failure triage', 'Coverage analysis', 'Lint & typecheck'],
  },
  {
    id: 'agent-reviewer', role: 'reviewer', name: 'Reviewer / Merger', core: true, enabled: true,
    description: 'Reviews each worker\'s output, resolves conflicts and produces the final result.',
    providerId: 'anthropic', modelId: 'claude-opus-5-5',
    capabilities: ['Code review', 'Conflict resolution', 'Merge & finalize', 'Quality gates'],
  },
]

export const seedProjects: Project[] = [
  {
    id: 'proj-zeropulse', name: 'zeropulse-web', path: '~/dev/zeropulse-web',
    stack: ['Next.js', 'TypeScript', 'Postgres'], status: 'healthy', branch: 'main',
    lastRunAt: now - 2 * H, runCount: 14,
    description: 'Marketing site and customer dashboard for ZeroPulse.',
  },
  {
    id: 'proj-api', name: 'pulse-api', path: '~/dev/pulse-api',
    stack: ['Node', 'Fastify', 'Prisma'], status: 'attention', branch: 'refactor/service-layer',
    lastRunAt: now - 1 * D, runCount: 9,
    description: 'Public REST API. 3 failing integration tests on the current branch.',
  },
  {
    id: 'proj-mobile', name: 'pulse-mobile', path: '~/dev/pulse-mobile',
    stack: ['React Native', 'Expo'], status: 'healthy', branch: 'main',
    lastRunAt: now - 3 * D, runCount: 5,
    description: 'Companion mobile app.',
  },
  {
    id: 'proj-docs', name: 'pulse-docs', path: '~/dev/pulse-docs',
    stack: ['Astro', 'MDX'], status: 'healthy', branch: 'main',
    lastRunAt: now - 6 * D, runCount: 3,
    description: 'Public documentation site.',
  },
  {
    id: 'proj-legacy', name: 'pulse-legacy', path: '~/dev/pulse-legacy',
    stack: ['Express', 'JavaScript'], status: 'archived', branch: 'v1',
    runCount: 1,
    description: 'Retired v1 service kept for reference.',
  },
]

export const seedMemory: ProjectMemory[] = [
  {
    id: 'mem-1', projectId: 'proj-zeropulse', kind: 'decision',
    title: 'Use server actions for mutations',
    body: 'We standardised on server actions over REST routes for dashboard mutations. Keep route handlers only for webhooks and OAuth callbacks.',
    tags: ['architecture', 'next'], updatedAt: now - 2 * D, uses: 11,
  },
  {
    id: 'mem-2', projectId: 'proj-zeropulse', kind: 'repo-summary',
    title: 'Repository overview',
    body: 'App Router layout with /app, /components, /lib. Auth lives in /lib/auth. Tailwind tokens defined in globals.css. 412 files indexed, last scan 2h ago.',
    tags: ['index'], updatedAt: now - 2 * H, uses: 14,
  },
  {
    id: 'mem-3', projectId: 'proj-api', kind: 'decision',
    title: 'Service layer owns all Prisma access',
    body: 'Routes must never import Prisma directly. All DB reads and writes go through /services. This is the target of the current refactor.',
    tags: ['refactor', 'prisma'], updatedAt: now - 1 * D, uses: 6,
  },
  {
    id: 'mem-4', projectId: 'proj-api', kind: 'note',
    title: 'Flaky test: webhooks.retry.spec',
    body: 'Fails ~1 in 8 runs due to a timing assumption in the retry backoff. QA agent should use fake timers.',
    tags: ['tests', 'flaky'], updatedAt: now - 3 * D, uses: 4,
  },
  {
    id: 'mem-5', projectId: 'proj-docs', kind: 'doc',
    title: 'Docs style guide',
    body: 'Second person, present tense, short paragraphs. Every endpoint page needs a curl example and an error table.',
    tags: ['docs', 'style'], updatedAt: now - 9 * D, uses: 3,
  },
  {
    id: 'mem-6', projectId: 'proj-zeropulse', kind: 'note',
    title: 'Design tokens',
    body: 'Primary #3B82FF, surface rgba(10,22,48,.55). Use the Glass component for any elevated surface.',
    tags: ['design'], updatedAt: now - 5 * D, uses: 8,
  },
]

export const seedTemplates: Template[] = [
  {
    id: 'tpl-feature', name: 'Build feature', icon: 'feature', builtin: true, mode: 'balanced', agents: 'auto',
    description: 'Plan, implement across frontend and backend, test and review a new feature.',
    prompt: 'Build authentication with Google OAuth, including login UI, session handling and tests.',
  },
  {
    id: 'tpl-bug', name: 'Fix bug', icon: 'bug', builtin: true, mode: 'fastest', agents: 3,
    description: 'Reproduce the failure, locate the root cause, patch it and add a regression test.',
    prompt: 'Fix the failing tests in the webhook retry module and add a regression test.',
  },
  {
    id: 'tpl-refactor', name: 'Refactor module', icon: 'refactor', builtin: true, mode: 'max-quality', agents: 4,
    description: 'Restructure a module behind a clean interface without changing behaviour.',
    prompt: 'Refactor the API layer so all database access goes through a service layer.',
  },
  {
    id: 'tpl-tests', name: 'Write tests', icon: 'tests', builtin: true, mode: 'eco', agents: 2,
    description: 'Raise coverage on a module with meaningful unit and integration tests.',
    prompt: 'Write unit and integration tests for the billing module and raise coverage above 85%.',
  },
  {
    id: 'tpl-docs', name: 'Generate docs', icon: 'docs', builtin: true, mode: 'eco', agents: 2,
    description: 'Produce API reference, README and changelog from the code as it stands.',
    prompt: 'Generate API documentation and a README for the public REST endpoints.',
  },
  {
    id: 'tpl-analyze', name: 'Analyze repository', icon: 'research', builtin: true, mode: 'balanced', agents: 3,
    description: 'Map the architecture, find risks and propose a prioritised improvement list.',
    prompt: 'Analyze this repository and propose improvements ranked by impact and effort.',
  },
  {
    id: 'tpl-landing', name: 'Landing page', icon: 'feature', mode: 'balanced', agents: 3,
    description: 'Design and build a responsive marketing landing page with copy and SEO.',
    prompt: 'Create a landing page for ZeroPulse with hero, features, pricing and a signup form.',
  },
]

export const seedIntegrations: Integration[] = [
  { id: 'int-anthropic', name: 'Anthropic API', category: 'provider', status: 'connected', description: 'Anthropic-compatible provider for Claude models.', detail: 'api.anthropic.com' },
  { id: 'int-openai', name: 'OpenAI-compatible', category: 'provider', status: 'connected', description: 'Any endpoint speaking the OpenAI chat-completions protocol.', detail: 'api.openai.com/v1' },
  { id: 'int-openrouter', name: 'OpenRouter', category: 'provider', status: 'connected', description: 'Route to many hosted models with one key.', detail: 'openrouter.ai' },
  { id: 'int-ollama', name: 'Ollama', category: 'local', status: 'connected', description: 'Run open models locally. Detected 2 models.', detail: 'localhost:11434' },
  { id: 'int-llamacpp', name: 'llama.cpp', category: 'local', status: 'disconnected', description: 'Local llama.cpp server with an OpenAI-style endpoint.', detail: 'localhost:8080' },
  { id: 'int-github', name: 'GitHub', category: 'source-control', status: 'unconfigured', description: 'Open pull requests from finished runs and read issues as tasks.' },
  { id: 'int-fs', name: 'Local file system', category: 'filesystem', status: 'connected', description: 'Workers read and write inside approved project folders only.', detail: '5 folders approved' },
  { id: 'int-gitlab', name: 'GitLab', category: 'future', status: 'planned', description: 'Merge requests and CI status.' },
  { id: 'int-linear', name: 'Linear', category: 'future', status: 'planned', description: 'Turn issues into swarm tasks.' },
  { id: 'int-mcp', name: 'MCP servers', category: 'future', status: 'planned', description: 'Give workers shared tools through the Model Context Protocol.' },
]

export const seedHistory: RunSummary[] = [
  { id: 'run-h1', title: 'Add Stripe webhook handlers', projectId: 'proj-api', mode: 'balanced', status: 'completed', agentCount: 3, durationMs: 412_000, tokens: 184_300, costUsd: 0.92, startedAt: now - 2 * H },
  { id: 'run-h2', title: 'Fix flaky retry tests', projectId: 'proj-api', mode: 'fastest', status: 'completed', agentCount: 2, durationMs: 188_000, tokens: 61_900, costUsd: 0.21, startedAt: now - 1 * D },
  { id: 'run-h3', title: 'Pricing page redesign', projectId: 'proj-zeropulse', mode: 'max-quality', status: 'completed', agentCount: 4, durationMs: 655_000, tokens: 302_400, costUsd: 3.18, startedAt: now - 2 * D },
  { id: 'run-h4', title: 'Generate docs for v2 endpoints', projectId: 'proj-docs', mode: 'eco', status: 'completed', agentCount: 2, durationMs: 241_000, tokens: 98_700, costUsd: 0.07, startedAt: now - 4 * D },
  { id: 'run-h5', title: 'Migrate auth to sessions', projectId: 'proj-zeropulse', mode: 'balanced', status: 'failed', agentCount: 3, durationMs: 301_000, tokens: 133_000, costUsd: 0.64, startedAt: now - 5 * D },
]

export const seedPreferences: Preferences = {
  tokenBudgetMode: 'balanced',
  tokenBudget: 1_000_000,
  maxConcurrency: 4,
  defaultAgentCount: 'auto',
  defaultMode: 'balanced',
  reduceMotion: false,
  telemetry: false,
  storeRunLogs: true,
  redactSecrets: true,
  simulationSpeed: 1,
  orchestrator: 'simulated',
}
