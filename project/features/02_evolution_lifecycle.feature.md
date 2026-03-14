# Feature 02 — Evolution Lifecycle

## Scenario F02-S01: Evolution has explicit time and stages

- Given an evolution is scheduled
- Then it has an id, start time, duration, and named stages

## Scenario F02-S02: Evolution progress is observable

- Given an evolution is running
- When time advances
- Then progress moves from 0 to 1 over the duration

## Scenario F02-S03: Evolution can be canceled

- Given an evolution is running
- When a cancel patch is applied
- Then the evolution is marked canceled and stops applying effects

