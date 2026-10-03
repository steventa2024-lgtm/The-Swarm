import type { AgentRole, Complexity, FileChangeType } from '@/types'

/**
 * Blueprints stand in for what a real Planner agent would return. Each one maps
 * a family of tasks to worker priorities and plausible file targets. A live
 * orchestrator replaces this module with model output, not UI changes.
 */

export interface RoleScript {
  title: string
  description: string
  summary: string
  checklist: string[]
  actions: string[]
  files: { path: string; type: FileChangeType }[]
}

export interface Blueprint {
  id: string
  topic: string
  priority: AgentRole[]
  files: Partial<Record<AgentRole, { path: string; type: FileChangeType }[]>>
  finalSummary: string[]
  nextSteps: string[]
}

const f = (path: string, type: FileChangeType = 'modified') => ({ path, type })

const BLUEPRINTS: { match: RegExp; blueprint: Blueprint }[] = [
  {
    match: /auth|oauth|login|sign.?in|session/i,
    blueprint: {
      id: 'auth',
      topic: 'Google OAuth',
      priority: ['backend', 'frontend', 'qa', 'docs', 'researcher'],
      files: {
        backend: [f('src/lib/auth/google.ts', 'added'), f('src/routes/auth/callback.ts', 'added'), f('src/lib/auth/session.ts'), f('prisma/schema.prisma')],
        frontend: [f('src/components/auth/SignInButton.tsx', 'added'), f('src/app/login/page.tsx', 'added'), f('src/components/Header.tsx')],
        qa: [f('tests/auth/google.spec.ts', 'added'), f('tests/auth/session.spec.ts', 'added')],
        docs: [f('docs/auth.md', 'added'), f('README.md')],
        researcher: [f('docs/research/oauth-pkce.md', 'added')],
      },
      finalSummary: [
        'Google OAuth 2.0 with PKCE added behind /auth/callback with signed, httpOnly sessions.',
        'Sign-in button and login route built with the existing design tokens.',
        'Session model added to the Prisma schema with a reversible migration.',
      ],
      nextSteps: ['Register the production redirect URI in Google Cloud Console', 'Add rate limiting to /auth/callback'],
    },
  },
  {
    match: /landing|marketing|homepage|hero|website/i,
    blueprint: {
      id: 'landing',
      topic: 'landing page',
      priority: ['frontend', 'researcher', 'qa', 'docs', 'backend'],
      files: {
        frontend: [f('src/app/page.tsx'), f('src/components/marketing/Hero.tsx', 'added'), f('src/components/marketing/Pricing.tsx', 'added'), f('src/styles/marketing.css', 'added')],
        researcher: [f('content/copy-brief.md', 'added'), f('content/seo.json', 'added')],
        qa: [f('tests/e2e/landing.spec.ts', 'added')],
        docs: [f('docs/marketing-components.md', 'added')],
        backend: [f('src/app/api/signup/route.ts', 'added')],
      },
      finalSummary: [
        'Responsive landing page with hero, feature grid, pricing and signup form.',
        'Copy and metadata drafted from competitor and brand research.',
        'Lighthouse accessibility ≥ 98 and layout verified at three breakpoints.',
      ],
      nextSteps: ['Replace placeholder screenshots with product captures', 'Connect the signup form to the mailing list'],
    },
  },
  {
    match: /refactor|restructure|clean ?up|service layer|api layer|migrate/i,
    blueprint: {
      id: 'refactor',
      topic: 'service layer',
      priority: ['backend', 'qa', 'researcher', 'docs', 'frontend'],
      files: {
        backend: [f('src/services/users.ts', 'added'), f('src/services/orders.ts', 'added'), f('src/routes/users.ts'), f('src/routes/orders.ts'), f('src/lib/db.ts')],
        qa: [f('tests/services/users.spec.ts', 'added'), f('tests/routes/orders.spec.ts')],
        researcher: [f('docs/research/dependency-map.md', 'added')],
        docs: [f('docs/architecture.md'), f('CHANGELOG.md')],
        frontend: [f('src/client/api.ts')],
      },
      finalSummary: [
        'All Prisma access moved behind /services; routes now depend only on service interfaces.',
        'Behaviour preserved: the full existing suite passes unchanged.',
        'Dependency map and architecture notes updated.',
      ],
      nextSteps: ['Add an ESLint rule forbidding Prisma imports in /routes', 'Migrate the remaining legacy handlers'],
    },
  },
  {
    match: /test|failing|flaky|coverage|regression|bug|fix/i,
    blueprint: {
      id: 'tests',
      topic: 'test suite',
      priority: ['qa', 'backend', 'researcher', 'docs', 'frontend'],
      files: {
        qa: [f('tests/webhooks/retry.spec.ts'), f('tests/helpers/fake-timers.ts', 'added'), f('tests/billing/invoice.spec.ts', 'added')],
        backend: [f('src/webhooks/retry.ts'), f('src/webhooks/backoff.ts')],
        researcher: [f('docs/research/flaky-analysis.md', 'added')],
        docs: [f('docs/testing.md')],
        frontend: [f('src/components/StatusBanner.tsx')],
      },
      finalSummary: [
        'Root cause identified: retry backoff relied on wall-clock timing.',
        'Fix applied and a regression test added using fake timers.',
        'Suite ran 40 consecutive times with no flakes.',
      ],
      nextSteps: ['Apply the fake-timer helper to the two other timing-sensitive specs'],
    },
  },
  {
    match: /analy[sz]e|audit|review|repository|repo\b|improve/i,
    blueprint: {
      id: 'analysis',
      topic: 'repository analysis',
      priority: ['researcher', 'backend', 'frontend', 'docs', 'qa'],
      files: {
        researcher: [f('reports/architecture-map.md', 'added'), f('reports/risk-register.md', 'added')],
        backend: [f('reports/backend-findings.md', 'added')],
        frontend: [f('reports/frontend-findings.md', 'added')],
        docs: [f('reports/improvement-plan.md', 'added')],
        qa: [f('reports/test-gaps.md', 'added')],
      },
      finalSummary: [
        'Architecture mapped across 412 files with 6 hotspots flagged.',
        'Improvements ranked by impact and effort; 4 quick wins identified.',
        'Test gaps listed per module with suggested priorities.',
      ],
      nextSteps: ['Start with the three quick wins in improvement-plan.md', 'Schedule a follow-up refactor run for the data layer'],
    },
  },
]

