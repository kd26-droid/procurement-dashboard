/**
 * Pricing Repository v2 client
 *
 * Talks to the Factwise pricing repo backend for cheapest-by-MPN lookups
 * and per-MPN history queries used by the procurement strategy dashboard.
 *
 * Endpoint spec:
 *   POST /pricing_repository/v2/cheapest-by-mpn/
 *   GET  /pricing_repository/v2/list/?search=<mpn>&page_size=500
 *
 * Auth: Bearer token from URL ?token= param (same as the rest of the dashboard).
 */

import { getAuthToken } from './api';

// ----------------------------------------------------------------------------
// Types — mirrors the BE response shape exactly
// ----------------------------------------------------------------------------

export type PricingSourceType =
  | 'PO'
  | 'CONTRACT'
  | 'QUOTE'
  | 'RFQ'
  | 'DIGIKEY'
  | 'MOUSER';

export type PriceBasis =
  | 'rate'
  | 'effective_rate'
  | 'quoted_rate'
  | 'landed_rate'
  | 'total_item_cost'
  | 'landed_total';

export interface PricingRecord {
  pricing_entry_id: string;
  source: PricingSourceType;
  mpn: string;
  manufacturer: string | null;
  item_code: string | null;
  item_name: string | null;
  enterprise_item_id: string | null;

  // Native price fields
  rate: number | null;
  effective_rate: number | null;
  quoted_rate: number | null;
  landed_rate: number | null;
  total_item_cost: number | null;
  landed_total: number | null;

  // Currency — native + admin-normalized
  currency_code: string | null;
  currency_symbol: string | null;
  conversion_rate: number | null;
  admin_currency_code: string | null;
  admin_currency_symbol: string | null;
  rate_in_admin_currency: number | null;
  effective_rate_in_admin_currency: number | null;
  quoted_rate_in_admin_currency: number | null;
  landed_rate_in_admin_currency: number | null;
  landed_total_in_admin_currency: number | null;
  total_item_cost_in_admin_currency: number | null;

  quantity: number | null;
  min_quantity: number | null;
  max_quantity: number | null;

  // Vendor / customer
  supplier_entity_id: string | null;
  supplier_name: string | null;
  customer_entity_id: string | null;
  customer_name: string | null;

  // Document references for deep-linking
  agreement_id: string | null;
  event_id: string | null;
  po_id: string | null;
  po_group_id: string | null;
  quote_id: string | null;
  source_id: string | null;
  source_parent_id: string | null;
  template_id: string | null;
  rfq_event_id: string | null;
  rfq_item_id: string | null;

  // Status
  status_display: string | null;
  contract_status: string | null;
  costing_sheet_status: string | null;
  event_status: string | null;
  quoted_status: string | null;

  pricing_datetime: string;
}

/** One MPN's results — every requested source_type is a key, value is record or null. */
export type CheapestByMpnPerSource = Partial<Record<PricingSourceType, PricingRecord | null>>;

export interface CheapestByMpnResponse {
  price_basis: PriceBasis;
  date_from: string | null;
  date_to: string | null;
  source_types: PricingSourceType[];
  /** Every requested MPN is a key. Value is null if MPN had zero hits anywhere. */
  results: Record<string, CheapestByMpnPerSource | null>;
}

export interface CheapestByMpnRequest {
  mpns: string[];
  source_types?: PricingSourceType[];
  date_from?: string; // ISO 8601 (YYYY-MM-DD)
  date_to?: string;
  price_basis?: PriceBasis;
}

// ----------------------------------------------------------------------------
// Base URL — reuses the same AWS API Gateway logic as lib/api.ts
// ----------------------------------------------------------------------------

const getPricingRepoBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const apiUrlParam = params.get('api_url');
    if (
      apiUrlParam &&
      (apiUrlParam.includes('localhost') ||
        apiUrlParam.includes('192.168.') ||
        apiUrlParam.includes('127.0.0.1'))
    ) {
      return apiUrlParam;
    }

    // Local dev fallback: if the dashboard itself is running on localhost,
    // default to a local backend at :8000 regardless of api_env param.
    // This exists because the cheapest-by-mpn endpoint is only on local BE right now.
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:8000';
    }

    const apiEnv = params.get('api_env');
    if (apiEnv === 'prod') return 'https://qc9s5bz8d7.execute-api.us-east-1.amazonaws.com/prod';
    if (apiEnv === 'dev') return 'https://poiigw0go0.execute-api.us-east-1.amazonaws.com/dev';
  }

  const envUrl =
    typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL
      : undefined;
  return envUrl || 'https://poiigw0go0.execute-api.us-east-1.amazonaws.com/dev';
};

