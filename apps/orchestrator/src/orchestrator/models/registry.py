from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

from orchestrator.models.providers.ollama import OllamaModel
from orchestrator.models.providers.remote_stub import RemoteStubModel


@dataclass(frozen=True)
class ModelSpec:
  id: str
  provider: str
  label: str
  meta: Dict[str, Any]
  config: Dict[str, Any]


class ModelRegistry:
  def __init__(self, models: List[ModelSpec]) -> None:
    self._models = {m.id: m for m in models}

  def get(self, model_id: str) -> ModelSpec | None:
    return self._models.get(model_id)

  def create_client(self, model_id: str):
    spec = self._models.get(model_id)
    if spec is None:
      return None
    if spec.provider == "ollama":
      return OllamaModel(base_url=spec.config["base_url"], model=spec.config["model"])
    if spec.provider == "remote_stub":
      return RemoteStubModel(base_url=spec.config["base_url"])
    return None

