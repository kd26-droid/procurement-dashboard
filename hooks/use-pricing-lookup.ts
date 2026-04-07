/**
 * usePricingLookup
 *
 * Pulls MPNs off the dashboard's line items, calls the pricing repo
 * cheapest-by-mpn endpoint, caches per (settings hash), and returns a
 * map keyed by MPN that the table cells render from.
 *
 * Re-fires when items change OR when any pricing setting changes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchCheapestByMpn,
  isExpiredContract,
  isZeroRateOrDraftQuote,
  type CheapestByMpnPerSource,
  type PriceBasis,
  type PricingRecord,
  type PricingSourceType,
} from '@/lib/pricingRepo';

// ----------------------------------------------------------------------------
// Settings shape (mirrors the settings dialog)
// ----------------------------------------------------------------------------

export interface PricingLookupSettings {
  /** Number of days back from today. null = no lower bound. */
  daysBack: number | null;
  priceBasis: PriceBasis;
  sourceTypes: PricingSourceType[];
  excludeExpiredContracts: boolean;
  excludeZeroRateAndDraftQuotes: boolean;
}

export const DEFAULT_PRICING_SETTINGS: PricingLookupSettings = {
  daysBack: 180,
  priceBasis: 'effective_rate',
  sourceTypes: ['PO', 'CONTRACT', 'QUOTE', 'RFQ'],
  excludeExpiredContracts: true,
  excludeZeroRateAndDraftQuotes: true,
};

// ----------------------------------------------------------------------------
// MPN extraction — scans customId_* keys with fuzzy matching
// ----------------------------------------------------------------------------

/** Identification names we treat as "an MPN field". Only "MPN" and "MPN Code". */
const MPN_NAME_PATTERNS = new Set(['mpn', 'mpncode']);

/** Strip spaces, dashes, dots, slashes; lowercase. */
function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[\s\-_./]/g, '');
}

/**
 * Pull the MPN value off a transformed line item.
 * Looks at every key matching customId_<name> and returns the first one
 * whose normalized name matches a known MPN pattern.
 */
/**
 * Pull the MPN value off a transformed line item.
 *
 * MPN can live in several places depending on how the project is set up:
 *   - As a specification: key `spec_MPN` or `spec_MPN_Code`
 *   - As a custom identification: key `customId_MPN` or `customId_MPN_Code`
 *
 * Both prefixes are scanned, MPN takes priority over MPN Code.
 */
export function extractMpn(item: any): string | null {
  if (!item || typeof item !== 'object') return null;

  const candidates: Array<{ normalized: string; value: string }> = [];

  for (const key of Object.keys(item)) {
    let rawName: string | null = null;
    if (key.startsWith('customId_')) {
      rawName = key.slice('customId_'.length).replace(/_/g, ' ');
    } else if (key.startsWith('spec_')) {
      rawName = key.slice('spec_'.length).replace(/_/g, ' ');
    } else {
      continue;
    }

    const normalized = normalizeFieldName(rawName);
    if (!MPN_NAME_PATTERNS.has(normalized)) continue;

    const val = item[key];
    if (val == null) continue;
    const trimmed = String(val).trim();
    if (!trimmed || trimmed === '-' || trimmed === '—') continue;

    candidates.push({ normalized, value: trimmed });
  }

  if (candidates.length === 0) return null;

  // Prefer exact "mpn" over "mpncode"
  const exact = candidates.find((c) => c.normalized === 'mpn');
  if (exact) return exact.value;
  return candidates[0].value;
}

// ----------------------------------------------------------------------------
// Cache — keyed by hash of (mpns + settings)
// ----------------------------------------------------------------------------