// ----------------------------------------------------------------------------
// Core fetch helper — handles auth, timeout, retry on 429/5xx
// ----------------------------------------------------------------------------

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

async function pricingRepoFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication token not found. Please provide token in URL.');

  const url = `${getPricingRepoBaseUrl()}${path}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...init.headers,
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** (attempt - 1)));
      }

      const res = await fetch(url, { ...init, headers, signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        lastError = new Error('Rate limited (429)');
        continue;
      }

      if (res.status >= 500 && attempt < MAX_RETRIES) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}: ${res.statusText}`);
      }

      return (await res.json()) as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        lastError = new Error(`Pricing repo request timed out: ${path}`);
        if (attempt < MAX_RETRIES) continue;
        throw lastError;
      }
      if (
        err.message?.includes('fetch') ||
        err.message?.includes('network') ||
        err.message?.includes('Failed to fetch')
      ) {
        lastError = err;
        if (attempt < MAX_RETRIES) continue;
      }
      throw err;
    }
  }

  throw lastError || new Error(`Pricing repo request failed: ${path}`);
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

const MAX_BATCH = 500;

/**
 * Fetch the cheapest pricing record per (MPN, source_type) within a date window.
 * Automatically batches MPN lists larger than 500 into multiple requests
 * and merges the responses.
 */
export async function fetchCheapestByMpn(
  req: CheapestByMpnRequest,
): Promise<CheapestByMpnResponse> {
  const cleanMpns = Array.from(
    new Set(req.mpns.map((m) => (m ?? '').trim()).filter((m) => m.length > 0)),
  );

  if (cleanMpns.length === 0) {
    return {
      price_basis: req.price_basis ?? 'effective_rate',
      date_from: req.date_from ?? null,
      date_to: req.date_to ?? null,
      source_types: req.source_types ?? ['PO', 'CONTRACT', 'QUOTE', 'RFQ', 'DIGIKEY', 'MOUSER'],
      results: {},
    };
  }

  const batches: string[][] = [];
  for (let i = 0; i < cleanMpns.length; i += MAX_BATCH) {
    batches.push(cleanMpns.slice(i, i + MAX_BATCH));
  }

  const responses = await Promise.all(
    batches.map((batch) =>
      pricingRepoFetch<CheapestByMpnResponse>('/pricing_repository/v2/cheapest-by-mpn/', {
        method: 'POST',
        body: JSON.stringify({
          mpns: batch,
          source_types: req.source_types,
          date_from: req.date_from,
          date_to: req.date_to,
          price_basis: req.price_basis,
        }),
      }),
    ),
  );

  const merged: CheapestByMpnResponse = {
    price_basis: responses[0]?.price_basis ?? req.price_basis ?? 'effective_rate',
    date_from: responses[0]?.date_from ?? req.date_from ?? null,
    date_to: responses[0]?.date_to ?? req.date_to ?? null,
    source_types: responses[0]?.source_types ?? [],
    results: {},
  };
  for (const r of responses) {
    Object.assign(merged.results, r.results);
  }
  return merged;
}

/**
 * Fetch full pricing history for one MPN (used by the chart popover).
 * Uses the existing /v2/list/ endpoint with search=mpn — no date filter.
 */
export async function fetchMpnHistory(mpn: string): Promise<PricingRecord[]> {
  const trimmed = (mpn ?? '').trim();
  if (!trimmed) return [];

  const url = `/pricing_repository/v2/list/?search=${encodeURIComponent(trimmed)}&page_size=500`;
  const res = await pricingRepoFetch<{
    results?: PricingRecord[];
    items?: PricingRecord[];
    data?: PricingRecord[];
  }>(url);

  // List endpoint may envelope under several keys depending on backend version.
  const records = res.results ?? res.items ?? res.data ?? [];
  // Defensive: filter out records whose mpn doesn't actually match (search is icontains).
  return records.filter((r) => r.mpn?.trim().toLowerCase() === trimmed.toLowerCase());
}

// ----------------------------------------------------------------------------
// Deep-link URL builder — assembles a Factwise route from the record's IDs.
// Ported verbatim from pricing-dashboard/app/page.tsx#handleRowClick so the
// same URL shapes are used across both dashboards.
// ----------------------------------------------------------------------------

