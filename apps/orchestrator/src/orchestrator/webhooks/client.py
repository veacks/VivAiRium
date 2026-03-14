from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict

import httpx


@dataclass(frozen=True)
class PatchWebhookClient:
  webhook_url: str

  def build_envelope(self, run_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    created_at_ms = int(time.time() * 1000)
    suffix = uuid.uuid4().hex
    return {
      "patch_id": f"patch_{created_at_ms}_{suffix}",
      "idempotency_key": f"{run_id}:{created_at_ms}:{suffix}",
      "created_at_ms": created_at_ms,
      "source": {"kind": "orchestrator", "run_id": run_id},
      "patch": patch,
    }

  async def send_patch(self, run_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    envelope = self.build_envelope(run_id=run_id, patch=patch)
    async with httpx.AsyncClient(timeout=20) as client:
      r = await client.post(self.webhook_url, json=envelope)
      r.raise_for_status()
    return envelope

  async def try_send_patch(self, run_id: str, patch: Dict[str, Any]) -> tuple[bool, Dict[str, Any], str | None]:
    envelope = self.build_envelope(run_id=run_id, patch=patch)
    try:
      async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(self.webhook_url, json=envelope)
        r.raise_for_status()
      return True, envelope, None
    except httpx.HTTPError as exc:
      return False, envelope, str(exc)

  @staticmethod
  def format_envelope(envelope: Dict[str, Any]) -> str:
    return json.dumps(envelope, indent=2, sort_keys=True)
