from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ModerationPolicy:
  blocked_patterns = [
    # hateful / identity attacks
    re.compile(r"\b(nazi|kkk|white\s*supremacy)\b", re.IGNORECASE),
    re.compile(r"\b(kill\s+all)\b", re.IGNORECASE),
    # sexual content (broad MVP block)
    re.compile(r"\b(rape|incest|child)\b", re.IGNORECASE),
    # degrading stereotypes / slurs are intentionally not enumerated here; plug in provider moderation later.
  ]

  def is_allowed_text(self, text: str) -> bool:
    for pat in self.blocked_patterns:
      if pat.search(text):
        return False
    return True

  def is_allowed_json(self, data: Any) -> bool:
    try:
      txt = json.dumps(data, ensure_ascii=False)
    except Exception:
      return False
    return self.is_allowed_text(txt)

