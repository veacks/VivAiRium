# Feature 01 — Live Aquarium View

## Scenario F01-S01: World is always evolving

- Given the viewer opens the app
- When the viewer watches the scene for 30 seconds
- Then entities continue evolving without user interaction

## Scenario F01-S02: XR entry does not reset simulation

- Given the viewer is watching the aquarium
- When the viewer enters XR mode
- Then the world state continues from the same simulation timeline

## Scenario F01-S03: Chunks mount/unmount without stopping simulation

- Given the viewer moves the camera across the world
- When distant chunks are unloaded
- Then simulation continues for entities in those chunks

## Scenario F01-S04: Desktop camera uses orbit controls

- Given the viewer opens the app on desktop
- When the viewer drags or zooms in the aquarium viewport
- Then the camera orbits around the aquarium without resetting the simulation
