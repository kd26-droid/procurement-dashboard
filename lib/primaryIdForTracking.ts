/**
 * Primary ID for tracking — per-enterprise admin setting that controls
 * which item identifier the buyer trusts as authoritative. Drives:
 *   - Contract quantity tracking matcher
 *   - This dashboard's pricing-repository lookup (cheapest-by-id)
 *
 * BE contract: GET /contracts/settings/primary-id-for-tracking/
 *
 *   {
 *     "tracking_primary_identifier": "MPN" | "ERP" | "CPN" | "HSN" | null,
 *     "allowed_tracking_primary_identifiers": [...],
 *     "default_tracking_primary_identifier": null
 *   }
 *
 * NULL = admin hasn't picked. The hook falls back to the legacy
 * cheapest-by-mpn path so the dashboard keeps working until admins flip
 * the setting in the FW admin UI.
 */
import { getAuthToken } from './api';

export type PrimaryIdForTracking = 'MPN' | 'ERP' | 'CPN' | 'HSN';

export interface PrimaryIdForTrackingResponse {
  tracking_primary_identifier: PrimaryIdForTracking | null;
  allowed_tracking_primary_identifiers: PrimaryIdForTracking[];
  default_tracking_primary_identifier: PrimaryIdForTracking | null;
}

const ENDPOINT = '/contracts/settings/primary-id-for-tracking/';

// Same base-URL resolution as autofillSettings.ts — keep them aligned so
// local dev overrides apply to both fetches uniformly.
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
      return 'https://6rnlqc78hb.execute-api.us-east-1.amazonaws.com/dev';
  }
  return envUrl ?? 'http://localhost:3001';
};

export async function fetchPrimaryIdForTracking():
  Promise<PrimaryIdForTracking | null> {
  const token = getAuthToken();
  if (!token) {
    console.warn('[primaryIdForTracking] no auth token');
    return null;
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
        `[primaryIdForTracking] HTTP ${res.status} — treating as unset`
      );
      return null;
    }
    const data = (await res.json()) as PrimaryIdForTrackingResponse;
    return data.tracking_primary_identifier ?? null;
  } catch (err) {
    console.error('[primaryIdForTracking] fetch failed', err);
    return null;
  }
}
