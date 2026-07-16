import type { SQLiteDatabase } from 'expo-sqlite';
import { calculateActivationMetric, type ActivationMetric } from '../core/activation';
import { loadActivityTimestamps, setSetting } from '../core/db';

export const ACTIVATION_SETTING = 'activation_metric';

/** Recompute locally and store inside the settings table carried by backups. */
export async function refreshActivationMetric(
  db: SQLiteDatabase,
  now = Date.now()
): Promise<ActivationMetric> {
  const metric = calculateActivationMetric(await loadActivityTimestamps(db), now);
  await setSetting(db, ACTIVATION_SETTING, JSON.stringify(metric), now);
  return metric;
}

