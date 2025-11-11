/**
 * Factwise Backend API Client
 *
 * This module provides functions to interact with the Factwise backend APIs
 * for the Strategy Dashboard.
 */

// API Configuration
// Environment-based API URLs:
// - Local dev: http://localhost:8000 (from .env.local)
// - Vercel dev: AWS Dev API Gateway (from .env.development)
// - Vercel prod: AWS Prod API Gateway (from .env.production)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://poiigw0go0.execute-api.us-east-1.amazonaws.com/dev';

/**
 * Get API token from URL parameters
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('token');
}

/**
 * Get project ID from URL parameters
 */
export function getProjectId(): string | null {
  if (typeof window === 'undefined') return null;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('project_id');
}

/**
 * Generic API request handler with authentication
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();

  if (!token) {
    throw new Error('Authentication token not found. Please provide token in URL.');
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface ProjectOverview {
  success: boolean;
  project: {
    project_id: string;
    project_code: string;
    project_name: string;
    customer_name: string;
    buyer_entity_name: string;
    deadline: string | null;
    validity_from: string | null;
    status: string;
    description: string;
    tags: string[];
  };
  summary: {
    total_items: number;
    items_with_assigned_users: number;
    items_without_assigned_users: number;
    total_quantity: number;
    total_amount: number;
    average_rate: number;
  };
}

export interface ProjectItem {
  project_item_id: string;
  item_code: string;
  item_name: string;
  description: string;
  erp_item_code: string;
  quantity: number;
  rate: number;
  amount: number;
  measurement_unit: {
    id: string;
    name: string;
    abbreviation: string;
    category: string;
    value_type: string;
  } | null;
  currency: {
    id: string;
    code: string;
    symbol: string;
    name: string;
  } | null;
  tags: string[];
  custom_tags: string[];
  item_type: string | null;
  status: string | null;
  custom_ids: any;
  custom_fields: any;
  additional_details: any;
  attributes: Array<{
    attribute_id: string;
    attribute_name: string;
    attribute_type: string;
    attribute_values: Array<{
      value: string;
      currency_id?: string;
      measurement_unit_id?: string;
    }>;
  }>;
  buyer_pricing_information: any;
  seller_pricing_information: any;
  notes: string;
  assigned_users: Array<{
    user_id: string;
    email: string;
    name: string;
  }>;
  assigned_users_count: number;
  delivery_schedules: Array<{
    delivery_schedule_id: string;
    quantity: number;
    delivery_date: string | null;
  }>;
  rfq_events_count: number;
  item_valid: boolean;
  created_datetime: string;
  modified_datetime: string;
  created_by_user_id: string | null;
  modified_by_user_id: string | null;
  project_id: string;
  enterprise_item_id: string | null;
}

export interface ProjectItemsResponse {
  success: boolean;
  items: ProjectItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ProjectUser {
  user_id: string;
  email: string;
  name: string;
  role: string;
}

export interface ProjectUsersResponse {
  success: boolean;
  users: ProjectUser[];
  total: number;
}

export interface Vendor {
  vendor_id: string;
  vendor_name: string;
  vendor_code: string;
  contact_email: string;
  contact_phone: string;
  is_preferred: boolean;
  active: boolean;
}

export interface VendorsResponse {
  success: boolean;
  vendors: Vendor[];
  total: number;
  limit: number;
  offset: number;
}

export interface Category {
  category_id: string;
  category_name: string;
  category_code: string;
  color: string;
  item_count: number;
}

export interface CategoriesResponse {
  success: boolean;
  categories: Category[];
  total: number;
}

export interface UpdateItemRequest {
  rate?: number;
  quantity?: number;
  notes?: string;
  custom_fields?: Record<string, any>;
  assigned_user_ids?: string[];
}

export interface UpdateItemResponse {
  success: boolean;
  message: string;
  item: ProjectItem;
}

export interface BulkAssignRequest {
  assignments: Array<{
    project_item_id: string;
    user_ids: string[];
    action: 'replace' | 'add' | 'remove';
  }>;
}

export interface BulkAssignResponse {
  success: boolean;
  updated: number;
  failed: number;
  errors: Array<{
    project_item_id: string;
    error: string;
  }>;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get project overview and summary statistics
 */
export async function getProjectOverview(projectId: string): Promise<ProjectOverview> {
  return apiRequest<ProjectOverview>(
    `/organization/project/${projectId}/strategy/overview/`
  );
}

/**
 * Get all items in a project
 */
export async function getProjectItems(
  projectId: string,
  options?: {
    limit?: number;
    offset?: number;
    search?: string;
    has_user?: boolean;
  }
): Promise<ProjectItemsResponse> {
  const params = new URLSearchParams();

  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());
  if (options?.search) params.append('search', options.search);
  if (options?.has_user !== undefined) params.append('has_user', options.has_user.toString());

  const queryString = params.toString();
  const endpoint = `/organization/project/${projectId}/strategy/items/${queryString ? '?' + queryString : ''}`;

  return apiRequest<ProjectItemsResponse>(endpoint);
}

