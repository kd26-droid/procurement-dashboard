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
  fetchCheapestById,
  fetchCheapestByItem,
  fetchCheapestByMpn,
  isExpiredContract,
  isZeroRateOrDraftQuote,
  type CheapestByItemPerSource,
  type CheapestByMpnPerSource,
  type CheapestByMpnRecord,
  type CheapestOverall,
  type PriceBasis,
  type PricingRecord,
  type PricingSourceType,
} from '@/lib/pricingRepo';
import {
  fetchAutofillSettings,
  type AutofillSettings,
} from '@/lib/autofillSettings';
import {
  fetchPrimaryIdForTracking,
  type PrimaryIdForTracking,
} from '@/lib/primaryIdForTracking';

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

/**
 * Pull the identifier value to feed cheapest-by-id, based on the buyer's
 * Primary ID for tracking setting. Returns null when the chosen
 * identifier isn't populated on that line item — those rows get
 * skipped server-side anyway.
 *
 * The /strategy/items/ response only exposes erp_item_code directly on
 * the project item shape; MPN/CPN/HSN live in the item's attribute
 * fields (spec_X / customId_X — same place extractMpn() scans). So we
 * fall back to walking the attributes for any identifier the item
 * shape doesn't expose as a top-level field.
 */

/** Strip spaces, dashes, underscores, dots, slashes; lowercase.
 *  Shared with isMpnField — duplicated here to keep the helper local. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[\s\-_./]/g, '');
}

/**
 * Look through every spec_<name> / customId_<name> key on the item for
 * an attribute name that contains `needle`. Returns the first non-empty
 * value found, or null. `needle` is matched against the normalized
 * attribute name (so spec_HSN_Code and customId_hsn-code both hit
 * needle='hsn').
 */
function extractAttrValue(item: any, needle: string): string | null {
  if (!item || typeof item !== 'object') return null;
  const target = normalize(needle);
  for (const key of Object.keys(item)) {
    let rawName: string | null = null;
    if (key.startsWith('customId_')) {
      rawName = key.slice('customId_'.length).replace(/_/g, ' ');
    } else if (key.startsWith('spec_')) {
      rawName = key.slice('spec_'.length).replace(/_/g, ' ');
    } else {
      continue;
    }
    if (!normalize(rawName).includes(target)) continue;
    const val = item[key];
    if (val == null) continue;
    const trimmed = String(val).trim();
    if (!trimmed || trimmed === '-' || trimmed === '—') continue;
    return trimmed;
  }
  return null;
}

