# Feature 05 — Webhooks and Patch Feed

## Scenario F05-S01: Patch webhook is idempotent

- Given the same patch envelope is submitted twice with the same idempotency key
- Then the second submission is deduplicated

## Scenario F05-S02: Patch feed is cursor-based

- Given patches have been ingested
- When the client requests `/api/patch-feed?cursor=<n>`
- Then it receives patches after cursor and a new cursor

## Scenario F05-S03: Deploy webhooks are accepted and recorded

- Given Netlify or GitHub sends a deploy webhook
- Then the system records success/failure for auditing

## Scenario F05-S04: Patch and activity history is cached locally

- Given the local functions server ingests patches and activity events
- When the operator reloads the page or restarts the local stack
- Then cached history is restored from disk in `cache/evolution-history`

## Scenario F05-S05: The viewer can replay cached world history

- Given cached patch history exists
- When the viewer selects an older timeline point in the UI
- Then the world is rebuilt from cached patches up to that point and can return to live mode
