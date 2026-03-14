# Feature 04 — Human Influence and Moderation

## Scenario F04-S01: Votes and mood tags are ingested

- Given a viewer submits votes or mood tags
- Then the system stores them as weighted influence signals

## Scenario F04-S02: Moderation blocks disallowed content

- Given a proposal contains hateful or sexualized content
- When the moderation pipeline evaluates it
- Then it is blocked and an audit event is recorded

## Scenario F04-S03: Influence is translated into agent weights

- Given influence signals exist
- When the orchestrator prepares an agent prompt
- Then influence signals adjust agent influence weights

