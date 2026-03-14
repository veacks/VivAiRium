# Living Aquarium — Product Summary

**Living Aquarium** helps viewers watch a continuously evolving 3D world in the browser, shaped by autonomous creator agents and nudged by human influence.

## Priority capabilities

1. Live 3D aquarium view (desktop orbit camera + XR) that never stops simulation
2. Time-based evolutions with explicit lifecycle stages and cancellation
3. AI creator agents that create/mutate/delete entities and can mutate other agents
4. Entity ↔ creator feedback loop (provenance + telemetry back to creator pipeline)
5. Human influence ingestion (mood boards + voting) filtered through moderation
6. Webhook/event system for deploy notifications, runtime entity updates, and visible agent reasoning
7. Agent-driven evolution that replaces full species blueprints: generated geometry, generated textures, locomotion patterns, and ecology traits
8. Living ecology with plant races fighting for sunlight, animal races fighting for territory, and terrain that mutates in response
9. Local cache-backed history so patch/evolution timelines survive reloads and can be replayed in the UI
10. Runtime budgets that cap world entity count and visible vertex load so the aquarium stays within CPU/GPU limits