export function buildFactwiseUrl(record: PricingRecord): string | null {
  switch (record.source) {
    case 'QUOTE':
      // Navigate to costing sheet: /seller/costing/{source_parent_id}/
      if (record.source_parent_id) {
        return `/seller/costing/${record.source_parent_id}/`;
      }
      return null;

    case 'RFQ':
      // Navigate to RFQ event: /buyer/events/{rfq_event_id}/summary
      if (record.rfq_event_id || record.event_id) {
        return `/buyer/events/${record.rfq_event_id || record.event_id}/summary`;
      }
      return null;

    case 'CONTRACT':
      // Navigate to CLM contract: /buyer/CLM/template/{template_id}/contract/{source_parent_id}/
      if (record.template_id && record.source_parent_id) {
        return `/buyer/CLM/template/${record.template_id}/contract/${record.source_parent_id}/`;
      }
      if (record.agreement_id) {
        // Fallback — try using agreement_id
        return `/buyer/CLM/contracts/${record.agreement_id}/`;
      }
      return null;

    case 'PO': {
      // Both direct and RFQ-derived POs use the same route in this build:
      //   /buyer/purchase_orders/{source_parent_id}/summary
      // po_id is the human-readable code (e.g. "PO000082"), not a route id.
      const poUuid = record.source_parent_id || record.po_group_id || record.source_id;
      if (!poUuid) return null;
      return `/buyer/purchase_orders/${poUuid}/summary`;
    }

    case 'DIGIKEY':
    case 'MOUSER':
      // External sources — no navigation
      return null;

    default:
      return null;
  }
}

/**
 * Open the source document in a new browser tab.
 *
 * Always opens in a new tab — never uses postMessage. The Factwise host is
 * derived from the api_url query param (swapping backend port 8000 for
 * frontend port 3001 on the same hostname). Falls back to localhost:3001.
 */
export function navigateInFactwise(record: PricingRecord): boolean {
  const url = buildFactwiseUrl(record);
  if (!url) return false;
  if (typeof window === 'undefined') return false;

  // Derive Factwise frontend host from api_url, fall back to localhost:3001
  const urlParams = new URLSearchParams(window.location.search);
  const apiUrl = urlParams.get('api_url');
  let factwiseBase = 'http://localhost:3001';
  if (apiUrl) {
    try {
      const parsed = new URL(apiUrl);
      factwiseBase = `${parsed.protocol}//${parsed.hostname}:3001`;
    } catch {
      // keep default
    }
  }

  const fullUrl = `${factwiseBase}${url}`;
  const newWindow = window.open(fullUrl, '_blank', 'noopener,noreferrer');
  if (!newWindow) {
    // Popup blocked — anchor fallback
    const a = document.createElement('a');
    a.href = fullUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  return true;
}

// ----------------------------------------------------------------------------
// Helpers — pull the displayed admin-currency value off a record
// ----------------------------------------------------------------------------

/** Picks the admin-currency-normalized value of the chosen price basis. */
export function getAdminPrice(record: PricingRecord, basis: PriceBasis): number | null {
  switch (basis) {
    case 'rate':
      return record.rate_in_admin_currency;
    case 'effective_rate':
      return record.effective_rate_in_admin_currency;
    case 'quoted_rate':
      return record.quoted_rate_in_admin_currency;
    case 'landed_rate':
      return record.landed_rate_in_admin_currency;
    case 'total_item_cost':
      return record.total_item_cost_in_admin_currency;
    case 'landed_total':
      return record.landed_total_in_admin_currency;
    default:
      return null;
  }
}

/** True if the record should be hidden as "expired contract". */
export function isExpiredContract(record: PricingRecord): boolean {
  if (record.source !== 'CONTRACT') return false;
  const status = (record.contract_status || record.status_display || '').toLowerCase();
  return status.includes('expired');
}

/** True if the record looks like a draft / zero-rate quote we should ignore. */
export function isZeroRateOrDraftQuote(record: PricingRecord, basis: PriceBasis): boolean {
  const price = getAdminPrice(record, basis);
  if (price !== null && price <= 0) return true;
  if (record.source === 'QUOTE') {
    const status = (record.quoted_status || record.status_display || '').toLowerCase();
    if (status.includes('draft')) return true;
  }
  return false;
}
