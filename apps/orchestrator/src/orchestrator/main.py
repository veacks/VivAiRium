import asyncio
import os
import sys
import time

from orchestrator.webhooks.client import PatchWebhookClient
from orchestrator.models.registry import ModelRegistry, ModelSpec
from orchestrator.moderation.policy import ModerationPolicy


def env_flag(name: str, default: bool) -> bool:
  raw = os.environ.get(name)
  if raw is None:
    return default
  return raw.strip().lower() in {"1", "true", "yes", "on"}


async def run_loop() -> None:
  webhook_url = os.environ.get("VIVAIRIUM_PATCH_WEBHOOK_URL", "http://localhost:8888/.netlify/functions/patch-webhook")
  run_id = os.environ.get("VIVAIRIUM_RUN_ID", f"run_{int(time.time())}")
  strict_webhooks = env_flag("VIVAIRIUM_STRICT_WEBHOOKS", default=False)
  emit_local_fallback = env_flag("VIVAIRIUM_PRINT_PATCHES_ON_FAILURE", default=True)

  registry = ModelRegistry(
    models=[
      ModelSpec(
        id="model_ollama_default",
        provider="ollama",
        label="Ollama Local",
        meta={"latency": "low", "cost": "low", "creativity": 0.6, "safety": "medium", "locality": "local"},
        config={"base_url": os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"), "model": os.environ.get("OLLAMA_MODEL", "llama3")}
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

  moderation = ModerationPolicy()
  client = PatchWebhookClient(webhook_url=webhook_url)

  print(f"[orchestrator] run_id={run_id}", file=sys.stderr)
  print(f"[orchestrator] webhook_url={webhook_url}", file=sys.stderr)
  print(f"[orchestrator] strict_webhooks={strict_webhooks}", file=sys.stderr)

  while True:
    # MVP: emit a simple agent-driven evolution patch envelope periodically.
    proposal = {
      "kind": "evolution.schedule",
      "evolution": {
        "id": f"evo_orch_{int(time.time() * 1000)}",
        "source_agent_id": "agent_orchestrator",
        "source_model_id": "model_ollama_default",
        "intent": "Orchestrator proposes a calm ambience shift.",
        "start_time_ms": int(time.time() * 1000),
        "duration_ms": 20000,
        "stages": [{"name": "fade_in", "duration_ms": 8000}, {"name": "hold", "duration_ms": 8000}, {"name": "fade_out", "duration_ms": 4000}],
        "progress_t": 0,
        "canceled": False,
        "target": {"kind": "chunk", "chunk_id": "0:0"},
        "expected_final": {"ambience": "calm"},
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