const GENERIC: Blueprint = {
  id: 'generic',
  topic: 'the task',
  priority: ['backend', 'frontend', 'qa', 'docs', 'researcher'],
  files: {
    backend: [f('src/core/index.ts'), f('src/core/handlers.ts', 'added'), f('src/lib/config.ts')],
    frontend: [f('src/components/Feature.tsx', 'added'), f('src/app/page.tsx')],
    qa: [f('tests/feature.spec.ts', 'added')],
    docs: [f('README.md'), f('docs/feature.md', 'added')],
    researcher: [f('docs/research/notes.md', 'added')],
  },
  finalSummary: [
    'Subtasks implemented in parallel and merged without conflicts.',
    'New tests cover the primary flows and pass.',
    'Documentation updated alongside the change.',
  ],
  nextSteps: ['Review the merged diff before committing'],
}

export function pickBlueprint(prompt: string): Blueprint {
  return BLUEPRINTS.find((b) => b.match.test(prompt))?.blueprint ?? GENERIC
}

/** Heuristic complexity score → how many workers the orchestrator wants. */
export function classifyComplexity(prompt: string): Complexity {
  const words = prompt.trim().split(/\s+/).filter(Boolean).length
  let score = words / 10
  const bumps = /oauth|auth|payment|migrat|refactor|architect|repository|entire|full|end.to.end|multi|database|integration|api/gi
  score += (prompt.match(bumps)?.length ?? 0) * 0.9
  if (score < 1.8) return 'low'
  if (score < 3.2) return 'medium'
  return 'high'
}

export const COMPLEXITY_AGENTS: Record<Complexity, 2 | 3 | 4> = { low: 2, medium: 3, high: 4 }

type Template = (topic: string) => Omit<RoleScript, 'files'>

const ROLE_TEMPLATES: Partial<Record<AgentRole, Template>> = {
  frontend: (t) => ({
    title: `Build ${t} UI`,
    description: `Implement components, routes and styling for ${t}.`,
    summary: `Building interface for ${t}`,
    checklist: ['Scaffold components', 'Wire state & forms', 'Responsive styling pass', 'Accessibility check'],
    actions: ['Scaffolding component tree', 'Binding form state', 'Applying design tokens', 'Fixing focus order and aria labels', 'Checking responsive breakpoints'],
  }),
  backend: (t) => ({
    title: `Implement ${t} service`,
    description: `Create the data models, endpoints and integrations behind ${t}.`,
    summary: `Implementing server logic for ${t}`,
    checklist: ['Define data models', 'Implement endpoints', 'Validation & error handling', 'Wire integrations'],
    actions: ['Defining models and migrations', 'Writing request handlers', 'Validating inputs with schemas', 'Handling error and retry paths', 'Connecting external providers'],
  }),
  qa: (t) => ({
    title: `Test ${t}`,
    description: `Write and run unit and integration tests covering ${t}.`,
    summary: `Writing tests for ${t}`,
    checklist: ['Write unit tests', 'Add integration tests', 'Run full suite', 'Triage failures'],
    actions: ['Drafting unit tests', 'Mocking external services', 'Running the suite', 'Triaging a failing assertion', 'Checking coverage deltas'],
  }),
  docs: (t) => ({
    title: `Document ${t}`,
    description: `Update the README, reference docs and changelog for ${t}.`,
    summary: `Documenting ${t}`,
    checklist: ['Draft README section', 'API reference', 'Changelog entry', 'Proof-read'],
    actions: ['Drafting README section', 'Generating API reference', 'Adding usage examples', 'Writing changelog entry', 'Proof-reading wording'],
  }),
  researcher: (t) => ({
    title: `Research ${t}`,
    description: `Index the repository and gather the context needed for ${t}.`,
    summary: `Gathering context for ${t}`,
    checklist: ['Index repository', 'Read relevant docs', 'Audit dependencies', 'Summarise findings'],
    actions: ['Indexing repository files', 'Reading upstream documentation', 'Auditing dependency versions', 'Cross-referencing prior decisions', 'Summarising findings for the team'],
  }),
}

export function buildRoleScript(role: AgentRole, bp: Blueprint): RoleScript | undefined {
  const tpl = ROLE_TEMPLATES[role]
  if (!tpl) return undefined
  const files = bp.files[role] ?? GENERIC.files[role] ?? []
  return { ...tpl(bp.topic), files }
}

/** Deterministic pseudo-random from a string so file stats are stable across renders. */
export function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}
