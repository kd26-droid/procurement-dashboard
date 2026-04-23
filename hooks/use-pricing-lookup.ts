/**
 * usePricingLookup
 *
 * Extracts MPNs from line items, calls fetchCheapestByMpn, and returns
 * byItemId keyed by enterprise_item_id / erp_item_code / item_code so the
 * rest of the dashboard doesn't need to change.
 *
 * Why MPN and not cheapest-by-item?
 *   Items always get new codes when recreated, so item-ID lookups miss.
 *   MPN is stable — same part = same MPN regardless of item code.
 *
 * For items with no MPN, falls back to fetchCheapestByItem so they still
 * get results if the backend has matching records by item ID.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchCheapestByItem,
  fetchCheapestByMpn,
  isExpiredContract,
  isZeroRateOrDraftQuote,
  type CheapestByItemPerSource,
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
  daysBack: null,
  priceBasis: 'rate',
  sourceTypes: ['PO', 'CONTRACT', 'QUOTE', 'RFQ'],
  excludeExpiredContracts: true,
  excludeZeroRateAndDraftQuotes: false,
};

// ----------------------------------------------------------------------------
// MPN extraction — scans spec_* and customId_* keys with fuzzy matching
// ----------------------------------------------------------------------------

/** Strip spaces, dashes, underscores, dots, slashes; lowercase. */
function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[\s\-_./]/g, '');
}

/**
 * Returns true if a normalized field name looks like an MPN field.
 * Matches: mpn, mpn1, mpn2, mpncode, mpncd, mfgpn, partnumber, partno, etc.
 */
function isMpnField(normalized: string): boolean {
  if (normalized === 'mpn') return true;
  if (normalized.startsWith('mpn')) return true;   // mpn1, mpn2, mpncode, mpncd …
  if (normalized === 'mfgpn') return true;
  if (normalized === 'mfrpn') return true;
  if (normalized === 'manufacturerpartnumber') return true;
  if (normalized === 'mfgpartnumber') return true;
  if (normalized === 'partnumber') return true;
  if (normalized === 'partno') return true;
  return false;
}

