from dataclasses import dataclass
import httpx


@dataclass(frozen=True)
class OllamaModel:
  base_url: str
  model: str

  async def generate(self, prompt: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
      r = await client.post(
        f"{self.base_url}/api/generate",
        json={"model": self.model, "prompt": prompt, "stream": False},
      )
      r.raise_for_status()
      data = r.json()
      return data.get("response", "")

