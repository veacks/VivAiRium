import asyncio
import os
import sys
import time
from typing import Dict

from orchestrator.webhooks.client import PatchWebhookClient
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
  webhook_url = os.environ.get("VIVAIRIUM_PATCH_WEBHOOK_URL", "http://localhost:8888/.netlify/functions/patch-webhook")
  run_id = os.environ.get("VIVAIRIUM_RUN_ID", f"run_{int(time.time())}")
  strict_webhooks = env_flag("VIVAIRIUM_STRICT_WEBHOOKS", default=False)
  emit_local_fallback = env_flag("VIVAIRIUM_PRINT_PATCHES_ON_FAILURE", default=True)
  role_model_assignments = build_role_model_assignments()

  registry = build_model_registry()

  moderation = ModerationPolicy()
  client = PatchWebhookClient(webhook_url=webhook_url)

  print(f"[orchestrator] run_id={run_id}", file=sys.stderr)
  print(f"[orchestrator] webhook_url={webhook_url}", file=sys.stderr)
  print(f"[orchestrator] strict_webhooks={strict_webhooks}", file=sys.stderr)
  for role, model_id in role_model_assignments.items():
    spec = registry.get(model_id)
    if spec is not None:
      print(f"[orchestrator] role_model role={role} model={spec.config['model']}", file=sys.stderr)

  while True:
    # MVP: emit a simple agent-driven evolution patch envelope periodically.
    biome_model_id = role_model_assignments["biome_builder"]
    biome_model_spec = registry.get(biome_model_id)
    proposal = {
      "kind": "evolution.schedule",
      "evolution": {
        "id": f"evo_orch_{int(time.time() * 1000)}",
        "source_agent_id": "agent_biome_builder",
        "source_model_id": biome_model_id,
        "intent": "Orchestrator proposes a calm ambience shift.",
        "start_time_ms": int(time.time() * 1000),
        "duration_ms": 20000,
        "stages": [{"name": "fade_in", "duration_ms": 8000}, {"name": "hold", "duration_ms": 8000}, {"name": "fade_out", "duration_ms": 4000}],
        "progress_t": 0,
        "canceled": False,
        "target": {"kind": "chunk", "chunk_id": "0:0"},
        "expected_final": {
          "ambience": "calm",
          "assigned_role_models": role_model_assignments,
          "source_model_name": biome_model_spec.config["model"] if biome_model_spec is not None else None,
        },
        "history": []
      }
    }

    if not moderation.is_allowed_json(proposal):
      await asyncio.sleep(3)
      continue

    sent, envelope, error = await client.try_send_patch(run_id=run_id, patch=proposal)
    if sent:
      print(f"[orchestrator] patch_sent patch_id={envelope['patch_id']}", file=sys.stderr)
    else:
      print(f"[orchestrator] patch_send_failed error={error}", file=sys.stderr)
      if emit_local_fallback:
        print("[orchestrator] patch_fallback_payload=", file=sys.stderr)
        print(client.format_envelope(envelope), file=sys.stderr)
      if strict_webhooks:
        raise RuntimeError(f"Failed to send patch to {webhook_url}: {error}")

    await asyncio.sleep(10)


def main() -> None:
  try:
    asyncio.run(run_loop())
  except KeyboardInterrupt:
    print("[orchestrator] shutdown_requested", file=sys.stderr)


if __name__ == "__main__":
  main()
