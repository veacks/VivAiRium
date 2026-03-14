# Agent Operating Rules (ViVAiRium)

## Workflow

This repo follows a doc-first, feature-first workflow:

1. Keep `project/SUMMARY.md` aligned with implementation nouns.
2. Keep `project/USERFLOW.md` aligned with the primary operator journey.
3. Keep `project/features/*.feature.md` authoritative for behaviors.
4. Keep `project/TEST_MATRIX.md` mapping every scenario to a test layer and status.

## Non-negotiables

- TypeScript for web + shared packages; React + R3F + XR in renderer.
- Zustand for state access on the frontend.
- Simulation must run in a Web Worker (no React lifecycle coupling).
- CrewAI + Ollama support in the orchestrator layer (Python).
- Agent mutation must be data-driven; never rewrite source files as a mutation strategy.
- Every evolution must be time-based (start, duration, stages, progress, cancel).
- Entities must maintain provenance and feedback ping-pong with the creator agent/model.

## Performance rules

- Avoid per-entity React renders; prefer instancing, LOD, and culling.
- Keep worker messages compact; prefer patch deltas over full snapshots when scaling.
- XR mode must reuse the same world state without resetting simulation.

