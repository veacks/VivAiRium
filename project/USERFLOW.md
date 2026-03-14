# User Flow

## Viewer journey (steady-state)

1. Open the aquarium web app.
2. See the world already evolving (no “start game”).
3. Optionally enter XR mode without resetting the world.
4. Watch entities emerge and evolve through visible lifecycle stages.
5. Submit votes/tags (human influence) that bias future evolutions.

## Operator journey (system owner)

1. Deploy via GitHub → Netlify.
2. Receive deploy webhooks and audit events for patch ingestion/moderation.
3. Run the orchestrator to generate evolutions and agent mutations.
4. Monitor patch feed and feedback events to ensure creator ping-pong works.

