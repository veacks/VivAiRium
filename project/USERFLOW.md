# User Flow

## Viewer journey (steady-state)

1. Open the aquarium web app.
2. See the world already evolving (no “start game”).
3. Inspect the aquarium with desktop orbit camera controls.
4. Optionally enter XR mode without resetting the world.
5. Watch species races emerge and evolve through visible lifecycle stages, geometry jumps, texture changes, behavior shifts, and terrain adaptation.
6. Scrub the replay timeline to jump backward in the cached history, then return to the live stream.
7. Submit votes/tags (human influence) that bias future evolutions.

## Operator journey (system owner)

1. Deploy via GitHub → Netlify.
2. Receive deploy webhooks and audit events for patch ingestion/moderation.
3. Run the orchestrator to generate evolutions and agent mutations.
4. Monitor patch feed, replay history, cached species assets, and agent reasoning traces to ensure creator ping-pong works.
