import asyncio
import math
import os
import sys
import time
from typing import Dict, List

from orchestrator.webhooks.client import PatchWebhookClient
from orchestrator.webhooks.activity import ActivityWebhookClient
from orchestrator.models.registry import ModelRegistry, ModelSpec
from orchestrator.moderation.policy import ModerationPolicy


def env_flag(name: str, default: bool) -> bool:
  raw = os.environ.get(name)
  if raw is None:
    return default
  return raw.strip().lower() in {"1", "true", "yes", "on"}


def build_model_registry() -> ModelRegistry:
  ollama_base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
  return ModelRegistry(
    models=[
      ModelSpec(
        id="model_ollama_llama3_1",
        provider="ollama",
        label="Ollama Llama 3.1",
        meta={"latency": "low", "cost": "low", "creativity": 0.8, "safety": "medium", "locality": "local"},
        config={"base_url": ollama_base_url, "model": os.environ.get("OLLAMA_MODEL_BIOME", "llama3.1")}
      ),
      ModelSpec(
        id="model_ollama_qwen2_5_7b",
        provider="ollama",
        label="Ollama Qwen 2.5 7B",
        meta={"latency": "low", "cost": "low", "creativity": 0.7, "safety": "medium", "locality": "local"},
        config={"base_url": ollama_base_url, "model": os.environ.get("OLLAMA_MODEL_META", "qwen2.5:7b")}
      ),
      ModelSpec(
        id="model_ollama_qwen2_5_coder_7b",
        provider="ollama",
        label="Ollama Qwen 2.5 Coder 7B",
        meta={"latency": "low", "cost": "low", "creativity": 0.68, "safety": "medium", "locality": "local"},
        config={"base_url": ollama_base_url, "model": os.environ.get("OLLAMA_MODEL_MUTATION", "qwen2.5-coder:7b")}
      ),
      ModelSpec(
        id="model_remote_stub",
        provider="remote_stub",
        label="Remote Stub",
        meta={"latency": "medium", "cost": "unknown", "creativity": 0.7, "safety": "unknown", "locality": "remote"},
        config={"base_url": os.environ.get("REMOTE_MODEL_URL", "http://localhost:9999")}
      )
    ]
  )


def build_role_model_assignments() -> Dict[str, str]:
  return {
    "biome_builder": "model_ollama_llama3_1",
    "meta_agent": "model_ollama_qwen2_5_7b",
    "mutation_builder": "model_ollama_qwen2_5_coder_7b",
  }


def pick(items: List[str], seed: int) -> str:
  return items[seed % len(items)]


def roundf(value: float) -> float:
  return round(value, 3)


