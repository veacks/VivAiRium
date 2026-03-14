export type Id<T extends string> = string & { __brand: T };

export type AgentId = Id<"agent">;
export type ModelId = Id<"model">;
export type EntityId = Id<"entity">;
export type EvolutionId = Id<"evolution">;
export type PatchId = Id<"patch">;

export function asId<T extends string>(v: string): Id<T> {
  return v as Id<T>;
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(16).slice(2);
  return `${prefix}_${Date.now().toString(16)}_${rand}`;
}

