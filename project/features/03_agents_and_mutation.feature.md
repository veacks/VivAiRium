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

## Scenario F03-S04: Agent reasoning is visible to the operator

- Given an agent prepares an evolution proposal
- When the operator watches the activity console
- Then the console shows the agent reasoning, including shape, behavior, and shader intent

## Scenario F03-S05: Agents evolve form, function, and shader together

- Given an evolution targets an entity
- When the evolution progresses through its stages
- Then the entity visibly changes geometry, motion behavior, and shader response over time
