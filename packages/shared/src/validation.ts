export function assertObject(v: unknown, msg = "Expected object"): asserts v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) throw new Error(msg);
}

export function assertString(v: unknown, msg = "Expected string"): asserts v is string {
  if (typeof v !== "string") throw new Error(msg);
}

export function assertNumber(v: unknown, msg = "Expected number"): asserts v is number {
  if (typeof v !== "number" || Number.isNaN(v)) throw new Error(msg);
}

