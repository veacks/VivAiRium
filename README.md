# Living Aquarium (Prototype)

A production-oriented prototype of a browser-based, real-time 3D “living aquarium” that continuously evolves via AI creator agents.

## Stack (hard constraints)

- TypeScript monorepo (`pnpm` workspaces)
- React + React Three Fiber (R3F) rendering
- WebXR/WebVR via `@react-three/xr`
- Zustand for frontend state access
- Simulation in a Web Worker (never tied to React mount/unmount)
- CrewAI (Python) for agent orchestration
- Ollama local model support + remote model adapters
- Netlify for frontend + Functions + webhook endpoints

## Repo layout

- `apps/web`: browser app (R3F + XR) + sim worker client
- `apps/functions`: Netlify Functions (webhooks, patch feed, human signals)
- `apps/orchestrator`: Python CrewAI orchestrator (proposes evolutions + agent mutations)
- `packages/shared`: shared domain models + event contracts
- `packages/sim`: simulation runtime (scheduler, patch applier, feedback)

## Quick start

### 1) Install

```bash
pnpm i
```

### 2) Run web (dev)

```bash
pnpm -C apps/web dev
```

Full local stack:
```bash
pnpm dev:local
```
This starts:
- Netlify Functions locally on `http://localhost:9999`
- the Vite web app on `http://localhost:5173`
- the orchestrator automatically after the Functions endpoint is reachable

The web UI includes a live activity console fed by `/api/activity-feed`, so you can watch orchestrator and agent events in real time.

### 3) Run orchestrator (optional; posts patches to webhook)

Using `uv`:
```bash
uv sync --directory apps/orchestrator
uv run --directory apps/orchestrator vivairium-orchestrator
```

From the workspace root, the same commands are exposed as:
```bash
pnpm orchestrator:sync
pnpm orchestrator:run
```

Local behavior:
- If no webhook receiver is running, the orchestrator stays alive and prints the patch payload to stderr.
- Set `VIVAIRIUM_STRICT_WEBHOOKS=true` to make webhook delivery failures crash the process.
- Set `VIVAIRIUM_PATCH_WEBHOOK_URL` to your Netlify/local Functions endpoint when one is available.
- The standalone default targets `http://localhost:9999/.netlify/functions/patch-webhook` to match `pnpm dev:local`.

Default Ollama role preset:
- `biome_builder -> llama3.1`
- `meta_agent -> qwen2.5:7b`
- `mutation_builder -> qwen2.5-coder:7b`

Optional overrides:
```bash
OLLAMA_MODEL_BIOME=llama3.1 \
OLLAMA_MODEL_META=qwen2.5:7b \
OLLAMA_MODEL_MUTATION=qwen2.5-coder:7b \
pnpm orchestrator:run
```

### 4) Netlify (local)

Use Netlify CLI to run Functions + web together (recommended for `/api/*` routes).

## Core architecture rules

- Simulation is the source of truth; renderer is a subscriber.
- Every evolution is time-based and cancelable with explicit stages.
- Agents can mutate other agents via data patches (no code rewriting).
- Entities retain provenance and emit feedback to their creator pipeline.

## Product process docs

See:
- `project/SUMMARY.md`
- `project/USERFLOW.md`
- `project/features/`
- `project/TEST_MATRIX.md`
