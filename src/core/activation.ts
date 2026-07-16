import { localDayKey } from './safety';

export interface ActivationMetric {
  unique_days: number;
  activated: boolean;
  first_activity_at: number | null;
  activated_at: number | null;
  computed_at: number;
}

/** Khatabook-style local activation: records made on two separate local days. */
export function calculateActivationMetric(
  timestamps: number[],
  computedAt = Date.now()
): ActivationMetric {
  const sorted = timestamps.filter(Number.isFinite).sort((a, b) => a - b);
  const firstByDay = new Map<string, number>();
  for (const at of sorted) if (!firstByDay.has(localDayKey(at))) firstByDay.set(localDayKey(at), at);
  const firsts = [...firstByDay.values()];
  return {
    unique_days: firsts.length,
    activated: firsts.length >= 2,
    first_activity_at: firsts[0] ?? null,
    activated_at: firsts[1] ?? null,
    computed_at: computedAt,
  };
}