/**
 * Pull the MPN value off a transformed line item.
 *
 * Scans every key matching spec_<name> or customId_<name>.
 * Priority: exact "mpn" > "mpncode" > anything else starting with "mpn".
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
    if (!isMpnField(normalized)) continue;

    const val = item[key];
    if (val == null) continue;
    const trimmed = String(val).trim();
    if (!trimmed || trimmed === '-' || trimmed === '—') continue;

    candidates.push({ normalized, value: trimmed });
  }

  if (candidates.length === 0) return null;

  // Priority: exact "mpn" > "mpncode" > other mpn* variants
  const exact = candidates.find((c) => c.normalized === 'mpn');
  if (exact) return exact.value;
  const code = candidates.find((c) => c.normalized === 'mpncode');
  if (code) return code.value;
  return candidates[0].value;
}

// ----------------------------------------------------------------------------
// Cache — keyed by hash of (identifiers + settings)
// ----------------------------------------------------------------------------

interface CacheEntry {
  results: Record<string, CheapestByMpnPerSource | null>;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function buildCacheKey(ids: string[], settings: PricingLookupSettings): string {
  return JSON.stringify({
    m: [...ids].sort(),
    d: settings.daysBack,
    b: settings.priceBasis,
    s: [...settings.sourceTypes].sort(),
  });
}

// Map user-facing price basis to the admin-currency equivalent for backend ranking.
// The backend compares raw numbers across currencies when given 'rate' / 'effective_rate' / 'quoted_rate',
// which picks the wrong cheapest in mixed-currency projects. The *_in_admin_currency variants
// rank correctly. We still display native rate + currency_code to the user from the returned record.
function toRankingBasis(basis: PriceBasis): PriceBasis {
  if (basis === 'rate') return 'rate_in_admin_currency';
  if (basis === 'effective_rate') return 'effective_rate_in_admin_currency';
  if (basis === 'quoted_rate') return 'quoted_rate_in_admin_currency';
  return basis;
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
// Client-side filters
// ----------------------------------------------------------------------------

function applyClientFilters(
  perSource: CheapestByMpnPerSource | null,
  settings: PricingLookupSettings,
): CheapestByMpnPerSource | null {
  if (!perSource) return null;
  const out: CheapestByMpnPerSource = {};
  for (const [src, rec] of Object.entries(perSource)) {
    const key = src as PricingSourceType;
    if (!rec) { out[key] = null; continue; }
    if (settings.excludeExpiredContracts && isExpiredContract(rec)) { out[key] = null; continue; }
    if (settings.excludeZeroRateAndDraftQuotes && isZeroRateOrDraftQuote(rec, settings.priceBasis)) { out[key] = null; continue; }
    out[key] = rec;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------------

export interface PricingLookupState {
  /** Map: lookupKey (enterprise_item_id / erp_item_code / item_code) → per-source cheapest record. */
  byItemId: Map<string, CheapestByItemPerSource | null>;
  /** Map: lineItem.id → mpn (for chart history lookups). */
  itemIdToMpn: Map<string | number, string | null>;
  /** Map: mpn → per-source (for chart history lookups). */
  byMpn: Map<string, CheapestByMpnPerSource | null>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePricingLookup(
  items: any[],
  settings: PricingLookupSettings,
  enabled: boolean = true,
): PricingLookupState {
  const [state, setState] = useState<{
    byItemId: Map<string, CheapestByItemPerSource | null>;
    byMpn: Map<string, CheapestByMpnPerSource | null>;
    loading: boolean;
    error: string | null;
  }>({
    byItemId: new Map(),
    byMpn: new Map(),
    loading: false,
    error: null,
  });
  const [refetchToken, setRefetchToken] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  // lineItem.id → mpn (for chart history)
  const itemIdToMpn = useMemo(() => {
    const m = new Map<string | number, string | null>();
    for (const it of items) {
      m.set(it.id ?? it.project_item_id, extractMpn(it));
    }
    return m;
  }, [items]);

  // Per-item metadata: lookupKey, mpn, currency, and whether it has an MPN
  const itemEntries = useMemo(() => {
    // NOTE: same MPN can appear on multiple items with different currencies —
    // do NOT deduplicate by MPN. Deduplicate by lookupKey (enterprise_item_id) only.
    const seen = new Set<string>();
    const entries: Array<{
      lookupKey: string;
      enterprise_item_id: string | null;
      erp_item_code: string | null;
      item_code: string | null;
      mpn: string | null;
      project_currency_code: string | null;
    }> = [];
    for (const it of items) {
      const eid = it.enterprise_item_id || null;
      const erp = it.erp_item_code || null;
      const icode = it.itemId || it.item_code || null;
      const key = eid || erp || icode;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      entries.push({
        lookupKey: key,
        enterprise_item_id: eid,
        erp_item_code: erp,
        item_code: icode,
        mpn: extractMpn(it),
        project_currency_code: it.currency?.code || null,
      });
    }
    return entries;
  }, [items]);

  const itemEntriesKey = useMemo(
    () => itemEntries.map(e => e.lookupKey).sort().join('|'),
    [itemEntries],
  );

  useEffect(() => {
    if (!enabled || itemEntries.length === 0) {
      setState({ byItemId: new Map(), byMpn: new Map(), loading: false, error: null });
      return;
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setState((s) => ({ ...s, loading: true, error: null }));

    const dateFrom = settings.daysBack !== null ? isoDaysAgo(settings.daysBack) : undefined;
    const dateTo   = settings.daysBack !== null ? todayIso()                     : undefined;

    const withMpn    = itemEntries.filter(e => !!e.mpn);
    const withoutMpn = itemEntries.filter(e => !e.mpn);

    const promises: Promise<any>[] = [];

    const rankingBasis = toRankingBasis(settings.priceBasis);

    // --- MPN-based lookup — new items[] shape, response keyed by enterprise_item_id ---
    if (withMpn.length > 0) {
      promises.push(
        fetchCheapestByMpn({
          items: withMpn.map(e => ({
            mpn: e.mpn as string,
            enterprise_item_id: e.enterprise_item_id || undefined,
            project_currency_code: e.project_currency_code || undefined,
          })),
          source_types: settings.sourceTypes,
          date_from: dateFrom,
          date_to: dateTo,
          price_basis: rankingBasis,
        }),
      );
    } else {
      promises.push(Promise.resolve(null));
    }

    // --- Item-ID fallback for items without MPN ---
    if (withoutMpn.length > 0) {
      promises.push(
        fetchCheapestByItem({
          items: withoutMpn.map(e => ({
            enterprise_item_id: e.enterprise_item_id || undefined,
            erp_item_code:      e.erp_item_code      || undefined,
            item_code:          e.item_code           || undefined,
          })),
          source_types: settings.sourceTypes,
          date_from: dateFrom,
          date_to: dateTo,
          price_basis: rankingBasis,
        }),
      );
    } else {
      promises.push(Promise.resolve(null));
    }

    Promise.all(promises)
      .then(([mpnResp, itemResp]) => {
        if (controller.signal.aborted) return;

        const byItemId = new Map<string, CheapestByItemPerSource | null>();
        const byMpn    = new Map<string, CheapestByMpnPerSource | null>();

        // Response now keyed by enterprise_item_id — map directly to lookupKey
        if (mpnResp?.results) {
          for (const entry of withMpn) {
            const key = entry.enterprise_item_id || entry.lookupKey;
            const raw = mpnResp.results[key] ?? null;
            const filtered = applyClientFilters(raw, settings);
            byItemId.set(entry.lookupKey, filtered);
            // Also populate byMpn for chart history lookups
            if (entry.mpn) byMpn.set(entry.mpn, filtered);
          }
        }

        // Map item-ID results for no-MPN items
        if (itemResp?.results) {
          for (const entry of withoutMpn) {
            const raw = itemResp.results[entry.lookupKey] ?? null;
            byItemId.set(entry.lookupKey, applyClientFilters(raw, settings));
          }
        }

        setState({ byItemId, byMpn, loading: false, error: null });
      })
      .catch((err: any) => {
        if (controller.signal.aborted) return;
        console.error('[usePricingLookup] fetch failed:', err);
        setState({ byItemId: new Map(), byMpn: new Map(), loading: false, error: err?.message || 'Pricing lookup failed' });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    itemEntriesKey,
    settings.daysBack,
    settings.priceBasis,
    settings.sourceTypes.join(','),
    settings.excludeExpiredContracts,
    settings.excludeZeroRateAndDraftQuotes,
    refetchToken,
  ]);

  return {
    byItemId: state.byItemId,
    byMpn:    state.byMpn,
    itemIdToMpn,
    loading:  state.loading,
    error:    state.error,
    refetch:  () => setRefetchToken((t) => t + 1),
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
