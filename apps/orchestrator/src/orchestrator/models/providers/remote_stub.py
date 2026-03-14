from dataclasses import dataclass
import httpx


@dataclass(frozen=True)
class RemoteStubModel:
  base_url: str

  async def generate(self, prompt: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
      r = await client.post(f"{self.base_url}/generate", json={"prompt": prompt})
      r.raise_for_status()
      data = r.json()
      return data.get("text", "")

