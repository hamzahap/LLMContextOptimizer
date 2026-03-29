interface IntegerOptionRange {
  min?: number;
  max?: number;
}

interface NumberOptionRange {
  min?: number;
  max?: number;
}

export function parseIntegerOption(raw: string, flag: string, range: IntegerOptionRange = {}): number {
  const value = Number(raw);

  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`Invalid ${flag}: "${raw}". Expected an integer.`);
  }

  if (range.min !== undefined && value < range.min) {
    throw new Error(`Invalid ${flag}: expected >= ${range.min}, got ${value}.`);
  }

  if (range.max !== undefined && value > range.max) {
    throw new Error(`Invalid ${flag}: expected <= ${range.max}, got ${value}.`);
  }

  return value;
}

export function parseNumberOption(raw: string, flag: string, range: NumberOptionRange = {}): number {
  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${flag}: "${raw}". Expected a number.`);
  }

  if (range.min !== undefined && value < range.min) {
    throw new Error(`Invalid ${flag}: expected >= ${range.min}, got ${value}.`);
  }

  if (range.max !== undefined && value > range.max) {
    throw new Error(`Invalid ${flag}: expected <= ${range.max}, got ${value}.`);
  }

  return value;
}
