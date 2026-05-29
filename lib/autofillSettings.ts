/**
 * Enterprise-level Autofill Pricing settings (read-only on this dashboard).
 *
 * The buyer configures these in Factwise Admin -> Settings -> Autofill
 * Pricing (factwise-integrated/src/Organizations/Admin/Components/Settings/
 * Autofill/). The procurement dashboard READS them here so its
 * `cheapest-by-mpn` call uses the same hierarchy, price basis and
 * tiebreaker preferences that every other autofill surface uses. Single
 * source of truth: no localStorage override of these fields, no UI to
 * change them here.
 */
import { getAuthToken } from './api';

// Reuse the same base-URL resolution logic as pricingRepo.ts. We can't
// import it from there because it isn't exported, so this thin re-implementation
// keeps the dashboard's existing local-dev knobs working.
const getApiBaseUrl = (): string => {
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
  }
  const envUrl =
    typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL
      : undefined;
  const isLocalUrl =
    envUrl &&
    (envUrl.includes('localhost') ||
      envUrl.includes('192.168.') ||
      envUrl.includes('127.0.0.1'));
  if (isLocalUrl) return envUrl;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const apiEnv = params.get('api_env');
    if (apiEnv === 'prod')
      return 'https://qc9s5bz8d7.execute-api.us-east-1.amazonaws.com/prod';
    if (apiEnv === 'dev')
      return 'https://poiigw0go0.execute-api.us-east-1.amazonaws.com/dev';
  }
  return envUrl || 'https://poiigw0go0.execute-api.us-east-1.amazonaws.com/dev';
};

export type IdentifierType = 'MPN' | 'ERP' | 'CODE' | 'CPN';

export type AutofillPriceBasis =
  | 'rate'
  | 'effective_rate'
  | 'landed_rate'
  | 'total_item_cost'
  | 'landed_total';

export interface AutofillSettings {
  identifier_hierarchy: IdentifierType[];
  default_price_basis: AutofillPriceBasis;
  payment_term_preference: string[];
  incoterm_preference: string[];
  /**
   * Default look-back window (days). null = "all time" — no date_from sent
   * to cheapest-by-mpn. Used as the date window unless the local gear
   * overrides.
   */
  lookback_days: number | null;
}

export interface AutofillSettingsResponse extends AutofillSettings {
  allowed_identifier_types: IdentifierType[];
  allowed_price_bases: AutofillPriceBasis[];
  allowed_lookback_days: Array<number | null>;
  default_identifier_hierarchy: IdentifierType[];
  default_price_basis_value: AutofillPriceBasis;
  default_payment_term_preference: string[];
  default_incoterm_preference: string[];
  default_lookback_days: number | null;
}

/**
 * Sane defaults so the dashboard still works if the BE call fails (network
 * blip, auth scope issue, etc.) — we don't want a 5xx on the settings call
 * to break autofill entirely. Matches the BE's own fallback in
 * factwise/organization/org_models/enterprise_autofill_setting_model.py.
 */
export const FALLBACK_AUTOFILL_SETTINGS: AutofillSettings = {
  identifier_hierarchy: ['MPN', 'ERP', 'CODE', 'CPN'],
  default_price_basis: 'effective_rate',
  payment_term_preference: [],
  incoterm_preference: [],
  lookback_days: null,
};

const ENDPOINT = '/organization/settings/autofill/';

export async function fetchAutofillSettings(): Promise<AutofillSettings> {
  const token = getAuthToken();
  if (!token) {
    console.warn('[autofillSettings] no auth token — using fallbacks');
    return FALLBACK_AUTOFILL_SETTINGS;
  }
  try {
    const res = await fetch(`${getApiBaseUrl()}${ENDPOINT}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      console.warn(
        `[autofillSettings] HTTP ${res.status} — using fallbacks`
      );
      return FALLBACK_AUTOFILL_SETTINGS;
    }
    const data = (await res.json()) as AutofillSettingsResponse;
    return {
      identifier_hierarchy:
        data.identifier_hierarchy ||
        FALLBACK_AUTOFILL_SETTINGS.identifier_hierarchy,
      default_price_basis:
        data.default_price_basis ||
        FALLBACK_AUTOFILL_SETTINGS.default_price_basis,
      payment_term_preference: data.payment_term_preference || [],
      incoterm_preference: data.incoterm_preference || [],
      // Coerce explicit non-int to null so the consumer side has a clean
      // discriminator (null = all time, number = days). Server already
      // returns null or a positive int; this is a defensive fence.
      lookback_days:
        typeof data.lookback_days === 'number' && data.lookback_days > 0
          ? data.lookback_days
          : null,
    };
  } catch (err) {
    console.error(
      '[autofillSettings] fetch failed — using fallbacks',
      err
    );
    return FALLBACK_AUTOFILL_SETTINGS;
  }
}
