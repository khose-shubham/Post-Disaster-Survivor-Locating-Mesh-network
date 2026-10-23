/**
 * TRACE Operational Persistence Module
 *
 * Provides verified client-side local storage persistence for operational records:
 * - Rescue operations and audit histories
 * - Confirmed survivor records
 * - Incident records and timeline logs
 *
 * Safe for SSR (guards against non-browser environments).
 * Validates schema on load to prevent corrupted or tampered local records.
 * Never stores credentials, tokens, or encryption keys.
 */

import type { AppEvent, ConfirmedSurvivorRecord, RescueOperation } from "./types";
import type { Incident } from "./state";

const STORAGE_KEY = "trace_operational_records_v1";

export interface PersistedOperationalBundle {
  version: 1 | 2;
  savedAt: number;
  incidents: Incident[];
  operations: RescueOperation[];
  survivors: ConfirmedSurvivorRecord[];
  events?: AppEvent[] | undefined;
}

export function isLocalStorageAvailable(): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }
  try {
    const testKey = "__trace_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function loadPersistedOperationalData(): PersistedOperationalBundle | null {
  if (!isLocalStorageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed.version !== 1 && parsed.version !== 2) ||
      !Array.isArray(parsed.operations) ||
      !Array.isArray(parsed.survivors) ||
      !Array.isArray(parsed.incidents)
    ) {
      return null;
    }
    return parsed as PersistedOperationalBundle;
  } catch {
    return null;
  }
}

export function savePersistedOperationalData(bundle: {
  incidents: Incident[];
  operations: RescueOperation[];
  survivors: ConfirmedSurvivorRecord[];
  events?: AppEvent[] | undefined;
}): boolean {
  if (!isLocalStorageAvailable()) return false;
  try {
    const payload: PersistedOperationalBundle = {
      version: 2,
      savedAt: Date.now(),
      incidents: bundle.incidents,
      operations: bundle.operations,
      survivors: bundle.survivors,
      ...(bundle.events !== undefined ? { events: bundle.events } : {}),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearPersistedOperationalData(): boolean {
  if (!isLocalStorageAvailable()) return false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