function extractIdForTracking(
  item: any,
  identifier: PrimaryIdForTracking,
): string | null {
  switch (identifier) {
    case 'MPN':
      // Prefer the direct item-master MPN now that the BE exposes it.
      // Fall back to attribute-scan for shapes where mpn_item_code is
      // empty but the buyer has MPN in spec_MPN / customId_MPN_Code.
      return (
        item?.mpn_item_code ||
        item?.MPN_item_code ||
        extractMpn(item) ||
        null
      );
    case 'ERP':
      // erp_item_code is on the project item shape directly.
      // Fall back to attributes for safety on shapes that omit it.
      return (
        (item?.erp_item_code as string | null) ??
        extractAttrValue(item, 'erp') ??
        null
      );
    case 'CPN':
      return (
        // BE /strategy/items/ now exposes cpn_item_code top-level.
        // Fall back to legacy field names + attribute walk for safety.
        item?.cpn_item_code ||
        item?.cpn ||
        item?.CPN_item_code ||
        extractAttrValue(item, 'cpn') ||
        null
      );
    case 'HSN':
      return (
        item?.hsn_item_code ||
        item?.hsn ||
        item?.HSN_item_code ||
        extractAttrValue(item, 'hsn') ||
        null
      );
    default:
      return null;
  }
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
    // `cheapest_overall` lives in the same dict but has a different
    // shape (no mpn/manufacturer/etc.) — pass it through untouched
    // rather than running source-record filters that don't apply.
    if (src === 'cheapest_overall') {
      out.cheapest_overall = rec as typeof out.cheapest_overall;
      continue;
    }
    const key = src as PricingSourceType;
    const sourceRec = rec as CheapestByMpnRecord | null;
    if (!sourceRec) { out[key] = null; continue; }
    if (settings.excludeExpiredContracts && isExpiredContract(sourceRec)) { out[key] = null; continue; }
    if (settings.excludeZeroRateAndDraftQuotes && isZeroRateOrDraftQuote(sourceRec, settings.priceBasis)) { out[key] = null; continue; }
    out[key] = sourceRec;
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
  /**
   * Map: lookupKey → BE-synthesised winner. Drives the Autofill button
   * (no FE-side cherry-picking). Honours UOM normalization, contract
   * blended rate, vendor block, tiebreakers — all server-side.
   */
  byItemIdOverall: Map<string, CheapestOverall | null>;
  /** Enterprise-level autofill setting fetched from BE on mount. */
  autofillSettings: AutofillSettings | null;
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
    byItemIdOverall: Map<string, CheapestOverall | null>;
    loading: boolean;
    error: string | null;
  }>({
    byItemId: new Map(),
    byMpn: new Map(),
    byItemIdOverall: new Map(),
    loading: false,
    error: null,
  });
  // Fetched once on mount, drives the hierarchy + price_basis on every
  // cheapest-by-mpn call. We don't refetch on dashboard prefs changes —
  // these are enterprise-wide, not session-local.
  const [autofillSettings, setAutofillSettings] =
    useState<AutofillSettings | null>(null);
  // Primary ID for tracking — fetched once on mount alongside autofill.
  // NULL means the admin hasn't picked, so the hook stays on the legacy
  // cheapest-by-mpn + cheapest-by-item dual-call path. Any non-null value
  // routes through the new cheapest-by-id endpoint.
  const [primaryId, setPrimaryId] =
    useState<PrimaryIdForTracking | null>(null);
  const [primaryIdLoaded, setPrimaryIdLoaded] = useState<boolean>(false);
  const [refetchToken, setRefetchToken] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAutofillSettings()
      .then((data) => {
        if (!cancelled) setAutofillSettings(data);
      })
      .catch((err) => {
        console.error('[usePricingLookup] settings fetch failed', err);
      });
    fetchPrimaryIdForTracking()
      .then((value) => {
        if (cancelled) return;
        setPrimaryId(value);
        setPrimaryIdLoaded(true);
      })
      .catch((err) => {
        console.error(
          '[usePricingLookup] primary-id fetch failed', err,
        );
        if (!cancelled) setPrimaryIdLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      /** Project item's UOM id — drives BE-side rate normalisation. */
      target_uom_id: string | null;
      /** Project item's UOM id for the requested_qty — sent for blended math. */
      requested_qty_uom_id: string | null;
      /** Item quantity — engages CONTRACT blended-rate engine on BE. */
      requested_qty: string | null;
      /**
       * Custom Part Number — used by the hierarchy walker when the item's
       * MPN doesn't return any rows but the buyer has CPN mapped on the
       * EnterpriseItem.
       */
      cpn: string | null;
    }> = [];
    for (const it of items) {
      const eid = it.enterprise_item_id || null;
      const erp = it.erp_item_code || null;
      const icode = it.itemId || it.item_code || null;
      // Two project items pointing at the same EnterpriseItem must stay
      // distinct here so each gets its own blended walk (their qty is
      // what differs). Project_item_id is the project row's PK — always
      // unique per row. Fall through to the legacy chain only when the
      // item shape doesn't expose it (event/req surfaces).
      const key =
        it.project_item_id ||
        it.id ||
        eid ||
        erp ||
        icode;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      // Pull UOM + qty from whichever shape the page passes us. Project
      // items expose these as measurement_unit_id / quantity directly;
      // event/req items use slightly different keys.
      const uomId =
        it.measurement_unit_id ||
        it.measurementUnitId ||
        it.measurement_unit?.measurement_unit_id ||
        null;
      const qty =
        it.quantity != null
          ? String(it.quantity)
          : it.qty != null
          ? String(it.qty)
          : null;
      const cpn = it.cpn || it.CPN_item_code || null;
      entries.push({
        lookupKey: key,
        enterprise_item_id: eid,
        erp_item_code: erp,
        item_code: icode,
        mpn: extractMpn(it),
        project_currency_code: it.currency?.code || null,
        target_uom_id: uomId,
        requested_qty_uom_id: uomId,
        requested_qty: qty,
        cpn,
      });
    }
    return entries;
  }, [items]);

  const itemEntriesKey = useMemo(
    () => itemEntries.map(e => e.lookupKey).sort().join('|'),
    [itemEntries],
  );

  useEffect(() => {
    console.log('[PRICE-DEBUG] effect fired', {
      enabled,
      itemEntriesCount: itemEntries.length,
      primaryIdLoaded,
      primaryId,
      refetchToken,
    });
    if (!enabled || itemEntries.length === 0) {
      console.log('[PRICE-DEBUG] early-return: gate failed', {
        enabled,
        itemEntriesCount: itemEntries.length,
      });
      setState({
        byItemId: new Map(),
        byMpn: new Map(),
        byItemIdOverall: new Map(),
        loading: false,
        error: null,
      });
      return;
    }
    // Wait for the Primary ID fetch to settle before deciding which
    // endpoint to call — calling the wrong one now means a wasted
    // refetch after the setting resolves and the FE flicker is jarring.
    if (!primaryIdLoaded) {
      console.log('[PRICE-DEBUG] early-return: primaryIdLoaded=false (still fetching)');
      return;
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setState((s) => ({ ...s, loading: true, error: null }));

    const dateFrom = settings.daysBack !== null ? isoDaysAgo(settings.daysBack) : undefined;
    const dateTo   = settings.daysBack !== null ? todayIso()                     : undefined;

    // ── Setting-driven path ────────────────────────────────────────
    // When admin has picked a Primary ID, route every item (with a
    // populated value on that identifier) through cheapest-by-id.
    // Items missing the chosen id are simply not queryable — BE would
    // 400 on an all-empty list, FE silently skips them and reports
    // empty results for that lookupKey.
    if (primaryId) {
      console.log('[PRICE-DEBUG] taking new-endpoint path; primaryId=', primaryId);
      // Build per-item request objects. Each line item gets:
      //   key                   — lookupKey (FE's stable line-row id)
      //   id                    — value of the chosen identifier
      //   project_currency_code — that line item's own project currency
      // Two line items sharing the same id but different currencies stay
      // distinct in the request (different keys) so the BE returns each
      // with its own per-currency conversion.
      type RequestItem = {
        key: string;
        id: string;
        project_currency_code?: string;
        target_uom_id?: string;
        requested_qty?: string;
        requested_qty_uom_id?: string;
      };
      const requestItems: RequestItem[] = [];
      let extractAttempts = 0;
      const sampleItem = items[0];
      if (sampleItem) {
        console.log(
          '[PRICE-DEBUG] sample item shape (keys):',
          Object.keys(sampleItem),
        );
        console.log(
          '[PRICE-DEBUG] sample identifier values:',
          {
            erp_item_code: sampleItem.erp_item_code,
            mpn_item_code: sampleItem.mpn_item_code,
            cpn_item_code: sampleItem.cpn_item_code,
            hsn_item_code: sampleItem.hsn_item_code,
          },
        );
      }
      for (const entry of itemEntries) {
        // The lookupKey chain now starts with project_item_id; the find
        // here must use the SAME chain or sourceItem never matches.
        const sourceItem = items.find(
          (it: any) => (
            it.project_item_id ||
            it.id ||
            it.enterprise_item_id ||
            it.erp_item_code ||
            it.itemId ||
            it.item_code
          ) === entry.lookupKey,
        );
        const value = sourceItem
          ? extractIdForTracking(sourceItem, primaryId)
          : null;
        extractAttempts++;
        if (!value || !value.trim()) {
          console.log('[PRICE-DEBUG] skipping item — extractor returned no value', {
            lookupKey: entry.lookupKey,
            primaryId,
            sourceItemFound: !!sourceItem,
          });
          continue;
        }
        // target_uom_id + requested_qty/uom unlock two server-side
        // overlays:
        //   target_uom_id    → cross-UOM ranking on rate_per_base_uom
        //   requested_qty    → CONTRACT blended-rate override (walks
        //                      tiers from the contract's current cursor
        //                      and replaces the static cheapest-tier-row
        //                      with what THIS qty would actually pay)
        requestItems.push({
          key: entry.lookupKey,
          id: value.trim(),
          project_currency_code: entry.project_currency_code || undefined,
          target_uom_id: entry.target_uom_id || undefined,
          requested_qty: entry.requested_qty || undefined,
          requested_qty_uom_id: entry.requested_qty_uom_id || undefined,
        });
      }
      const rankingBasis = toRankingBasis(settings.priceBasis);

      console.log('[PRICE-DEBUG] cheapest-by-id build done', {
        extractAttempts,
        requestItemsCount: requestItems.length,
        firstRequestItem: requestItems[0],
      });
      if (requestItems.length === 0) {
        console.warn(
          '[PRICE-DEBUG] ⚠ NO API CALL will be made — every item failed extraction. ' +
          'Check primaryId vs the identifier values on items above.',
        );
      } else {
        console.log('[PRICE-DEBUG] firing POST /pricing-repository/v2/cheapest-by-id/');
      }
      const promise = requestItems.length > 0
        ? fetchCheapestById({
            items: requestItems,
            source_types: settings.sourceTypes,
            date_from: dateFrom,
            date_to: dateTo,
            price_basis: rankingBasis,
          })
        : Promise.resolve(null);

      promise
        .then((resp) => {
          if (controller.signal.aborted) return;
          const byItemId = new Map<
            string, CheapestByItemPerSource | null
          >();
          const byMpn = new Map<string, CheapestByMpnPerSource | null>();
          const byItemIdOverall = new Map<
            string, CheapestOverall | null
          >();
          for (const entry of itemEntries) {
            // Response keys are the lookupKey we sent — direct lookup.
            const raw = resp?.results[entry.lookupKey] ?? null;
            const filtered = applyClientFilters(raw, settings);
            byItemId.set(entry.lookupKey, filtered);
            // Populate byMpn for chart history when MPN mode is active
            if (primaryId === 'MPN' && entry.mpn) {
              byMpn.set(entry.mpn, filtered);
            }
            // cheapest-by-id doesn't synth a cheapest_overall (the
            // dashboard cherry-picks across sources itself). Set null
            // so the Autofill button falls back to FE-side cheapest.
            byItemIdOverall.set(entry.lookupKey, null);
          }
          setState({
            byItemId,
            byMpn,
            byItemIdOverall,
            loading: false,
            error: null,
          });
        })
        .catch((err: any) => {
          if (controller.signal.aborted) return;
          console.error('[usePricingLookup] cheapest-by-id failed:', err);
          // The setting-gate 400 from cheapest-by-id is operator-facing,
          // not actionable for the buyer who's just trying to use the
          // dashboard. Replace it with a softer message pointing at the
          // admin. Any other error keeps its native text.
          const rawMessage = String(err?.message ?? '');
          const isUnconfigured =
            /Primary ID for tracking is not configured/i.test(rawMessage);
          setState({
            byItemId: new Map(),
            byMpn: new Map(),
            byItemIdOverall: new Map(),
            loading: false,
            error: isUnconfigured
              ? 'Pricing lookup is not configured. Please contact your admin.'
              : rawMessage || 'Pricing lookup failed',
          });
        });

      return () => controller.abort();
    }

    // ── Legacy path (Primary ID not configured) ────────────────────
    const withMpn    = itemEntries.filter(e => !!e.mpn);
    const withoutMpn = itemEntries.filter(e => !e.mpn);

    const promises: Promise<any>[] = [];

    const rankingBasis = toRankingBasis(settings.priceBasis);

    // --- MPN-based lookup — new items[] shape, response keyed by enterprise_item_id ---
    if (withMpn.length > 0) {
      promises.push(
        fetchCheapestByMpn({
          items: withMpn.map((e) => ({
            mpn: e.mpn as string,
            enterprise_item_id: e.enterprise_item_id || undefined,
            erp: e.erp_item_code || undefined,
            code: e.item_code || undefined,
            cpn: e.cpn || undefined,
            project_currency_code: e.project_currency_code || undefined,
            target_uom_id: e.target_uom_id || undefined,
            requested_qty: e.requested_qty || undefined,
            requested_qty_uom_id: e.requested_qty_uom_id || undefined,
          })),
          // analytics keeps the per-source breakdown the dashboard already
          // renders AND attaches cheapest_overall on every item. Switching to
          // 'autofill' would strip the per-source columns and break the
          // existing UI — only flip later when an autofill-only surface uses
          // this hook.
          mode: 'analytics',
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
        const byItemIdOverall = new Map<string, CheapestOverall | null>();

        // Response now keyed by enterprise_item_id — map directly to lookupKey
        if (mpnResp?.results) {
          for (const entry of withMpn) {
            const key = entry.enterprise_item_id || entry.lookupKey;
            const raw = mpnResp.results[key] ?? null;
            const filtered = applyClientFilters(raw, settings);
            byItemId.set(entry.lookupKey, filtered);
            // Also populate byMpn for chart history lookups
            if (entry.mpn) byMpn.set(entry.mpn, filtered);
            // cheapest_overall lives on the per-item bucket in analytics mode
            byItemIdOverall.set(
              entry.lookupKey,
              raw?.cheapest_overall ?? null,
            );
          }
        }

        // Map item-ID results for no-MPN items. cheapest-by-item endpoint
        // doesn't return cheapest_overall (it's a different endpoint pre-
        // dating the synth) — leave overall as null for these so the
        // Autofill button falls back to client-side cherry-picking just
        // for this slice. Once we migrate the no-MPN path to cheapest-by-
        // mpn with hierarchy fallback, this branch goes away.
        if (itemResp?.results) {
          for (const entry of withoutMpn) {
            const raw = itemResp.results[entry.lookupKey] ?? null;
            byItemId.set(entry.lookupKey, applyClientFilters(raw, settings));
          }
        }

        setState({
          byItemId,
          byMpn,
          byItemIdOverall,
          loading: false,
          error: null,
        });
      })
      .catch((err: any) => {
        if (controller.signal.aborted) return;
        console.error('[usePricingLookup] fetch failed:', err);
        setState({
          byItemId: new Map(),
          byMpn: new Map(),
          byItemIdOverall: new Map(),
          loading: false,
          error: err?.message || 'Pricing lookup failed',
        });
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
    primaryId,
    primaryIdLoaded,
  ]);

  return {
    byItemId: state.byItemId,
    byMpn:    state.byMpn,
    byItemIdOverall: state.byItemIdOverall,
    autofillSettings,
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

export type {
  PricingRecord,
  CheapestByMpnPerSource,
  CheapestOverall,
  PriceBasis,
  PricingSourceType,
};
export type { AutofillSettings };
