# Feature 03 — Agents and Inter-Agent Mutation

## Scenario F03-S01: Agents can create and modify entities

- Given creator agents are active
- When an agent proposes a world patch
- Then entities are created, updated, or deleted via patches

## Scenario F03-S02: Meta-agent mutates another agent via data

- Given a meta-agent targets another agent
- When an agent mutation patch is applied
- Then the target agent’s rules/skills/model/mutation settings change in world config data

## Scenario F03-S03: Agent mutation can freeze/unfreeze an agent

- Given an agent is mutated to freeze for a duration
- Then it does not emit proposals until unfrozen

