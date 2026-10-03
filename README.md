# ZeroPulse Swarm

A desktop app that splits one big task across several AI agents running **different models**, so no single model — or paid API plan — has to carry the whole job.

You drop in a master prompt. A **planner** reads it once and gives every agent a short brief for its own slice. **Workers** build their parts in parallel, a **reviewer** checks the result, and you watch it happen on a live graph, then **preview** what was built and **apply** it to your project.

> **Status: early / experimental.** The UI, the live engine (verified with local Ollama models), key storage, preview and file-apply all work. The OpenAI and Anthropic adapters are written but **not yet tested with real keys**. See [What is and isn't verified](#what-is-and-isnt-verified) and the [test guide](docs/TESTING.md).

Stack: Tauri 2 · Rust · React 19 · TypeScript · Tailwind CSS 4 · Framer Motion · Zustand · SQLite.

---

## Why it exists

Big prompts burn tokens. Sending the whole thing to one expensive model is slow and costly; sending it to many agents naively multiplies the cost. ZeroPulse is built around three ideas:

1. **Read once, brief everyone.** Only the planner reads the full master prompt. Each worker receives a self-contained brief with the requirements that concern it, plus a shared contract (file names, interfaces) so parallel work fits together. Roles with nothing to do are skipped and cost nothing.
2. **Different models for different strengths.** *Agents → Auto-assign* profiles every available model (reasoning, coding, writing, speed, price) and gives each role the best fit, spreading the team across distinct models.
3. **Spend paid tokens only where they're few.** On the default *Token saver* policy, paid models are reserved for planning and review (small outputs). Free local models (Ollama, llama.cpp) or cheap hosted models do the high-volume writing.

## What you get

| Screen | What it does |
| --- | --- |
| **Swarm** | Task box (agent count, run mode), live orchestration graph, worker cards, activity feed, file changes, token / cost / provider metrics. Views: **Graph**, **Timeline**, **Preview**. |
| **Preview** | Renders what the agents built, updating as each finishes. Static HTML/CSS/JS and React/TSX. Desktop / tablet / phone widths, error banner, and a Code tab. |
| **Review & apply** | Compare every proposed file against your real files as a diff, resolve files several agents wrote, then write the ones you pick into your project folder. |
| **Agents** | Auto-assign models by strength, per-agent model, editable **skill** (standing instructions), capabilities, enable/disable. |
| **Integrations** | Test & connect providers (Ollama, llama.cpp, OpenAI-compatible, OpenRouter, Anthropic); store API keys securely. |
| **Projects / Knowledge / Templates / Settings / Support** | Working folders per project, project memory notes, reusable task presets, budgets and preferences, diagnostics. |

## Run it

The desktop app is the real thing. API keys, project-folder access and previews **only work in the desktop app**, not in the browser dev server.

**Prerequisites (Windows):** Node 20+, [Rust](https://rustup.rs), MSVC build tools, WebView2 (included in Windows 11). For live runs with local models, install [Ollama](https://ollama.com) and pull a model.

```bash
npm install
npm run tauri build -- --no-bundle   # fast: just the exe -> src-tauri/target/release/zeropulse-swarm.exe
npm run tauri build                  # also builds the .msi and NSIS installers under bundle/
npm run tauri dev                    # development, with hot reload
npm run dev                          # UI only, in a browser (no keys, folders or React previews)
npm test                             # unit tests
```

## How a run works

```
Master prompt
   │
   ▼
Planner (strong model, reads everything once)
   │   writes: shared contract + per-agent brief, acceptance criteria, owned files
   │   may skip roles that have nothing to do
   ▼
Workers run in parallel  ── each gets: its skill + contract + its brief (not the full prompt)
 Frontend · Backend · QA · Docs · Researcher    (different models, each owns its files)
   │
   ▼
Reviewer (compact digest, checks every agent's acceptance criteria)
   │
   ▼
Final output  →  Preview tab  →  Review & apply to your project folder
```

Worker output is **proposed file contents**. Nothing touches your disk until you review and apply it.

## Architecture

```
src/
  types/             Domain types: Task, Run, Worker, Provider, AgentDefinition, FileChange, Metrics…
  data/
    seed.ts          Default providers, agents, projects, templates, memory
    skills.ts        Default skill (standing instructions) for each agent role
  engine/
    driver.ts        OrchestratorDriver interface — the seam between UI and orchestration
    liveDriver.ts    Real driver: plan → parallel workers → review, over provider adapters
    simulator.ts     Scripted demo driver (the default on first launch)
    strengths.ts     Model profiling + auto-assign (token-saver / balanced / quality)
    routing.ts       Per-run-mode model routing
    notes.ts         Sends only the project notes that relate to the prompt
    blueprints.ts    Placeholder plans used by the simulator
  providers/         OpenAI-compatible + Anthropic adapters, SSE parser, transport, connection test
  preview/build.ts   Turns proposed files into a runnable preview (HTML, or TSX via sucrase + import map)
  lib/               diff, secrets + file-access bridges, formatting helpers
  store/             Zustand: persisted workspace data, live run state
  persistence/       SQLite (desktop) or localStorage (browser)
  components/ pages/ UI (shadcn-style primitives, graph, rails, dialogs, 8 pages)
  __tests__/         Vitest suites
src-tauri/
  src/provider.rs    HTTP bridge to model providers (attaches keys, streams responses)
  src/secrets.rs     API keys in Windows Credential Manager (write / check / delete, never read back)
  src/fs.rs          Project file access confined to folders the user approved
  src/preview.rs     Loopback preview server, sandbox-friendly CSP
  migrations/        SQLite schema
docs/TESTING.md     What to test, in what order, and what "good" looks like
```

## Security model

- **API keys** live in Windows Credential Manager. The UI can save, check and delete a key but can never read one back; only the Rust bridge reads it, to attach a header. Key names must end in `KEY` or `TOKEN`.
- **File access** is limited to project folders you pick in the native dialog. Approval is enforced in Rust and persisted; paths with `..`, absolute paths, symlink escapes and `.git` are rejected.
- **Previews** run in a sandboxed iframe served from a loopback port on its own origin, with a CSP that blocks the page from making its own network requests. Generated code cannot reach the app, its storage or its IPC.
- **Live runs send your prompt (and any related project notes) to the providers you verified.** Use *Local Only* mode, or only connect local providers, to keep everything on your machine.
- Ollama "cloud" models are hidden from local providers because they leave the machine.

## What is and isn't verified

**Verified in the real desktop app:** live runs against Ollama (plan, parallel build, review), auto-assign, token-saving skip of idle roles, key storage and bridge, preview of static pages and React pages, the confined file read/apply flow, conflict handling, the release build and Desktop launch. 64 unit tests and 2 Rust tests pass.

**Not verified yet:**
- **OpenAI, OpenRouter and Anthropic adapters** with real keys (the code follows the documented protocols, but no real request has been made).
- **Pause / Stop during a live run.**
- The native **folder-picker dialog** (its approval logic is tested; the dialog itself is not automated).
- The **MSI / NSIS installers** (built, never installed).
- A second live run after the latest "don't write other agents' files" prompt change.

**Known limitations:**
- Windows only for stored keys right now (the credential-store feature is enabled for Windows only).
- Local models are slow to load and their output quality varies; the reviewer is an LLM opinion, not a build result — nothing runs your tests or type-checker yet.
- React previews load React from esm.sh, so they need internet.
- Model strength profiles are heuristics from model names and prices, not benchmarks.
- No agent feedback loop yet: a failed review doesn't automatically send fixes back to the responsible worker.

## Contributing / extending

- Add a provider: implement `ProviderAdapter` in `src/providers/` and register it in `adapterFor`.
- Change how work is split: edit the planner prompt in `src/engine/liveDriver.ts` and the default skills in `src/data/skills.ts`.
- Swap the orchestrator: implement `OrchestratorDriver` and select it in `src/store/swarm.ts`.
- Theme: colour tokens are in `@theme` in `src/index.css`.

> A `postcss.config.js` in a *parent* folder can break Vite builds; `vite.config.ts` pins an inline PostCSS config to avoid that.