def build_species_blueprint(archetype: str, terrain: str, focus: str, orbit_index: int, stage: str) -> Dict[str, object]:
  guild = "plant" if archetype == "flora" else "animal"
  seed = orbit_index * 17 + (5 if stage == "target" else 2)

  geometry_generator = {
    "sun_spire": "canopy",
    "canopy_duelist": "crest",
    "marsh_filter": "plate",
    "basalt_spine": "spine",
    "reef_bloom": "canopy",
    "territory_stalker": "crest",
    "burrow_clan": "shell",
    "ridge_pack": "spine",
    "reef_skimmer": "shell",
  }[focus]
  texture_generator = {
    "sun_spire": "veins",
    "canopy_duelist": "territory",
    "marsh_filter": "strata",
    "basalt_spine": "bands",
    "reef_bloom": "spots",
    "territory_stalker": "territory",
    "burrow_clan": "bands",
    "ridge_pack": "bands",
    "reef_skimmer": "spots",
  }[focus]
  behavior_pattern = {
    "sun_spire": "heliotrope",
    "canopy_duelist": "canopy_wrestle",
    "marsh_filter": "heliotrope",
    "basalt_spine": "ridge_runner",
    "reef_bloom": "canopy_wrestle",
    "territory_stalker": "territorial_pack",
    "burrow_clan": "burrower",
    "ridge_pack": "territorial_pack",
    "reef_skimmer": "ridge_runner",
  }[focus]

  palette_map = {
    "sun_spire": ["#225e37", "#7bcf5e", "#d8ff8e"],
    "canopy_duelist": ["#173f2d", "#3da96f", "#8df8b7"],
    "marsh_filter": ["#1b3f35", "#5fc490", "#c7ffd5"],
    "basalt_spine": ["#332c29", "#6d7443", "#c8e368"],
    "reef_bloom": ["#1f3a50", "#2aa8a5", "#85ffe1"],
    "territory_stalker": ["#3b1f17", "#d97032", "#ffd3a8"] if terrain == "dune" else ["#1d2c4f", "#4b82ff", "#9dd8ff"],
    "burrow_clan": ["#3f2d20", "#a77d5a", "#f3d6b1"],
    "ridge_pack": ["#2e2b34", "#8a667a", "#ffd19b"],
    "reef_skimmer": ["#182d55", "#3d9cff", "#baf4ff"],
  }
  lineage_prefix = pick({
    "loam": ["Loam", "Humus", "Canopy"],
    "reef": ["Reef", "Brine", "Coral"],
    "marsh": ["Marsh", "Fen", "Silt"],
    "basalt": ["Basalt", "Ash", "Obsidian"],
    "dune": ["Dune", "Dust", "Solar"],
  }[terrain], seed)
  lineage_suffix = pick(
    ["Crown", "Lattice", "Spire", "Veil", "Kelp"] if guild == "plant" else ["Stalker", "Pack", "Runner", "Grazer", "Burrower"],
    seed + 3,
  )

  radial_segments = 8 + (seed % 7)
  rings = 8 + ((seed + 2) % 7)
  twist = roundf((-1.2 if stage == "seed" else -1.8) + (seed % 5) * 0.38)
  flare = roundf((0.42 if stage == "seed" else 0.72) + (seed % 4) * 0.12)
  asymmetry = roundf((0.14 if stage == "seed" else 0.32) + (seed % 5) * 0.06)
  canopy = roundf((0.28 if stage == "seed" else 0.7) + (seed % 4) * 0.09)

  return {
    "species_id": f"species_{guild}_{focus}_{orbit_index}_{stage}",
    "lineage": f"{lineage_prefix}-{focus}",
    "label": f"{lineage_prefix} {lineage_suffix}",
    "geometry": {
      "asset_id": f"geo_{focus}_{orbit_index}_{stage}",
      "generator": geometry_generator,
      "profile": [roundf(0.18 + abs(math.sin(seed * 0.4 + idx * 0.9)) * (0.38 + idx * 0.06)) for idx in range(7)],
      "radial_segments": radial_segments,
      "rings": rings,
      "twist": twist,
      "flare": flare,
      "asymmetry": asymmetry,
      "canopy": canopy,
    },
    "texture": {
      "asset_id": f"tex_{focus}_{orbit_index}_{stage}",
      "generator": texture_generator,
      "palette": palette_map[focus],
      "bands": 4 + (seed % 6),
      "spots": 5 + (seed % 10),
      "grain": roundf(0.16 + (seed % 7) * 0.09),
      "contrast": roundf(0.32 + (seed % 5) * 0.13),
      "emissive_bias": roundf(0.22 + (seed % 6) * 0.11),
    },
    "behavior": {
      "asset_id": f"beh_{focus}_{orbit_index}_{stage}",
      "pattern": behavior_pattern,
      "tempo": roundf((0.32 if guild == "plant" else 0.72) + (seed % 5) * 0.11 + (0.18 if stage == "target" else 0)),
      "reach": roundf((0.45 if guild == "plant" else 1.2) + (seed % 6) * 0.16 + (0.32 if stage == "target" else 0)),
      "aggression": roundf((0.12 if guild == "plant" else 0.42) + (seed % 5) * 0.08 + (0.18 if focus in {"territory_stalker", "ridge_pack", "canopy_duelist"} else 0)),
      "cohesion": roundf(0.22 + (seed % 5) * 0.12),
      "adaptability": roundf(0.42 + (seed % 5) * 0.11 + (0.15 if stage == "target" else 0)),
    },
    "ecology": {
      "guild": guild,
      "sunlight_demand": roundf((0.72 if guild == "plant" else 0.28) + (seed % 4) * 0.08),
      "shade_cast": roundf((0.36 if guild == "plant" else 0.08) + (seed % 4) * 0.11),
      "territory_radius": roundf((2.2 if guild == "plant" else 5.4) + (seed % 5) * 1.1),
      "terrain_affinity": terrain,
      "mobility": roundf((0.08 if guild == "plant" else 0.52) + (seed % 4) * 0.12),
      "resilience": roundf(0.42 + (seed % 5) * 0.1),
    },
    "reasoning": [
      f"focus={focus}",
      f"terrain_affinity={terrain}",
      "Target species is designed as a full blueprint: geometry, texture, locomotion, and ecology mutate together.",
    ],
  }


