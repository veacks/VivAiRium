from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Dict

import httpx


@dataclass(frozen=True)
class ActivityWebhookClient:
  activity_url: str

  async def emit(
    self,
    *,
    source: str,
    scope: str,
    level: str,
    message: str,
    details: Dict[str, Any] | None = None,
  ) -> None:
    payload = {
      "id": f"activity_{int(time.time() * 1000)}",
      "at_ms": int(time.time() * 1000),
      "source": source,
      "scope": scope,
      "level": level,
      "message": message,
      "details": details or {},
    }
    async with httpx.AsyncClient(timeout=10) as client:
      response = await client.post(self.activity_url, json=payload)
      response.raise_for_status()