interface CacheEntry {
  results: Record<string, CheapestByMpnPerSource | null>;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function buildCacheKey(mpns: string[], settings: PricingLookupSettings): string {
  return JSON.stringify({
    m: [...mpns].sort(),
    d: settings.daysBack,
    b: settings.priceBasis,
    s: [...settings.sourceTypes].sort(),
  });
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ----------------------------------------------------------------------------
// Filter applied to the BE response
// ----------------------------------------------------------------------------

function applyClientFilters(
  perSource: CheapestByMpnPerSource | null,
  settings: PricingLookupSettings,
): CheapestByMpnPerSource | null {
  if (!perSource) return null;
  const out: CheapestByMpnPerSource = {};
  for (const [src, rec] of Object.entries(perSource)) {
    const key = src as PricingSourceType;
    if (!rec) {
      out[key] = null;
      continue;
    }
    if (settings.excludeExpiredContracts && isExpiredContract(rec)) {
      out[key] = null;
      continue;
    }
    if (
      settings.excludeZeroRateAndDraftQuotes &&
      isZeroRateOrDraftQuote(rec, settings.priceBasis)
    ) {
      out[key] = null;
      continue;
    }
    out[key] = rec;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------------

export interface PricingLookupState {
  /** Map: mpn → per-source cheapest record (after client-side filters). */
  byMpn: Map<string, CheapestByMpnPerSource | null>;
  /** Map: lineItem.id → mpn (so cells can look up by row id). */
  itemIdToMpn: Map<string | number, string | null>;
  loading: boolean;
  error: string | null;
  /** Force a refetch (bypasses cache). */
  refetch: () => void;
}

export function usePricingLookup(
  items: any[],
  settings: PricingLookupSettings,
  enabled: boolean = true,
): PricingLookupState {
  const [state, setState] = useState<{
    byMpn: Map<string, CheapestByMpnPerSource | null>;
    loading: boolean;
    error: string | null;
  }>({
    byMpn: new Map(),
    loading: false,
    error: null,
  });
  const [refetchToken, setRefetchToken] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  // Build itemId → mpn map (for the cells)
  const itemIdToMpn = useMemo(() => {
    const m = new Map<string | number, string | null>();
    for (const it of items) {
      m.set(it.id ?? it.project_item_id, extractMpn(it));
    }
    return m;
  }, [items]);

  // Unique non-null MPNs
  const mpns = useMemo(() => {
    const set = new Set<string>();
    for (const v of itemIdToMpn.values()) {
      if (v) set.add(v);
    }
    return Array.from(set);
  }, [itemIdToMpn]);

  useEffect(() => {
    if (!enabled || mpns.length === 0) {
      setState({ byMpn: new Map(), loading: false, error: null });
      return;
    }

    const cacheKey = buildCacheKey(mpns, settings);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS && refetchToken === 0) {
      const filtered = new Map<string, CheapestByMpnPerSource | null>();
      for (const [mpn, perSource] of Object.entries(cached.results)) {
        filtered.set(mpn, applyClientFilters(perSource, settings));
      }
      setState({ byMpn: filtered, loading: false, error: null });
      return;
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setState((s) => ({ ...s, loading: true, error: null }));

    const dateFrom = settings.daysBack !== null ? isoDaysAgo(settings.daysBack) : undefined;
    const dateTo = settings.daysBack !== null ? todayIso() : undefined;

    fetchCheapestByMpn({
      mpns,
      source_types: settings.sourceTypes,
      date_from: dateFrom,
      date_to: dateTo,
      price_basis: settings.priceBasis,
    })
      .then((resp) => {
        if (controller.signal.aborted) return;
        cache.set(cacheKey, { results: resp.results, fetchedAt: Date.now() });
        const filtered = new Map<string, CheapestByMpnPerSource | null>();
        for (const [mpn, perSource] of Object.entries(resp.results)) {
          filtered.set(mpn, applyClientFilters(perSource, settings));
        }
        setState({ byMpn: filtered, loading: false, error: null });
      })
      .catch((err: any) => {
        if (controller.signal.aborted) return;
        console.error('[usePricingLookup] fetch failed:', err);
        setState({ byMpn: new Map(), loading: false, error: err?.message || 'Pricing lookup failed' });
      });

    return () => controller.abort();
    // mpns is derived from itemIdToMpn; settings is whole object; refetchToken forces reruns
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    mpns.join('|'),
    settings.daysBack,
    settings.priceBasis,
    settings.sourceTypes.join(','),
    settings.excludeExpiredContracts,
    settings.excludeZeroRateAndDraftQuotes,
    refetchToken,
  ]);

  return {
    byMpn: state.byMpn,
    itemIdToMpn,
    loading: state.loading,
    error: state.error,
    refetch: () => setRefetchToken((t) => t + 1),
  };
}

// ----------------------------------------------------------------------------
// localStorage persistence helpers
// ----------------------------------------------------------------------------

const STORAGE_KEY = 'procurementDashboard.pricingLookupSettings.v1';

export function loadPricingSettings(): PricingLookupSettings {
  if (typeof window === 'undefined') return DEFAULT_PRICING_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRICING_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PRICING_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_PRICING_SETTINGS;
  }
}

export function savePricingSettings(settings: PricingLookupSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota errors
  }
}

// ----------------------------------------------------------------------------
// Re-exports
// ----------------------------------------------------------------------------

export type { PricingRecord, CheapestByMpnPerSource, PriceBasis, PricingSourceType };