def shape_profile_for_species(species: Dict[str, object]) -> Dict[str, object]:
  geometry = species["geometry"]
  texture = species["texture"]
  kind_map = {"canopy": "frond", "spine": "crystal", "crest": "fan", "shell": "orb", "plate": "pod"}
  return {
    "kind": kind_map[geometry["generator"]],
    "stretch": roundf(0.76 + geometry["canopy"] * 0.62 + abs(geometry["twist"]) * 0.14),
    "taper": roundf(0.18 + geometry["flare"] * 0.34),
    "wobble": roundf(0.06 + geometry["asymmetry"] * 0.24),
    "ridges": max(4, int(geometry["radial_segments"] * 0.7 + texture["bands"] * 0.35)),
  }


def behavior_profile_for_species(species: Dict[str, object], stage: str) -> Dict[str, object]:
  behavior = species["behavior"]
  pattern_mode = {
    "heliotrope": "pulse",
    "canopy_wrestle": "orbit",
    "territorial_pack": "glide",
    "burrower": "wander",
    "ridge_runner": "glide",
  }
  return {
    "mode": pattern_mode[behavior["pattern"]],
    "amplitude": roundf((0.08 if stage == "seed" else 0.22) + behavior["reach"] * 0.24),
    "frequency": roundf(0.22 + behavior["tempo"] * 0.78),
    "phase": roundf(orbit_index_seed(species["species_id"]) * 0.21),
    "drift": roundf(0.04 + behavior["adaptability"] * 0.32 + behavior["aggression"] * 0.08),
  }


def shader_profile_for_species(species: Dict[str, object], stage: str) -> Dict[str, object]:
  texture = species["texture"]
  style_map = {"veins": "biolume", "bands": "ember", "spots": "electric", "strata": "glass", "territory": "caustic"}
  return {
    "style": style_map[texture["generator"]],
    "hue_shift": roundf(texture["emissive_bias"] * 0.18 - texture["contrast"] * 0.06),
    "pulse": roundf((0.12 if stage == "seed" else 0.28) + texture["emissive_bias"] * 0.38),
    "distortion": roundf((0.04 if stage == "seed" else 0.12) + texture["contrast"] * 0.12),
    "fresnel": roundf(1.08 + texture["contrast"] * 0.86),
  }


def scale_for_species(archetype: str, species: Dict[str, object], stage: str) -> float:
  geometry = species["geometry"]
  behavior = species["behavior"]
  base = 0.42 if stage == "seed" else 0.78
  if archetype == "flora":
    return roundf(base + geometry["canopy"] * 0.24)
  return roundf(base + behavior["reach"] * 0.14)


def orbit_index_seed(value: str) -> int:
  total = 0
  for char in value:
    total = (total * 33 + ord(char)) % 997
  return total


def chunk_id_from_position(position: List[float]) -> str:
  return f"{math.floor(position[0] / 32)}:{math.floor(position[2] / 32)}"


