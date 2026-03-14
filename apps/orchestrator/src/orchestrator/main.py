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
    entity_id = f"entity_orch_{now_ms}"
    evolution_id = f"evo_orch_{now_ms}"
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
        "position": [round(math.cos(angle) * 4, 3), 0.35, round(math.sin(angle) * 4, 3)],
        "rotationY": round(angle, 3),
        "scale": 0.35,
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
          message="submitted evolution proposal",
          details={
            "intent": proposal["evolution"]["intent"],
            "target": proposal["evolution"]["target"],
            "duration_ms": proposal["evolution"]["duration_ms"],
            "entity_id": entity_id,
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
