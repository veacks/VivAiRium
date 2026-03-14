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