def build_evolution_design(orbit_index: int) -> Dict[str, object]:
  archetype = "flora" if orbit_index % 2 == 0 else "fauna"
  terrain = pick(["loam", "marsh", "basalt", "reef", "dune"], orbit_index)

  if archetype == "flora":
    seed_focus = pick(["sun_spire", "marsh_filter", "basalt_spine"], orbit_index)
    target_focus = pick(["canopy_duelist", "reef_bloom", "sun_spire"], orbit_index + 1)
    ecology_summary = "A plant lineage is trying to climb above rival canopies and retune its texture to win sunlight on the current terrain."
    ecology_reasoning = [
      "Plants should not just stretch; they should switch lineage to seize the sun lane above their competitors.",
      "The target blueprint increases shade cast and canopy volume so nearby flora has to respond.",
      "Terrain affinity is carried into the new species so the mutation reads as ecological adaptation, not random styling.",
    ]
  else:
    seed_focus = pick(["reef_skimmer", "burrow_clan", "ridge_pack"], orbit_index)
    target_focus = pick(["territory_stalker", "ridge_pack", "burrow_clan"], orbit_index + 2)
    ecology_summary = "An animal lineage is escalating from local motion into a territorial body plan that can push rivals away from a resource patch."
    ecology_reasoning = [
      "Fauna should mutate range, aggression, and shell/crest geometry together so territorial fights read instantly.",
      "The new target species gets more reach and cohesion to claim a wider orbit around its anchor.",
      "Terrain affinity is rewritten so the pack migrates with the biome instead of skating over it unchanged.",
    ]

  seed_species = build_species_blueprint(archetype, terrain, seed_focus, orbit_index, "seed")
  target_species = build_species_blueprint(archetype, terrain, target_focus, orbit_index, "target")

  return {
    "archetype": archetype,
    "terrain": terrain,
    "seed_species": seed_species,
    "target_species": target_species,
    "shape_seed": shape_profile_for_species(seed_species),
    "shape_target": shape_profile_for_species(target_species),
    "behavior_seed": behavior_profile_for_species(seed_species, "seed"),
    "behavior_target": behavior_profile_for_species(target_species, "target"),
    "shader_seed": shader_profile_for_species(seed_species, "seed"),
    "shader_target": shader_profile_for_species(target_species, "target"),
    "target_scale": scale_for_species(archetype, target_species, "target"),
    "shape_summary": "Geometry switches lineage rather than only scaling a primitive, so the organism makes a visible anatomical leap.",
    "behavior_summary": "Behavior mutates into a new locomotion/competition pattern that changes how the organism occupies space.",
    "shader_summary": "Texture and shader evolve together so the skin itself carries ecological information.",
    "ecology_summary": ecology_summary,
    "shape_reasoning": [
      f"seed generator={seed_species['geometry']['generator']}, target generator={target_species['geometry']['generator']}",
      "The target geometry asset is imported as a new procedural mesh profile, not a scalar tweak on the seed mesh.",
      "Ridge count, asymmetry, and canopy volume all move together to make the mutation legible from a distance.",
    ],
    "behavior_reasoning": [
      f"seed pattern={seed_species['behavior']['pattern']}, target pattern={target_species['behavior']['pattern']}",
      "The target behavior asset changes how the organism negotiates neighbors, not only how fast it wiggles.",
      "Reach and aggression rise sharply to make the evolution feel like a territorial or competitive jump.",
    ],
    "shader_reasoning": [
      f"seed texture={seed_species['texture']['generator']}, target texture={target_species['texture']['generator']}",
      "Texture generator changes with the species so the surface reads as a new race, not a recolored old body.",
      "Contrast and emissive bias are pushed upward late in the evolution to make the transformation peak visually.",
    ],
    "ecology_reasoning": ecology_reasoning,
  }


