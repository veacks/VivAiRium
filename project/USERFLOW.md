# User Flow

## Viewer journey (steady-state)

1. Open the aquarium web app.
2. See the world already evolving (no “start game”).
3. Inspect the aquarium with desktop orbit camera controls.
4. Optionally enter XR mode without resetting the world.
5. Watch entities emerge and evolve through visible lifecycle stages, shape changes, behavior changes, and shader changes.
6. Submit votes/tags (human influence) that bias future evolutions.

## Operator journey (system owner)

1. Deploy via GitHub → Netlify.
2. Receive deploy webhooks and audit events for patch ingestion/moderation.
3. Run the orchestrator to generate evolutions and agent mutations.
4. Monitor patch feed, agent reasoning traces, and feedback events to ensure creator ping-pong works.
