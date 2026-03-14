import asyncio
import math
import os
import sys
import time
from typing import Dict

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
        meta={"latency": "low", "cost": "low", "creativity": 0.65, "safety": "medium", "locality": "local"},
        config={"base_url": ollama_base_url, "model": os.environ.get("OLLAMA_MODEL_BIOME", "llama3.1")}
      ),
      ModelSpec(
        id="model_ollama_qwen2_5_7b",
        provider="ollama",
        label="Ollama Qwen 2.5 7B",
        meta={"latency": "low", "cost": "low", "creativity": 0.6, "safety": "medium", "locality": "local"},
        config={"base_url": ollama_base_url, "model": os.environ.get("OLLAMA_MODEL_META", "qwen2.5:7b")}
      ),
      ModelSpec(
        id="model_ollama_qwen2_5_coder_7b",
        provider="ollama",
        label="Ollama Qwen 2.5 Coder 7B",
        meta={"latency": "low", "cost": "low", "creativity": 0.55, "safety": "medium", "locality": "local"},
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


def build_evolution_design(orbit_index: int) -> Dict[str, object]:
  shape_variants = [
    {
      "seed": {"kind": "pod", "stretch": 0.78, "taper": 0.56, "wobble": 0.08, "ridges": 5},
      "target": {"kind": "frond", "stretch": 1.65, "taper": 0.28, "wobble": 0.22, "ridges": 8},
      "summary": "Open the flora from a compact pod into a taller frond so it reads as a deliberate growth event.",
      "reasoning": [
        "Start with a closed silhouette to make the first growth stage legible.",
        "Increase stretch and ridges during sprout to add vertical cadence near the origin.",
        "Preserve moderate wobble so the shader motion remains readable rather than noisy.",
      ],
    },
    {
      "seed": {"kind": "frond", "stretch": 1.0, "taper": 0.52, "wobble": 0.12, "ridges": 6},
      "target": {"kind": "fan", "stretch": 1.35, "taper": 0.34, "wobble": 0.3, "ridges": 10},
      "summary": "Spread the plant into a fan profile to widen the occupied volume without crowding the center.",
      "reasoning": [
        "Use a fan target when the orbit angle already creates directional separation.",
        "Add wobble late so the fan looks alive instead of static geometry.",
        "Keep taper above zero so the object still feels organic instead of mechanical.",
      ],
    },
    {
      "seed": {"kind": "crystal", "stretch": 0.84, "taper": 0.22, "wobble": 0.04, "ridges": 7},
      "target": {"kind": "orb", "stretch": 1.2, "taper": 0.62, "wobble": 0.18, "ridges": 9},
      "summary": "Round the shape over time so the organism feels like it softens as it matures.",
      "reasoning": [
        "Begin from a faceted seed to emphasize the mutation starting point.",
        "Shift toward an orb once growth stabilizes to contrast with the sharper initial form.",
        "Raise ridge density while rounding to keep shader highlights articulated.",
      ],
    },
  ]
  behavior_variants = [
    {
      "seed": {"mode": "rooted", "amplitude": 0.06, "frequency": 0.42, "phase": 0.0, "drift": 0.0},
      "target": {"mode": "pulse", "amplitude": 0.42, "frequency": 0.95, "phase": 0.15, "drift": 0.1},
      "summary": "Wake the organism from a rooted seed into a breathing pulse without turning it into fauna.",
      "reasoning": [
        "Keep the first phase anchored so the viewer registers the spawn location clearly.",
        "Introduce amplitude gradually to communicate growth, not teleportation.",
        "Limit drift to preserve a calm center composition.",
      ],
    },
    {
      "seed": {"mode": "pulse", "amplitude": 0.18, "frequency": 0.7, "phase": 0.4, "drift": 0.06},
      "target": {"mode": "orbit", "amplitude": 0.85, "frequency": 0.52, "phase": 0.65, "drift": 0.14},
      "summary": "Transition from a local pulse into a slow orbit so the new element claims space over time.",
      "reasoning": [
        "Start with pulse to avoid an immediate lateral jump on creation.",
        "Use a slow orbit to create visible behavioral evolution rather than a static shader-only change.",
        "Keep frequency low enough that XR viewers can track the motion comfortably.",
      ],
    },
    {
      "seed": {"mode": "rooted", "amplitude": 0.05, "frequency": 0.35, "phase": 0.25, "drift": 0.0},
      "target": {"mode": "wander", "amplitude": 0.65, "frequency": 0.48, "phase": 0.95, "drift": 0.22},
      "summary": "Let the organism detach into a constrained wander to signal a more autonomous life cycle.",
      "reasoning": [
        "Delay the wander until the shape is established, otherwise the mutation reads as noise.",
        "Combine moderate amplitude and drift to keep motion inside the visible central field.",
        "Offset phase so successive agents do not synchronize into identical loops.",
      ],
    },
  ]
  shader_variants = [
    {
      "seed": {"style": "glass", "hue_shift": -0.06, "pulse": 0.12, "distortion": 0.02, "fresnel": 1.35},
      "target": {"style": "biolume", "hue_shift": 0.1, "pulse": 0.82, "distortion": 0.18, "fresnel": 1.55},
      "summary": "Move from a quiet translucent seed into a bioluminescent canopy with visible pulse bands.",
      "reasoning": [
        "Start with low pulse to keep the seed readable against the aquarium floor.",
        "Increase fresnel and distortion together so edge glow and surface motion reinforce each other.",
        "Bias hue upward to separate mature flora from the colder fauna palette.",
      ],
    },
    {
      "seed": {"style": "biolume", "hue_shift": 0.04, "pulse": 0.24, "distortion": 0.06, "fresnel": 1.2},
      "target": {"style": "electric", "hue_shift": 0.22, "pulse": 0.68, "distortion": 0.2, "fresnel": 1.7},
      "summary": "Escalate the shader from soft bioluminescence to a sharper electric edge as the mutation peaks.",
      "reasoning": [
        "Use electric only late in the lifecycle so the scene does not feel uniformly aggressive.",
        "Raise distortion to advertise that the material itself is evolving, not just the mesh.",
        "Push fresnel higher on fan shapes to sharpen their silhouette against the fog.",
      ],
    },
    {
      "seed": {"style": "glass", "hue_shift": -0.02, "pulse": 0.08, "distortion": 0.04, "fresnel": 1.45},
      "target": {"style": "caustic", "hue_shift": 0.16, "pulse": 0.58, "distortion": 0.14, "fresnel": 1.3},
      "summary": "Switch from glassy restraint to a caustic shader so motion reads through moving light rather than raw brightness.",
      "reasoning": [
        "Reserve the caustic style for rounded forms so surface light sweeps are easier to read.",
        "Keep pulse below the electric preset to avoid flicker overload in the console view.",
        "Use a mild hue shift so the shader evolution complements the morphology instead of overpowering it.",
      ],
    },
  ]

  shape_variant = shape_variants[orbit_index % len(shape_variants)]
  behavior_variant = behavior_variants[orbit_index % len(behavior_variants)]
  shader_variant = shader_variants[orbit_index % len(shader_variants)]
  target_scale = 0.95 + (orbit_index % 3) * 0.22

  return {
    "shape_seed": shape_variant["seed"],
    "shape_target": shape_variant["target"],
    "shape_summary": shape_variant["summary"],
    "shape_reasoning": shape_variant["reasoning"],
    "behavior_seed": behavior_variant["seed"],
    "behavior_target": behavior_variant["target"],
    "behavior_summary": behavior_variant["summary"],
    "behavior_reasoning": behavior_variant["reasoning"],
    "shader_seed": shader_variant["seed"],
    "shader_target": shader_variant["target"],
    "shader_summary": shader_variant["summary"],
    "shader_reasoning": shader_variant["reasoning"],
    "target_scale": target_scale,
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
    if spec is not None:
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
    # Emit a visible orchestrator-authored flora entity near the origin, then evolve it over time.
    biome_model_id = role_model_assignments["biome_builder"]
    biome_model_spec = registry.get(biome_model_id)
    now_ms = int(time.time() * 1000)
    orbit_index = (now_ms // 10_000) % 8
    angle = orbit_index * (math.pi / 4)
    design = build_evolution_design(orbit_index)
    entity_id = f"entity_orch_{now_ms}"
    evolution_id = f"evo_orch_{now_ms}"
    seed_position = [round(math.cos(angle) * 4, 3), 0.35, round(math.sin(angle) * 4, 3)]
    entity_create_patch = {
      "kind": "entity.create",
      "entity": {
        "id": entity_id,
        "archetype": "flora",
        "provenance": {
          "creator_agent_id": "agent_biome_builder",
          "creator_model_id": biome_model_id,
          "originating_evolution_id": evolution_id,
        },
        "chunk_id": "0:0",
        "anchor_position": seed_position,
        "position": seed_position,
        "rotationY": round(angle, 3),
        "scale": 0.35,
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
        "intent": "Orchestrator grows a visible flora cluster near the aquarium core.",
        "start_time_ms": now_ms,
        "duration_ms": 20000,
        "stages": [{"name": "seed", "duration_ms": 5000}, {"name": "sprout", "duration_ms": 7000}, {"name": "mature", "duration_ms": 8000}],
        "progress_t": 0,
        "canceled": False,
        "target": {"kind": "entity", "entity_id": entity_id},
        "expected_final": {
          "archetype": "flora",
          "shape_profile": design["shape_target"],
          "behavior_profile": design["behavior_target"],
          "shader_profile": design["shader_target"],
          "scale": design["target_scale"],
          "reasoning_summary": "Shape, behavior, and shader all evolve together so the organism reads as a real agent-authored mutation.",
          "reasoning_steps": [
            *design["shape_reasoning"],
            *design["behavior_reasoning"],
            *design["shader_reasoning"],
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
      await asyncio.sleep(3)
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
          },
        )
        await activity_client.emit(
          source="agent",
          scope="biome_builder",
          level="info",
          message="reasoning prepared",
          details={
            "entity_id": entity_id,
            "summary": "Agent is planning a coordinated evolution across morphology, motion, and shader response.",
            "shape_summary": design["shape_summary"],
            "shape_reasoning": design["shape_reasoning"],
            "shape_target": design["shape_target"],
            "behavior_summary": design["behavior_summary"],
            "behavior_reasoning": design["behavior_reasoning"],
            "behavior_target": design["behavior_target"],
            "shader_summary": design["shader_summary"],
            "shader_reasoning": design["shader_reasoning"],
            "shader_target": design["shader_target"],
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
            "shape_target": design["shape_target"],
            "behavior_target": design["behavior_target"],
            "shader_target": design["shader_target"],
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

    await asyncio.sleep(10)


def main() -> None:
  try:
    asyncio.run(run_loop())
  except KeyboardInterrupt:
    print("[orchestrator] shutdown_requested", file=sys.stderr)


if __name__ == "__main__":
  main()