/**
 * Update a project item
 */
export async function updateProjectItem(
  projectId: string,
  itemId: string,
  updates: UpdateItemRequest
): Promise<UpdateItemResponse> {
  return apiRequest<UpdateItemResponse>(
    `/organization/project/${projectId}/strategy/items/${itemId}/`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );
}

/**
 * Get users who have access to the project
 */
export async function getProjectUsers(projectId: string): Promise<ProjectUsersResponse> {
  return apiRequest<ProjectUsersResponse>(
    `/organization/project/${projectId}/strategy/users/`
  );
}

/**
 * Bulk assign users to items
 */
export async function bulkAssignUsers(
  projectId: string,
  assignments: BulkAssignRequest['assignments']
): Promise<BulkAssignResponse> {
  return apiRequest<BulkAssignResponse>(
    `/organization/project/${projectId}/strategy/bulk-assign/`,
    {
      method: 'POST',
      body: JSON.stringify({ assignments }),
    }
  );
}

/**
 * Get list of vendors
 */
export async function getVendors(
  projectId: string,
  options?: {
    search?: string;
    limit?: number;
    offset?: number;
  }
): Promise<VendorsResponse> {
  const params = new URLSearchParams();

  if (options?.search) params.append('search', options.search);
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());

  const queryString = params.toString();
  const endpoint = `/organization/project/${projectId}/strategy/vendors/${queryString ? '?' + queryString : ''}`;

  return apiRequest<VendorsResponse>(endpoint);
}

/**
 * Get list of categories/tags
 */
export async function getCategories(projectId: string): Promise<CategoriesResponse> {
  return apiRequest<CategoriesResponse>(
    `/organization/project/${projectId}/strategy/categories/`
  );
}

// ============================================================================
// PostMessage Communication with Factwise Parent
// ============================================================================

export type FactwiseMessage =
  | { type: 'ITEM_UPDATED'; item_id: string; changes: UpdateItemRequest }
  | { type: 'ITEMS_ASSIGNED'; item_ids: string[]; user_ids: string[] }
  | { type: 'DASHBOARD_READY' }
  | { type: 'REQUEST_REFETCH' };

/**
 * Send message to Factwise parent window
 */
export function sendMessageToFactwise(message: FactwiseMessage) {
  if (typeof window === 'undefined' || window.parent === window) {
    console.log('Not in iframe, skipping postMessage:', message);
    return;
  }

  // Send to parent (Factwise)
  window.parent.postMessage(message, '*');
  console.log('Sent message to Factwise:', message);
}

/**
 * Listen for messages from Factwise parent window
 */
export function listenToFactwiseMessages(
  callback: (message: any) => void
) {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: MessageEvent) => {
    // In production, verify origin
    // if (event.origin !== 'https://factwise.io') return;

    console.log('Received message from Factwise:', event.data);
    callback(event.data);
  };

  window.addEventListener('message', handler);

  // Return cleanup function
  return () => {
    window.removeEventListener('message', handler);
  };
}

/**
 * Notify Factwise that an item was updated
 */
export function notifyItemUpdated(itemId: string, changes: UpdateItemRequest) {
  sendMessageToFactwise({
    type: 'ITEM_UPDATED',
    item_id: itemId,
    changes,
  });
}

/**
 * Notify Factwise that users were assigned
 */
export function notifyItemsAssigned(itemIds: string[], userIds: string[]) {
  sendMessageToFactwise({
    type: 'ITEMS_ASSIGNED',
    item_ids: itemIds,
    user_ids: userIds,
  });
}

/**
 * Notify Factwise to refetch data
 */
export function requestFactwiseRefetch() {
  sendMessageToFactwise({
    type: 'REQUEST_REFETCH',
  });
}

// ============================================================================
// Additional API Functions for User Assignment
// ============================================================================

/**
 * Auto-assign users to items based on tag-to-user mapping
 */
export async function autoAssignUsersByTags(
  projectId: string,
  tagUserMap: Record<string, string[]>,
  scope: 'all' | 'unassigned' | 'item_ids',
  itemIds?: string[]
): Promise<{
  success: boolean;
  updated: number;
  skipped: number;
  total_assignments: number;
  message: string;
}> {
  const body: any = {
    tag_user_map: tagUserMap,
    scope,
  };

  if (scope === 'item_ids' && itemIds) {
    body.item_ids = itemIds;
  }

  return apiRequest(
    `/organization/project/${projectId}/strategy/auto-assign-by-tags/`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
}