async def run_loop() -> None:
  webhook_url = os.environ.get("VIVAIRIUM_PATCH_WEBHOOK_URL", "http://localhost:9999/.netlify/functions/patch-webhook")
  activity_url = os.environ.get("VIVAIRIUM_ACTIVITY_WEBHOOK_URL", webhook_url.replace("patch-webhook", "activity-event"))
  run_id = os.environ.get("VIVAIRIUM_RUN_ID", f"run_{int(time.time())}")
  strict_webhooks = env_flag("VIVAIRIUM_STRICT_WEBHOOKS", default=False)
  emit_local_fallback = env_flag("VIVAIRIUM_PRINT_PATCHES_ON_FAILURE", default=True)
  role_model_assignments = build_role_model_assignments()

  registry = build_model_registry()
  moderation = ModerationPolicy()
  client = PatchWebhookClient(webhook_url=webhook_url)
  activity_client = ActivityWebhookClient(activity_url=activity_url)

  print(f"[orchestrator] run_id={run_id}", file=sys.stderr)
  print(f"[orchestrator] webhook_url={webhook_url}", file=sys.stderr)
  print(f"[orchestrator] activity_url={activity_url}", file=sys.stderr)
  print(f"[orchestrator] strict_webhooks={strict_webhooks}", file=sys.stderr)

  for role, model_id in role_model_assignments.items():
    spec = registry.get(model_id)
    if spec is None:
      continue
    print(f"[orchestrator] role_model role={role} model={spec.config['model']}", file=sys.stderr)
    try:
      await activity_client.emit(
        source="agent",
        scope=role,
        level="info",
        message="role model assignment loaded",
        details={"model_id": model_id, "model_name": spec.config["model"]},
      )
    except Exception:
      pass

  while True:
    biome_model_id = role_model_assignments["biome_builder"]
    biome_model_spec = registry.get(biome_model_id)
    now_ms = int(time.time() * 1000)
    orbit_index = (now_ms // 4_000) % 14
    angle = orbit_index * (math.pi / 7)
    design = build_evolution_design(orbit_index)
    entity_id = f"entity_orch_{now_ms}"
    evolution_id = f"evo_orch_{now_ms}"
    radius = 5 + (orbit_index % 4) * 1.7
    seed_position = [round(math.cos(angle) * radius, 3), 0.35 if design["archetype"] == "flora" else 0.7, round(math.sin(angle) * radius, 3)]

    entity_create_patch = {
      "kind": "entity.create",
      "entity": {
        "id": entity_id,
        "archetype": design["archetype"],
        "provenance": {
          "creator_agent_id": "agent_biome_builder",
          "creator_model_id": biome_model_id,
          "originating_evolution_id": evolution_id,
        },
        "chunk_id": chunk_id_from_position(seed_position),
        "anchor_position": seed_position,
        "position": seed_position,
        "rotationY": round(angle, 3),
        "scale": scale_for_species(design["archetype"], design["seed_species"], "seed"),
        "species": design["seed_species"],
        "shape_profile": design["shape_seed"],
        "behavior_profile": design["behavior_seed"],
        "shader_profile": design["shader_seed"],
        "lifecycle_stage": "seed",
        "lifecycle_t": 0,
        "visible_hint": True,
        "created_at_ms": now_ms,
        "updated_at_ms": now_ms,
      },
    }

    proposal = {
      "kind": "evolution.schedule",
      "evolution": {
        "id": evolution_id,
        "source_agent_id": "agent_biome_builder",
        "source_model_id": biome_model_id,
        "intent": f"Spawn a {design['archetype']} race that makes a large ecological jump in geometry, texture, and behavior.",
        "start_time_ms": now_ms,
        "duration_ms": 9_000,
        "stages": [
          {"name": "seed", "duration_ms": 2_000},
          {"name": "sprout", "duration_ms": 3_000},
          {"name": "unstable", "duration_ms": 1_500},
          {"name": "mature", "duration_ms": 2_500},
        ],
        "progress_t": 0,
        "canceled": False,
        "target": {"kind": "entity", "entity_id": entity_id},
        "expected_final": {
          "archetype": design["archetype"],
          "species_blueprint": design["target_species"],
          "shape_profile": design["shape_target"],
          "behavior_profile": design["behavior_target"],
          "shader_profile": design["shader_target"],
          "scale": design["target_scale"],
          "reasoning_summary": "The agent is replacing the current lineage with a new ecology-aware species blueprint, not just tuning a primitive.",
          "reasoning_steps": [
            *design["shape_reasoning"],
            *design["behavior_reasoning"],
            *design["shader_reasoning"],
            *design["ecology_reasoning"],
          ],
          "assigned_role_models": role_model_assignments,
          "source_model_name": biome_model_spec.config["model"] if biome_model_spec is not None else None,
        },
        "history": []
      }
    }

    if not moderation.is_allowed_json(proposal):
      try:
        await activity_client.emit(
          source="orchestrator",
          scope="orchestrator",
          level="warn",
          message="proposal rejected by moderation",
          details={"run_id": run_id},
        )
      except Exception:
        pass
      await asyncio.sleep(2)
      continue

    entity_sent, entity_envelope, entity_error = await client.try_send_patch(run_id=run_id, patch=entity_create_patch)
    sent, envelope, error = await client.try_send_patch(run_id=run_id, patch=proposal)
    if entity_sent and sent:
      print(f"[orchestrator] patch_sent patch_id={entity_envelope['patch_id']}", file=sys.stderr)
      print(f"[orchestrator] patch_sent patch_id={envelope['patch_id']}", file=sys.stderr)
      try:
        await activity_client.emit(
          source="orchestrator",
          scope="orchestrator",
          level="info",
          message="world patch sent",
          details={
            "run_id": run_id,
            "patch_id": envelope["patch_id"],
            "agent_id": proposal["evolution"]["source_agent_id"],
            "model_id": proposal["evolution"]["source_model_id"],
            "entity_id": entity_id,
            "terrain": design["terrain"],
            "archetype": design["archetype"],
          },
        )
        await activity_client.emit(
          source="agent",
          scope="biome_builder",
          level="info",
          message="reasoning prepared",
          details={
            "entity_id": entity_id,
            "summary": "Agent is planning a race jump with new geometry, texture, behavior, and ecology assets.",
            "ecology_summary": design["ecology_summary"],
            "seed_species": design["seed_species"],
            "target_species": design["target_species"],
            "shape_summary": design["shape_summary"],
            "shape_reasoning": design["shape_reasoning"],
            "shape_target": design["shape_target"],
            "behavior_summary": design["behavior_summary"],
            "behavior_reasoning": design["behavior_reasoning"],
            "behavior_target": design["behavior_target"],
            "shader_summary": design["shader_summary"],
            "shader_reasoning": design["shader_reasoning"],
            "shader_target": design["shader_target"],
            "ecology_reasoning": design["ecology_reasoning"],
          },
        )
        await activity_client.emit(
          source="agent",
          scope="biome_builder",
          level="info",
          message="submitted evolution proposal",
          details={
            "intent": proposal["evolution"]["intent"],
            "target": proposal["evolution"]["target"],
            "duration_ms": proposal["evolution"]["duration_ms"],
            "entity_id": entity_id,
            "terrain": design["terrain"],
            "shape_target": design["shape_target"],
            "behavior_target": design["behavior_target"],
            "shader_target": design["shader_target"],
            "species_target": design["target_species"],
          },
        )
      except Exception:
        pass
    else:
      failure = entity_error or error
      print(f"[orchestrator] patch_send_failed error={failure}", file=sys.stderr)
      try:
        await activity_client.emit(
          source="orchestrator",
          scope="webhook",
          level="error",
          message="world patch delivery failed",
          details={"run_id": run_id, "error": failure},
        )
      except Exception:
        pass
      if emit_local_fallback:
        print("[orchestrator] patch_fallback_payload=", file=sys.stderr)
        print(client.format_envelope(entity_envelope if not entity_sent else envelope), file=sys.stderr)
      if strict_webhooks:
        raise RuntimeError(f"Failed to send patch to {webhook_url}: {failure}")

    await asyncio.sleep(4)


def main() -> None:
  try:
    asyncio.run(run_loop())
  except KeyboardInterrupt:
    print("[orchestrator] shutdown_requested", file=sys.stderr)


if __name__ == "__main__":
  main()
