"use client"

import type React from "react"

import { useState, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LineChart, Line, BarChart, Bar, ComposedChart, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Label as RechartsLabel, LabelList } from 'recharts'
import { Tooltip as UiTooltip, TooltipContent as UiTooltipContent, TooltipTrigger as UiTooltipTrigger } from "@/components/ui/tooltip"
import { SettingsDialog, SettingsPanel, AppSettings, buildDefaultSettings, MappingId, PriceSource } from "@/components/settings-dialog"
import { getProjectId, getProjectItems, getProjectOverview, getProjectDetail, getProjectUsers, updateProjectItem, bulkAssignUsers, bulkAssignUsersWithRoles, notifyItemsAssigned, notifyItemUpdated, getProjectTags, updateItemTags, getDigikeyJobStatus, getMouserJobStatus, getAssignmentRules, getRuleFieldOptions, getActionRules, searchVendors, getItemCustomVendors, addItemCustomVendors, removeItemCustomVendor, type ProjectItem, type AssignmentRule, type AssignmentRuleCondition, type FieldOptionsResponse, type ProjectOverview, type TagUserMapping, type ProjectCustomSection, type ActionRule, type ActionRuleCriterion, type CustomVendor } from '@/lib/api'
import { AutoAssignUsersPopover, AutoFillPricesPopover, AutoAssignActionsPopover } from "@/components/autoassign-popovers"
import { useToast } from "@/hooks/use-toast"
import {
  usePricingLookup,
  loadPricingSettings,
  savePricingSettings,
  DEFAULT_PRICING_SETTINGS,
  type PricingLookupSettings,
} from "@/hooks/use-pricing-lookup"
import { PricingLookupSettingsButton } from "@/components/pricing-lookup-settings"
import { PricingCharts } from "@/components/pricing-charts"
import {
  fetchMpnHistory,
  getAdminPrice,
  isExpiredContract,
  navigateInFactwise,
  buildFactwiseUrl,
  type PricingRecord,
  type PricingSourceType,
} from "@/lib/pricingRepo"
import {
  Settings,
  Users,
  DollarSign,
  BarChart3,
  FileText,
  TrendingUp,
  ArrowUpDown,
  Edit,
  ToggleLeft,
  ToggleRight,
  Building2,
  Package,
  GripVertical,
  ChevronDown,
  Search,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  CheckSquare,
  Globe,
  FileSignature,
  X,
  Download,
} from "lucide-react"

/**
 * Format cached_at timestamp to human-readable format
 */
function formatCachedDate(isoString: string | null | undefined): string {
  if (!isoString) return '';

  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffHours < 1) {
    return "just now";
  } else if (diffHours < 24) {
    return `${Math.floor(diffHours)} hours ago`;
  } else if (diffDays < 7) {
    return `${Math.floor(diffDays)} days ago`;
  } else {
    return date.toLocaleDateString(); // e.g., "11/24/2025"
  }
}

/**
 * Currency symbol lookup for distributor prices
 */
function getDistributorCurrencySymbol(code: string | null | undefined): string {
  const symbols: Record<string, string> = {
    INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥',
    AUD: 'A$', CAD: 'C$', SGD: 'S$',
  };
  if (!code) return '$';
  return symbols[code] || code + ' ';
}

/**
 * Build the tooltip JSX for a distributor pricing column.
 * Shows every variant with its full price-break table, MOQ, reeling fee, and part number.
 * Falls back gracefully to legacy fields if `variants` is missing.
 */
function renderDistributorTooltip(pricing: any, distributorLabel: string, itemQty: number = 1, itemCurrencySymbol: string = '₹') {
  const sym = itemCurrencySymbol || getDistributorCurrencySymbol(pricing?.currency);

  // Build the list of variants to render. If no variants, synthesize a single
  // "variant" from legacy fields so old cached rows still render properly.
  const rawVariants: any[] = Array.isArray(pricing?.variants) ? pricing.variants : [];
  const hasRealVariants = rawVariants.length > 0;
  const legacyPartNum =
    distributorLabel === 'Digi-Key'
      ? pricing?.digikey_part_number
      : pricing?.mouser_part_number;
  const variantsToRender = hasRealVariants
    ? rawVariants
    : [
        {
          packaging: pricing?.packaging || 'Standard',
          digikey_part_number: distributorLabel === 'Digi-Key' ? legacyPartNum : undefined,
          mouser_part_number: distributorLabel === 'Mouser' ? legacyPartNum : undefined,
          moq: pricing?.moq ?? null,
          reeling_fee: '0',
          price_breaks: Array.isArray(pricing?.price_breaks) ? pricing.price_breaks : [],
          marketplace: false,
        },
      ];

  const preferredIdx =
    hasRealVariants && typeof pricing?.preferred_variant_index === 'number'
      ? pricing.preferred_variant_index
      : 0;

  const stock = pricing?.stock;
  const stockText =
    stock !== null && stock !== undefined && stock > 0
      ? `${stock.toLocaleString()} in stock`
      : 'Out of stock';

  return (
    <div className="bg-white max-w-[440px] p-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-2">
        <div className="font-semibold text-sm text-gray-900">{distributorLabel} Pricing</div>
        <div className="text-xs text-gray-500 font-medium">{stockText}</div>
      </div>

      {pricing?.cached_at && (
        <div className="text-[11px] text-gray-400 italic mb-2">
          Last updated: {formatCachedDate(pricing.cached_at)}
        </div>
      )}

      {/* Variants */}
      <div className="space-y-2">
        {variantsToRender.map((variant: any, idx: number) => {
          const isPreferred = hasRealVariants && idx === preferredIdx;
          const partNum =
            variant?.digikey_part_number || variant?.mouser_part_number || '';
          const fee =
            variant?.reeling_fee !== undefined && variant?.reeling_fee !== null
              ? parseFloat(String(variant.reeling_fee)) || 0
              : 0;
          const hasFee = fee > 0;
          const moq = variant?.moq ?? null;
          const breaks: any[] = Array.isArray(variant?.price_breaks)
            ? variant.price_breaks
            : [];
          const isMarketplace = variant?.marketplace === true;

          return (
            <div
              key={idx}
              className={`rounded-md border p-2.5 ${
                isPreferred
                  ? 'border-blue-300 bg-blue-50/50'
                  : 'border-gray-200 bg-gray-50/40'
              } ${isMarketplace ? 'opacity-75' : ''}`}
            >
              {/* Variant header */}
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {isPreferred && (
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                        PREFERRED
                      </span>
                    )}
                    <div className="font-semibold text-xs text-gray-900 truncate">
                      {variant?.packaging || 'Standard'}
                    </div>
                  </div>
                  {partNum && (
                    <div className="text-[11px] text-gray-500 font-mono mt-0.5 truncate">
                      {partNum}
                    </div>
                  )}
                </div>
                {moq !== null && moq !== undefined && (
                  <span
                    className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-semibold ${
                      moq > 1
                        ? 'text-amber-700 bg-amber-50 border-amber-200'
                        : 'text-gray-600 bg-white border-gray-200'
                    }`}
                  >
                    MOQ {moq.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Marketplace badge */}
              {isMarketplace && (
                <div className="text-[10px] text-gray-700 bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 mb-1.5 inline-block font-medium">
                  Marketplace (3rd party)
                </div>
              )}

              {/* Reeling fee warning */}
              {hasFee && (
                <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-1.5">
                  <span className="font-semibold">+ {sym}{fee.toFixed(2)}</span> reeling fee (one-time, non-refundable)
                </div>
              )}

              {/* Price breaks */}
              {breaks.length > 0 ? (
                <div className="text-[11px]">
                  <div className="grid grid-cols-3 gap-x-3 text-gray-500 font-semibold uppercase tracking-wide pb-1 border-b border-gray-200">
                    <div>Qty</div>
                    <div className="text-right">Unit</div>
                    <div className="text-right">Total</div>
                  </div>
                  {(() => {
                    const sortedBreaks = [...breaks].sort((a: any, b: any) => (a.quantity ?? 0) - (b.quantity ?? 0))
                    let activeIdx = 0
                    for (let i = 0; i < sortedBreaks.length; i++) {
                      if ((sortedBreaks[i].quantity ?? 0) <= itemQty) activeIdx = i
                      else break
                    }
                    return breaks.map((pb: any, bIdx: number) => {
                    const qty = Math.round(parseFloat(String(pb?.quantity)) || 0);
                    const unitPrice = parseFloat(String(pb?.unit_price)) || 0;
                    const isActive = sortedBreaks[activeIdx] === pb
                    // Always recompute total if fee applies; otherwise use backend total if provided
                    let totalPrice: number;
                    if (hasFee) {
                      totalPrice = qty * unitPrice + fee;
                    } else if (pb?.total_price !== null && pb?.total_price !== undefined) {
                      totalPrice = parseFloat(String(pb.total_price)) || qty * unitPrice;
                    } else {
                      totalPrice = qty * unitPrice;
                    }
                    return (
                      <div
                        key={bIdx}
                        className={`grid grid-cols-3 gap-x-3 py-0.5 tabular-nums ${isActive ? 'bg-green-50 text-green-800 font-semibold rounded px-1 -mx-1' : 'text-gray-900'}`}
                      >
                        <div>{qty.toLocaleString()}</div>
                        <div className="text-right">
                          {sym}
                          {unitPrice.toFixed(3)}
                        </div>
                        <div className="text-right">
                          {sym}
                          {totalPrice.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                            minimumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                    );
                  })
                })()}
                </div>
              ) : (
                <div className="text-[11px] text-gray-400 italic">
                  No price breaks available
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Convert distributor pricing from USD to item currency
 * NEW STRUCTURE: { status, status_message, data: { unit_price, price_breaks, ... } }
 * Handles: unit_price, quantity_price, price_breaks, savings_info, next_tier_info
 */
function convertDistributorPricing(pricingWrapper: any, itemCurrency: any, exchangeRates: Record<string, number>) {
  if (!pricingWrapper) return null;

  // NEW: Handle the new wrapper structure with status field
  // Status values: available, fetching, pending, not_found, error, no_mpn
  let status = pricingWrapper.status;
  const statusMessage = pricingWrapper.status_message;
  const pricingData = pricingWrapper.data;

  // IMPORTANT: Detect MPN not found from data (stock === -1 means MPN doesn't exist on distributor)
  // This is a cached "not found" result - stop polling and show "Not Listed"
  if (pricingData && pricingData.stock === -1) {
    return {
      status: 'not_found',
      status_message: 'Not Listed',
      data: null,
      unit_price: null,
      currency: null,
      stock: -1
    };
  }

  // If status is not 'available', return wrapper with status info only
  if (status !== 'available' || !pricingData) {
    return {
      status,
      status_message: statusMessage,
      data: null,
      // Flatten for backward compatibility when no data
      unit_price: null,
      currency: null,
      stock: null
    };
  }

  const distributorCurrency = pricingData.currency; // USD for Digikey, can be INR/USD/etc for Mouser

  // If distributor already returns price in item's currency, no conversion needed
  if (distributorCurrency === itemCurrency?.code) {
    return {
      status,
      status_message: statusMessage,
      data: pricingData,
      // Flatten data for backward compatibility
      ...pricingData,
      needsConversion: false
    };
  }

  // Get exchange rate - try direct rate first, then inverse
  const rateKey = `${distributorCurrency}_TO_${itemCurrency?.code}`;
  let exchangeRate = exchangeRates[rateKey];

  // If direct rate not available, try inverse rate (e.g., INR_TO_USD = 1 / USD_TO_INR)
  if (!exchangeRate) {
    const inverseRateKey = `${itemCurrency?.code}_TO_${distributorCurrency}`;
    const inverseRate = exchangeRates[inverseRateKey];
    if (inverseRate) {
      exchangeRate = 1 / inverseRate;
      console.log(`[Currency] Using inverse rate: 1/${inverseRateKey} = ${exchangeRate}`);
    }
  }

  if (!exchangeRate) {
    console.warn(`No exchange rate for ${rateKey} or inverse`);
    return {
      status,
      status_message: statusMessage,
      data: pricingData,
      // Flatten data for backward compatibility
      ...pricingData,
      needsConversion: true,
      conversionFailed: true
    };
  }

  // Convert all pricing fields
  const convertedData = {
    ...pricingData,

    // Original USD values (keep for reference)
    original_unit_price: pricingData.unit_price,
    original_quantity_price: pricingData.quantity_price,
    original_currency: distributorCurrency,

    // Converted values
    unit_price: pricingData.unit_price ? pricingData.unit_price * exchangeRate : null,
    quantity_price: pricingData.quantity_price ? pricingData.quantity_price * exchangeRate : null,
    currency: itemCurrency.code,
    exchange_rate: exchangeRate,

    // Convert all price breaks
    price_breaks: pricingData.price_breaks ? pricingData.price_breaks.map((pb: any) => ({
      quantity: pb.quantity,
      price: (typeof pb.price === 'number' ? pb.price : parseFloat(pb.price)) * exchangeRate,
      original_price: pb.price  // Keep USD for reference
    })) : [],

    // Convert savings_info if exists
    savings_info: pricingData.savings_info ? {
      base_price: pricingData.savings_info.base_price * exchangeRate,
      current_price: pricingData.savings_info.current_price * exchangeRate,
      savings_per_unit: pricingData.savings_info.savings_per_unit * exchangeRate,
      total_savings: pricingData.savings_info.total_savings * exchangeRate,
      discount_percent: pricingData.savings_info.discount_percent,
      // Keep originals
      original_base_price: pricingData.savings_info.base_price,
      original_current_price: pricingData.savings_info.current_price
    } : null,

    // Convert next_tier_info if exists
    next_tier_info: pricingData.next_tier_info ? {
      next_tier_qty: pricingData.next_tier_info.next_tier_qty,
      next_tier_price: pricingData.next_tier_info.next_tier_price * exchangeRate,
      additional_qty_needed: pricingData.next_tier_info.additional_qty_needed,
      savings_per_unit: pricingData.next_tier_info.savings_per_unit ? pricingData.next_tier_info.savings_per_unit * exchangeRate : 0,
      potential_total_savings: pricingData.next_tier_info.potential_total_savings ? pricingData.next_tier_info.potential_total_savings * exchangeRate : 0,
      // Keep originals
      original_next_tier_price: pricingData.next_tier_info.next_tier_price
    } : null,

    needsConversion: false,
    wasConverted: true
  };

  return {
    status,
    status_message: statusMessage,
    data: convertedData,
    // Flatten data for backward compatibility
    ...convertedData
  };
}

/**
 * Process pricing for a single item - converts distributor pricing and auto-populates PO/Contract/Quote
 */
function processItemPricing(item: any, exchangeRates: Record<string, number>) {
  // Convert distributor pricing first
  const digikeyPricing = convertDistributorPricing(
    item.digikey_pricing,
    item.currency,
    exchangeRates
  );

  const mouserPricing = convertDistributorPricing(
    item.mouser_pricing,
    item.currency,
    exchangeRates
  );

  // Get base price from distributor data
  const digikeyPrice = digikeyPricing?.status === 'available'
    ? (digikeyPricing.quantity_price ?? digikeyPricing.unit_price)
    : null;
  const mouserPrice = mouserPricing?.status === 'available'
    ? (mouserPricing.quantity_price ?? mouserPricing.unit_price)
    : null;

  // Calculate base price from available distributor pricing
  let basePrice: number | null = null;
  if (digikeyPrice && mouserPrice) {
    basePrice = (digikeyPrice + mouserPrice) / 2;
  } else if (digikeyPrice) {
    basePrice = digikeyPrice;
  } else if (mouserPrice) {
    basePrice = mouserPrice;
  }

  // Auto-populate PO/Contract/Quote prices - always generate mock data
  // Use distributor price as base if available, otherwise use deterministic fallback
  let pricePO = 0;
  let priceContract = 0;
  let priceQuote = 0;
  let priceEXIM = 0;

  // Generate deterministic variation based on item ID
  const itemKey = String(item.itemId || item.id || '');
  let h = 0;
  for (let i = 0; i < itemKey.length; i++) h = (h * 31 + itemKey.charCodeAt(i)) >>> 0;
  const variation = 0.98 + ((h % 5) / 100); // 0.98 to 1.02

  // Use Digikey/Mouser price if available, then item.unitPrice (Price column), otherwise generate mock
  let mockBasePrice = basePrice;
  if (!mockBasePrice || mockBasePrice <= 0) {
    // Fall back to item.unitPrice (the Price column from Factwise)
    mockBasePrice = item.unitPrice || 0;
  }
  if (!mockBasePrice || mockBasePrice <= 0) {
    // Last resort: Generate deterministic mock price based on item ID
    mockBasePrice = 50 + ((h % 500)); // 50 to 550 in item's currency
  }

  // Prices with per-item variation so cheapest source varies
  // Each source uses a different formula to ensure prices are never identical
  // XOR with source-specific salt + different prime multipliers
  const poHash = (h ^ 0xA5A5) * 7;
  const contractHash = (h ^ 0x5A5A) * 13;
  const quoteHash = (h ^ 0x3C3C) * 17;
  const eximHash = (h ^ 0xC3C3) * 23;

  const poVariation = 0.85 + (Math.abs(poHash) % 21) / 100;       // 0.85 to 1.05
  const contractVariation = 0.85 + (Math.abs(contractHash) % 21) / 100; // 0.85 to 1.05
  const quoteVariation = 0.85 + (Math.abs(quoteHash) % 21) / 100;    // 0.85 to 1.05
  const eximVariation = 0.85 + (Math.abs(eximHash) % 21) / 100;     // 0.85 to 1.05

  pricePO = Math.round(mockBasePrice * poVariation * variation * 100) / 100;
  priceContract = Math.round(mockBasePrice * contractVariation * variation * 100) / 100;
  priceQuote = Math.round(mockBasePrice * quoteVariation * variation * 100) / 100;
  priceEXIM = Math.round(mockBasePrice * eximVariation * variation * 100) / 100;

  // Determine cheapest source — only real distributor data (Digikey/Mouser)
  const priceOptions: { source: string; price: number }[] = [];

  // Add Digikey/Mouser if available
  if (digikeyPricing?.status === 'available') {
    const dkPrice = digikeyPricing.quantity_price ?? digikeyPricing.unit_price;
    if (dkPrice && dkPrice > 0) {
      priceOptions.push({ source: 'Digi-Key', price: dkPrice });
    }
  }
  if (mouserPricing?.status === 'available') {
    const mPrice = mouserPricing.quantity_price ?? mouserPricing.unit_price;
    if (mPrice && mPrice > 0) {
      priceOptions.push({ source: 'Mouser', price: mPrice });
    }
  }

  // Find cheapest source — always Project (no hardcoded sources)
  const validPrices = priceOptions.filter(p => p.price > 0);
  const cheapestSource = validPrices.length > 0
    ? validPrices.reduce((min, p) => p.price < min.price ? p : min).source
    : 'Project';

  const vendor = item.vendor || ''

  return {
    ...item,
    digikey_pricing: digikeyPricing,
    mouser_pricing: mouserPricing,
    pricePO,
    priceContract,
    priceQuote,
    priceEXIM,
    source: cheapestSource,
    vendor,
  };
}

export default function ProcurementDashboard() {
  const { toast } = useToast()
  const [lineItems, setLineItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [projectData, setProjectData] = useState({
    name: "",
    id: "",
    status: "",
    created: "",
    deadline: "",
    customer: "",
    buyer_entity_id: "",
    buyer_entity_name: "",
    template_id: "",
  })
  const [projectUsers, setProjectUsers] = useState<Array<{user_id: string, name: string, email: string, role: string}>>([])
  // Project-level role arrays (same for all items)
  const [projectManagers, setProjectManagers] = useState<string>('')
  const [rfqAssignees, setRfqAssignees] = useState<string>('')
  const [quoteAssignees, setQuoteAssignees] = useState<string>('')
  // Map of user name → roles (for settings display)
  const [userRolesMap, setUserRolesMap] = useState<Record<string, string[]>>({})
  // All enterprise users available for role assignment
  const [availableUsers, setAvailableUsers] = useState<Array<{user_id: string, name: string, email: string}>>([])
  // Users assigned to at least one section in the project (eligible for item-level assignment)
  const [sectionAssignedUsers, setSectionAssignedUsers] = useState<Array<{user_id: string, name: string, email: string}>>([])
  // Currently assigned users per role (raw arrays from API)
  const [rfqResponsibleUsers, setRfqResponsibleUsers] = useState<Array<{user_id: string, name: string, email: string}>>([])
  const [quoteResponsibleUsers, setQuoteResponsibleUsers] = useState<Array<{user_id: string, name: string, email: string}>>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [tagSearchTerm, setTagSearchTerm] = useState("")

  // Ref to prevent double loading in React Strict Mode
  const loadingStartedRef = useRef(false)
  const [vendorSearchTerm, setVendorSearchTerm] = useState("")
  // Edit-popup custom vendor state
  const [editVendorSearchInput, setEditVendorSearchInput] = useState("")
  const [editVendorSearchResults, setEditVendorSearchResults] = useState<CustomVendor[]>([])
  const [editVendorSearching, setEditVendorSearching] = useState(false)
  const [editVendorSelectedIds, setEditVendorSelectedIds] = useState<string[]>([])
  const [editAttachedVendors, setEditAttachedVendors] = useState<CustomVendor[]>([])  // common-intersection in bulk mode
  const [editVendorMutating, setEditVendorMutating] = useState(false)
  // True once the user has added or removed any custom vendor in this edit session — enables the Save button
  const [editVendorDirty, setEditVendorDirty] = useState(false)
  const [userSearchTerm, setUserSearchTerm] = useState("")
  const [selectedItems, setSelectedItems] = useState<number[]>([])
  const [editingItem, setEditingItem] = useState<any | null>(null)
  const [editingUsers, setEditingUsers] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [vendorFilter, setVendorFilter] = useState<string[]>([])
  const [actionFilter, setActionFilter] = useState<string[]>([])
  const [assignedFilter, setAssignedFilter] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [sortField, setSortField] = useState<string>("")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [reverseFilter, setReverseFilter] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  // Track if all items are loaded from server
  const [allItemsLoaded, setAllItemsLoaded] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: 0, failed: 0 })
  const [isLoadingAllItems, setIsLoadingAllItems] = useState(false)
  const [loadingError, setLoadingError] = useState<{ message: string; canRetry: boolean } | null>(null)
  const loadingAbortRef = useRef(false)
  const autoAssignAbortRef = useRef(false)
  const [autoAssignProgress, setAutoAssignProgress] = useState<{
    current: number
    total: number
    isRunning: boolean
    phase: 'fetching' | 'evaluating' | 'assigning' | 'done' | 'cancelled'
    rulesCount: number
    matchedItems: number
    assignmentsCount: number
    log: string[]  // recent activity log lines
  }>({ current: 0, total: 0, isRunning: false, phase: 'fetching', rulesCount: 0, matchedItems: 0, assignmentsCount: 0, log: [] })

  const [columnOrder, setColumnOrder] = useState([
    "itemId",
    "description",
    "internalNotes",
    "bom",
    "quantity",
    "unit",
    "category",
    "projectManager",
    "rfqAssignee",
    "quoteAssignee",
    "rfqResponsible",
    "quoteResponsible",
    "action",
    "assignedTo",
    "dueDate",
    "vendor",
    "unitPrice",
    "source",
    "pricePO",
    "priceContract",
    "priceQuote",
    "priceRFQ",
    "priceDigikey",
    "priceMouser",
  ])
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(["customer"])
  const [savedViews, setSavedViews] = useState<{ [key: string]: { order: string[]; hidden: string[] } }>({})
  const [currentView, setCurrentView] = useState("default")
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null)

  // Dynamic specification columns
  const [specColumns, setSpecColumns] = useState<string[]>([])
  // Dynamic custom identification columns
  const [customIdColumns, setCustomIdColumns] = useState<string[]>([])
  // Dynamic internal notes column name (from Item Directory template)
  const [internalNotesLabel, setInternalNotesLabel] = useState<string>('Internal Notes')

  // Pricing repo lookup settings — persisted to localStorage
  const [pricingSettings, setPricingSettings] = useState<PricingLookupSettings>(DEFAULT_PRICING_SETTINGS)
  // Gate: pricing repo fetch only runs after the user explicitly clicks "Load Pricing"
  const [pricingEnabled, setPricingEnabled] = useState<boolean>(false)
  useEffect(() => {
    setPricingSettings(loadPricingSettings())
  }, [])
  const updatePricingSettings = (next: PricingLookupSettings) => {
    setPricingSettings(next)
    savePricingSettings(next)
  }

  // Distributor enabled flags (based on API keys configured in admin)
  const [digikeyEnabled, setDigikeyEnabled] = useState(false)
  const [mouserEnabled, setMouserEnabled] = useState(false)
  // Digikey job state
  const [digikeyJob, setDigikeyJob] = useState<any>(null)
  // Mouser job state
  const [mouserJob, setMouserJob] = useState<any>(null)
  // Exchange rates for currency conversion (USD_TO_XXX format)
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    itemId: 130,
    description: 280,
    internalNotes: 140,
    bom: 140,
    quantity: 80,
    unit: 60,
    category: 170,
    projectManager: 160,
    rfqAssignee: 160,
    quoteAssignee: 160,
    rfqResponsible: 160,
    quoteResponsible: 160,
    action: 80,
    assignedTo: 144,
    dueDate: 100,
    vendor: 144,
    unitPrice: 100,
    source: 96,
    pricePO: 88,
    priceContract: 88,
    priceQuote: 88,
    priceDigikey: 88,
    priceMouser: 88,
    priceEXIM: 88,
    totalPrice: 128,
    customer: 120,
  })

  const [isResizing, setIsResizing] = useState(false)
  const [resizeColumn, setResizeColumn] = useState<string | null>(null)

  // Popup states
  const [showAssignUsersPopup, setShowAssignUsersPopup] = useState(false)
  const [showFillPricesPopup, setShowFillPricesPopup] = useState(false)
  const [showAssignActionsPopup, setShowAssignActionsPopup] = useState(false)
  const [showActionResultsPopup, setShowActionResultsPopup] = useState(false)
  const [actionResultsLoading, setActionResultsLoading] = useState(false)
  const [showAnalyticsPopup, setShowAnalyticsPopup] = useState(false)
  const [selectedItemForAnalytics, setSelectedItemForAnalytics] = useState<any>(null)
  // Full pricing-repo history for the currently-open analytics popup (lazy-loaded)
  const [analyticsMpnHistory, setAnalyticsMpnHistory] = useState<PricingRecord[] | null>(null)
  const [analyticsUseAdminCurrency, setAnalyticsUseAdminCurrency] = useState(true)
  const [analyticsHistoryLoading, setAnalyticsHistoryLoading] = useState(false)
  // Confirmation dialog: cell click → confirm before navigating to source doc
  const [pendingNavRecord, setPendingNavRecord] = useState<PricingRecord | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editFormData, setEditFormData] = useState<any>({})

  // Bulk update progress state
  const [bulkUpdateInProgress, setBulkUpdateInProgress] = useState(false)
  const [bulkUpdateProgress, setBulkUpdateProgress] = useState({ current: 0, total: 0, failed: 0 })

  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<'users' | 'prices' | 'actions'>('users')
  const [settingsProfiles, setSettingsProfiles] = useState<Record<string, AppSettings>>({})
  const [currentSettingsKey, setCurrentSettingsKey] = useState<string>('Default')

  // Admin action rules (fetched by SettingsPanel, used by handleAssignActions)
  const [adminActionRules, setAdminActionRules] = useState<import('@/lib/api').ActionRule[]>([])

  // Helper function to refresh pricing data in chunks (avoids timeout)
  const refreshPricingDataInChunks = async (projectId: string, pricingType: 'digikey' | 'mouser' | 'both') => {
    console.log(`[Pricing Refresh] Starting chunked refresh for ${pricingType}...`)
    const CHUNK_SIZE = 200
    let offset = 0
    let hasMore = true
    const pricingUpdates: Map<string, any> = new Map()

    while (hasMore) {
      try {
        const chunkResponse = await getProjectItems(projectId, {
          limit: CHUNK_SIZE,
          offset,
          skip_pricing_jobs: true
        })

        if (!chunkResponse.items || chunkResponse.items.length === 0) {
          hasMore = false
          break
        }

        // Collect pricing data from this chunk
        chunkResponse.items.forEach((item: any) => {
          const update: any = { project_item_id: item.project_item_id }
          if (pricingType === 'digikey' || pricingType === 'both') {
            update.digikey_pricing = item.digikey_pricing
          }
          if (pricingType === 'mouser' || pricingType === 'both') {
            update.mouser_pricing = item.mouser_pricing
          }
          pricingUpdates.set(item.project_item_id, update)
        })

        console.log(`[Pricing Refresh] Fetched chunk ${offset}-${offset + chunkResponse.items.length}`)

        offset += CHUNK_SIZE
        if (chunkResponse.items.length < CHUNK_SIZE) {
          hasMore = false
        }

        // Small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (error) {
        console.error(`[Pricing Refresh] Error fetching chunk at offset ${offset}:`, error)
        hasMore = false
      }
    }

    console.log(`[Pricing Refresh] Collected pricing for ${pricingUpdates.size} items`)

    // Update local state with new pricing data
    setLineItems((prevItems: any[]) => prevItems.map((item: any) => {
      const update = pricingUpdates.get(item.project_item_id)
      if (!update) return item

      const updatedItem = { ...item }
      if (update.digikey_pricing !== undefined) {
        updatedItem.digikey_pricing = update.digikey_pricing
      }
      if (update.mouser_pricing !== undefined) {
        updatedItem.mouser_pricing = update.mouser_pricing
      }
      // Re-process pricing with currency conversion
      return processItemPricing(updatedItem, exchangeRates)
    }))

    console.log(`[Pricing Refresh] Updated local state with new pricing`)
  }

  // Helper function to refresh user assignments in chunks (avoids timeout)
  const refreshUserAssignmentsInChunks = async (projectId: string) => {
    console.log(`[User Refresh] Starting chunked refresh for user assignments...`)
    const CHUNK_SIZE = 200
    let offset = 0
    let hasMore = true
    const userUpdates: Map<string, any> = new Map()

    while (hasMore) {
      try {
        const chunkResponse = await getProjectItems(projectId, {
          limit: CHUNK_SIZE,
          offset,
          skip_pricing_jobs: true
        })

        if (!chunkResponse.items || chunkResponse.items.length === 0) {
          hasMore = false
          break
        }

        // Collect user assignment data from this chunk
        chunkResponse.items.forEach((item: any) => {
          userUpdates.set(item.project_item_id, {
            assigned_user_ids: item.assigned_users.map((u: any) => u.user_id),
            assignedTo: item.assigned_users.map((u: any) => u.name).join(', ')
          })
        })

        console.log(`[User Refresh] Fetched chunk ${offset}-${offset + chunkResponse.items.length}`)

        offset += CHUNK_SIZE
        if (chunkResponse.items.length < CHUNK_SIZE) {
          hasMore = false
        }

        // Small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (error) {
        console.error(`[User Refresh] Error fetching chunk at offset ${offset}:`, error)
        hasMore = false
      }
    }

    console.log(`[User Refresh] Collected user assignments for ${userUpdates.size} items`)

    // Update local state with new user assignments
    setLineItems((prevItems: any[]) => prevItems.map((item: any) => {
      const update = userUpdates.get(item.project_item_id)
      if (!update) return item

      return {
        ...item,
        assigned_user_ids: update.assigned_user_ids,
        assignedTo: update.assignedTo
      }
    }))

    console.log(`[User Refresh] Updated local state with new user assignments`)
    return userUpdates
  }

  // Initialize savedViews from localStorage on client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem("tableViews")
      if (stored) {
        setSavedViews(JSON.parse(stored))
      }
      const storedSettings = localStorage.getItem('appSettingsProfiles')
      let parsed: Record<string, AppSettings> | null = null
      try {
        parsed = storedSettings ? JSON.parse(storedSettings) : null
      } catch {}
      const initial = parsed && Object.keys(parsed).length > 0 ? parsed : { Default: buildDefaultSettings('Default') }
      setSettingsProfiles(initial)
      const curKey = localStorage.getItem('currentSettingsProfile') || 'Default'
      setCurrentSettingsKey(initial[curKey] ? curKey : 'Default')
    }
  }, [])

  // Warn user before leaving page during bulk update
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (bulkUpdateInProgress) {
        e.preventDefault()
        e.returnValue = 'Bulk update is in progress. Are you sure you want to leave?'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [bulkUpdateInProgress])

  // Load project data from API
  useEffect(() => {
    // Prevent double loading in React Strict Mode
    if (loadingStartedRef.current) {
      console.log('[Dashboard] Skipping duplicate load (Strict Mode)')
      return
    }
    loadingStartedRef.current = true

    async function loadProjectData() {
      try {
        setLoading(true)
        const projectId = getProjectId()

        if (!projectId) {
          console.warn('No project_id in URL, using empty data')
          setLineItems([])
          setLoading(false)
          return
        }

        console.log('[Dashboard] Fetching data for project:', projectId)

        // Fetch overview, users, and tags first (fast queries)
        const [overviewResponse, usersResponse, tagsResponse] = await Promise.all([
          getProjectOverview(projectId),
          getProjectUsers(projectId),
          getProjectTags(projectId)
        ])

        // Load items in smaller chunks to avoid timeout
        // Start with first 100 items for immediate display
        // IMPORTANT: Skip pricing jobs on initial load - we'll trigger them after all data is loaded
        const initialItemsResponse = await getProjectItems(projectId, { limit: 100, offset: 0, skip_pricing_jobs: true })
        console.log('[Dashboard] Initial load:', initialItemsResponse.items.length, 'items of', initialItemsResponse.total)
        // DEBUG: Check what assigned_users looks like from API
        if (initialItemsResponse.items.length > 0) {
          console.log('[Dashboard] DEBUG assigned_users on first item:', JSON.stringify(initialItemsResponse.items[0].assigned_users))
        }

        // Set project data
        setProjectData({
          name: overviewResponse.project.project_name,
          id: overviewResponse.project.project_code,
          status: overviewResponse.project.status,
          created: overviewResponse.project.validity_from || '',
          deadline: overviewResponse.project.deadline || '',
          customer: overviewResponse.project.customer_name || '',
          buyer_entity_id: overviewResponse.project.buyer_entity_id || '',
          buyer_entity_name: overviewResponse.project.buyer_entity_name || '',
          template_id: overviewResponse.project.template_id || '',
        })

        console.log('[Dashboard] Project:', overviewResponse.project.project_name)

        // Set users data
        setProjectUsers(usersResponse.users)
        console.log('[Dashboard] Loaded', usersResponse.users.length, 'users:', usersResponse.users.map(u => `${u.name} (${u.email})`))

        // Set project-level role columns (same for all items)
        const pmNames = (usersResponse.project_managers || []).map(u => u.name).join('; ')
        const rfqNames = (usersResponse.rfq_responsible_users || []).map(u => u.name).join('; ')
        const quoteNames = (usersResponse.quote_responsible_users || []).map(u => u.name).join('; ')
        setProjectManagers(pmNames)
        setRfqAssignees(rfqNames)
        setQuoteAssignees(quoteNames)
        setRfqResponsibleUsers(usersResponse.rfq_responsible_users || [])
        setQuoteResponsibleUsers(usersResponse.quote_responsible_users || [])
        console.log('[Dashboard] Roles — PM:', pmNames, '| RFQ:', rfqNames, '| Quote:', quoteNames)

        // Build user → roles map for settings display
        const rolesMap: Record<string, string[]> = {}
        ;(usersResponse.project_managers || []).forEach(u => {
          if (!rolesMap[u.name]) rolesMap[u.name] = []
          rolesMap[u.name].push('PM')
        })
        ;(usersResponse.rfq_responsible_users || []).forEach(u => {
          if (!rolesMap[u.name]) rolesMap[u.name] = []
          if (!rolesMap[u.name].includes('RFQ Assignee')) rolesMap[u.name].push('RFQ Assignee')
        })
        ;(usersResponse.quote_responsible_users || []).forEach(u => {
          if (!rolesMap[u.name]) rolesMap[u.name] = []
          if (!rolesMap[u.name].includes('Quote Assignee')) rolesMap[u.name].push('Quote Assignee')
        })
        setUserRolesMap(rolesMap)

        // Store available enterprise users for role assignment dropdowns
        if (usersResponse.available_users) {
          setAvailableUsers(usersResponse.available_users)
          console.log('[Dashboard] Available users for assignment:', usersResponse.available_users.length)
        }

        // Store section-assigned users (eligible for item-level assignment)
        if (usersResponse.section_assigned_users) {
          setSectionAssignedUsers(usersResponse.section_assigned_users)
          console.log('[Dashboard] Section-assigned users:', usersResponse.section_assigned_users.length)
        }

        // Set available tags (ALL organization-level tags from backend)
        setAvailableTags(tagsResponse.tags || [])
        console.log('[Dashboard] Available tags:', tagsResponse.total, 'tags:', tagsResponse.tags)

        // LOG: Check for duplicates from backend
        console.log('[Dashboard] Raw items from backend:', initialItemsResponse.items.length)
        console.log('[Dashboard] Item codes:', initialItemsResponse.items.map((item: ProjectItem) => item.item_code))

        // Check for duplicate item_codes
        const itemCodes = initialItemsResponse.items.map((item: ProjectItem) => item.item_code)
        const duplicateCodes = itemCodes.filter((code, index) => itemCodes.indexOf(code) !== index)
        if (duplicateCodes.length > 0) {
          console.warn('[Dashboard] ⚠️ DUPLICATE ITEM CODES FROM BACKEND:', duplicateCodes)
        }

        // LOG: Verify tags and custom_tags from backend
        console.log('[Dashboard] Tags and BOM info received from API:')
        initialItemsResponse.items.slice(0, 5).forEach((item: ProjectItem) => {
          console.log(`  ${item.item_code}:`, {
            tags: item.tags || [],
            custom_tags: item.custom_tags || [],
            bom_info: item.bom_info
          })
        })

        // Extract all unique spec names for dynamic columns
        const specNamesSet = new Set<string>()
        initialItemsResponse.items.forEach(item => {
          item.specifications?.forEach(spec => {
            specNamesSet.add(spec.spec_name)
          })
        })
        const uniqueSpecNames = Array.from(specNamesSet).sort()
        setSpecColumns(uniqueSpecNames)
        console.log('[Dashboard] Found', uniqueSpecNames.length, 'unique specifications:', uniqueSpecNames)

        // Extract all unique custom identification names for dynamic columns
        const customIdNamesSet = new Set<string>()
        initialItemsResponse.items.forEach(item => {
          item.custom_identifications?.forEach(id => {
            customIdNamesSet.add(id.identification_name)
          })
        })
        const uniqueCustomIdNames = Array.from(customIdNamesSet).sort()
        setCustomIdColumns(uniqueCustomIdNames)
        console.log('[Dashboard] Found', uniqueCustomIdNames.length, 'unique custom identifications:', uniqueCustomIdNames)

        // Store exchange rates for currency conversion
        if (initialItemsResponse.exchange_rates) {
          setExchangeRates(initialItemsResponse.exchange_rates)
          console.log('[Dashboard] Loaded exchange rates:', Object.keys(initialItemsResponse.exchange_rates).length, 'currencies')
        }

        // Store dynamic internal notes column name from API
        const notesColName = initialItemsResponse.internal_notes_column_name || 'Internal Notes'
        setInternalNotesLabel(notesColName)
        console.log('[Dashboard] Internal notes column name:', notesColName)

        // Transform API data using shared helper
        const itemsWithConvertedPricing = initialItemsResponse.items.map((item: ProjectItem, index: number) =>
          transformApiItem(item, index, initialItemsResponse.exchange_rates || {}, uniqueSpecNames, uniqueCustomIdNames)
        )

        console.log('[Dashboard] Loaded', itemsWithConvertedPricing.length, 'items')

        setLineItems(itemsWithConvertedPricing)
        setLoading(false)

        // Load remaining items in background if there are more
        const totalItems = initialItemsResponse.total
        if (totalItems > 100) {
          console.log(`[Dashboard] Loading remaining ${totalItems - 100} items in background...`)
          loadRemainingItems(projectId, initialItemsResponse.exchange_rates || {}, uniqueSpecNames, totalItems, uniqueCustomIdNames)
        } else {
          // All items loaded initially - trigger pricing jobs
          setAllItemsLoaded(true)
          console.log(`[Dashboard] All ${totalItems} items loaded, triggering pricing jobs...`)
          triggerPricingJobs(projectId)
        }
      } catch (error) {
        console.error('[Dashboard] Error loading data:', error)
        setLineItems([])
        setLoading(false)
      }
    }

    loadProjectData()
  }, [])

  // Transform a raw API item into the dashboard format
  const transformApiItem = (item: ProjectItem, index: number, exchangeRates: Record<string, number>, uniqueSpecNames: string[], uniqueCustomIdNames: string[]) => {
    const baseItem: any = {
      id: index + 1,
      project_item_id: item.project_item_id,
      customer: '',
      itemId: item.item_code,
      description: item.item_name,
      quantity: item.quantity,
      unit: item.measurement_unit?.abbreviation || '',
      category: (() => {
        const allTags = [...(item.tags || []), ...(item.custom_tags || [])];
        const uniqueTags = [...new Set(allTags)];
        return uniqueTags.length > 0 ? uniqueTags.join(', ') : 'Uncategorized';
      })(),
      original_tags: item.tags || [],
      original_custom_tags: item.custom_tags || [],
      assignedTo: item.assigned_users.map(u => u.name).join(', '),
      assigned_user_ids: item.assigned_users.map(u => u.user_id),
      _debug_assigned_users: item.assigned_users, // TEMP DEBUG — remove later
      unitPrice: item.rate || 0,
      totalPrice: item.amount || 0,
      currency: item.currency,
      event_quantity: item.event_quantity ?? null,
      bom_slab_quantity: item.bom_slab_quantity || 0,
      enterprise_item_id: item.enterprise_item_id || null,
      erp_item_code: item.erp_item_code || null,
      // RFQ/Quote Assignee are PROJECT-level (same for all items) — populated from column render using state
      rfqAssigneeName: '',  // filled from rfqAssignees state in column render
      quoteAssigneeName: '',  // filled from quoteAssignees state in column render
      // RFQ/Quote Item Responsible are PER-ITEM — from items API
      // API may return objects [{user_id, name}] or just ID strings ["uuid"] — handle both
      rfqResponsibleName: (item.rfq_responsible_users || []).map((u: any) => {
        if (typeof u === 'string') { const found = projectUsers.find(pu => pu.user_id === u); return found?.name || u }
        return u.name || u.user_id || u
      }).join('; '),
      quoteResponsibleName: (item.quote_responsible_users || []).map((u: any) => {
        if (typeof u === 'string') { const found = projectUsers.find(pu => pu.user_id === u); return found?.name || u }
        return u.name || u.user_id || u
      }).join('; '),
      vendor: '',
      custom_vendors: [] as CustomVendor[],  // populated when edit popup opens or bulk-loaded later
      action: item.action || '',
      dueDate: '',
      source: '',
      pricePO: 0,
      priceContract: 0,
      priceQuote: 0,
      priceDigikey: 0,
      priceMouser: 0,
      priceEXIM: 0,
      manuallyEdited: item.custom_fields?.manually_edited || false,
      notes: item.notes || '',
      internalNotes: item.internal_notes || '',
      bom_info: item.bom_info || {
        is_bom_item: false,
        bom_id: null,
        bom_code: null,
        bom_name: null,
        bom_item_id: null,
        bom_module_linkage_id: null,
      },
      bom_usages: item.bom_usages || [],
      event_usages: item.event_usages || [],
      delivery_slabs: item.delivery_slabs || [],
      alternate_info: item.alternate_info || {
        is_alternate: false,
        alternate_parent_id: null,
        alternate_parent_name: null,
        alternate_parent_code: null,
        has_alternates: false,
        alternates: [],
      },
    }

    uniqueSpecNames.forEach(specName => {
      const spec = item.specifications?.find(s => s.spec_name === specName)
      baseItem[`spec_${specName.replace(/\s+/g, '_')}`] = spec?.spec_values.join(', ') || '-'
    })

    uniqueCustomIdNames.forEach(idName => {
      const customId = item.custom_identifications?.find(id => id.identification_name === idName)
      baseItem[`customId_${idName.replace(/\s+/g, '_')}`] = customId?.identification_value || '-'
    })

    baseItem.digikey_pricing = item.digikey_pricing || null
    baseItem.mouser_pricing = item.mouser_pricing || null

    return processItemPricing(baseItem, exchangeRates)
  }

  // Load remaining items in background with parallel fetching and retry
  const loadRemainingItems = async (projectId: string, exchangeRates: Record<string, number>, uniqueSpecNames: string[], totalItems: number, uniqueCustomIdNames: string[] = [], resumeFromOffset: number = 100) => {
    const CHUNK_SIZE = 500
    const CONCURRENCY = 3 // Fetch 3 chunks in parallel
    const MAX_CHUNK_RETRIES = 3

    loadingAbortRef.current = false
    setLoadingError(null)
    setIsLoadingAllItems(true)

    let loadedCount = resumeFromOffset
    let failedChunks: number[] = []
    setLoadingProgress({ loaded: loadedCount, total: totalItems, failed: 0 })

    // Build list of all offsets we need to fetch
    const offsets: number[] = []
    for (let offset = resumeFromOffset; offset < totalItems; offset += CHUNK_SIZE) {
      offsets.push(offset)
    }

    console.log(`[Background Load] Loading ${totalItems - resumeFromOffset} items in ${offsets.length} chunks of ${CHUNK_SIZE} (concurrency: ${CONCURRENCY})`)

    // Process offsets in batches of CONCURRENCY
    for (let batchStart = 0; batchStart < offsets.length; batchStart += CONCURRENCY) {
      if (loadingAbortRef.current) {
        console.log('[Background Load] Aborted by user')
        break
      }

      const batch = offsets.slice(batchStart, batchStart + CONCURRENCY)
      console.log(`[Background Load] Fetching batch: offsets ${batch.join(', ')}`)

      // Fetch all chunks in this batch in parallel
      const results = await Promise.allSettled(
        batch.map(async (offset) => {
          let lastErr: Error | null = null
          for (let retry = 0; retry <= MAX_CHUNK_RETRIES; retry++) {
            try {
              if (retry > 0) {
                console.log(`[Background Load] Retrying offset ${offset} (attempt ${retry + 1})`)
              }
              const chunkResponse = await getProjectItems(projectId, {
                limit: CHUNK_SIZE,
                offset,
                skip_pricing_jobs: true,
              })
              return { offset, items: chunkResponse.items || [] }
            } catch (err: any) {
              lastErr = err
              if (retry < MAX_CHUNK_RETRIES) {
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retry)))
              }
            }
          }
          throw lastErr || new Error(`Failed to fetch offset ${offset}`)
        })
      )

      // Process results from this batch
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { offset, items } = result.value
          if (items.length === 0) continue

          // Discover new custom ID names
          items.forEach((item: ProjectItem) => {
            item.custom_identifications?.forEach(id => {
              if (!uniqueCustomIdNames.includes(id.identification_name)) {
                uniqueCustomIdNames.push(id.identification_name)
              }
            })
          })
          setCustomIdColumns([...uniqueCustomIdNames].sort())

          // Transform and append
          const converted = items.map((item: ProjectItem, idx: number) =>
            transformApiItem(item, offset + idx, exchangeRates, uniqueSpecNames, uniqueCustomIdNames)
          )
          setLineItems(prev => [...prev, ...converted])
          loadedCount += converted.length
        } else {
          // This chunk failed after all retries
          const failedOffset = batch[results.indexOf(result)]
          failedChunks.push(failedOffset)
          console.error(`[Background Load] Chunk at offset ${failedOffset} failed permanently:`, result.reason)
        }
      }

      setLoadingProgress({ loaded: Math.min(loadedCount, totalItems), total: totalItems, failed: failedChunks.length })
      console.log(`[Background Load] Progress: ${loadedCount}/${totalItems} loaded, ${failedChunks.length} failed chunks`)
    }

    // Done
    if (failedChunks.length > 0) {
      const failedItems = failedChunks.length * CHUNK_SIZE
      console.warn(`[Background Load] Completed with ${failedChunks.length} failed chunks (~${failedItems} items)`)
      setLoadingError({
        message: `${failedChunks.length} chunk(s) failed to load (~${Math.min(failedItems, totalItems - loadedCount)} items). You can retry or continue with what's loaded.`,
        canRetry: true,
      })
      // Store failed offsets for retry
      ;(window as any).__failedChunkOffsets = failedChunks
      ;(window as any).__loadRemainingContext = { projectId, exchangeRates, uniqueSpecNames, totalItems, uniqueCustomIdNames }
      setIsLoadingAllItems(false)
    } else {
      console.log(`[Background Load] Finished loading all ${totalItems} items`)
      setAllItemsLoaded(true)
      setIsLoadingAllItems(false)
      setLoadingError(null)
      triggerPricingJobs(projectId)
      // Custom vendor hydration kicks off via useEffect([allItemsLoaded])
    }
  }

  // Background hydrator: fetch custom_vendors for every loaded line item in small parallel waves.
  // Background hydrator: fetch custom_vendors for every loaded line item in small parallel waves.
  // Runs once after items finish loading — and only runs once per session per project.
  // Note: this is a temporary workaround until the backend batches custom_vendors into the items endpoint.
  const customVendorHydrationDoneRef = useRef(false)
  useEffect(() => {
    if (!allItemsLoaded) return
    if (customVendorHydrationDoneRef.current) return
    if (lineItems.length === 0) return

    const projectId = getProjectId()
    if (!projectId) return

    customVendorHydrationDoneRef.current = true
    let cancelled = false

    const run = async () => {
      // Snapshot IDs directly from the setter to avoid stale closure on lineItems
      const snapshot: Array<{ id: number; project_item_id: string }> = []
      lineItems.forEach((li: any) => {
        if (li.project_item_id) snapshot.push({ id: li.id, project_item_id: li.project_item_id })
      })
      if (snapshot.length === 0) return
      console.log(`[Custom Vendors] Hydrating ${snapshot.length} items in background...`)

      const CONCURRENCY = 8
      let i = 0
      while (i < snapshot.length) {
        if (cancelled) return
        const wave = snapshot.slice(i, i + CONCURRENCY)
        i += CONCURRENCY
        const results = await Promise.all(
          wave.map(({ id, project_item_id }) =>
            getItemCustomVendors(projectId, project_item_id)
              .then(res => ({ id, vendors: res.custom_vendors || [] }))
              .catch(err => {
                console.warn('[Custom Vendors] Failed for', project_item_id, err)
                return null
              })
          )
        )
        if (cancelled) return
        const byId = new Map<number, CustomVendor[]>()
        for (const r of results) {
          if (r) byId.set(r.id, r.vendors)
        }
        if (byId.size > 0) {
          setLineItems((prev: any[]) =>
            prev.map(li => (byId.has(li.id) ? { ...li, custom_vendors: byId.get(li.id)! } : li))
          )
        }
      }
      console.log('[Custom Vendors] Hydration complete')
    }

    run()
    return () => { cancelled = true }
    // We intentionally only trigger on allItemsLoaded flipping true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItemsLoaded])

  // Retry only the failed chunks
  const retryFailedChunks = async () => {
    const failedOffsets = (window as any).__failedChunkOffsets as number[] | undefined
    const ctx = (window as any).__loadRemainingContext
    if (!failedOffsets?.length || !ctx) return

    setLoadingError(null)
    setIsLoadingAllItems(true)
    const { projectId, exchangeRates, uniqueSpecNames, totalItems, uniqueCustomIdNames } = ctx
    const CHUNK_SIZE = 500
    let newFailed: number[] = []
    let newLoaded = 0

    console.log(`[Retry] Retrying ${failedOffsets.length} failed chunks...`)

    for (const offset of failedOffsets) {
      try {
        const chunkResponse = await getProjectItems(projectId, { limit: CHUNK_SIZE, offset, skip_pricing_jobs: true })
        const items = chunkResponse.items || []
        if (items.length > 0) {
          items.forEach((item: ProjectItem) => {
            item.custom_identifications?.forEach(id => {
              if (!uniqueCustomIdNames.includes(id.identification_name)) {
                uniqueCustomIdNames.push(id.identification_name)
              }
            })
          })
          setCustomIdColumns([...uniqueCustomIdNames].sort())
          const converted = items.map((item: ProjectItem, idx: number) =>
            transformApiItem(item, offset + idx, exchangeRates, uniqueSpecNames, uniqueCustomIdNames)
          )
          setLineItems(prev => [...prev, ...converted])
          newLoaded += converted.length
        }
      } catch (err) {
        console.error(`[Retry] Chunk at offset ${offset} failed again:`, err)
        newFailed.push(offset)
      }
    }

    setLoadingProgress(prev => ({
      loaded: prev.loaded + newLoaded,
      total: totalItems,
      failed: newFailed.length,
    }))

    if (newFailed.length > 0) {
      ;(window as any).__failedChunkOffsets = newFailed
      setLoadingError({
        message: `${newFailed.length} chunk(s) still failing. Check your network connection and try again.`,
        canRetry: true,
      })
    } else {
      ;(window as any).__failedChunkOffsets = undefined
      setLoadingError(null)
      setAllItemsLoaded(true)
      triggerPricingJobs(projectId)
    }
    setIsLoadingAllItems(false)
  }

  // Trigger pricing jobs for all loaded items
  const triggerPricingJobs = async (projectId: string) => {
    try {
      console.log('[Pricing Jobs] All items loaded. Triggering pricing by fetching items without skip_pricing_jobs flag...')

      // Call getProjectItems WITHOUT skip_pricing_jobs to trigger backend pricing jobs
      // Use limit: 1 since we just need to trigger the jobs, not load all items
      // Backend will still process ALL items in the project for pricing jobs
      const response = await getProjectItems(projectId, { limit: 1 })

      console.log('[Pricing Jobs] Response:', response)

      // Detect if Digikey/Mouser API keys are configured
      // Only enable columns if backend returns a valid status (all_cached or background_job_started)
      const digikeyConfigured = response.digikey_status === 'all_cached' || response.digikey_status === 'background_job_started'
      const mouserConfigured = response.mouser_status === 'all_cached' || response.mouser_status === 'background_job_started'
      setDigikeyEnabled(digikeyConfigured)
      setMouserEnabled(mouserConfigured)
      console.log('[Pricing Jobs] API keys configured - Digikey:', digikeyConfigured, 'Mouser:', mouserConfigured)

      // Handle Digikey status
      if (response.digikey_status === 'background_job_started') {
        const uncachedCount = response.digikey_uncached_count || 0
        const jobId = response.digikey_job_id

        console.log(`🔄 Digikey background job started for ${uncachedCount} items`)

        setDigikeyJob({
          job_id: jobId,
          status: 'processing',
          uncached_count: uncachedCount,
          progress_percentage: 0,
          total_items: uncachedCount,
          processed_items: 0,
          successful_items: 0,
          failed_items: 0
        })

        // Start polling
        if (jobId) {
          pollDigikeyJobProgress(jobId)
        }
      } else {
        console.log('✅ Digikey pricing already cached')
      }

      // Handle Mouser status
      if (response.mouser_status === 'background_job_started') {
        const uncachedCount = response.mouser_uncached_count || 0
        const jobId = response.mouser_job_id

        console.log(`🔄 Mouser background job started for ${uncachedCount} items`)

        setMouserJob({
          job_id: jobId,
          status: 'processing',
          uncached_count: uncachedCount,
          progress_percentage: 0,
          total_items: uncachedCount,
          processed_items: 0,
          successful_items: 0,
          failed_items: 0
        })

        // Start polling
        if (jobId) {
          pollMouserJobProgress(jobId)
        }
      } else {
        console.log('✅ Mouser pricing already cached')
      }

      if (response.digikey_status === 'background_job_started' || response.mouser_status === 'background_job_started') {
        toast({
          title: "Pricing Jobs Started",
          description: "Fetching Digikey and Mouser pricing for all items...",
        })
      }

    } catch (error) {
      console.error('[Pricing Jobs] Error triggering pricing jobs:', error)
      toast({
        title: "Error",
        description: "Failed to start pricing jobs",
        variant: "destructive",
      })
    }
  }

  // Poll Digikey job progress
  const pollDigikeyJobProgress = async (jobId: string) => {
    const projectId = getProjectId()
    if (!projectId) return

    const pollInterval = setInterval(async () => {
      try {
        const data = await getDigikeyJobStatus(projectId, jobId)
        console.log('[Digikey Poll] Job status response:', JSON.stringify(data, null, 2))

        if (data.success) {
          setDigikeyJob(data.job)

          // Update progress
          if (data.job.status === 'processing') {
            console.log(`Digikey pricing: ${data.job.progress_percentage.toFixed(1)}%`)
          }
          else if (data.job.status === 'completed' || data.job.status === 'partial') {
            clearInterval(pollInterval)

            console.log('[Digikey Poll] Job completed! Details:', {
              status: data.job.status,
              total_items: data.job.total_items,
              successful_items: data.job.successful_items,
              failed_items: data.job.failed_items
            })

            toast({
              title: "Digikey Pricing Complete!",
              description: `Pricing loaded for ${data.job.successful_items}/${data.job.total_items} items`,
            })

            // Wait a moment for backend to finish caching, then refresh pricing in chunks
            await new Promise(resolve => setTimeout(resolve, 1000))

            // Refresh pricing data using chunked loading (avoids timeout)
            await refreshPricingDataInChunks(projectId, 'digikey')

            setDigikeyJob(null)
            console.log('[Digikey Poll] Pricing refresh complete')
          }
          else if (data.job.status === 'failed') {
            // API error (rate limit, auth failure, etc) - stop polling
            clearInterval(pollInterval)
            setDigikeyJob(null)

            console.log('[Digikey Poll] Job failed:', data.job.error_message)

            toast({
              title: "Digikey Pricing Failed",
              description: "API rate limit reached - please try again in a few minutes",
              variant: "destructive"
            })
          }
        }
      } catch (error) {
        console.error('Failed to poll job status:', error)
        clearInterval(pollInterval)
        toast({
          title: "Error",
          description: "Failed to check Digikey pricing progress",
          variant: "destructive"
        })
      }
    }, 3000) // Poll every 3 seconds
  }

  // Poll Mouser job progress
  const pollMouserJobProgress = async (jobId: string) => {
    const projectId = getProjectId()
    if (!projectId) return

    const pollInterval = setInterval(async () => {
      try {
        const data = await getMouserJobStatus(projectId, jobId)

        if (data.success) {
          setMouserJob(data.job)

          // Update progress
          if (data.job.status === 'processing') {
            console.log(`Mouser pricing: ${data.job.progress_percentage.toFixed(1)}%`)
          }
          else if (data.job.status === 'completed' || data.job.status === 'partial') {
            clearInterval(pollInterval)

            toast({
              title: "Mouser Pricing Complete!",
              description: `Pricing loaded for ${data.job.successful_items}/${data.job.total_items} items`,
            })

            // Wait a moment for backend to finish caching, then refresh pricing in chunks
            await new Promise(resolve => setTimeout(resolve, 1000))

            // Refresh pricing data using chunked loading (avoids timeout)
            await refreshPricingDataInChunks(projectId, 'mouser')

            setMouserJob(null)
            console.log('[Mouser Poll] Pricing refresh complete')
          }
          else if (data.job.status === 'failed') {
            // API error (rate limit, auth failure, etc) - stop polling
            clearInterval(pollInterval)
            setMouserJob(null)

            console.log('[Mouser Poll] Job failed:', data.job.error_message)

            toast({
              title: "Mouser Pricing Failed",
              description: "API rate limit reached - please try again in a few minutes",
              variant: "destructive"
            })
          }
        }
      } catch (error) {
        console.error('Failed to poll Mouser job status:', error)
        clearInterval(pollInterval)
        toast({
          title: "Error",
          description: "Failed to check Mouser pricing progress",
          variant: "destructive"
        })
      }
    }, 3000) // Poll every 3 seconds
  }

  // Click outside handler for column visibility dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const columnDropdown = document.getElementById('column-visibility-dropdown')
      const button = (event.target as Element)?.closest('[title="Show/Hide Columns"]')
      if (columnDropdown && !columnDropdown.contains(event.target as Node) && !button) {
        columnDropdown.classList.add('hidden')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Eagerly fetch admin action rules when entity ID becomes available
  useEffect(() => {
    const entityId = projectData.buyer_entity_id
    if (!entityId) return
    getActionRules(entityId)
      .then(res => {
        const active = (res.rules || []).filter(r => r.is_active)
        setAdminActionRules(active)
        if (active.length > 0) console.log(`[Dashboard] Loaded ${active.length} admin action rule(s)`)
      })
      .catch(err => console.warn('[Dashboard] Failed to fetch action rules:', err))
  }, [projectData.buyer_entity_id])

  const currentSettings: AppSettings = useMemo(() => {
    const raw = settingsProfiles[currentSettingsKey] || buildDefaultSettings('Default')
    // Migrate old tagUserMap → rfqAssigneeMap/quoteAssigneeMap if needed
    return {
      ...raw,
      users: {
        rfqAssigneeMap: raw.users?.rfqAssigneeMap || (raw.users as any)?.tagUserMap || {},
        quoteAssigneeMap: raw.users?.quoteAssigneeMap || {},
        rfqResponsibleMap: raw.users?.rfqResponsibleMap || {},
        quoteResponsibleMap: raw.users?.quoteResponsibleMap || {},
      },
    }
  }, [settingsProfiles, currentSettingsKey])

  // Eligible users for item-level assignment: section-assigned + PM + RFQ Assignee + Quote Assignee
  const eligibleUsers = useMemo(() => {
    const userMap = new Map<string, { user_id: string; name: string; email: string }>()
    // Section-assigned users
    for (const u of sectionAssignedUsers) {
      userMap.set(u.user_id, u)
    }
    // Project managers, RFQ assignees, Quote assignees
    for (const u of [...rfqResponsibleUsers, ...quoteResponsibleUsers]) {
      if (!userMap.has(u.user_id)) userMap.set(u.user_id, u)
    }
    // Project managers from projectUsers (role === 'PROJECT_MANAGER' or from the PM list)
    for (const u of projectUsers) {
      if (!userMap.has(u.user_id)) userMap.set(u.user_id, u)
    }
    return Array.from(userMap.values())
  }, [sectionAssignedUsers, rfqResponsibleUsers, quoteResponsibleUsers, projectUsers])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const it of lineItems) {
      const cats = Array.isArray(it.category)
        ? (it.category as string[])
        : String(it.category || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
      cats.forEach((c) => set.add(c))
    }
    return Array.from(set).sort()
  }, [lineItems])

  const allUsers = useMemo(() => {
    const userNames = new Set<string>()

    // Add all users from API - these are the users with project access
    console.log('[Dashboard] Processing', projectUsers.length, 'users from API')
    projectUsers.forEach((user) => {
      console.log('[Dashboard] User:', user.name, '| Email:', user.email, '| Role:', user.role)
      if (user.name && user.name.trim()) {
        userNames.add(user.name.trim())
      } else {
        console.warn('[Dashboard] Skipping user with empty name:', user.email)
      }
    })

    // Also add users from assigned items (in case there are legacy assignments)
    for (const it of lineItems) {
      const people = Array.isArray(it.assignedTo)
        ? (it.assignedTo as string[])
        : String(it.assignedTo || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
      people.forEach((p) => {
        if (p && p.trim()) {
          userNames.add(p.trim())
        }
      })
    }

    console.log('[Dashboard] Final user list:', Array.from(userNames))
    return Array.from(userNames).sort()
  }, [lineItems, projectUsers])

  // Dynamic filter options from table data
  const vendorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of lineItems) {
      const v = String(it.vendor || '').trim()
      set.add(v === '' ? 'TBD' : v)
    }
    return Array.from(set).sort()
  }, [lineItems])

  const actionOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of lineItems) {
      const a = String(it.action || '').trim()
      if (a) set.add(a)
    }
    return Array.from(set).sort()
  }, [lineItems])

  const assignedOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of lineItems) {
      const people = Array.isArray(it.assignedTo)
        ? (it.assignedTo as string[])
        : String(it.assignedTo || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
      if (people.length === 0) set.add('Unassigned')
      people.forEach((p) => set.add(p))
    }
    return Array.from(set).sort()
  }, [lineItems])

  const handleMouseDown = (columnKey: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    setResizeColumn(columnKey)

    const startX = e.clientX
    // Get actual rendered width from the th element
    const thEl = (e.target as HTMLElement).parentElement
    const startWidth = thEl ? thEl.getBoundingClientRect().width : (columnWidths[columnKey as keyof typeof columnWidths] || 120)

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX
      const newWidth = Math.max(startWidth + diff, 40) // 40px absolute minimum
      setColumnWidths((prev) => ({
        ...prev,
        [columnKey]: newWidth,
      }))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setResizeColumn(null)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }

  const dynamicMetrics = useMemo(() => {
    const totalItems = lineItems.length

    // Calculate total value: sum of (quantity × unit_price)
    const totalValue = lineItems.reduce((sum: number, item: any) => {
      return sum + (item.quantity * item.unitPrice)
    }, 0)

    // Calculate average value per item: total value / number of items
    const avgPrice = totalItems > 0 ? totalValue / totalItems : 0

    const totalVendors = lineItems.filter((item: any) => item.vendor && item.vendor.trim() !== "").length
    const avgVendorsPerItem = totalItems > 0 ? totalVendors / totalItems : 0

    // Determine currency display
    const currencies = Array.from(new Set(
      lineItems
        .map((item: any) => item.currency?.code || item.currency?.symbol)
        .filter(Boolean)
    ))
    const hasMultipleCurrencies = currencies.length > 1
    const currencySymbol = hasMultipleCurrencies
      ? '?'
      : (lineItems[0]?.currency?.symbol || '$')

    // Format value with proper K/M/B suffix
    const formatValue = (value: number) => {
      if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`
      } else if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`
      } else {
        return value.toFixed(2)
      }
    }

    return [
      {
        label: "Total Value",
        value: `${currencySymbol}${formatValue(totalValue)}`,
        icon: FileText,
        trendIcon: TrendingUp,
        trendValue: "+35.2%",
        bgColor: "bg-gradient-to-br from-purple-50 to-purple-100",
        textColor: "text-purple-600",
        valueColor: "text-purple-900",
        iconColor: "text-purple-500",
        tooltip: hasMultipleCurrencies ? "Multiple currencies detected" : undefined,
      },
      {
        label: "Avg Price",
        value: `${currencySymbol}${formatValue(avgPrice)}`,
        icon: BarChart3,
        trendIcon: TrendingUp,
        trendValue: "+15.3%",
        bgColor: "bg-gradient-to-br from-teal-50 to-teal-100",
        textColor: "text-teal-600",
        valueColor: "text-teal-900",
        iconColor: "text-teal-500",
        tooltip: hasMultipleCurrencies ? "Multiple currencies detected" : undefined,
      },
      {
        label: "# of Items",
        value: totalItems.toString(),
        icon: Package,
        trendIcon: TrendingUp,
        trendValue: "+8.1%",
        bgColor: "bg-gradient-to-br from-blue-50 to-blue-100",
        textColor: "text-blue-600",
        valueColor: "text-blue-900",
        iconColor: "text-blue-500",
      },
      {
        label: "Avg Vendors/Item",
        value: avgVendorsPerItem.toFixed(1),
        icon: Building2,
        trendIcon: TrendingUp,
        trendValue: "+12.4%",
        bgColor: "bg-gradient-to-br from-orange-50 to-orange-100",
        textColor: "text-orange-600",
        valueColor: "text-orange-900",
        iconColor: "text-orange-500",
      },
    ]
  }, [lineItems])

  const filterMetrics = useMemo(() => {
    return {
      prices: {
        pending: lineItems.filter((item: any) => item.unitPrice === 0).length,
        identified: lineItems.filter((item: any) => item.unitPrice > 0).length
      },
      actions: {
        pending: lineItems.filter((item: any) => !item.action || item.action.trim() === "").length,
        defined: lineItems.filter((item: any) => item.action && item.action.trim() !== "").length
      },
      users: {
        pending: lineItems.filter((item: any) => !item.assignedTo || item.assignedTo.trim() === "").length,
        assigned: lineItems.filter((item: any) => item.assignedTo && item.assignedTo.trim() !== "").length
      },
      vendors: {
        missing: lineItems.filter((item: any) => !item.vendor || item.vendor.trim() === "").length,
        assigned: lineItems.filter((item: any) => item.vendor && item.vendor.trim() !== "").length
      }
    }
  }, [lineItems])

  const handleFilterClick = (filterType: string) => {
    if (activeFilter === filterType) {
      setActiveFilter(null)
      setReverseFilter(false)
    } else {
      setActiveFilter(filterType)
      setReverseFilter(false)
    }
  }

  const toggleFilterReverse = (filterType: string) => {
    if (activeFilter === filterType) {
      setReverseFilter(!reverseFilter)
    }
  }

  // ── Pricing repo v2 cheapest-by-MPN lookup ──
  // Gated by pricingEnabled — only fires after the user clicks "Load Pricing"
  const pricingLookup = usePricingLookup(lineItems, pricingSettings, pricingEnabled)

  // Load full pricing-repo history for the currently-selected analytics item.
  // Search by MPN first, fall back to item_code if no MPN, then erp_item_code.
  useEffect(() => {
    if (!showAnalyticsPopup || !selectedItemForAnalytics) {
      setAnalyticsMpnHistory(null)
      return
    }
    const item = selectedItemForAnalytics
    const mpn = pricingLookup.itemIdToMpn.get(item.id) ?? null
    // Waterfall: MPN → item_code → erp_item_code
    const searchTerm = mpn || item.itemId || item.erp_item_code || null
    if (!searchTerm) {
      setAnalyticsMpnHistory([])
      return
    }
    let cancelled = false
    setAnalyticsHistoryLoading(true)
    fetchMpnHistory(searchTerm)
      .then((rows) => {
        if (cancelled) return
        // If searched by item_code/erp, the results may include other items with similar names.
        // Filter to only rows matching this item's enterprise_item_id when available.
        let filtered = rows
        if (!mpn && item.enterprise_item_id) {
          filtered = rows.filter((r: any) => r.enterprise_item_id === item.enterprise_item_id)
          // If strict filter yields nothing, fall back to all results
          if (filtered.length === 0) filtered = rows
        }
        setAnalyticsMpnHistory(filtered)
        setAnalyticsHistoryLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setAnalyticsMpnHistory([])
        setAnalyticsHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showAnalyticsPopup, selectedItemForAnalytics, pricingLookup.itemIdToMpn])

  const filteredAndSortedItems = useMemo(() => {
    let filtered = lineItems.filter((item: any) => {
      const term = searchTerm.toLowerCase()
      const matchesSearch =
        item.customer.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        item.itemId.toLowerCase().includes(term) ||
        item.vendor.toLowerCase().includes(term) ||
        // Search custom identifications (MPN, CPN, etc.)
        customIdColumns.some(idName => {
          const key = `customId_${idName.replace(/\s+/g, '_')}`
          return (item[key] || '').toLowerCase().includes(term)
        }) ||
        // Search spec columns
        specColumns.some(specName => {
          const key = `spec_${specName.replace(/\s+/g, '_')}`
          return (item[key] || '').toLowerCase().includes(term)
        })

      const vendorMatch = vendorFilter.length === 0 || vendorFilter.includes(item.vendor || "tbd")
      const actionMatch = actionFilter.length === 0 || actionFilter.includes(item.action)
      const assignedMatch = assignedFilter.length === 0 || assignedFilter.includes(item.assignedTo || "unassigned")

      // Category filter: check if ANY of the item's tags match the selected categories
      const itemTags = item.category ? String(item.category).split(',').map((t: string) => t.trim()) : []
      const categoryMatch = categoryFilter.length === 0 || itemTags.some((tag: string) => categoryFilter.includes(tag))

      return matchesSearch && vendorMatch && actionMatch && assignedMatch && categoryMatch
    })

    if (activeFilter) {
      switch (activeFilter) {
        case "prices":
          filtered = filtered.filter((item: any) => (reverseFilter ? item.unitPrice > 0 : item.unitPrice === 0))
          break
        case "actions":
          filtered = filtered.filter((item: any) =>
            reverseFilter
              ? item.action && item.action.trim() !== ""
              : !item.action || item.action.trim() === "",
          )
          break
        case "users":
          filtered = filtered.filter((item: any) =>
            reverseFilter
              ? item.assignedTo && item.assignedTo.trim() !== ""
              : !item.assignedTo || item.assignedTo.trim() === "",
          )
          break
        case "vendors":
          filtered = filtered.filter((item: any) =>
            reverseFilter ? item.vendor && item.vendor.trim() !== "" : !item.vendor || item.vendor.trim() === "",
          )
          break
      }
    }

    if (sortField) {
      filtered.sort((a: any, b: any) => {
        const rawA = (a as any)[sortField as keyof typeof a]
        const rawB = (b as any)[sortField as keyof typeof b]

        // Normalize values for safe comparison
        const norm = (v: unknown) => {
          if (v === undefined || v === null) return ''
          if (typeof v === 'string') return v.toLowerCase()
          if (typeof v === 'number') return v
          const s = String(v)
          return s.toLowerCase()
        }

        const aValue = norm(rawA)
        const bValue = norm(rawB)

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }

    return filtered
  }, [
    lineItems,
    searchTerm,
    vendorFilter,
    actionFilter,
    assignedFilter,
    categoryFilter,
    sortField,
    sortDirection,
    activeFilter,
    reverseFilter,
    customIdColumns,
    specColumns,
  ])

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredAndSortedItems.slice(startIndex, endIndex)
  }, [filteredAndSortedItems, currentPage])

  const totalPages = Math.ceil(filteredAndSortedItems.length / itemsPerPage)

  // Export to CSV function
  const handleExportCSV = () => {
    if (filteredAndSortedItems.length === 0) {
      toast({
        title: "Nothing to export",
        description: "No items match your current filters",
        variant: "destructive",
      })
      return
    }

    // Helper to escape CSV values
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return ''
      const str = String(value)
      // If contains comma, newline, or quote, wrap in quotes and escape internal quotes
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    // Helper to get currency symbol from currency code
    const getCurrencySymbolForExport = (code: string): string => {
      const symbols: Record<string, string> = {
        'INR': '₹', 'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥',
        'CNY': '¥', 'AUD': 'A$', 'CAD': 'C$', 'SGD': 'S$', 'AED': 'AED ',
        'SAR': 'SAR ', 'MYR': 'RM', 'THB': '฿', 'KRW': '₩',
      }
      return symbols[code] || `${code} `
    }

    // Helper to format price with currency symbol
    const formatPrice = (price: any, currencySymbol: string = ''): string => {
      if (price === null || price === undefined || price === 0) return ''
      const formatted = typeof price === 'number' ? price.toFixed(5) : String(price)
      return currencySymbol ? `${currencySymbol}${formatted}` : formatted
    }

    // Helper to get distributor price details
    // Build a comprehensive distributor row for the CSV.
    // Returns the preferred variant's part number, packaging, MOQ, unit price, and reeling fee,
    // PLUS a compact "All Variants" string listing every other option the buyer could pick.
    const getDistributorPrice = (
      pricing: any,
      distributorLabel: 'Digi-Key' | 'Mouser',
      currencySymbol: string = ''
    ): {
      status: string
      partNumber: string
      packaging: string
      moq: string
      unitPrice: string
      reelingFee: string
      stock: string
      allVariants: string
    } => {
      const empty = {
        status: 'N/A',
        partNumber: '',
        packaging: '',
        moq: '',
        unitPrice: '',
        reelingFee: '',
        stock: '',
        allVariants: '',
      }
      if (!pricing) return empty
      if (pricing.status === 'not_configured') return { ...empty, status: 'Not Configured' }
      if (pricing.status === 'not_found') return { ...empty, status: 'Not Listed' }
      if (pricing.status === 'fetching' || pricing.status === 'pending') return { ...empty, status: 'Fetching...' }
      if (pricing.status !== 'available') {
        return { ...empty, status: pricing.status_message || pricing.status || 'N/A' }
      }

      const sym = currencySymbol || (pricing.currency ? getCurrencySymbolForExport(pricing.currency) : '')
      const variants: any[] = Array.isArray(pricing.variants) ? pricing.variants : []

      // Pick the preferred variant (or synthesize one from legacy top-level fields)
      const preferredIdx =
        typeof pricing.preferred_variant_index === 'number' ? pricing.preferred_variant_index : 0
      const preferred =
        variants.length > 0
          ? variants[preferredIdx] || variants[0]
          : {
              packaging: pricing.packaging || 'Standard',
              digikey_part_number: distributorLabel === 'Digi-Key' ? pricing.digikey_part_number : undefined,
              mouser_part_number: distributorLabel === 'Mouser' ? pricing.mouser_part_number : undefined,
              moq: pricing.moq,
              reeling_fee: '0',
              price_breaks: Array.isArray(pricing.price_breaks) ? pricing.price_breaks : [],
            }

      const partNumber =
        preferred?.digikey_part_number ||
        preferred?.mouser_part_number ||
        pricing.digikey_part_number ||
        pricing.mouser_part_number ||
        ''

      // Cell price = first price break's unit price (lowest-qty tier)
      let cellUnitPrice: number | null = null
      if (Array.isArray(preferred?.price_breaks) && preferred.price_breaks.length > 0) {
        const pb = preferred.price_breaks[0]
        const raw = pb?.unit_price
        cellUnitPrice = typeof raw === 'number' ? raw : parseFloat(String(raw))
      } else if (pricing.unit_price !== null && pricing.unit_price !== undefined) {
        cellUnitPrice =
          typeof pricing.unit_price === 'number' ? pricing.unit_price : parseFloat(String(pricing.unit_price))
      }

      const reelingFeeNum = preferred?.reeling_fee ? parseFloat(String(preferred.reeling_fee)) || 0 : 0
      const reelingFeeStr = reelingFeeNum > 0 ? `${sym}${reelingFeeNum.toFixed(2)}` : ''

      // Compact list of every variant for people who want to see their options at a glance.
      // Format: "Cut Tape (CT): $0.540 (MOQ 1) | Tape & Reel (TR): $0.254 (MOQ 2500) | Digi-Reel®: $0.540 (MOQ 1) +$7.00 fee"
      const variantSummary =
        variants.length > 0
          ? variants
              .map((v: any) => {
                const pack = v?.packaging || 'Standard'
                const mq = v?.moq != null ? v.moq : ''
                const breaks = Array.isArray(v?.price_breaks) ? v.price_breaks : []
                const firstPrice = breaks.length > 0 ? parseFloat(String(breaks[0]?.unit_price)) || 0 : 0
                const fee = v?.reeling_fee ? parseFloat(String(v.reeling_fee)) || 0 : 0
                const feeTag = fee > 0 ? ` +${sym}${fee.toFixed(2)} fee` : ''
                return `${pack}: ${sym}${firstPrice.toFixed(3)} (MOQ ${mq})${feeTag}`
              })
              .join(' | ')
          : ''

      return {
        status: 'Available',
        partNumber: String(partNumber || ''),
        packaging: preferred?.packaging || 'Standard',
        moq: preferred?.moq != null ? String(preferred.moq) : '',
        unitPrice: cellUnitPrice != null && !isNaN(cellUnitPrice) ? `${sym}${cellUnitPrice.toFixed(5)}` : '',
        reelingFee: reelingFeeStr,
        stock: pricing.stock !== null && pricing.stock !== undefined ? String(pricing.stock) : '',
        allVariants: variantSummary,
      }
    }

    // Find max number of tags across all items
    let maxTags = 0
    filteredAndSortedItems.forEach((item: any) => {
      const tags = item.category && item.category !== 'Uncategorized'
        ? String(item.category).split(',').map((t: string) => t.trim()).filter(Boolean)
        : []
      if (tags.length > maxTags) maxTags = tags.length
    })

    // Build CSV headers - start with base columns
    const headers: string[] = [
      'Item ID',
      'Description',
      internalNotesLabel,
      'Is Alternate',
      'Alternate Parent Name',
      'Has Alternates',
      'Alternate Names',
      'BOM Name',
      'BOM Slab Qty',
      'Item Qty',
      'Per Unit Qty',
      'Unit',
      'Event Code',
      'Event Qty',
    ]

    // Add dynamic tag columns (Tag 1, Tag 2, etc.)
    for (let i = 1; i <= maxTags; i++) {
      headers.push(`Tag ${i}`)
    }

    // Continue with remaining columns
    headers.push(
      'Project Manager',
      'RFQ Assignee',
      'Quote Assignee',
      'RFQ Item Responsible',
      'Quote Item Responsible',
      'Action',
      'Assigned To',
      'Due Date',
      'Vendor',
      'Currency',
      'Unit Price',
      'Total Price',
      'Source (Cheapest)',
      // Real pricing-repo v2 prices loaded after "Load Pricing"
      'PO Price', 'PO Vendor', 'PO Date',
      'Contract Price', 'Contract Vendor', 'Contract Date',
      'Quote Price', 'Quote Vendor', 'Quote Date',
      'RFQ Price', 'RFQ Vendor', 'RFQ Date',
    )

    // Digikey + Mouser — rich export: part number, packaging, MOQ, unit price, reeling fee, stock, status, and all variant options
    headers.push(
      'Digi-Key Part Number',
      'Digi-Key Packaging',
      'Digi-Key MOQ',
      'Digi-Key Unit Price',
      'Digi-Key Reeling Fee',
      'Digi-Key Stock',
      'Digi-Key Status',
      'Digi-Key All Variants',
    )
    headers.push(
      'Mouser Part Number',
      'Mouser Packaging',
      'Mouser MOQ',
      'Mouser Unit Price',
      'Mouser Reeling Fee',
      'Mouser Stock',
      'Mouser Status',
      'Mouser All Variants',
    )

    // Add dynamic spec columns
    specColumns.forEach(specName => {
      headers.push(specName)
    })

    // Add dynamic custom identification columns
    customIdColumns.forEach(idName => {
      headers.push(idName)
    })

    // Build CSV rows - one row per API item (no fanning over bom_usages/event_usages)
    const rows: string[][] = []

    filteredAndSortedItems.forEach((item: any) => {
      const itemCurrencySymbol = item.currency?.symbol || (item.currency?.code ? getCurrencySymbolForExport(item.currency.code) : '') || '₹'
      const digikeyDetails = getDistributorPrice(item.digikey_pricing, 'Digi-Key', itemCurrencySymbol)
      const mouserDetails = getDistributorPrice(item.mouser_pricing, 'Mouser', '₹')

      // Parse tags for this item
      const itemTags = item.category && item.category !== 'Uncategorized'
        ? String(item.category).split(',').map((t: string) => t.trim()).filter(Boolean)
        : []

      // Get alternate info
      const altInfo = item.alternate_info || {}
      const alternateNames = (altInfo.alternates || [])
        .map((alt: any) => alt.item_name || '')
        .filter(Boolean)
        .join('; ')

      // BOM info from bom_info (each API item already represents one BOM source)
      const bomName = item.bom_info?.bom_name || ''
      const bomSlabQty = item.bom_slab_quantity ?? item.bom_info?.bom_slab_quantity ?? ''

      // Event info — use first event_usage entry (all entries for one slab are same event)
      const eventUsages = item.event_usages || []
      const eventCode = eventUsages?.[0]?.event_code || ''
      const eventQty = item.event_quantity ?? ''

      const row: string[] = [
        escapeCSV(item.itemId),
        escapeCSV(item.description),
        escapeCSV(item.internalNotes || ''),
        altInfo.is_alternate ? 'Yes' : 'No',
        escapeCSV(altInfo.alternate_parent_name || ''),
        altInfo.has_alternates ? 'Yes' : 'No',
        escapeCSV(alternateNames),
        escapeCSV(bomName),
        bomSlabQty !== '' ? String(bomSlabQty) : '',
        escapeCSV(item.quantity),
        bomSlabQty && Number(bomSlabQty) > 0 ? String(Math.round((item.quantity / Number(bomSlabQty)) * 10000) / 10000) : '',
        escapeCSV(item.unit),
        escapeCSV(eventCode),
        eventQty !== '' && eventQty !== null ? String(eventQty) : '',
      ]

      // Add individual tag columns
      for (let t = 0; t < maxTags; t++) {
        row.push(escapeCSV(itemTags[t] || ''))
      }

      // Add role columns
      row.push(
        escapeCSV(projectManagers),
        escapeCSV(item.rfqAssigneeName || ''),
        escapeCSV(item.quoteAssigneeName || ''),
        escapeCSV(item.rfqResponsibleName || ''),
        escapeCSV(item.quoteResponsibleName || ''),
      )

      // Add remaining columns
      row.push(
        escapeCSV(item.action),
        escapeCSV(item.assignedTo),
        escapeCSV(item.dueDate),
        escapeCSV(
          Array.isArray(item.custom_vendors) && item.custom_vendors.length > 0
            ? item.custom_vendors.map((v: CustomVendor) => v.vendor_name).join('; ')
            : (item.vendor || '')
        ),
        escapeCSV(item.currency?.code || ''),
        formatPrice(item.unitPrice, itemCurrencySymbol),
        formatPrice(item.totalPrice, itemCurrencySymbol),
        escapeCSV(item.source),
      )

      // Real pricing-repo v2 prices (PO / Contract / Quote / RFQ)
      const lookupKey = item.enterprise_item_id || item.erp_item_code || item.itemId || null
      const perSource = lookupKey ? (pricingLookup.byItemId.get(lookupKey) ?? null) : null
      const colToSource: Record<string, PricingSourceType> = {
        pricePO: 'PO',
        priceContract: 'CONTRACT',
        priceQuote: 'QUOTE',
        priceRFQ: 'RFQ',
      }
      for (const colKey of ['pricePO', 'priceContract', 'priceQuote', 'priceRFQ']) {
        const sourceType = colToSource[colKey] as PricingSourceType
        const record = perSource ? (perSource as any)[sourceType] ?? null : null
        const adminPrice = record ? getAdminPrice(record, pricingSettings.priceBasis) : null
        const sym = record?.admin_currency_symbol || record?.admin_currency_code || ''
        row.push(
          adminPrice !== null ? `${sym}${adminPrice.toFixed(4)}` : '',
          escapeCSV(record?.supplier_name || record?.customer_name || ''),
          escapeCSV(record?.pricing_datetime ? record.pricing_datetime.slice(0, 10) : ''),
        )
      }

      // Always add rich Digikey values
      row.push(
        escapeCSV(digikeyDetails.partNumber),
        escapeCSV(digikeyDetails.packaging),
        digikeyDetails.moq,
        digikeyDetails.unitPrice,
        digikeyDetails.reelingFee,
        digikeyDetails.stock,
        escapeCSV(digikeyDetails.status),
        escapeCSV(digikeyDetails.allVariants),
      )
      // Always add rich Mouser values
      row.push(
        escapeCSV(mouserDetails.partNumber),
        escapeCSV(mouserDetails.packaging),
        mouserDetails.moq,
        mouserDetails.unitPrice,
        mouserDetails.reelingFee,
        mouserDetails.stock,
        escapeCSV(mouserDetails.status),
        escapeCSV(mouserDetails.allVariants),
      )

      // Add dynamic spec values
      specColumns.forEach(specName => {
        const key = `spec_${specName.replace(/\s+/g, '_')}`
        row.push(escapeCSV(item[key] || ''))
      })

      // Add dynamic custom identification values
      customIdColumns.forEach(idName => {
        const key = `customId_${idName.replace(/\s+/g, '_')}`
        row.push(escapeCSV(item[key] || ''))
      })

      rows.push(row)
    })

    // Build CSV content
    const csvContent = [
      headers.map(h => escapeCSV(h)).join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    // Create and download file
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }) // BOM for Excel UTF-8
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url

    // Generate filename with project name and date
    const date = new Date().toISOString().split('T')[0]
    const projectName = projectData.name || 'procurement'
    const sanitizedName = projectName.replace(/[^a-z0-9]/gi, '_').substring(0, 30)
    link.download = `${sanitizedName}_export_${date}.csv`

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: "Export successful",
      description: `Exported ${filteredAndSortedItems.length} items (${rows.length} rows) to CSV`,
    })
  }

  const handleSelectAll = () => {
    if (selectedItems.length === filteredAndSortedItems.length) {
      setSelectedItems([])
    } else {
      setSelectedItems(filteredAndSortedItems.map((item) => item.id))
    }
  }

  const handleSelectItem = (id: number) => {
    setSelectedItems((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]))
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const toggleColumnVisibility = (columnKey: string) => {
    // Prevent totalPrice and source columns from being hidden
    if (columnKey === 'totalPrice' || columnKey === 'source') {
      return
    }
    setHiddenColumns((prev) =>
      prev.includes(columnKey) ? prev.filter((col) => col !== columnKey) : [...prev, columnKey],
    )
  }

  const saveCurrentView = () => {
    const viewName = prompt("Enter view name:")
    if (viewName) {
      const newViews = {
        ...savedViews,
        [viewName]: { order: columnOrder, hidden: hiddenColumns },
      }
      setSavedViews(newViews)
      if (typeof window !== 'undefined') {
        localStorage.setItem("tableViews", JSON.stringify(newViews))
      }
      setCurrentView(viewName)
    }
  }

  const loadView = (viewName: string) => {
    if (viewName === "default") {
      // Reset to default view
      setColumnOrder([
        "customer",
        "itemId",
        "description",
        "quantity",
        "unit",
        "category",
        "action",
        "assignedTo",
        "dueDate",
        "vendor",
        "unitPrice",
        "totalPrice",
      ])
      setHiddenColumns([])
      setCurrentView("default")
    } else if (savedViews[viewName]) {
      setColumnOrder(savedViews[viewName].order)
      // Filter out totalPrice and source from hidden columns - they must always be visible
      setHiddenColumns(savedViews[viewName].hidden.filter((col) => col !== 'totalPrice' && col !== 'source'))
      setCurrentView(viewName)
    }
  }

  // Helper: resolve user ID to display name
  const resolveUserName = (uid: string): string => {
    const fromProject = projectUsers.find(u => u.user_id === uid)
    if (fromProject) return fromProject.name
    const fromAvailable = availableUsers.find(u => u.user_id === uid)
    if (fromAvailable) return fromAvailable.name
    return uid // fallback to ID if not found
  }

  // Auto Assign Users Handler — fills RFQ Assignee & Quote Assignee columns per item
  // ─── Rule Evaluation Helpers ───

  /**
   * Extract the value from a project custom field based on its type.
   * Backend stores values in type-specific columns: text_value, integer_value, decimal_value, etc.
   */
  const getCustomFieldValue = (field: { type: string; text_value?: string | null; integer_value?: number | null; decimal_value?: number | null; date_value?: string | null; multi_choice_value?: string[] | null }): string | string[] => {
    const t = field.type.toUpperCase()
    if (t === 'MULTI_CHOICE' && Array.isArray(field.multi_choice_value)) {
      return field.multi_choice_value
    }
    if ((t === 'INTEGER' || t === 'FLOAT' || t === 'DECIMAL') && field.integer_value != null) {
      return String(field.integer_value)
    }
    if ((t === 'FLOAT' || t === 'DECIMAL') && field.decimal_value != null) {
      return String(field.decimal_value)
    }
    if (t === 'DATE' && field.date_value) {
      return field.date_value
    }
    // Default: text_value covers CHOICE, SHORTTEXT, LONGTEXT, etc.
    return field.text_value || ''
  }

  /**
   * Get a field value from an item or project for rule condition evaluation.
   * Returns string or string[] depending on field.
   *
   * For CUSTOM fields, checks in order:
   * 1. Project-level custom sections (section_type: "OTHER") — same for all items
   * 2. Item-level custom_fields, additional_details, attributes
   */
  const getFieldValue = (
    condition: AssignmentRuleCondition,
    item: any,
    project: typeof projectData,
    projectCustomSections?: ProjectCustomSection[]
  ): string | string[] => {
    if (condition.field_type === 'BUILTIN') {
      switch (condition.field) {
        case 'tags': {
          const tags = [
            ...(item.original_tags || []),
            ...(item.original_custom_tags || []),
          ]
          return [...new Set(tags)]
        }
        case 'customer_name':
          return project.customer || ''
        case 'buyer_entity_name':
          return project.buyer_entity_name || ''
        case 'project_code':
          return project.id || ''
        default:
          return ''
      }
    }

    // CUSTOM fields
    const fieldName = condition.field
    const sectionName = condition.section_name

    // 1. Check project-level custom sections (section_type: "OTHER")
    if (projectCustomSections) {
      for (const section of projectCustomSections) {
        // Match section name if specified on the condition
        if (sectionName && section.name !== sectionName) continue
        // Only check project-level sections (OTHER), not item-level (ITEM)
        // But if no section_name filter, check all sections
        for (const field of section.custom_fields) {
          if (field.name === fieldName) {
            return getCustomFieldValue(field)
          }
        }
      }
    }

    // 2. Check item-level: custom_fields, additional_details, attributes
    if (item.custom_fields && item.custom_fields[fieldName] !== undefined) {
      const val = item.custom_fields[fieldName]
      return Array.isArray(val) ? val : String(val)
    }
    if (item.additional_details && item.additional_details[fieldName] !== undefined) {
      const val = item.additional_details[fieldName]
      return Array.isArray(val) ? val : String(val)
    }
    if (Array.isArray(item.attributes)) {
      const attr = item.attributes.find(
        (a: any) => a.attribute_name === fieldName
      )
      if (attr?.attribute_values?.length > 0) {
        return attr.attribute_values.map((v: any) => v.value || String(v))
      }
    }
    return ''
  }

  /**
   * Evaluate a single condition against a field value. Case-insensitive.
   */
  const evaluateCondition = (
    operator: string,
    fieldValue: string | string[],
    conditionValue: string
  ): boolean => {
    const cv = conditionValue.toLowerCase()

    if (Array.isArray(fieldValue)) {
      const lowerValues = fieldValue.map((v) => v.toLowerCase())
      switch (operator) {
        case 'contains':
          return lowerValues.some((v) => v.includes(cv) || cv.includes(v))
        case 'does_not_contain':
          return !lowerValues.some((v) => v.includes(cv) || cv.includes(v))
        case 'is':
          return lowerValues.includes(cv)
        case 'is_not':
          return !lowerValues.includes(cv)
        default:
          return false
      }
    }

    const fv = String(fieldValue).toLowerCase()
    switch (operator) {
      case 'is':
        return fv === cv
      case 'is_not':
        return fv !== cv
      case 'contains':
        return fv.includes(cv)
      case 'does_not_contain':
        return !fv.includes(cv)
      default:
        return false
    }
  }

  /**
   * Evaluate all conditions of a rule against an item. Handles AND/OR conjunctions.
   */
  const evaluateRuleConditions = (
    conditions: AssignmentRuleCondition[],
    item: any,
    project: typeof projectData,
    projectCustomSections?: ProjectCustomSection[]
  ): boolean => {
    if (conditions.length === 0) return true

    let result = true
    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i]
      const fieldValue = getFieldValue(cond, item, project, projectCustomSections)
      const match = evaluateCondition(cond.operator, fieldValue, cond.value)

      if (i === 0) {
        result = match
      } else {
        const conjunction = cond.conjunction || 'AND'
        if (conjunction === 'AND') {
          result = result && match
        } else {
          result = result || match
        }
      }
    }
    return result
  }

  // ─── Auto Assign Users (Phase 4: Rules Engine) ───

  const handleAutoAssignUsers = async (scope: 'all' | 'unassigned' | 'selected', ruleOverrides?: Record<string, boolean>) => {
    const resetProgress = () => setAutoAssignProgress({ current: 0, total: 0, isRunning: false, phase: 'done', rulesCount: 0, matchedItems: 0, assignmentsCount: 0, log: [] })
    const addLog = (msg: string) => setAutoAssignProgress(prev => ({ ...prev, log: [...prev.log.slice(-19), msg] }))

    autoAssignAbortRef.current = false

    try {
      const entityId = projectData.buyer_entity_id
      const templateId = projectData.template_id
      const projectId = new URLSearchParams(window.location.search).get('project_id') || ''

      if (!entityId) {
        toast({ title: "Error", description: "Could not determine entity ID for this project. Please reload.", variant: "destructive" })
        return
      }

      // ── Phase 1: Fetching ──
      setAutoAssignProgress({ current: 0, total: 0, isRunning: true, phase: 'fetching', rulesCount: 0, matchedItems: 0, assignmentsCount: 0, log: ['Fetching rules and project details...'] })

      const [rulesResponse, projectDetail] = await Promise.all([
        getAssignmentRules(entityId),
        getProjectDetail(projectId).catch((err) => {
          console.warn('[Auto-Assign] Failed to fetch project detail:', err)
          return { custom_sections: [] } as { custom_sections: ProjectCustomSection[] }
        }),
      ])

      if (autoAssignAbortRef.current) { resetProgress(); toast({ title: "Cancelled", description: "Auto-assign was cancelled. No changes were made." }); return }

      const allRules = rulesResponse.rules || []
      const projectCustomSections = projectDetail.custom_sections || []

      // Filter applicable rules
      let applicableRules = allRules.filter((rule: AssignmentRule) => {
        if (!rule.is_active) return false
        if (rule.template_filter.length > 0 && templateId) return rule.template_filter.includes(templateId)
        return true
      })
      if (ruleOverrides) {
        applicableRules = applicableRules.filter((rule: AssignmentRule) => ruleOverrides[rule.rule_id] !== false)
      }

      // Local settings tag-user mappings (user's own, HIGHEST priority)
      const localMaps = currentSettings.users
      const hasLocalMappings = Object.values(localMaps).some(m => Object.keys(m).length > 0)
      const hasBackendRules = applicableRules.length > 0

      if (!hasLocalMappings && !hasBackendRules) {
        resetProgress()
        toast({ title: "No Rules", description: "No local mappings or backend rules found. Configure mappings in Settings or ask admin to create rules.", variant: "destructive" })
        return
      }

      if (hasLocalMappings) addLog(`Local settings: ${Object.values(localMaps).reduce((n, m) => n + Object.keys(m).length, 0)} tag mappings`)
      if (hasBackendRules) addLog(`Backend rules: ${applicableRules.length} rule(s): ${applicableRules.map(r => r.name).join(', ')}`)

      // Determine items
      let itemsToProcess: any[]
      if (scope === 'selected') {
        const selectedSet = new Set(selectedItems)
        itemsToProcess = lineItems.filter((item: any) => selectedSet.has(item.id))
      } else if (scope === 'unassigned') {
        itemsToProcess = lineItems.filter((item: any) => !item.rfqAssigneeName && !item.quoteAssigneeName)
      } else {
        itemsToProcess = [...lineItems]
      }

      addLog(`Evaluating ${itemsToProcess.length} items (scope: ${scope})`)

      // ── Phase 2: Evaluating ──
      setAutoAssignProgress(prev => ({ ...prev, phase: 'evaluating', total: itemsToProcess.length, rulesCount: applicableRules.length }))

      const assignments: Array<{ project_item_id: string; user_ids: string[]; action: 'replace'; role: string }> = []
      // Track which item+role combos are covered by local mappings (they take priority)
      const localCovered = new Set<string>()
      let matchedItems = 0

      for (let i = 0; i < itemsToProcess.length; i++) {
        if (autoAssignAbortRef.current) {
          setAutoAssignProgress(prev => ({ ...prev, phase: 'cancelled', isRunning: false }))
          toast({ title: "Cancelled", description: `Stopped after evaluating ${i} of ${itemsToProcess.length} items. No changes were made.` })
          return
        }

        const item = itemsToProcess[i]
        const itemProjectItemId = item.project_item_id
        if (!itemProjectItemId) {
          setAutoAssignProgress(prev => ({ ...prev, current: i + 1 }))
          continue
        }

        const itemTags = [...(item.original_tags || []), ...(item.original_custom_tags || [])].map((t: string) => t.toLowerCase())
        const uniqueItemTags = [...new Set(itemTags)]
        let itemHasAssignment = false

        // ── STEP 1: Local settings mappings (PRIORITY) ──
        // RFQ panels mapped by TAG, Quote panels mapped by CUSTOMER
        if (hasLocalMappings) {
          const projectCustomer = (projectData.customer || '').toLowerCase()

          // Tag-based: RFQ Assignee, RFQ Item Responsible
          const tagRoleKeys: Array<{ mapKey: keyof typeof localMaps; role: string }> = [
            { mapKey: 'rfqAssigneeMap', role: 'RFQ_ASSIGNEE' },
            { mapKey: 'rfqResponsibleMap', role: 'RFQ_RESPONSIBLE' },
          ]
          for (const { mapKey, role } of tagRoleKeys) {
            const map = localMaps[mapKey]
            for (const tag of uniqueItemTags) {
              const userIds = map[tag] || map[tag.charAt(0).toUpperCase() + tag.slice(1)] || Object.entries(map).find(([k]) => k.toLowerCase() === tag)?.[1]
              if (userIds && userIds.length > 0) {
                assignments.push({ project_item_id: itemProjectItemId, user_ids: userIds, action: 'replace', role })
                localCovered.add(`${itemProjectItemId}::${role}`)
                itemHasAssignment = true
              }
            }
          }

          // Customer-based: Quote Assignee, Quote Item Responsible
          const customerRoleKeys: Array<{ mapKey: keyof typeof localMaps; role: string }> = [
            { mapKey: 'quoteAssigneeMap', role: 'QUOTE_ASSIGNEE' },
            { mapKey: 'quoteResponsibleMap', role: 'QUOTE_RESPONSIBLE' },
          ]
          for (const { mapKey, role } of customerRoleKeys) {
            const map = localMaps[mapKey]
            if (projectCustomer) {
              const userIds = Object.entries(map).find(([k]) => k.toLowerCase() === projectCustomer)?.[1]
              if (userIds && userIds.length > 0) {
                assignments.push({ project_item_id: itemProjectItemId, user_ids: userIds, action: 'replace', role })
                localCovered.add(`${itemProjectItemId}::${role}`)
                itemHasAssignment = true
              }
            }
          }
        }

        // ── STEP 2: Backend rules (only for roles NOT already covered by local) ──
        if (hasBackendRules) {
          for (const rule of applicableRules) {
            if (!evaluateRuleConditions(rule.conditions, item, projectData, projectCustomSections)) continue

            const outputs: any = rule.outputs || {}
            const tagMappings: TagUserMapping[] = outputs.tag_mappings || []

            // Project-level outputs (rfq_assignee / quote_assignee — top-level, no tag needed)
            const projectRoles: Array<{ userIds: string[]; role: string }> = [
              { userIds: outputs.rfq_assignee_user_ids || [], role: 'RFQ_ASSIGNEE' },
              { userIds: outputs.quote_assignee_user_ids || [], role: 'QUOTE_ASSIGNEE' },
            ]
            for (const { userIds, role } of projectRoles) {
              if (userIds.length === 0) continue
              if (localCovered.has(`${itemProjectItemId}::${role}`)) continue // local takes priority
              assignments.push({ project_item_id: itemProjectItemId, user_ids: userIds, action: 'replace', role })
              itemHasAssignment = true
            }

            // Item-level outputs (rfq_item_responsible / quote_item_responsible — per tag)
            for (const tm of tagMappings) {
              if (!uniqueItemTags.includes(tm.tag.toLowerCase())) continue
              const tagRoles: Array<{ userIds: string[]; role: string }> = [
                { userIds: tm.rfq_item_responsible_user_ids || [], role: 'RFQ_RESPONSIBLE' },
                { userIds: tm.quote_item_responsible_user_ids || [], role: 'QUOTE_RESPONSIBLE' },
              ]
              for (const { userIds, role } of tagRoles) {
                if (userIds.length === 0) continue
                if (localCovered.has(`${itemProjectItemId}::${role}`)) continue
                assignments.push({ project_item_id: itemProjectItemId, user_ids: userIds, action: 'replace', role })
                itemHasAssignment = true
              }
            }
          }
        }

        if (itemHasAssignment) {
          matchedItems++
          addLog(`${item.name || item.itemCode || itemProjectItemId.slice(0, 8)} → matched (${assignments.length} assignments so far)`)
        }

        setAutoAssignProgress(prev => ({ ...prev, current: i + 1, matchedItems, assignmentsCount: assignments.length }))

        // Yield to UI every 10 items so progress bar updates
        if (i % 10 === 9) await new Promise(r => setTimeout(r, 0))
      }

      // Check abort again before sending
      if (autoAssignAbortRef.current) {
        setAutoAssignProgress(prev => ({ ...prev, phase: 'cancelled', isRunning: false }))
        toast({ title: "Cancelled", description: "Auto-assign was cancelled. No changes were made." })
        return
      }

      if (assignments.length === 0) {
        resetProgress()
        toast({ title: "No Matches", description: "Rules conditions did not match any items, or no users are configured in rule outputs." })
        return
      }

      // Merge assignments
      const mergedMap = new Map<string, { project_item_id: string; user_ids: Set<string>; role: string }>()
      for (const a of assignments) {
        const key = `${a.project_item_id}::${a.role}`
        if (!mergedMap.has(key)) {
          mergedMap.set(key, { project_item_id: a.project_item_id, user_ids: new Set(a.user_ids), role: a.role })
        } else {
          a.user_ids.forEach((uid) => mergedMap.get(key)!.user_ids.add(uid))
        }
      }

      const mergedAssignments = Array.from(mergedMap.values()).map((m) => ({
        project_item_id: m.project_item_id,
        user_ids: Array.from(m.user_ids),
        action: 'replace' as const,
        role: m.role as 'RFQ_ASSIGNEE' | 'RFQ_RESPONSIBLE' | 'QUOTE_ASSIGNEE' | 'QUOTE_RESPONSIBLE' | 'ASSIGNED',
      }))

      // ── Phase 3: Assigning ──
      addLog(`Sending ${mergedAssignments.length} assignments to Factwise...`)
      setAutoAssignProgress(prev => ({ ...prev, phase: 'assigning' }))

      // Final abort check
      if (autoAssignAbortRef.current) {
        setAutoAssignProgress(prev => ({ ...prev, phase: 'cancelled', isRunning: false }))
        toast({ title: "Cancelled", description: "Auto-assign was cancelled before sending to Factwise. No changes were made." })
        return
      }

      const result = await bulkAssignUsersWithRoles(projectId, mergedAssignments)
      console.log('[Auto-Assign] Bulk-assign result:', result)

      addLog(`Done! ${result.updated} assignments applied, ${result.failed} failed.`)
      setAutoAssignProgress(prev => ({ ...prev, phase: 'done', isRunning: false }))

      toast({
        title: "Users Assigned Successfully",
        description: `Applied ${applicableRules.length} rule(s), assigned users to ${matchedItems} item(s). Refreshing...`,
      })

      // Re-fetch users (for project-level assignees) + items (for per-item responsible) from API
      try {
        const [freshUsers, freshItems] = await Promise.all([
          getProjectUsers(projectId),
          getProjectItems(projectId),
        ])

        // Update project-level assignees
        if (freshUsers) {
          setProjectUsers(freshUsers.users || [])
          setRfqAssignees((freshUsers.rfq_responsible_users || []).map(u => u.name).join('; '))
          setQuoteAssignees((freshUsers.quote_responsible_users || []).map(u => u.name).join('; '))
          if (freshUsers.section_assigned_users) setSectionAssignedUsers(freshUsers.section_assigned_users)
        }

        // Update items (per-item responsible names come from API)
        if (freshItems?.items) {
          const exchangeRates: Record<string, number> = {}
          const uniqueSpecNames: string[] = []
          const uniqueCustomIdNames: string[] = []
          const transformed = freshItems.items.map((item: ProjectItem, index: number) =>
            transformApiItem(item, index, exchangeRates, uniqueSpecNames, uniqueCustomIdNames)
          )
          setLineItems(transformed)
        }
      } catch (refreshErr) {
        console.error('[Auto-Assign] Failed to refresh after assign:', refreshErr)
      }
    } catch (error) {
      console.error('[Auto-Assign] Error:', error)
      resetProgress()
      toast({ title: "Error", description: error instanceof Error ? error.message : "An unexpected error occurred", variant: "destructive" })
    }

    document.body.click()
  }

  // Manual User Assignment Handler
  const handleManualUserAssignment = async () => {
    console.log('[Manual Assign] Save button clicked!')
    console.log('[Manual Assign] editingItem:', editingItem)
    console.log('[Manual Assign] editingUsers:', editingUsers)

    if (!editingItem) {
      console.error('[Manual Assign] No editing item found')
      return
    }

    const projectId = getProjectId()
    console.log('[Manual Assign] Project ID:', projectId)

    if (!projectId) {
      console.error('[Manual Assign] No project ID found')
      toast({
        title: "Error",
        description: "Project ID not found",
        variant: "destructive",
      })
      return
    }

    try {
      // Convert user names to user IDs
      const selectedUserIds = editingUsers
        .map(userName => {
          const user = projectUsers.find(u => u.name === userName)
          console.log(`[Manual Assign] Looking for user "${userName}", found:`, user)
          return user?.user_id
        })
        .filter((id: string | undefined): id is string => id !== undefined)

      console.log('[Manual Assign] Assigning users:', editingUsers, 'IDs:', selectedUserIds)
      console.log('[Manual Assign] Item to update:', editingItem.project_item_id)

      // Use update item API with assigned_user_ids
      const result = await updateProjectItem(projectId, editingItem.project_item_id, {
        assigned_user_ids: selectedUserIds
      })

      if (result.success) {
        console.log('[Manual Assign] Successfully assigned users to item')

        // Update local state directly instead of refetching all items
        setLineItems((prevItems: any[]) => prevItems.map((item: any) => {
          if (item.project_item_id !== editingItem.project_item_id) return item
          return {
            ...item,
            assigned_user_ids: selectedUserIds,
            assignedTo: editingUsers.join(', '),
            manuallyEdited: true
          }
        }))

        // Notify Factwise parent
        notifyItemsAssigned([editingItem.project_item_id], selectedUserIds)

        // Show success toast
        toast({
          title: "User Assigned",
          description: editingUsers.length > 0
            ? `Assigned ${editingUsers.join(', ')} to item`
            : "Removed user assignment",
        })

        // Close dialog
        setEditingItem(null)
        setEditingUsers([])
      } else {
        console.error('[Manual Assign] Failed:', result)

        // Show error toast
        toast({
          title: "Assignment Failed",
          description: "Failed to assign user to item",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('[Manual Assign] Error:', error)

      // Show error toast
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
    }
  }

  // Edit Rate and Quantity Handler
  const handleEditRateQuantity = async () => {
    console.log('[Edit Rate/Qty] Save button clicked!')
    console.log('[Edit Rate/Qty] editFormData:', editFormData)

    // For bulk edits, use the bulk handler instead
    if (editFormData.isBulk) {
      console.log('[Edit Rate/Qty] Bulk edit detected, calling handleSaveEdit')
      await handleSaveEdit()
      return
    }

    if (!editFormData.project_item_id) {
      console.error('[Edit Rate/Qty] No item ID found in editFormData')
      return
    }

    const projectId = getProjectId()
    console.log('[Edit Rate/Qty] Project ID:', projectId)

    if (!projectId) {
      console.error('[Edit Rate/Qty] No project ID found')
      toast({
        title: "Error",
        description: "Project ID not found",
        variant: "destructive",
      })
      return
    }

    try {
      // Validation
      const rate = parseFloat(String(editFormData.rate || 0))
      const quantity = parseFloat(String(editFormData.quantity || 0))

      if (isNaN(rate) || rate < 0) {
        toast({
          title: "Validation Error",
          description: "Rate must be a positive number",
          variant: "destructive",
        })
        return
      }

      if (isNaN(quantity) || quantity <= 0) {
        toast({
          title: "Validation Error",
          description: "Quantity must be greater than zero",
          variant: "destructive",
        })
        return
      }

      // Get the original item to compare changes
      const originalItem = editFormData.item

      console.log('[Edit Rate/Qty] Original item:', originalItem)
      console.log('[Edit Rate/Qty] New values - rate:', rate, 'quantity:', quantity)

      // Prepare update payload - only include changed fields
      const updatePayload: any = {}
      let hasChanges = false

      // Check if rate changed
      if (originalItem && rate !== originalItem.unitPrice) {
        updatePayload.rate = rate
        hasChanges = true
        console.log('[Edit Rate/Qty] Rate changed from', originalItem.unitPrice, 'to', rate)
      }

      // Check if quantity changed
      if (originalItem && quantity !== originalItem.quantity) {
        updatePayload.quantity = quantity
        hasChanges = true
        console.log('[Edit Rate/Qty] Quantity changed from', originalItem.quantity, 'to', quantity)
      }

      // Check if assignedTo changed
      let userIdsChanged = false
      let selectedUserIds: string[] = []
      if (editFormData.assignedTo !== undefined && editFormData.assignedTo !== null) {
        const assignedUserNames = editFormData.assignedTo
          .split(',')
          .map((name: string) => name.trim())
          .filter(Boolean)

        selectedUserIds = assignedUserNames
          .map((userName: string) => {
            const user = projectUsers.find(u => u.name === userName)
            return user?.user_id
          })
          .filter((id: string | undefined): id is string => id !== undefined)

        // Compare with original assigned users
        const originalUserIds = originalItem?.assigned_user_ids || []
        const userIdsMatch =
          selectedUserIds.length === originalUserIds.length &&
          selectedUserIds.every(id => originalUserIds.includes(id))

        if (!userIdsMatch) {
          updatePayload.assigned_user_ids = selectedUserIds
          hasChanges = true
          userIdsChanged = true
          console.log('[Edit Rate/Qty] Users changed from', originalUserIds, 'to', selectedUserIds)
        }
      }

      // Check if action changed
      let actionChanged = false
      if (editFormData.action !== undefined && originalItem && editFormData.action !== originalItem.action) {
        actionChanged = true
        hasChanges = true
        updatePayload.action = editFormData.action
        console.log('[Edit] Action changed from', originalItem.action, 'to', editFormData.action)
      }

      // Check if category/tags changed
      let tagsChanged = false
      let newTags: string[] = []
      if (editFormData.category !== undefined && editFormData.category !== null) {
        newTags = String(editFormData.category)
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean)
          .filter((t: string) => t !== 'Uncategorized') // Never send "Uncategorized" placeholder

        const originalCategory = originalItem?.category === 'Uncategorized' ? '' : (originalItem?.category || '')
        const originalTags = originalCategory
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean)

        // Compare tag arrays
        const tagsMatch =
          newTags.length === originalTags.length &&
          newTags.every(tag => originalTags.includes(tag))

        if (!tagsMatch) {
          // Tags changed - we'll handle this separately after rate/qty update
          tagsChanged = true
          hasChanges = true
          console.log('[Edit Rate/Qty] Tags changed from', originalTags, 'to', newTags)
        }
      }

      // If nothing else changed, just close — custom vendor mutations have already been committed
      if (!hasChanges) {
        if (editVendorDirty) {
          toast({
            title: "Saved",
            description: "Vendor changes saved",
          })
        } else {
          toast({
            title: "No Changes",
            description: "No fields were modified",
          })
        }
        setShowEditDialog(false)
        setEditFormData({})
        setEditVendorDirty(false)
        return
      }

      console.log('[Edit Rate/Qty] Updating item:', editFormData.project_item_id, 'with payload:', updatePayload)

      // Use update item API
      const result = await updateProjectItem(projectId, editFormData.project_item_id, updatePayload)

      if (result.success) {
        console.log('[Edit Rate/Qty] Successfully updated rate and quantity')

        // Update tags if they changed
        // Logic: tags can only be removed (not added), custom_tags can be added/removed
        if (tagsChanged && newTags) {
          const originalTagsArr = originalItem?.original_tags || []
          const originalCustomTagsArr = originalItem?.original_custom_tags || []

          // Tags to keep = original tags that are still in newTags (can only remove, not add)
          const tagsToKeep = originalTagsArr.filter((t: string) => newTags.includes(t))

          // Custom tags = all newTags that are not in original_tags
          // This includes: existing custom_tags that weren't removed + newly added tags
          const newCustomTags = newTags.filter((t: string) => !originalTagsArr.includes(t))

          console.log('[Edit Rate/Qty] Tag update - original_tags:', originalTagsArr, 'original_custom_tags:', originalCustomTagsArr)
          console.log('[Edit Rate/Qty] Tag update - newTags:', newTags, 'tagsToKeep:', tagsToKeep, 'newCustomTags:', newCustomTags)

          try {
            const tagsResult = await updateItemTags(
              projectId,
              editFormData.project_item_id,
              tagsToKeep,      // tags (only kept ones, removed ones will be gone)
              newCustomTags    // custom_tags (new + existing that weren't removed)
            )
            if (tagsResult.success) {
              console.log('[Edit Rate/Qty] Successfully updated tags and custom_tags')
            } else {
              console.error('[Edit Rate/Qty] Failed to update tags:', tagsResult)
            }
          } catch (tagError) {
            console.error('[Edit Rate/Qty] Error updating tags:', tagError)
          }
        }

        // Update local state directly instead of refetching all items
        setLineItems((prevItems: any[]) => prevItems.map((item: any) => {
          if (item.project_item_id !== editFormData.project_item_id) return item

          const updatedItem = { ...item, manuallyEdited: true }

          if (updatePayload.rate !== undefined) {
            updatedItem.unitPrice = updatePayload.rate
            updatedItem.totalPrice = updatePayload.rate * (updatePayload.quantity ?? item.quantity)
          }

          if (updatePayload.quantity !== undefined) {
            updatedItem.quantity = updatePayload.quantity
            updatedItem.totalPrice = (updatePayload.rate ?? item.unitPrice) * updatePayload.quantity
          }

          if (userIdsChanged && updatePayload.assigned_user_ids) {
            updatedItem.assigned_user_ids = updatePayload.assigned_user_ids
            updatedItem.assignedTo = projectUsers
              .filter((u: any) => updatePayload.assigned_user_ids.includes(u.user_id))
              .map((u: any) => u.name)
              .join(', ')
          }

          if (actionChanged) {
            updatedItem.action = editFormData.action
          }

          if (tagsChanged && newTags) {
            const originalTagsArr = item.original_tags || []
            // Tags to keep = original tags that are still in newTags
            const tagsToKeep = originalTagsArr.filter((t: string) => newTags.includes(t))
            // Custom tags = all newTags that are not in original_tags
            const newCustomTags = newTags.filter((t: string) => !originalTagsArr.includes(t))

            updatedItem.category = newTags.length > 0 ? newTags.join(', ') : 'Uncategorized'
            updatedItem.original_tags = tagsToKeep
            updatedItem.original_custom_tags = newCustomTags
          }

          return updatedItem
        }))

        // Notify Factwise parent - only send what changed
        const changedFields: any = {}
        const updatedFieldsList: string[] = []
        const currencySymbol = editFormData.currency?.symbol || '₹'

        if (updatePayload.rate !== undefined) {
          changedFields.rate = updatePayload.rate
          updatedFieldsList.push(`rate to ${currencySymbol}${updatePayload.rate.toFixed(2)}`)
        }

        if (updatePayload.quantity !== undefined) {
          changedFields.quantity = updatePayload.quantity
          updatedFieldsList.push(`quantity to ${updatePayload.quantity}`)
        }

        // Send notifications
        if (Object.keys(changedFields).length > 0) {
          notifyItemUpdated(editFormData.project_item_id, changedFields)
        }

        if (userIdsChanged && updatePayload.assigned_user_ids) {
          notifyItemsAssigned([editFormData.project_item_id], updatePayload.assigned_user_ids)
          updatedFieldsList.push('assigned users')
        }

        if (tagsChanged) {
          // Notify Factwise parent to refetch items
          window.parent.postMessage({
            type: 'PROJECT_ITEM_UPDATED',
            project_item_ids: [editFormData.project_item_id],
            project_id: projectId,
            updated_fields: ['tags'],
            timestamp: new Date().toISOString()
          }, '*')
          updatedFieldsList.push('tags')
        }

        // Show success toast
        toast({
          title: "Item Updated",
          description: `Updated ${updatedFieldsList.join(', ')}`,
        })

        // Close dialog
        setShowEditDialog(false)
        setEditFormData({})
      } else {
        console.error('[Edit Rate/Qty] Failed:', result)

        // Show error toast
        toast({
          title: "Update Failed",
          description: "Failed to update item",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('[Edit Rate/Qty] Error:', error)

      // Show error toast
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
    }
  }

  // Auto Fill Prices Handler
  const handleAutoFillPrices = (scope: 'all' | 'non-selected' | 'selected') => {
    let itemsToUpdate = lineItems
    if (scope === 'non-selected') {
      itemsToUpdate = lineItems.filter((item: any) => !selectedItems.includes(item.id))
    } else if (scope === 'selected') {
      itemsToUpdate = lineItems.filter((item: any) => selectedItems.includes(item.id))
    }

    // Helper: choose mapping id for an item (one mapping per item; for now pick first configured)
    const mappingIds: MappingId[] = ['Direct - Materials', 'Indirect - Materials', 'Direct - Capex', 'Indirect - Capex']
    const pickMappingId = () => mappingIds[0]

    const pickCheapest = (item: any, mapping: MappingId): { price: number; source: PriceSource } => {
      const sources = currentSettings.prices.sourcesByMapping[mapping] || []
      if (sources.length === 0) return { price: 0, source: 'Quote' }
      let best: { price: number; source: PriceSource } | null = null
      for (const s of sources) {
        const p = mockPriceForSource(item, s)
        if (!best || p < best.price) best = { price: p, source: s }
      }
      return best || { price: 0, source: 'Quote' }
    }

    // Items to exclude from auto-fill (2-3 items that should remain blank)
    const excludedItemIds = [6, 9, 15] // These will remain without prices

    const updatedItems = lineItems.map((item: any) => {
      if (!itemsToUpdate.some((u) => u.id === item.id)) return item

      // Skip certain items to keep them blank
      if (excludedItemIds.includes(item.id)) return item

      const mapping = pickMappingId()

      // Generate prices for all sources
      const pricePO = Math.round(mockPriceForSource(item, 'PO') * 100) / 100
      const priceContract = Math.round(mockPriceForSource(item, 'Contract') * 100) / 100
      const priceQuote = Math.round(mockPriceForSource(item, 'Quote') * 100) / 100
      const priceDigikey = Math.round(mockPriceForSource(item, 'Online - Digikey') * 100) / 100
      const priceEXIM = Math.round(mockPriceForSource(item, 'EXIM') * 100) / 100

      // Find cheapest for unitPrice, totalPrice, and source
      const priceSources = [
        { source: 'PO', price: pricePO },
        { source: 'Contract', price: priceContract },
        { source: 'Quote', price: priceQuote },
        { source: 'Digi-Key', price: priceDigikey },
        { source: 'EXIM', price: priceEXIM },
      ].filter(p => p.price > 0)
      const cheapest = priceSources.length > 0
        ? priceSources.reduce((min, p) => p.price < min.price ? p : min)
        : null
      const unitPrice = cheapest ? cheapest.price : 0
      const totalPrice = Math.round(unitPrice * item.quantity * 100) / 100
      const cheapestSource = 'Project'
      const vendor = item.vendor || ''

      return { ...item, pricePO, priceContract, priceQuote, priceDigikey, priceEXIM, unitPrice, totalPrice, source: cheapestSource, vendor }
    })

    setLineItems(updatedItems)
    document.body.click()
  }

  // ── Criteria Evaluation Engine ──
  // Evaluates a single criterion against an item
  const evaluateCriterion = (criterion: { field: string; operator: string; value: string; unit?: string }, item: any): boolean => {
    const { field, operator, value } = criterion
    switch (field) {
      case 'Price': {
        const itemPrice = parseFloat(item.unitPrice) || 0
        const targetPrice = parseFloat(value) || 0
        switch (operator) {
          case '>=': return itemPrice >= targetPrice
          case '<=': return itemPrice <= targetPrice
          case '>': return itemPrice > targetPrice
          case '<': return itemPrice < targetPrice
          case '=': return itemPrice === targetPrice
          default: return false
        }
      }
      case 'Quantity': {
        const itemQty = parseFloat(item.quantity) || 0
        const targetQty = parseFloat(value) || 0
        switch (operator) {
          case '>=': return itemQty >= targetQty
          case '<=': return itemQty <= targetQty
          case '>': return itemQty > targetQty
          case '<': return itemQty < targetQty
          case '=': return itemQty === targetQty
          default: return false
        }
      }
      case 'Vendor': {
        const itemVendor = (item.vendor || '').toLowerCase()
        const targetVendor = value.toLowerCase()
        return operator === 'is' ? itemVendor === targetVendor : itemVendor !== targetVendor
      }
      case 'Source': {
        const itemSource = (item.source || '').toLowerCase()
        const targetSource = value.toLowerCase()
        return operator === 'is' ? itemSource === targetSource : itemSource !== targetSource
      }
      case 'Tag': {
        const itemTags = item.category && item.category !== 'Uncategorized'
          ? String(item.category).split(',').map((t: string) => t.trim().toLowerCase())
          : []
        const targetTag = value.toLowerCase()
        const hasTag = itemTags.includes(targetTag)
        return operator === 'is' ? hasTag : !hasTag
      }
      case 'Date': {
        // Compare against item creation or some date field — use current date as fallback
        const targetDate = new Date(value).getTime()
        const now = Date.now()
        return operator === 'before' ? now < targetDate : now > targetDate
      }
      case 'Purpose': {
        const itemAction = (item.action || '').toLowerCase()
        const targetPurpose = value.toLowerCase()
        return operator === 'is' ? itemAction === targetPurpose : itemAction !== targetPurpose
      }
      case 'Item ID Type': {
        // Check if item has MPN/CPN/HSN based on itemId pattern
        const itemId = item.itemId || ''
        const hasType = value === 'MPN' ? /^[A-Z0-9\-]+$/i.test(itemId)
          : value === 'HSN' ? /^\d{4,8}$/.test(itemId)
          : true // CPN — assume true if neither MPN nor HSN
        return operator === 'is' ? hasType : !hasType
      }
      default:
        return false
    }
  }

  // Evaluate a full criteria set (WHERE + AND/OR chain) against an item
  const evaluateCriteria = (criteria: { conjunction: string; field: string; operator: string; value: string; unit?: string }[], item: any): boolean => {
    if (!criteria || criteria.length === 0) return true // No criteria = match all

    let result = evaluateCriterion(criteria[0], item)
    for (let i = 1; i < criteria.length; i++) {
      const c = criteria[i]
      const val = evaluateCriterion(c, item)
      if (c.conjunction === 'OR') {
        result = result || val
      } else {
        // AND (default)
        result = result && val
      }
    }
    return result
  }

  // Assign Actions Handler
  const handleAssignActions = async (scope: 'all' | 'unassigned' | 'selected') => {
    let idsToUpdate: Set<number>
    if (scope === 'unassigned') {
      idsToUpdate = new Set(lineItems.filter((item: any) => !item.action || item.action.trim() === '').map((i: any) => i.id))
    } else if (scope === 'selected') {
      idsToUpdate = new Set(selectedItems)
    } else {
      idsToUpdate = new Set(lineItems.map((i: any) => i.id))
    }

    // Get local criteria from settings
    const localCriteria = currentSettings.actions?.criteria || []
    const localAction = currentSettings.actions?.criteriaAction || 'Quote'
    const hasLocalCriteria = localCriteria.length > 0

    // Evaluate rules and collect items that changed
    const changedItems: { project_item_id: string; action: string }[] = []

    const updatedItems = lineItems.map((item: any) => {
      if (!idsToUpdate.has(item.id)) return item

      let newAction: string | null = null

      // Priority 1: Local settings criteria (user's own overrides)
      if (hasLocalCriteria && evaluateCriteria(localCriteria, item)) {
        newAction = localAction
      }

      // Priority 2: Admin action rules (from backend)
      if (!newAction) {
        for (const rule of adminActionRules) {
          if (evaluateCriteria(rule.criteria, item)) {
            newAction = rule.action
            break
          }
        }
      }

      if (!newAction) return item // No rule matched

      if (newAction !== item.action) {
        changedItems.push({ project_item_id: item.project_item_id, action: newAction })
      }
      return { ...item, action: newAction }
    })

    setLineItems(updatedItems)

    // Persist to backend
    const projectId = new URLSearchParams(window.location.search).get('project_id') || ''
    if (projectId && changedItems.length > 0) {
      const saveActions = async () => {
        let failed = 0
        for (const { project_item_id, action } of changedItems) {
          try {
            await updateProjectItem(projectId, project_item_id, { action })
          } catch (err) {
            failed++
            console.warn(`[Actions] Failed to save action for ${project_item_id}:`, err)
          }
        }
        if (failed > 0) {
          toast({ title: "Warning", description: `${failed} item(s) failed to save to server.`, variant: "destructive" })
        }
      }
      saveActions()
    }

    const skipped = idsToUpdate.size - changedItems.length

    toast({
      title: "Actions Assigned",
      description: changedItems.length > 0
        ? `Assigned actions to ${changedItems.length} item(s).${skipped > 0 ? ` ${skipped} item(s) had no matching rule.` : ''}`
        : `No matching rules found for ${idsToUpdate.size} item(s). Configure rules in Settings or ask admin.`,
    })

    document.body.click()
  }

  // Manual Edit Handlers
  const handleOpenEdit = async () => {
    if (selectedItems.length === 0) return

    // Get the selected line items
    const itemsToEdit = lineItems.filter((item: any) => selectedItems.includes(item.id))

    // Reset custom-vendor popup state
    setEditVendorSearchInput("")
    setEditVendorSearchResults([])
    setEditVendorSelectedIds([])
    setEditAttachedVendors([])
    setEditVendorSearching(false)
    setEditVendorMutating(false)
    setEditVendorDirty(false)

    // Fetch attached vendors for each selected item in parallel, then:
    // - single item: use that item's list as-is
    // - bulk: intersect by enterprise_vendor_master_id
    const projectIdForFetch = getProjectId()
    if (projectIdForFetch) {
      try {
        const fetched = await Promise.all(
          itemsToEdit.map((it: any) =>
            getItemCustomVendors(projectIdForFetch, it.project_item_id)
              .then(res => ({ itemId: it.id, project_item_id: it.project_item_id, vendors: res.custom_vendors || [] }))
              .catch(() => ({ itemId: it.id, project_item_id: it.project_item_id, vendors: [] as CustomVendor[] }))
          )
        )

        // Mirror results onto lineItems so the vendor column renders correctly
        setLineItems((prev: any[]) =>
          prev.map(li => {
            const match = fetched.find(f => f.itemId === li.id)
            return match ? { ...li, custom_vendors: match.vendors } : li
          })
        )

        if (itemsToEdit.length === 1) {
          setEditAttachedVendors(fetched[0]?.vendors || [])
        } else {
          // Intersection by vendor ID
          const idCounts = new Map<string, { count: number; vendor: CustomVendor }>()
          for (const row of fetched) {
            const seen = new Set<string>()
            for (const v of row.vendors) {
              if (seen.has(v.enterprise_vendor_master_id)) continue
              seen.add(v.enterprise_vendor_master_id)
              const prev = idCounts.get(v.enterprise_vendor_master_id)
              if (prev) {
                idCounts.set(v.enterprise_vendor_master_id, { count: prev.count + 1, vendor: prev.vendor })
              } else {
                idCounts.set(v.enterprise_vendor_master_id, { count: 1, vendor: v })
              }
            }
          }
          const common: CustomVendor[] = []
          idCounts.forEach(({ count, vendor }) => {
            if (count === itemsToEdit.length) common.push(vendor)
          })
          setEditAttachedVendors(common)
        }
      } catch (err) {
        console.warn('[Edit] Failed to load custom vendors for selected items:', err)
      }
    }

    // For bulk edit, use common values or empty strings
    if (selectedItems.length === 1) {
      // Single item edit - populate all fields
      const item = itemsToEdit[0]
      // Filter out "Uncategorized" placeholder - it's not a real tag
      const actualCategory = item.category === 'Uncategorized' ? '' : (item.category || '')
      const assignedToValue = item.assignedTo || ''
      const assignedUserIds = item.assigned_user_ids || []
      setEditFormData({
        isBulk: false,
        itemCount: 1,
        item: item, // Store the item in formData instead
        category: actualCategory,
        originalCategory: actualCategory, // Track original tags
        vendor: item.vendor || '',
        assignedTo: assignedToValue,
        originalAssignedTo: assignedToValue, // Track original users for single item too
        originalAssignedUserIds: assignedUserIds, // Track original user IDs
        action: item.action || '',
        unitPrice: item.unitPrice || 0,
        rate: item.unitPrice || 0,
        quantity: item.quantity || 0,
        currency: item.currency,
        unit: item.unit,
        itemId: item.itemId,
        project_item_id: item.project_item_id
      })
    } else {
      // Bulk edit - show common tags across all selected items
      // Get all unique tags from selected items
      const allTagsFromSelected = itemsToEdit
        .map((item: any) => item.category === 'Uncategorized' ? '' : (item.category || ''))
        .filter(Boolean)
        .flatMap((cats: string) => cats.split(',').map((c: string) => c.trim()))
        .filter(Boolean)

      // Find tags that are common to ALL selected items (intersection)
      const tagCounts = allTagsFromSelected.reduce((acc: any, tag: string) => {
        acc[tag] = (acc[tag] || 0) + 1
        return acc
      }, {})

      const commonTags = Object.entries(tagCounts)
        .filter(([_, count]) => count === selectedItems.length)
        .map(([tag, _]) => tag)
        .join(', ')

      // Get all user IDs from selected items
      const allUserIdsFromSelected = itemsToEdit
        .flatMap((item: any) => item.assigned_user_ids || [])

      // Find user IDs that are common to ALL selected items
      const userIdCounts = allUserIdsFromSelected.reduce((acc: any, userId: string) => {
        acc[userId] = (acc[userId] || 0) + 1
        return acc
      }, {})

      const commonUserIds = Object.entries(userIdCounts)
        .filter(([_, count]) => count === selectedItems.length)
        .map(([userId, _]) => userId)

      // Convert user IDs to names
      const commonUserNames = projectUsers
        .filter((u: any) => commonUserIds.includes(u.user_id))
        .map((u: any) => u.name)
        .join(', ')

      setEditFormData({
        isBulk: true,
        itemCount: selectedItems.length,
        category: commonTags,  // Show common tags
        originalCategory: commonTags, // Track original tags
        vendor: '',
        assignedTo: commonUserNames, // Show common users
        originalAssignedTo: commonUserNames, // Track original users
        originalAssignedUserIds: commonUserIds, // Track original user IDs
        action: '',
        unitPrice: 0,
        rate: 0,
        quantity: 0
      })
    }

    setShowEditDialog(true)
  }

  // Debounced server-side vendor search (edit popup only)
  useEffect(() => {
    if (!showEditDialog) return
    const query = editVendorSearchInput.trim()
    // Reset results when cleared
    if (query.length === 0) {
      setEditVendorSearchResults([])
      setEditVendorSearching(false)
      return
    }
    const projectId = getProjectId()
    if (!projectId) return

    setEditVendorSearching(true)
    const handle = setTimeout(async () => {
      try {
        // Single-item: exclude vendors already attached to that item via backend param
        const excludeForItemId = !editFormData.isBulk && editFormData.project_item_id
          ? String(editFormData.project_item_id)
          : undefined
        const res = await searchVendors(projectId, {
          search: query,
          limit: 30,
          excludeForItemId,
        })
        // In bulk mode we additionally hide vendors already common across all items
        const alreadyCommonIds = new Set(editAttachedVendors.map(v => v.enterprise_vendor_master_id))
        const filtered = editFormData.isBulk
          ? res.vendors.filter(v => !alreadyCommonIds.has(v.enterprise_vendor_master_id))
          : res.vendors
        setEditVendorSearchResults(filtered)
      } catch (err) {
        console.warn('[Vendor search] Failed:', err)
        setEditVendorSearchResults([])
      } finally {
        setEditVendorSearching(false)
      }
    }, 300)

    return () => clearTimeout(handle)
  }, [editVendorSearchInput, showEditDialog, editFormData.isBulk, editFormData.project_item_id, editAttachedVendors])

  // Auto-add on row click — POST a single vendor immediately to all targeted items
  const handleAddSingleVendor = async (enterpriseVendorMasterId: string) => {
    const projectId = getProjectId()
    if (!projectId) return
    const targetItems = lineItems.filter((item: any) => selectedItems.includes(item.id))
    if (targetItems.length === 0) return

    // Optimistic: remove from current results so it disappears from the list immediately
    setEditVendorSearchResults(prev => prev.filter(v => v.enterprise_vendor_master_id !== enterpriseVendorMasterId))

    setEditVendorMutating(true)
    try {
      const results = await Promise.all(
        targetItems.map((it: any) =>
          addItemCustomVendors(projectId, it.project_item_id, [enterpriseVendorMasterId])
            .then(res => ({ itemId: it.id, project_item_id: it.project_item_id, vendors: res.custom_vendors || [] }))
            .catch((err) => {
              console.warn('[Add vendor] Failed for item', it.project_item_id, err)
              return { itemId: it.id, project_item_id: it.project_item_id, vendors: null as CustomVendor[] | null }
            })
        )
      )

      // Mirror each item's updated custom_vendors back onto lineItems
      setLineItems((prev: any[]) =>
        prev.map(li => {
          const match = results.find(r => r.itemId === li.id)
          return match && match.vendors ? { ...li, custom_vendors: match.vendors } : li
        })
      )

      // Refresh popup pills: single = that item's list; bulk = intersection
      if (!editFormData.isBulk) {
        const only = results[0]
        setEditAttachedVendors(only?.vendors || [])
      } else {
        const idCounts = new Map<string, { count: number; vendor: CustomVendor }>()
        for (const row of results) {
          if (!row.vendors) continue
          const seen = new Set<string>()
          for (const v of row.vendors) {
            if (seen.has(v.enterprise_vendor_master_id)) continue
            seen.add(v.enterprise_vendor_master_id)
            const prev = idCounts.get(v.enterprise_vendor_master_id)
            if (prev) {
              idCounts.set(v.enterprise_vendor_master_id, { count: prev.count + 1, vendor: prev.vendor })
            } else {
              idCounts.set(v.enterprise_vendor_master_id, { count: 1, vendor: v })
            }
          }
        }
        const common: CustomVendor[] = []
        const totalTargets = targetItems.length
        idCounts.forEach(({ count, vendor }) => {
          if (count === totalTargets) common.push(vendor)
        })
        setEditAttachedVendors(common)
      }

      setEditVendorDirty(true)
      toast({
        title: "Vendor added",
        description: editFormData.isBulk
          ? `Added to ${targetItems.length} items`
          : undefined,
      })
    } finally {
      setEditVendorMutating(false)
    }
  }

  // Add selected vendors (single item = POST once; bulk = POST for every selected item)
  const handleAddCustomVendors = async () => {
    if (editVendorSelectedIds.length === 0) return
    const projectId = getProjectId()
    if (!projectId) return
    const idsToAdd = [...editVendorSelectedIds]
    const targetItems = lineItems.filter((item: any) => selectedItems.includes(item.id))
    if (targetItems.length === 0) return

    setEditVendorMutating(true)
    try {
      const results = await Promise.all(
        targetItems.map((it: any) =>
          addItemCustomVendors(projectId, it.project_item_id, idsToAdd)
            .then(res => ({ itemId: it.id, project_item_id: it.project_item_id, vendors: res.custom_vendors || [] }))
            .catch((err) => {
              console.warn('[Add vendor] Failed for item', it.project_item_id, err)
              return { itemId: it.id, project_item_id: it.project_item_id, vendors: null as CustomVendor[] | null }
            })
        )
      )

      // Update each item's custom_vendors in lineItems
      setLineItems((prev: any[]) =>
        prev.map(li => {
          const match = results.find(r => r.itemId === li.id)
          return match && match.vendors ? { ...li, custom_vendors: match.vendors } : li
        })
      )

      // Recompute the popup's visible vendor list (single: the one item's list; bulk: intersection)
      if (!editFormData.isBulk) {
        const only = results[0]
        setEditAttachedVendors(only?.vendors || [])
      } else {
        const idCounts = new Map<string, { count: number; vendor: CustomVendor }>()
        for (const row of results) {
          if (!row.vendors) continue
          const seen = new Set<string>()
          for (const v of row.vendors) {
            if (seen.has(v.enterprise_vendor_master_id)) continue
            seen.add(v.enterprise_vendor_master_id)
            const prev = idCounts.get(v.enterprise_vendor_master_id)
            if (prev) {
              idCounts.set(v.enterprise_vendor_master_id, { count: prev.count + 1, vendor: prev.vendor })
            } else {
              idCounts.set(v.enterprise_vendor_master_id, { count: 1, vendor: v })
            }
          }
        }
        const common: CustomVendor[] = []
        const totalTargets = targetItems.length
        idCounts.forEach(({ count, vendor }) => {
          if (count === totalTargets) common.push(vendor)
        })
        setEditAttachedVendors(common)
      }

      setEditVendorSelectedIds([])
      setEditVendorSearchInput("")
      setEditVendorSearchResults([])
      setEditVendorDirty(true)

      toast({
        title: "Vendors added",
        description: editFormData.isBulk
          ? `Added ${idsToAdd.length} vendor(s) to ${targetItems.length} items`
          : `Added ${idsToAdd.length} vendor(s)`,
      })
    } finally {
      setEditVendorMutating(false)
    }
  }

  // Remove a vendor from the active item(s). Single: one DELETE. Bulk: DELETE on every selected item.
  const handleRemoveCustomVendor = async (enterpriseVendorMasterId: string) => {
    const projectId = getProjectId()
    if (!projectId) return
    const targetItems = lineItems.filter((item: any) => selectedItems.includes(item.id))
    if (targetItems.length === 0) return

    setEditVendorMutating(true)
    try {
      await Promise.all(
        targetItems.map((it: any) =>
          removeItemCustomVendor(projectId, it.project_item_id, enterpriseVendorMasterId)
            .catch(err => console.warn('[Remove vendor] Failed for item', it.project_item_id, err))
        )
      )

      // Update lineItems: strip the removed vendor from every targeted item
      setLineItems((prev: any[]) =>
        prev.map(li => {
          if (!selectedItems.includes(li.id)) return li
          const existing: CustomVendor[] = Array.isArray(li.custom_vendors) ? li.custom_vendors : []
          return {
            ...li,
            custom_vendors: existing.filter(v => v.enterprise_vendor_master_id !== enterpriseVendorMasterId),
          }
        })
      )

      setEditAttachedVendors(prev => prev.filter(v => v.enterprise_vendor_master_id !== enterpriseVendorMasterId))
      setEditVendorDirty(true)

      toast({
        title: "Vendor removed",
        description: editFormData.isBulk
          ? `Removed from ${targetItems.length} items`
          : `Removed vendor`,
      })
    } finally {
      setEditVendorMutating(false)
    }
  }

  const handleSaveEdit = async () => {
    if (selectedItems.length === 0) return

    const projectId = getProjectId()
    if (!projectId) {
      console.error('[Edit] No project ID found')
      toast({
        title: "Error",
        description: "Project ID not found",
        variant: "destructive",
      })
      return
    }

    // Check if assignedTo changed - compare with original for both single and bulk
    const assignedToChanged = editFormData.assignedTo !== editFormData.originalAssignedTo

    // Check if category changed - compare with original for both single and bulk
    const categoryChanged = editFormData.category !== editFormData.originalCategory

    // If no other changes, close — custom vendor mutations are already committed.
    if (!assignedToChanged && !categoryChanged) {
      if (editVendorDirty) {
        toast({
          title: "Saved",
          description: "Vendor changes saved",
        })
      } else {
        toast({
          title: "No Changes",
          description: "No fields were modified",
        })
      }
      setShowEditDialog(false)
      setEditFormData({})
      setEditVendorDirty(false)
      return
    }

    console.log('[Edit] Saving changes for', selectedItems.length, 'items')
    console.log('[Edit] Form data:', editFormData)

    // If either users or tags changed, update via API
    if (assignedToChanged || categoryChanged) {
      // Close dialog immediately and show progress
      setShowEditDialog(false)
      setEditFormData({})

      const itemsToUpdate = lineItems.filter((item: any) => selectedItems.includes(item.id))

      // Start bulk update progress tracking
      setBulkUpdateInProgress(true)
      setBulkUpdateProgress({ current: 0, total: itemsToUpdate.length, failed: 0 })

      try {
        let successCount = 0
        let failCount = 0

        // Prepare user data if changed
        let newUserIdsFromForm: string[] = []
        let originalCommonUserIds: string[] = []
        if (assignedToChanged) {
          const assignedUserNames = (editFormData.assignedTo || '')
            .split(',')
            .map((name: string) => name.trim())
            .filter(Boolean)

          newUserIdsFromForm = assignedUserNames
            .map((userName: string) => {
              const user = projectUsers.find(u => u.name === userName)
              return user?.user_id
            })
            .filter((id: string | undefined): id is string => id !== undefined)

          originalCommonUserIds = editFormData.originalAssignedUserIds || []
          console.log('[Edit] Users changed - original:', originalCommonUserIds, 'new:', newUserIdsFromForm)
        }

        // Prepare tag data if changed
        let newTagsFromForm: string[] = []
        let originalCommonTags: string[] = []
        if (categoryChanged) {
          newTagsFromForm = (editFormData.category || '')
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
            .filter((t: string) => t !== 'Uncategorized')

          originalCommonTags = (editFormData.originalCategory || '')
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
          console.log('[Edit] Tags changed - original:', originalCommonTags, 'new:', newTagsFromForm)
        }

        console.log(`[Edit] Updating ${itemsToUpdate.length} items (users: ${assignedToChanged}, tags: ${categoryChanged})`)

        // Helper to update a single item with retry logic
        const updateItemWithRetry = async (item: any, maxRetries = 3): Promise<{ success: boolean; itemId: string; error?: any }> => {
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              // Update users first (if changed)
              if (assignedToChanged) {
                const existingUserIds = item.assigned_user_ids || []
                const itemSpecificUserIds = existingUserIds.filter((id: string) => !originalCommonUserIds.includes(id))
                const finalUserIds = Array.from(new Set([...itemSpecificUserIds, ...newUserIdsFromForm]))

                await updateProjectItem(projectId, item.project_item_id, {
                  assigned_user_ids: finalUserIds,
                  custom_fields: { manually_edited: true, last_manual_edit: new Date().toISOString() }
                })
              }

              // Then update tags (if changed) - sequential to avoid overwhelming API
              // Logic: tags can only be removed (not added), custom_tags can be added/removed
              if (categoryChanged) {
                const existingTags = item.category && item.category !== 'Uncategorized'
                  ? item.category.split(',').map((t: string) => t.trim()).filter(Boolean)
                  : []
                const itemSpecificTags = existingTags.filter((t: string) => !originalCommonTags.includes(t))
                const finalTags = Array.from(new Set([...itemSpecificTags, ...newTagsFromForm]))

                // Get original tags vs custom_tags for this item
                const originalTagsArr = item.original_tags || []

                // Tags to keep = original tags that are still in finalTags (can only remove, not add)
                const tagsToKeep = originalTagsArr.filter((t: string) => finalTags.includes(t))

                // Custom tags = all finalTags that are not in original_tags
                const newCustomTags = finalTags.filter((t: string) => !originalTagsArr.includes(t))

                await updateItemTags(projectId, item.project_item_id, tagsToKeep, newCustomTags)
              }

              return { success: true, itemId: item.itemId }
            } catch (error: any) {
              console.error(`[Edit] Attempt ${attempt}/${maxRetries} failed for item:`, item.itemId, error?.message || error)
              if (attempt === maxRetries) {
                return { success: false, itemId: item.itemId, error }
              }
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 500 * attempt))
            }
          }
          return { success: false, itemId: item.itemId }
        }

        // Process in smaller batches with retry
        const SAFE_BATCH_SIZE = 25 // Balance between speed and API reliability
        for (let i = 0; i < itemsToUpdate.length; i += SAFE_BATCH_SIZE) {
          const batch = itemsToUpdate.slice(i, i + SAFE_BATCH_SIZE)
          console.log(`[Edit] Processing batch ${Math.floor(i / SAFE_BATCH_SIZE) + 1}/${Math.ceil(itemsToUpdate.length / SAFE_BATCH_SIZE)} (${batch.length} items)`)

          // Update all items in this batch in parallel (but each item updates sequentially)
          const batchPromises = batch.map(item => updateItemWithRetry(item))
          const results = await Promise.all(batchPromises)

          successCount += results.filter(r => r.success).length
          failCount += results.filter(r => !r.success).length

          // Log any failures
          const failures = results.filter(r => !r.success)
          if (failures.length > 0) {
            console.error(`[Edit] Batch had ${failures.length} failures:`, failures.map(f => f.itemId))
          }

          // Update progress state
          setBulkUpdateProgress({
            current: Math.min(i + SAFE_BATCH_SIZE, itemsToUpdate.length),
            total: itemsToUpdate.length,
            failed: failCount
          })

          // Delay between batches to prevent rate limiting
          if (i + SAFE_BATCH_SIZE < itemsToUpdate.length) {
            await new Promise(resolve => setTimeout(resolve, 300))
          }
        }

        console.log(`[Edit] Complete: ${successCount} succeeded, ${failCount} failed`)
        setBulkUpdateInProgress(false)

        // Update local state directly instead of refetching
        const updatedLineItems = lineItems.map((item: any) => {
          if (!selectedItems.includes(item.id)) return item

          const updates: any = { ...item }

          if (assignedToChanged) {
            const existingUserIds = item.assigned_user_ids || []
            const itemSpecificUserIds = existingUserIds.filter((id: string) => !originalCommonUserIds.includes(id))
            const finalUserIds = Array.from(new Set([...itemSpecificUserIds, ...newUserIdsFromForm]))
            updates.assigned_user_ids = finalUserIds
            updates.assignedTo = projectUsers
              .filter((u: any) => finalUserIds.includes(u.user_id))
              .map((u: any) => u.name)
              .join(', ')
          }

          if (categoryChanged) {
            const existingTags = item.category && item.category !== 'Uncategorized'
              ? item.category.split(',').map((t: string) => t.trim()).filter(Boolean)
              : []
            const itemSpecificTags = existingTags.filter((t: string) => !originalCommonTags.includes(t))
            const finalTags = Array.from(new Set([...itemSpecificTags, ...newTagsFromForm]))
            updates.category = finalTags.length > 0 ? finalTags.join(', ') : 'Uncategorized'

            // Update original_tags and original_custom_tags
            const originalTagsArr = item.original_tags || []
            updates.original_tags = originalTagsArr.filter((t: string) => finalTags.includes(t))
            updates.original_custom_tags = finalTags.filter((t: string) => !originalTagsArr.includes(t))
          }

          updates.manuallyEdited = true
          return updates
        })

        setLineItems(updatedLineItems)

        // Notify Factwise parent
        const updatedItemIds = itemsToUpdate.map(item => item.project_item_id)
        if (assignedToChanged) {
          notifyItemsAssigned(updatedItemIds, newUserIdsFromForm)
        }
        if (categoryChanged) {
          window.parent.postMessage({
            type: 'PROJECT_ITEM_UPDATED',
            project_item_ids: updatedItemIds,
            project_id: projectId,
            updated_fields: ['tags'],
            timestamp: new Date().toISOString()
          }, '*')
        }

        toast({
          title: "Items Updated",
          description: `Successfully updated ${successCount} item(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
        })

      } catch (error) {
        console.error('[Edit] Error:', error)
        setBulkUpdateInProgress(false)
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to save changes",
          variant: "destructive",
        })
      }
    }
  }

  // Computed: Check if edit form has changes (for disabling save button)
  const editFormHasChanges = useMemo(() => {
    if (!editFormData || Object.keys(editFormData).length === 0) return false
    const assignedToChanged = editFormData.assignedTo !== editFormData.originalAssignedTo
    const categoryChanged = editFormData.category !== editFormData.originalCategory
    return assignedToChanged || categoryChanged || editVendorDirty
  }, [editFormData, editVendorDirty])

  const handleColumnDrag = (draggedCol: string, targetCol: string) => {
    const draggedIndex = columnOrder.indexOf(draggedCol)
    const targetIndex = columnOrder.indexOf(targetCol)

    const newOrder = [...columnOrder]
    newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, draggedCol)

    setColumnOrder(newOrder)
  }

  // Add spec columns to column order dynamically (after "bom" column)
  const specColumnKeys = specColumns.map(specName => `spec_${specName.replace(/\s+/g, '_')}`)
  const allColumns = [...columnOrder.slice(0, 3), ...specColumnKeys, ...columnOrder.slice(3)] // Insert specs after itemId, description, bom

  // Always show Digikey/Mouser columns regardless of API key configuration
  const distributorHiddenCols: string[] = []
  const visibleColumns = allColumns.filter((col) => !hiddenColumns.includes(col) && !distributorHiddenCols.includes(col))

  // Build column labels dynamically with spec columns
  const columnLabels: Record<string, string> = {
    customer: "Customer",
    itemId: "Item ID",
    description: "Description",
    internalNotes: internalNotesLabel,
    bom: "BOM",
    quantity: "Qty",
    unit: "Unit",
    category: "Tag",
    projectManager: "Project Manager",
    rfqAssignee: "RFQ Assignee",
    quoteAssignee: "Quote Assignee",
    rfqResponsible: "RFQ Item Responsible",
    quoteResponsible: "Quote Item Responsible",
    action: "Action",
    assignedTo: "Assigned",
    dueDate: "Due Date",
    vendor: "Vendor",
    pricePO: "PO Price",
    priceContract: "Contract",
    priceQuote: "Quote",
    priceRFQ: "RFQ",
    priceDigikey: "Digi-Key",
    priceMouser: "Mouser",
    priceEXIM: "EXIM",
    source: "Source",
    unitPrice: "Price",
  }

  // Add dynamic spec column labels + default widths
  specColumns.forEach(specName => {
    const key = `spec_${specName.replace(/\s+/g, '_')}`
    columnLabels[key] = specName
    if (!columnWidths[key]) columnWidths[key] = 120
  })

  // Add dynamic custom ID column default widths
  customIdColumns.forEach(idName => {
    const key = `customId_${idName.replace(/\s+/g, '_')}`
    if (!columnWidths[key]) columnWidths[key] = 120
  })

  // Helpers for price icons
  const priceSourceIcon = (src?: PriceSource) => {
    if (!src) return null
    if (src === 'PO') return <FileText className="h-3 w-3 text-gray-500" />
    if (src === 'Contract') return <FileSignature className="h-3 w-3 text-emerald-600" />
    if (src === 'Quote') return <FileText className="h-3 w-3 text-indigo-600" />
    if (src === 'EXIM') return <Package className="h-3 w-3 text-purple-600" />
    return <Globe className="h-3 w-3 text-teal-600" />
  }

  // Icon for current Action (for tooltips next to price)
  const actionIcon = (action?: string) => {
    if (!action || !action.trim()) return null
    const a = action.trim().toLowerCase()
    if (a === 'direct po') return <DollarSign className="h-3 w-3 text-green-600" />
    if (a === 'contract') return <FileSignature className="h-3 w-3 text-emerald-600" />
    if (a === 'quote') return <FileText className="h-3 w-3 text-indigo-600" />
    if (a === 'rfq') return <FileText className="h-3 w-3 text-gray-600" />
    return <FileText className="h-3 w-3 text-gray-500" />
  }

  function mockPriceForSource(item: any, source: PriceSource): number {
    // Calculate hash for deterministic variation
    const key = String(item.itemId || item.id || '') + '|' + source
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0

    // Use Digikey/Mouser price if available
    const digikeyPricing = item.digikey_pricing
    const mouserPricing = item.mouser_pricing

    const digikeyPrice = digikeyPricing?.status === 'available'
      ? (digikeyPricing.quantity_price ?? digikeyPricing.unit_price)
      : null
    const mouserPrice = mouserPricing?.status === 'available'
      ? (mouserPricing.quantity_price ?? mouserPricing.unit_price)
      : null

    let basePrice: number = 0
    if (digikeyPrice && mouserPrice) {
      basePrice = (digikeyPrice + mouserPrice) / 2
    } else if (digikeyPrice) {
      basePrice = digikeyPrice
    } else if (mouserPrice) {
      basePrice = mouserPrice
    }

    if (!basePrice || basePrice <= 0) {
      // Fall back to item.unitPrice (the Price column from Factwise)
      basePrice = item.unitPrice || 0
    }

    if (!basePrice || basePrice <= 0) {
      // Last resort: deterministic pseudo-price if no pricing available
      basePrice = 0.50 + ((h % 500) / 100) // 0.50 to 5.50
    }

    // Source-based price adjustments with variation per item
    // Each source uses XOR with unique salt + prime multiplier to ensure different prices
    const sourceSalts: Record<string, number> = {
      'PO': 0xA5A5,
      'Contract': 0x5A5A,
      'Quote': 0x3C3C,
      'EXIM': 0xC3C3,
      'Online - Digikey': 0x1234,
      'Online - Mouser': 0x5678,
      'Online - LCSC': 0x9ABC,
      'Online - Farnell': 0xDEF0,
    };
    const primeMultipliers: Record<string, number> = {
      'PO': 7,
      'Contract': 13,
      'Quote': 17,
      'EXIM': 23,
      'Online - Digikey': 29,
      'Online - Mouser': 31,
      'Online - LCSC': 37,
      'Online - Farnell': 41,
    };
    const salt = sourceSalts[source] || 0xFFFF;
    const prime = primeMultipliers[source] || 11;
    const sourceHash = (h ^ salt) * prime;
    const sourceVariation = 0.85 + (Math.abs(sourceHash) % 21) / 100; // 0.85 to 1.05

    // Apply variation to make cheapest source vary per item
    const adjustedMultiplier = sourceVariation;
    const finalPrice = basePrice * adjustedMultiplier
    return Math.max(0.01, Math.round(finalPrice * 1000) / 1000) // Round to 3 decimal places, min $0.01
  }

  // Generate realistic analytics data based on actual item data
  const generateAnalyticsData = (item: any) => {
    // ── Real pricing repo v2 history (lazy-loaded when popup opens) ──
    // Build per-source { vendor, price, quantity }[] from analyticsMpnHistory.
    const basis = pricingSettings.priceBasis

    // Derive the admin currency symbol from the first available history record
    const adminCurrSym = (() => {
      if (!analyticsMpnHistory || analyticsMpnHistory.length === 0) return '₹'
      for (const r of analyticsMpnHistory) {
        if (r.admin_currency_symbol) return r.admin_currency_symbol
      }
      return '₹'
    })()

    const historyToSeries = (source: PricingSourceType) => {
      if (!analyticsMpnHistory) return []
      return analyticsMpnHistory
        .filter((r) => r.source === source)
        .map((r) => {
          const price = getAdminPrice(r, basis)
          if (price === null || price <= 0) return null
          return {
            vendor: r.supplier_name || 'Unknown',
            price: Math.round(price * 100) / 100,
            quantity: typeof r.quantity === 'number' ? r.quantity : 0,
            date: r.pricing_datetime,
          }
        })
        .filter((d): d is { vendor: string; price: number; quantity: number; date: string } => d !== null)
        .sort((a, b) => a.date.localeCompare(b.date))
    }

    const realPoData = historyToSeries('PO')
    const realContractData = historyToSeries('CONTRACT')
    const realQuoteData = historyToSeries('QUOTE')
    const realRfqData = historyToSeries('RFQ')

    // Use item ID for deterministic randomness (for remaining mock-only series)
    const seed = item.id || 1
    let randomSeed = seed * 9999

    const seededRandom = (min: number, max: number) => {
      randomSeed = (randomSeed * 1103515245 + 12345) % (Math.pow(2, 31))
      const normalized = (randomSeed / Math.pow(2, 31))
      return min + normalized * (max - min)
    }

    // Get actual prices from item data
    const digikeyPricing = item.digikey_pricing
    const mouserPricing = item.mouser_pricing
    const digikeyPrice = digikeyPricing?.status === 'available'
      ? (digikeyPricing.quantity_price ?? digikeyPricing.unit_price) : null
    const mouserPrice = mouserPricing?.status === 'available'
      ? (mouserPricing.quantity_price ?? mouserPricing.unit_price) : null
    const digikeyStock = digikeyPricing?.stock ?? 0
    const mouserStock = mouserPricing?.stock ?? 0

    // Get item's actual data
    const itemQty = item.quantity || 100
    const itemCurrency = item.currency?.symbol || '₹'
    const poPrice = item.pricePO || 0
    const contractPrice = item.priceContract || 0
    const quotePrice = item.priceQuote || 0

    // Base price from actual distributor data or calculated prices
    const basePrice = digikeyPrice || mouserPrice || poPrice || contractPrice || quotePrice || 10

    // PO Module - different vendors with PO prices
    const poVendors = ['Arrow Electronics', 'Avnet', 'Future Electronics', 'TTI Inc', 'RS Components', 'Newark']
    const poData = poVendors.map((vendor, idx) => {
      const vendorFactor = [0.97, 1.02, 0.95, 1.05, 0.99, 1.01][idx]
      const variation = seededRandom(0.96, 1.04)
      const price = (poPrice || basePrice * 0.92) * vendorFactor * variation
      const qtyMultiplier = [1.0, 0.8, 1.3, 0.6, 1.1, 0.9][idx]
      const quantity = Math.round(itemQty * qtyMultiplier * seededRandom(0.9, 1.1))
      return {
        vendor,
        price: Math.round(price * 100) / 100,
        quantity: Math.max(10, quantity)
      }
    })

    // Contract Module - different vendors with contract prices
    const contractVendors = ['Arrow Electronics', 'Avnet', 'Future Electronics', 'TTI Inc', 'Digi-Key']
    const contractData = contractVendors.map((vendor, idx) => {
      const vendorFactor = [0.97, 1.02, 0.95, 1.05, 0.99][idx]
      const variation = seededRandom(0.98, 1.02)
      const price = (contractPrice || basePrice * 0.85) * vendorFactor * variation
      const qtyFactor = [1.2, 0.8, 1.5, 0.6, 1.0][idx]
      const quantity = Math.round(itemQty * qtyFactor * seededRandom(0.8, 1.2))
      return {
        vendor,
        price: Math.round(price * 100) / 100,
        quantity: Math.max(5, quantity)
      }
    })

    // EXIM Module - different vendors with import prices
    const eximVendors = ['LCSC', 'AliExpress', 'Made-in-China', 'Global Sources', 'IndiaMART']
    const eximData = eximVendors.map((vendor, idx) => {
      const dutyFactor = [1.08, 1.15, 1.12, 1.20, 1.06][idx]
      const variation = seededRandom(0.97, 1.03)
      const price = basePrice * dutyFactor * variation
      const qtyFactor = [1.5, 0.7, 1.0, 0.5, 1.2][idx]
      const quantity = Math.round(itemQty * qtyFactor * seededRandom(0.8, 1.2))
      return {
        vendor,
        price: Math.round(price * 100) / 100,
        quantity: Math.max(5, quantity)
      }
    })

    // Quote Module - different vendors with quote prices
    const quoteVendors = ['Arrow Electronics', 'Avnet', 'TTI Inc', 'Future Electronics', 'RS Components']
    const quoteData = quoteVendors.map((vendor, idx) => {
      const vendorFactor = [1.0, 1.05, 0.95, 1.08, 0.98][idx]
      const variation = seededRandom(0.94, 1.06)
      const price = (quotePrice || basePrice * 0.97) * vendorFactor * variation
      const quantity = Math.round(itemQty * seededRandom(0.9, 1.1))
      return {
        vendor,
        price: Math.round(price * 100) / 100,
        quantity: Math.max(10, quantity)
      }
    })

    // Online Pricing Module - always show all 4 vendors (real data when available, mock otherwise)
    const refPrice = digikeyPrice || mouserPrice || basePrice
    const refStock = digikeyStock || mouserStock || Math.max(100, itemQty * 3)
    const onlineData = [
      {
        vendor: 'Digikey',
        price: Math.round((digikeyPrice || refPrice * 1.0) * 100) / 100,
        quantity: digikeyStock > 0 ? digikeyStock : Math.round(refStock * 0.9),
      },
      {
        vendor: 'Mouser',
        price: Math.round((mouserPrice || refPrice * 1.02) * 100) / 100,
        quantity: mouserStock > 0 ? mouserStock : Math.round(refStock * 0.95),
      },
      {
        vendor: 'LCSC',
        price: Math.round(refPrice * 0.93 * 100) / 100,
        quantity: Math.round(refStock * 1.2),
      },
      {
        vendor: 'Farnell',
        price: Math.round(refPrice * 1.04 * 100) / 100,
        quantity: Math.round(refStock * 0.85),
      },
    ]

    // Always use real pricing-repo history. No mock fallback for PO/Contract/Quote/RFQ —
    // empty array → chart card shows "No history for this MPN" empty state.
    return {
      poData: realPoData,
      contractData: realContractData,
      eximData,
      quoteData: realQuoteData,
      rfqData: realRfqData,
      onlineData,
      adminCurrSym,
    }
  }

  // Helper function to render different chart types
  const renderChart = (
    data: any[],
    type: string,
    dataKey1: string,
    dataKey2: string,
    color1: string,
    color2: string,
    xAxisKey: string,
    xAxisLabel: string,
    yLeftLabel: string,
    yRightLabel: string,
    currSym: string = '₹',
  ) => {
    const commonTooltip = (value: any, name: string) => [
      name === dataKey1 ? `${currSym}${Number(value).toFixed(2)}` : `${value} pcs`,
      name === dataKey1 ? 'Price' : 'Quantity'
    ]

    const xLabel = xAxisLabel
    const isCurrencyLeft = /price|rate/i.test(yLeftLabel) || /price|rate/i.test(dataKey1)
    const isCurrencyRight = /price|rate/i.test(yRightLabel) || /price|rate/i.test(dataKey2)
    const fmtCurrency = (n: number) => `${currSym}${Number(n).toFixed(0)}`
    const leftTickFormatter = (v: any) => (isCurrencyLeft ? fmtCurrency(v) : v)
    const rightTickFormatter = (v: any) => (isCurrencyRight ? fmtCurrency(v) : v)
    const hasSecondSeries = Boolean(dataKey2) && data.some((d) => d[dataKey2 as keyof typeof d] !== undefined)
    const xAxisProps = {
      dataKey: xAxisKey,
      tick: { fontSize: 10, fill: '#475569' },
      angle: -25,
      textAnchor: 'end' as const,
      interval: 0,
    } as const
    const yLeftProps = {
      yAxisId: 'left',
      orientation: 'left' as const,
      tick: { fontSize: 12, fill: '#475569' },
      tickFormatter: leftTickFormatter,
    }
    const yRightProps = {
      yAxisId: 'right',
      orientation: 'right' as const,
      tick: { fontSize: 12, fill: '#475569' },
      tickFormatter: rightTickFormatter,
    }

    // Format value for permanent labels on data points
    const fmtLabel = (isCurrency: boolean) => (v: any) => {
      const n = Number(v)
      if (isNaN(n)) return ''
      return isCurrency ? `${currSym}${n.toFixed(0)}` : `${n}`
    }
    const labelStyle1 = { fontSize: 9, fill: color1, fontWeight: 600 }
    const labelStyle2 = { fontSize: 9, fill: color2, fontWeight: 600 }

    // Label just above the bar top — also records bar top y for pointLabel
    const barLabel = (isCurrency: boolean, color: string) => (props: any) => {
      const { x, y, width, value, index } = props
      const n = Number(value)
      if (isNaN(n)) return null
      if (index !== undefined) barTops[index] = y
      const text = isCurrency ? `${currSym}${n.toFixed(0)}` : `${n}`
      const cx = x + (width || 0) / 2
      const ty = y - 8
      return (
        <g>
          <rect x={cx - 16} y={ty - 10} width={32} height={13} rx={2} fill="white" fillOpacity={0.85} />
          <text x={cx} y={ty} textAnchor="middle" fontSize={9} fontWeight={700} fill={color}>
            {text}
          </text>
        </g>
      )
    }

    // Label for line points — white bg so it pops off the line, placed above bars if inside
    const barTops: Record<number, number> = {}
    const pointLabel = (isCurrency: boolean, color: string) => (props: any) => {
      const { x, y, value, index } = props
      const n = Number(value)
      if (isNaN(n)) return null
      const text = isCurrency ? `${currSym}${n.toFixed(0)}` : `${n}`
      const barTopY = barTops[index ?? -1]
      // If dot is inside/below a bar, place label above the bar; otherwise above the dot
      const rawY = (barTopY !== undefined && y >= barTopY) ? barTopY - 18 : y - 18
      const chartTop = (props.viewBox?.y ?? 5) + 4
      const finalY = Math.max(chartTop, rawY)
      return (
        <g>
          <rect x={x - 18} y={finalY - 10} width={36} height={14} rx={3} fill="white" stroke={color} strokeWidth={0.5} />
          <text x={x} y={finalY} textAnchor="middle" fontSize={9} fontWeight={700} fill={color}>
            {text}
          </text>
        </g>
      )
    }

    // Legend entry names
    const legendName1 = yLeftLabel || dataKey1
    const legendName2 = yRightLabel || dataKey2
    const legendPayload = [
      { value: legendName1, type: 'line' as const, color: color1 },
      ...(hasSecondSeries ? [{ value: legendName2, type: 'rect' as const, color: color2 }] : []),
    ]

    switch (type) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 28, right: 20, bottom: 45, left: 18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis {...xAxisProps} tickLine={false} axisLine={false} height={50} />
            <YAxis {...yLeftProps} tickLine={false} axisLine={false}>
              <RechartsLabel value={yLeftLabel} angle={-90} position="insideLeft" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </YAxis>
            <YAxis {...yRightProps} tickLine={false} axisLine={false}>
              <RechartsLabel value={yRightLabel} angle={-90} position="insideRight" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </YAxis>
            <Legend payload={legendPayload} verticalAlign="bottom" wrapperStyle={{ fontSize: 11, paddingTop: 12 }} iconSize={10} />
            <Tooltip formatter={commonTooltip} contentStyle={{ fontSize: '11px', padding: '6px 8px' }} />
            <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey={dataKey1} stroke={color1} strokeWidth={1.75} dot={{ r: 3, fill: color1, stroke: '#fff', strokeWidth: 1.5 }}>
              <LabelList dataKey={dataKey1} content={pointLabel(isCurrencyLeft, color1)} />
            </Line>
            <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey={dataKey2} stroke={color2} strokeWidth={1.5} dot={{ r: 3, fill: color2, stroke: '#fff', strokeWidth: 1.5 }}>
              <LabelList dataKey={dataKey2} content={pointLabel(isCurrencyRight, color2)} />
            </Line>
          </ComposedChart>
          </ResponsiveContainer>
        )
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 28, right: 20, bottom: 45, left: 18 }} barCategoryGap={"20%"} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis {...xAxisProps} tickLine={false} axisLine={false} height={50} />
            <YAxis {...yLeftProps} tickLine={false} axisLine={false}>
              <RechartsLabel value={yLeftLabel} angle={-90} position="insideLeft" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </YAxis>
            <YAxis {...yRightProps} tickLine={false} axisLine={false}>
              <RechartsLabel value={yRightLabel} angle={-90} position="insideRight" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </YAxis>
            <Legend payload={legendPayload} verticalAlign="bottom" wrapperStyle={{ fontSize: 11, paddingTop: 12 }} iconSize={10} />
            <Tooltip formatter={commonTooltip} contentStyle={{ fontSize: '11px', padding: '6px 8px' }} />
            <Bar isAnimationActive={false} yAxisId="left" dataKey={dataKey1} fill={color1} barSize={35} radius={[3,3,0,0]}>
              <LabelList dataKey={dataKey1} content={barLabel(isCurrencyLeft, color1)} />
            </Bar>
            {hasSecondSeries && (
              <Bar isAnimationActive={false} yAxisId="right" dataKey={dataKey2} fill={color2} barSize={35} radius={[3,3,0,0]}>
                <LabelList dataKey={dataKey2} content={barLabel(isCurrencyRight, color2)} />
              </Bar>
            )}
          </ComposedChart>
          </ResponsiveContainer>
        )
      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 28, right: 20, bottom: 45, left: 18 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis {...xAxisProps} tickLine={false} axisLine={false} height={50} />
            <YAxis {...yLeftProps}>
              <RechartsLabel value={`Price (${currSym})`} angle={-90} position="insideLeft" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </YAxis>
            <YAxis {...yRightProps}>
              <RechartsLabel value="Quantity (pcs)" angle={-90} position="insideRight" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </YAxis>
            <Legend payload={legendPayload} verticalAlign="bottom" wrapperStyle={{ fontSize: 11, paddingTop: 12 }} iconSize={10} />
            <Tooltip formatter={commonTooltip} contentStyle={{ fontSize: '11px', padding: '6px 8px' }} />
            <Area yAxisId="left" type="monotone" dataKey={dataKey1} stroke={color1} fill={color1} fillOpacity={0.6}>
              <LabelList dataKey={dataKey1} content={barLabel(isCurrencyLeft, color1)} />
            </Area>
            <Line yAxisId="right" type="monotone" dataKey={dataKey2} stroke={color2} strokeWidth={2} dot={{ r: 3, fill: color2, stroke: '#fff', strokeWidth: 1.5 }}>
              <LabelList dataKey={dataKey2} content={pointLabel(isCurrencyRight, color2)} />
            </Line>
          </ComposedChart>
          </ResponsiveContainer>
        )
      default: // composed (bars + line) — used for all 5 modules
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 28, right: 20, bottom: 45, left: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis {...xAxisProps} tickLine={false} axisLine={false} height={50} />
              <YAxis {...yLeftProps}>
                <RechartsLabel value={yLeftLabel} angle={-90} position="insideLeft" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
              </YAxis>
              <YAxis {...yRightProps}>
                <RechartsLabel value={yRightLabel} angle={-90} position="insideRight" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
              </YAxis>
              <Legend payload={[
                { value: legendName1, type: 'line' as const, color: color1 },
                { value: legendName2, type: 'square' as const, color: color2 },
              ]} verticalAlign="bottom" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconSize={10} />
              <Tooltip formatter={commonTooltip} contentStyle={{ fontSize: '11px', padding: '6px 8px' }} />
              <Bar isAnimationActive={false} yAxisId="right" dataKey={dataKey2} fill={color2} barSize={35} radius={[3,3,0,0]}>
                <LabelList dataKey={dataKey2} content={barLabel(isCurrencyRight, color2)} />
              </Bar>
              <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey={dataKey1} stroke={color1} strokeWidth={1.75} dot={{ r: 3, fill: color1, stroke: '#fff', strokeWidth: 1.5 }}>
                <LabelList dataKey={dataKey1} content={pointLabel(isCurrencyLeft, color1)} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        )
    }
  }

  // Generate analytics data for the selected item
  // Re-runs when MPN history is (re)loaded or price basis changes
  const analyticsData = useMemo(() => {
    if (!selectedItemForAnalytics) return null
    return generateAnalyticsData(selectedItemForAnalytics)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemForAnalytics, analyticsMpnHistory, pricingSettings.priceBasis])

  const renderCategoryInput = () => {
    const selectedTags = String(editFormData.category || '').split(',').filter((c: string) => c.trim())

    const filteredTags = availableTags
      .filter(tag => !selectedTags.includes(tag))
      .filter(tag => tag.toLowerCase().includes(tagSearchTerm.toLowerCase()))

    return (
      <div className="space-y-2">
        {/* Selected Tags */}
        <div className="flex flex-wrap items-center gap-2 min-h-[36px] p-2 bg-white border border-gray-300 rounded-md">
          {selectedTags.length === 0 ? (
            <span className="text-gray-500 text-sm">No tags selected</span>
          ) : (
            selectedTags.map((cat: string, index: number) => (
              <Badge key={index} variant="outline" className="flex items-center gap-2 pl-3 pr-2 py-1 bg-blue-100 border-blue-300 text-blue-900">
                <span className="font-medium">{cat}</span>
                <button
                  onClick={() => {
                    const newCategories = selectedTags.filter((_, i) => i !== index)
                    setEditFormData({ ...editFormData, category: newCategories.join(',') })
                  }}
                  className="rounded-full hover:bg-blue-200 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>

        {/* Searchable Tag Selector */}
        <div className="relative">
          <Input
            placeholder="Type to search and add tags..."
            value={tagSearchTerm}
            onChange={(e) => setTagSearchTerm(e.target.value)}
            onBlur={() => setTimeout(() => setTagSearchTerm(""), 200)}
            className="border-gray-400 bg-white pr-10"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

          {/* Dropdown appears ONLY when typing */}
          {tagSearchTerm.length > 0 && (
            <div className="absolute z-50 w-full mt-1 border-2 border-gray-300 rounded-md bg-white max-h-[180px] overflow-y-auto shadow-lg">
              {filteredTags.length === 0 ? (
                <div className="p-2 text-sm text-gray-500 text-center">
                  No tags match "{tagSearchTerm}"
                </div>
              ) : (
                <div className="py-1">
                  {filteredTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        if (!selectedTags.includes(tag)) {
                          setEditFormData({ ...editFormData, category: [...selectedTags, tag].join(',') })
                          setTagSearchTerm("")
                        }
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-100 focus:outline-none"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500">
          {availableTags.length} tag{availableTags.length !== 1 ? 's' : ''} available
        </p>
      </div>
    )
  }

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <div className="text-xl font-semibold text-gray-700">Loading Project Data...</div>
          <div className="text-sm text-gray-500">Fetching items from Factwise</div>
        </div>
      </div>
    )
  }

  // Handle back button click
  const handleBackClick = () => {
    // Check if opened from popup (sessionStorage)
    const returnUrl = typeof window !== 'undefined' ? sessionStorage.getItem('returnUrl') : null

    if (returnUrl) {
      console.log('[Dashboard] Navigating back to:', returnUrl)
      console.log('[Dashboard] sessionStorage flags:', {
        openAddItemPopup: sessionStorage.getItem('openAddItemPopup'),
        returnProjectId: sessionStorage.getItem('returnProjectId')
      })

      // Navigate back to the saved URL
      // The sessionStorage flags will be read by ProjectCreationPage to reopen the popup
      window.location.href = returnUrl
    } else {
      console.log('[Dashboard] No returnUrl found, using history.back()')
      // Fallback: go back in history
      window.history.back()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back Button - Top Left */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackClick}
            className="flex items-center gap-2 hover:bg-gray-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Project
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="mb-4">
            {/* Project Information - spans 2 columns on large screens */}
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Procurement Strategy</h1>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex items-center gap-2 bg-transparent"
                  title="Settings"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-0">
            {/* Project Information - spans exactly half the width */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h3 className="text-base font-semibold text-gray-900 mb-3">Project Information</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-gray-500">Name:</span>
                  <p className="font-medium text-gray-900 text-sm">{projectData.name}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">ID:</span>
                  <p className="font-medium text-gray-900">{projectData.id}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Customer:</span>
                  <p className="font-medium text-gray-900 text-sm">{projectData.customer || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Status:</span>
                  <Badge className="ml-1 bg-green-50 text-green-700 border-green-200 text-xs">
                    {projectData.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Deadline:</span>
                  <p className="font-medium text-gray-900 text-sm">{projectData.deadline || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* All 4 metrics in a 2x2 grid - spans exactly half the width */}
            <div className="grid grid-cols-2 gap-4">
              {dynamicMetrics.map((metric, index) => {
                const Icon = metric.icon
                const TrendIcon = metric.trendIcon
                const content = (
                  <div key={index} className={`rounded-lg shadow-sm ${metric.bgColor} p-3`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-xs font-medium ${metric.textColor}`}>{metric.label}</p>
                        <p className={`text-lg font-bold ${metric.valueColor}`}>{metric.value}</p>
                        <div className="flex items-center mt-1">
                          <TrendIcon
                            className={`h-3 w-3 ${metric.trendValue.startsWith("+") ? "text-green-500" : "text-red-500"}`}
                          />
                          <span
                            className={`text-xs font-medium ml-1 ${metric.trendValue.startsWith("+") ? "text-green-600" : "text-red-600"}`}
                          >
                            {metric.trendValue}
                          </span>
                        </div>
                      </div>
                      <Icon className={`h-5 w-5 ${metric.iconColor}`} />
                    </div>
                  </div>
                )

                // Wrap with tooltip if tooltip text exists
                return metric.tooltip ? (
                  <UiTooltip key={index}>
                    <UiTooltipTrigger asChild>
                      {content}
                    </UiTooltipTrigger>
                    <UiTooltipContent>
                      <p>{metric.tooltip}</p>
                    </UiTooltipContent>
                  </UiTooltip>
                ) : content
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6 mt-8">
            <div
              className={`p-3 rounded-lg border-2 cursor-pointer transition-all bg-gradient-to-br from-red-50 to-red-100 flex-1 min-w-[200px] ${
                activeFilter === "prices" ? "border-red-500 shadow-md" : "border-red-200 hover:border-red-300"
              }`}
              onClick={() => handleFilterClick("prices")}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-red-900 text-sm">Prices</h3>
                  <p className="text-xs text-red-700">
                    Pending: {filterMetrics.prices.pending} / Identified: {filterMetrics.prices.identified}
                  </p>
                </div>
                <DollarSign className="h-4 w-4 text-red-600 flex-shrink-0" />
              </div>
              {activeFilter === "prices" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFilterReverse("prices")
                  }}
                  className="w-full mt-2 bg-white/50 border-red-300 text-red-700 hover:bg-white/70 text-xs h-7"
                >
                  {reverseFilter ? <ToggleRight className="h-3 w-3 mr-1" /> : <ToggleLeft className="h-3 w-3 mr-1" />}
                  {reverseFilter ? "Show Pending" : "Show Identified"}
                </Button>
              )}
            </div>

            <div
              className={`p-3 rounded-lg border-2 cursor-pointer transition-all bg-gradient-to-br from-indigo-50 to-indigo-100 flex-1 min-w-[200px] ${
                activeFilter === "actions" ? "border-indigo-500 shadow-md" : "border-indigo-200 hover:border-indigo-300"
              }`}
              onClick={() => handleFilterClick("actions")}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-indigo-900 text-sm">Next Action</h3>
                  <p className="text-xs text-indigo-700">
                    Pending: {filterMetrics.actions.pending} / Defined: {filterMetrics.actions.defined}
                  </p>
                </div>
                <FileText className="h-4 w-4 text-indigo-600 flex-shrink-0" />
              </div>
              {activeFilter === "actions" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFilterReverse("actions")
                  }}
                  className="w-full mt-2 bg-white/50 border-indigo-300 text-indigo-700 hover:bg-white/70 text-xs h-7"
                >
                  {reverseFilter ? <ToggleRight className="h-3 w-3 mr-1" /> : <ToggleLeft className="h-3 w-3 mr-1" />}
                  {reverseFilter ? "Show Pending" : "Show Defined"}
                </Button>
              )}
            </div>

            <div
              className={`p-3 rounded-lg border-2 cursor-pointer transition-all bg-gradient-to-br from-cyan-50 to-cyan-100 flex-1 min-w-[200px] ${
                activeFilter === "users" ? "border-cyan-500 shadow-md" : "border-cyan-200 hover:border-cyan-300"
              }`}
              onClick={() => handleFilterClick("users")}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-cyan-900 text-sm">Users</h3>
                  <p className="text-xs text-cyan-700">
                    Pending: {filterMetrics.users.pending} / Assigned: {filterMetrics.users.assigned}
                  </p>
                </div>
                <Users className="h-4 w-4 text-cyan-600 flex-shrink-0" />
              </div>
              {activeFilter === "users" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFilterReverse("users")
                  }}
                  className="w-full mt-2 bg-white/50 border-cyan-300 text-cyan-700 hover:bg-white/70 text-xs h-7"
                >
                  {reverseFilter ? <ToggleRight className="h-3 w-3 mr-1" /> : <ToggleLeft className="h-3 w-3 mr-1" />}
                  {reverseFilter ? "Show Pending" : "Show Assigned"}
                </Button>
              )}
            </div>

            <div
              className={`p-3 rounded-lg border-2 cursor-pointer transition-all bg-gradient-to-br from-amber-50 to-amber-100 flex-1 min-w-[200px] ${
                activeFilter === "vendors" ? "border-amber-500 shadow-md" : "border-amber-200 hover:border-amber-300"
              }`}
              onClick={() => handleFilterClick("vendors")}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-amber-900 text-sm">Vendors</h3>
                  <p className="text-xs text-amber-700">
                    Missing: {filterMetrics.vendors.missing} / Assigned: {filterMetrics.vendors.assigned}
                  </p>
                </div>
                <Building2 className="h-4 w-4 text-amber-600 flex-shrink-0" />
              </div>
              {activeFilter === "vendors" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFilterReverse("vendors")
                  }}
                  className="w-full mt-2 bg-white/50 border-amber-300 text-amber-700 hover:bg-white/70 text-xs h-7"
                >
                  {reverseFilter ? <ToggleRight className="h-3 w-3 mr-1" /> : <ToggleLeft className="h-3 w-3 mr-1" />}
                  {reverseFilter ? "Show Missing" : "Show Assigned"}
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 mb-4">
            {/* Search bar on the left */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* All filters on the right */}
            <div className="flex items-center gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={`w-40 justify-between ${
                      vendorFilter.length > 0 && vendorFilter.length < vendorOptions.length
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : ""
                    }`}
                  >
                    {vendorFilter.length === 0 || vendorFilter.length === vendorOptions.length
                      ? "All Vendors"
                      : vendorFilter.length === 1
                        ? vendorFilter[0] === "tbd"
                          ? "TBD"
                          : vendorFilter[0]
                        : `${vendorFilter.length} selected`}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start" className="w-40 p-0">
                  <div className="p-2 space-y-1">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded border-b border-gray-200">
                      <input
                        type="checkbox"
                        checked={vendorFilter.length === vendorOptions.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setVendorFilter(vendorOptions.map((v) => (v === 'TBD' ? 'tbd' : v)))
                          } else {
                            setVendorFilter([])
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Select All</span>
                    </label>
                    {vendorOptions.map((vendor) => (
                      <label
                        key={vendor}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={vendorFilter.includes(vendor === "TBD" ? "tbd" : vendor)}
                          onChange={(e) => {
                            const value = vendor === "TBD" ? "tbd" : vendor
                            if (e.target.checked) {
                              setVendorFilter([...vendorFilter, value])
                            } else {
                              setVendorFilter(vendorFilter.filter((v) => v !== value))
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{vendor}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={`w-40 justify-between ${
                      actionFilter.length > 0 && actionFilter.length < actionOptions.length
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : ""
                    }`}
                  >
                    {actionFilter.length === 0 || actionFilter.length === actionOptions.length
                      ? "All Actions"
                      : actionFilter.length === 1
                        ? actionFilter[0]
                        : `${actionFilter.length} selected`}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start" className="w-40 p-0">
                  <div className="p-2 space-y-1">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded border-b border-gray-200">
                      <input
                        type="checkbox"
                        checked={actionFilter.length === actionOptions.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setActionFilter(actionOptions)
                          } else {
                            setActionFilter([])
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Select All</span>
                    </label>
                    {actionOptions.map((action) => (
                      <label
                        key={action}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={actionFilter.includes(action)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setActionFilter([...actionFilter, action])
                            } else {
                              setActionFilter(actionFilter.filter((a) => a !== action))
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{action}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={`w-40 justify-between ${
                      assignedFilter.length > 0 && assignedFilter.length < assignedOptions.length
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : ""
                    }`}
                  >
                    {assignedFilter.length === 0 || assignedFilter.length === assignedOptions.length
                      ? "All Assigned"
                      : assignedFilter.length === 1
                        ? assignedFilter[0] === "unassigned"
                          ? "Unassigned"
                          : assignedFilter[0]
                        : `${assignedFilter.length} selected`}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start" className="w-40 p-0">
                  <div className="p-2 space-y-1">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded border-b border-gray-200">
                      <input
                        type="checkbox"
                        checked={assignedFilter.length === assignedOptions.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAssignedFilter(assignedOptions.map((x) => (x === 'Unassigned' ? 'unassigned' : x)))
                          } else {
                            setAssignedFilter([])
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Select All</span>
                    </label>
                    {assignedOptions.map((assigned) => (
                      <label
                        key={assigned}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={assignedFilter.includes(assigned === "Unassigned" ? "unassigned" : assigned)}
                          onChange={(e) => {
                            const value = assigned === "Unassigned" ? "unassigned" : assigned
                            if (e.target.checked) {
                              setAssignedFilter([...assignedFilter, value])
                            } else {
                              setAssignedFilter(assignedFilter.filter((a) => a !== value))
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{assigned}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={`w-40 justify-between ${
                      categoryFilter.length > 0 && categoryFilter.length < allTags.length
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : ""
                    }`}
                  >
                    {categoryFilter.length === 0 || categoryFilter.length === allTags.length
                      ? "All Categories"
                      : categoryFilter.length === 1
                        ? categoryFilter[0]
                        : `${categoryFilter.length} selected`}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start" className="w-40 p-0">
                  <div className="p-2 space-y-1">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded border-b border-gray-200">
                      <input
                        type="checkbox"
                        checked={categoryFilter.length === allTags.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCategoryFilter(allTags)
                          } else {
                            setCategoryFilter([])
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Select All</span>
                    </label>
                    {allTags.map((category) => (
                      <label
                        key={category}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={categoryFilter.includes(category)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCategoryFilter([...categoryFilter, category])
                            } else {
                              setCategoryFilter(categoryFilter.filter((c) => c !== category))
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{category}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Second row with action buttons */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              {/* Auto Assign Users */}
              <Button
                variant="outline"
                className="flex items-center gap-2 bg-transparent"
                onClick={() => {
                  console.log('Auto Assign Users clicked')
                  setShowAssignUsersPopup(true)
                }}
              >
                <Users className="h-4 w-4" />
                Auto Assign Users
              </Button>

              {/* Auto Fill Prices */}
              <Button
                variant="outline"
                className="flex items-center gap-2 bg-transparent"
                onClick={() => {
                  setShowFillPricesPopup(true)
                }}
              >
                <DollarSign className="h-4 w-4" />
                Auto Fill Prices
              </Button>

              {/* Load Pricing (pricing repo v2) — split button with settings dropdown */}
              <PricingLookupSettingsButton
                variant="split"
                settings={pricingSettings}
                onChange={updatePricingSettings}
                loading={pricingLookup.loading}
                enabled={pricingEnabled}
                onLoadPricing={() => {
                  if (pricingEnabled) {
                    pricingLookup.refetch()
                  } else {
                    setPricingEnabled(true)
                  }
                }}
              />

              {/* Price basis quick switcher — instantly re-fetches with new basis */}
              {pricingEnabled && (
                <Select
                  value={pricingSettings.priceBasis}
                  onValueChange={(v) =>
                    updatePricingSettings({ ...pricingSettings, priceBasis: v as any })
                  }
                >
                  <SelectTrigger className="h-9 w-[170px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="effective_rate" className="text-xs">Effective Rate</SelectItem>
                    <SelectItem value="rate" className="text-xs">Base Rate</SelectItem>
                    <SelectItem value="quoted_rate" className="text-xs">Quoted Rate</SelectItem>
                    <SelectItem value="landed_rate" className="text-xs">Landed Rate (RFQ only)</SelectItem>
                    <SelectItem value="total_item_cost" className="text-xs">Total Item Cost</SelectItem>
                    <SelectItem value="landed_total" className="text-xs">Landed Total (RFQ only)</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* Assign Actions */}
              <Button
                variant="outline"
                className="flex items-center gap-2 bg-transparent"
                onClick={() => {
                  console.log('Assign Actions clicked')
                  setShowAssignActionsPopup(true)
                }}
              >
                <CheckSquare className="h-4 w-4" />
                Assign Actions
              </Button>

              {/* Edit Selected Items */}
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white h-8 flex items-center gap-2"
                onClick={handleOpenEdit}
                title="Edit Selected Items"
                disabled={selectedItems.length === 0}
              >
                <Edit className="h-3 w-3" />
                Edit {selectedItems.length > 0 ? `(${selectedItems.length})` : ''}
              </Button>

              {/* Export CSV Button */}
              <Button
                variant="outline"
                className="flex items-center gap-2 bg-transparent"
                onClick={handleExportCSV}
                title={`Export ${filteredAndSortedItems.length} items to CSV`}
              >
                <Download className="h-4 w-4" />
                Export CSV {filteredAndSortedItems.length > 0 ? `(${filteredAndSortedItems.length})` : ''}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {/* Eye Button - Column Visibility Toggle */}
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 bg-transparent"
                  title="Show/Hide Columns"
                  onClick={() => {
                    console.log('Eye button clicked')
                    const dropdown = document.getElementById('column-visibility-dropdown')
                    if (dropdown) {
                      dropdown.classList.toggle('hidden')
                    }
                  }}
                >
                  <Eye className="h-3 w-3 text-gray-600" />
                </Button>
                <div
                  id="column-visibility-dropdown"
                  className="hidden absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50"
                >
                  <div className="p-2 space-y-1">
                    {Object.entries(columnLabels)
                    .filter(([columnKey]) => {
                      // Always show distributor columns in the menu
                      return true
                    })
                    .map(([columnKey, label]) => {
                      const isAlwaysVisible = columnKey === 'totalPrice' || columnKey === 'source'
                      return (
                        <div
                          key={columnKey}
                          className={`flex items-center space-x-2 p-1 rounded ${
                            isAlwaysVisible ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'
                          }`}
                          onClick={() => {
                            if (!isAlwaysVisible) {
                              console.log('Column clicked:', columnKey)
                              toggleColumnVisibility(columnKey)
                            }
                          }}
                        >
                          {hiddenColumns.includes(columnKey) ? (
                            <EyeOff className="h-3 w-3 text-gray-400" />
                          ) : (
                            <Eye className="h-3 w-3 text-blue-600" />
                          )}
                          <span className={`text-xs ${hiddenColumns.includes(columnKey) ? 'text-gray-400' : 'text-gray-900'}`}>
                            {label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Save Button - View Persistence */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 bg-transparent"
                onClick={saveCurrentView}
                title="Save View"
              >
                <Save className="h-3 w-3" />
              </Button>

              {/* View Selector Dropdown */}
              <Select value={currentView} onValueChange={loadView}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  {Object.keys(savedViews).map((viewName) => (
                    <SelectItem key={viewName} value={viewName}>
                      {viewName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

            </div>
          </div>

          {/* Digikey Progress Banner */}
          {digikeyJob && (digikeyJob.status === 'processing' || digikeyJob.status === 'pending') && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                  <div>
                    <div className="font-medium text-blue-900">
                      {digikeyJob.status === 'pending' ? 'Preparing Digikey pricing...' : 'Fetching Digikey pricing...'}
                    </div>
                    <div className="text-sm text-blue-700">
                      {digikeyJob.processed_items || 0}/{digikeyJob.total_items} items processed
                      ({digikeyJob.progress_percentage?.toFixed(1) || 0}%)
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-64 h-2 bg-blue-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${digikeyJob.progress_percentage || 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mouser Progress Banner */}
          {mouserJob && (mouserJob.status === 'processing' || mouserJob.status === 'pending') && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="animate-spin h-5 w-5 border-2 border-green-600 border-t-transparent rounded-full" />
                  <div>
                    <div className="font-medium text-green-900">
                      {mouserJob.status === 'pending' ? 'Preparing Mouser pricing...' : 'Fetching Mouser pricing...'}
                    </div>
                    <div className="text-sm text-green-700">
                      {mouserJob.processed_items || 0}/{mouserJob.total_items} items processed
                      ({mouserJob.progress_percentage?.toFixed(1) || 0}%)
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-64 h-2 bg-green-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-600 transition-all duration-300"
                    style={{ width: `${mouserJob.progress_percentage || 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Loading All Items Progress Banner */}
          {isLoadingAllItems && loadingProgress.total > 0 && (
            <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="animate-spin h-5 w-5 border-2 border-purple-600 border-t-transparent rounded-full" />
                  <div>
                    <div className="font-medium text-purple-900">
                      Loading all items... (fetching 3 chunks in parallel)
                    </div>
                    <div className="text-sm text-purple-700">
                      {loadingProgress.loaded}/{loadingProgress.total} items loaded
                      ({((loadingProgress.loaded / loadingProgress.total) * 100).toFixed(1)}%)
                      {loadingProgress.failed > 0 && (
                        <span className="text-red-600 ml-2">
                          ({loadingProgress.failed} chunk(s) failed, will retry)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Progress bar */}
                  <div className="w-64 h-2 bg-purple-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-600 transition-all duration-300"
                      style={{ width: `${(loadingProgress.loaded / loadingProgress.total) * 100}%` }}
                    />
                  </div>
                  {/* Cancel button */}
                  <button
                    onClick={() => { loadingAbortRef.current = true }}
                    className="text-xs px-2 py-1 text-purple-700 hover:text-purple-900 hover:bg-purple-100 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading Error / Retry Banner */}
          {loadingError && !isLoadingAllItems && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <div>
                    <div className="font-medium text-red-900">Loading incomplete</div>
                    <div className="text-sm text-red-700">{loadingError.message}</div>
                  </div>
                </div>
                {loadingError.canRetry && (
                  <button
                    onClick={retryFailedChunks}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Retry Failed
                  </button>
                )}
              </div>
            </div>
          )}

          {(autoAssignProgress.isRunning || autoAssignProgress.phase === 'done' || autoAssignProgress.phase === 'cancelled') && (
            <div className="mb-3 flex items-center gap-3 px-2 py-2 rounded bg-gray-50 border text-sm">
              {autoAssignProgress.isRunning && (
                <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full flex-shrink-0" />
              )}
              <span className="text-gray-700 flex-1">
                {autoAssignProgress.phase === 'fetching' && 'Loading rules...'}
                {autoAssignProgress.phase === 'evaluating' && `Evaluating ${autoAssignProgress.current}/${autoAssignProgress.total} items...`}
                {autoAssignProgress.phase === 'assigning' && 'Assigning users...'}
                {autoAssignProgress.phase === 'done' && `Done — ${autoAssignProgress.matchedItems} items, ${autoAssignProgress.assignmentsCount} assignments`}
                {autoAssignProgress.phase === 'cancelled' && 'Cancelled — no changes made'}
              </span>
              {autoAssignProgress.isRunning && (
                <button onClick={() => { autoAssignAbortRef.current = true }} className="text-xs text-red-600 hover:text-red-800 font-medium">Cancel</button>
              )}
              {!autoAssignProgress.isRunning && (
                <button onClick={() => setAutoAssignProgress(prev => ({ ...prev, phase: 'fetching' as const, log: [], isRunning: false, matchedItems: 0, assignmentsCount: 0 }))} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
              )}
            </div>
          )}

          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]" style={{ position: 'relative' }}>
            <style>{`
              .dtbl td, .dtbl th { box-sizing: border-box; }
              .dtbl td > div, .dtbl td > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
              .pin { position: sticky !important; }
              .pin-edge { box-shadow: 4px 0 6px -2px rgba(0,0,0,0.15); }
            `}</style>
            <table className="border-collapse dtbl" style={{ minWidth: '100%' }}>
              <thead className="sticky top-0 z-30">
                <tr>
                  <th className="pin p-2 text-left font-medium text-gray-700 text-xs bg-gray-50 z-40 border-b border-gray-200" style={{ width: 40, minWidth: 40, maxWidth: 40, left: 0 }}>
                    <input
                      type="checkbox"
                      checked={
                        selectedItems.length === filteredAndSortedItems.length && filteredAndSortedItems.length > 0
                      }
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  {visibleColumns.map((columnKey, colIndex) => {
                    const isNumeric = columnKey === "quantity" || columnKey === "unitPrice" || columnKey === "totalPrice"
                    const isSticky = colIndex === 0 || colIndex === 1
                    const isLastSticky = colIndex === 1
                    const col0W = columnWidths[visibleColumns[0]] || 130
                    const frozenLeft = colIndex === 0 ? 40 : colIndex === 1 ? 40 + col0W : 0
                    const w = columnWidths[columnKey] || 100
                    return (
                      <th
                        key={columnKey}
                        className={`p-2 font-medium text-gray-700 text-xs relative group whitespace-nowrap select-none bg-gray-50 border-b border-gray-200 ${
                          isNumeric ? "text-right" : "text-left"
                        } ${isSticky ? "pin z-40" : ""} ${isLastSticky ? "pin-edge" : ""}`}
                        style={{
                          width: w,
                          minWidth: w,
                          maxWidth: w,
                          ...(isSticky ? { left: frozenLeft } : {}),
                        }}
                        draggable
                        onDragStart={(e) => {
                          if (isResizing) {
                            e.preventDefault()
                            return
                          }
                          setDraggedColumn(columnKey)
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggedColumn && draggedColumn !== columnKey) {
                            handleColumnDrag(draggedColumn, columnKey)
                          }
                          setDraggedColumn(null)
                        }}
                      >
                        <div className="flex items-center justify-between w-full">
                          <button
                            onClick={() => handleSort(columnKey)}
                            className={`flex items-center gap-1 hover:text-gray-900 ${
                              isNumeric ? "ml-auto" : ""
                            }`}
                          >
                            {columnLabels[columnKey as keyof typeof columnLabels]}
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                          <GripVertical className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 cursor-grab flex-shrink-0 ml-2" />
                        </div>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize hover:bg-blue-400/40"
                          onMouseDown={(e) => handleMouseDown(columnKey, e)}
                          style={{ zIndex: 10 }}
                        />
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-100">
        {paginatedItems.map((item: any) => (
          <tr key={item.id} className="hover:bg-gray-50 transition-colors group/row">
                    <td className="pin p-2 z-10 bg-white group-hover/row:bg-gray-50" style={{ width: 40, minWidth: 40, maxWidth: 40, left: 0 }}>
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => handleSelectItem(item.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    {visibleColumns.map((columnKey, colIndex) => {
                      const value = item[columnKey as keyof typeof item]
                      const isStickyCol = colIndex === 0 || colIndex === 1
                      const isLastStickyCol = colIndex === 1
                      const col0W = columnWidths[visibleColumns[0]] || 130
                      const frozenLeftVal = colIndex === 0 ? 40 : colIndex === 1 ? 40 + col0W : 0
                      const cellW = columnWidths[columnKey] || 100
                      const stickyClass = isStickyCol ? `pin z-10 bg-white group-hover/row:bg-gray-50${isLastStickyCol ? " pin-edge" : ""}` : ""
                      const stickyStyle: React.CSSProperties = isStickyCol
                        ? { left: frozenLeftVal, width: cellW, minWidth: cellW, maxWidth: cellW }
                        : { width: cellW, minWidth: cellW, maxWidth: cellW }

                      if (columnKey === "customer") {
                        return (
                          <td key={columnKey} className="p-2 text-left" style={stickyStyle}>
                            <div className="flex items-center">
                              <span
                                className="font-medium text-gray-900 text-xs truncate"
                                title={item.customer}
                              >
                                {item.customer}
                              </span>
                            </div>
                          </td>
                        )
                      }

                      if (columnKey === "itemId") {
                        return (
                          <td key={columnKey} className={`p-2 text-left ${stickyClass}`} style={{ ...stickyStyle }}>
                            <div className="flex items-center gap-1">
                              <span
                                className="font-mono text-xs text-gray-600 bg-gray-100 px-1 py-0.5 rounded"
                                title={item.itemId}
                              >
                                {item.itemId}
                              </span>
                            </div>
                          </td>
                        )
                      }

                      if (columnKey === "description") {
                        const altInfo = item.alternate_info || {}
                        const isParent = altInfo.has_alternates
                        const isAlternate = altInfo.is_alternate

                        return (
                          <td key={columnKey} className={`p-2 text-left ${stickyClass}`} style={{ ...stickyStyle }}>
                            <div className="flex items-center gap-2">
                              {/* Alternate indicator - show indent and icon */}
                              {isAlternate && (
                                <UiTooltip>
                                  <UiTooltipTrigger>
                                    <span className="text-blue-500 flex-shrink-0">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="16 3 21 3 21 8"></polyline>
                                        <line x1="4" y1="20" x2="21" y2="3"></line>
                                        <polyline points="21 16 21 21 16 21"></polyline>
                                        <line x1="15" y1="15" x2="21" y2="21"></line>
                                        <line x1="4" y1="4" x2="9" y2="9"></line>
                                      </svg>
                                    </span>
                                  </UiTooltipTrigger>
                                  <UiTooltipContent>
                                    <p className="text-xs">Alternate for: <strong>{altInfo.alternate_parent_name || 'Unknown'}</strong></p>
                                    {altInfo.alternate_parent_code && (
                                      <p className="text-xs text-gray-400">({altInfo.alternate_parent_code})</p>
                                    )}
                                  </UiTooltipContent>
                                </UiTooltip>
                              )}
                              {/* Item name - bold for parents */}
                              <span
                                className={`text-gray-900 text-xs truncate block ${isParent ? 'font-bold' : 'font-medium'}`}
                                title={item.description}
                              >
                                {item.description}
                              </span>
                              {/* Parent indicator - show count of alternates */}
                              {isParent && altInfo.alternates && altInfo.alternates.length > 0 && (
                                <UiTooltip>
                                  <UiTooltipTrigger>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 flex-shrink-0">
                                      {altInfo.alternates.length} alt
                                    </span>
                                  </UiTooltipTrigger>
                                  <UiTooltipContent side="bottom" align="start">
                                    <div className="space-y-1">
                                      <p className="text-xs font-medium">Alternates:</p>
                                      {altInfo.alternates.map((alt: any, idx: number) => (
                                        <div key={alt.item_id || idx} className="text-xs">
                                          {idx + 1}. {alt.item_name || 'Unknown'}
                                          {alt.item_code && <span className="text-gray-400 ml-1">({alt.item_code})</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </UiTooltipContent>
                                </UiTooltip>
                              )}
                              {item.manuallyEdited && (
                                <UiTooltip>
                                  <UiTooltipTrigger>
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-yellow-200 text-yellow-800">
                                      Edited
                                    </span>
                                  </UiTooltipTrigger>
                                  <UiTooltipContent>
                                    <p>This item has been manually edited.</p>
                                  </UiTooltipContent>
                                </UiTooltip>
                              )}
                            </div>
                          </td>
                        )
                      }

                      if (columnKey === "internalNotes") {
                        const internalNotesText = item.internalNotes || ''
                        return (
                          <td key={columnKey} className="p-2 text-left" style={stickyStyle}>
                            {internalNotesText ? (
                              <UiTooltip>
                                <UiTooltipTrigger>
                                  <span className="text-xs text-gray-700 truncate block cursor-help">
                                    {internalNotesText}
                                  </span>
                                </UiTooltipTrigger>
                                <UiTooltipContent side="bottom" className="max-w-[400px]">
                                  <p className="text-xs whitespace-pre-wrap">{internalNotesText}</p>
                                </UiTooltipContent>
                              </UiTooltip>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                        )
                      }

                      if (columnKey === "bom") {
                        const bomInfo = (item as any).bom_info
                        return (
                          <td key={columnKey} className="p-2 text-left" style={stickyStyle}>
                            {bomInfo?.is_bom_item ? (
                              <span className="text-xs text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis block">
                                {/* Show breadcrumb path like: KDKDKD -> QASB2 (same as Factwise) */}
                                {bomInfo.bom_hierarchy && bomInfo.bom_hierarchy.length > 0
                                  ? bomInfo.bom_hierarchy.map((bom: any) => bom.bom_code).join(' → ')
                                  : (bomInfo.bom_code || '-')}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                        )
                      }

                      if (columnKey === "category") {
                        const categories = (item.category || '').split(',').filter((c: string) => c.trim())
                        const isMissing = categories.length === 0

                        return (
                          <td key={columnKey} className="p-2 text-left" style={stickyStyle}>
                            {isMissing ? (
                              <span className="text-gray-400 text-xs">-</span>
                            ) : categories.length === 1 ? (
                              <Badge variant="outline" className="border-gray-200 text-gray-700 text-xs">
                                {categories[0]}
                              </Badge>
                            ) : (
                              <UiTooltip>
                                <UiTooltipTrigger>
                                  <span className="flex items-center gap-1 cursor-pointer overflow-hidden" style={{ maxWidth: '100%' }}>
                                    <Badge variant="outline" className="border-gray-200 text-gray-700 text-xs truncate max-w-[110px]">
                                      {categories[0].trim()}
                                    </Badge>
                                    <span className="text-blue-600 font-medium text-xs hover:text-blue-800 whitespace-nowrap flex-shrink-0">
                                      +{categories.length - 1}
                                    </span>
                                  </span>
                                </UiTooltipTrigger>
                                <UiTooltipContent side="bottom" align="start">
                                  <div className="space-y-1">
                                    {categories.map((cat: string, index: number) => (
                                      <div key={index} className="text-xs">
                                        {index + 1}. {cat.trim()}
                                      </div>
                                    ))}
                                  </div>
                                </UiTooltipContent>
                              </UiTooltip>
                            )}
                          </td>
                        )
                      }

                      if (columnKey === "projectManager" || columnKey === "rfqAssignee" || columnKey === "quoteAssignee" || columnKey === "rfqResponsible" || columnKey === "quoteResponsible") {
                        const value = columnKey === "projectManager" ? projectManagers
                          : columnKey === "rfqAssignee" ? rfqAssignees  // project-level, same for all items
                          : columnKey === "quoteAssignee" ? quoteAssignees  // project-level, same for all items
                          : columnKey === "rfqResponsible" ? (item.rfqResponsibleName || '')  // per-item
                          : (item.quoteResponsibleName || '')  // per-item
                        return (
                          <td key={columnKey} className="p-2 text-left" style={stickyStyle}>
                            {value ? (
                              <UiTooltip>
                                <UiTooltipTrigger>
                                  <span className="text-xs text-gray-700 truncate block">{value}</span>
                                </UiTooltipTrigger>
                                <UiTooltipContent side="bottom">
                                  <p className="text-xs whitespace-pre-wrap">{value}</p>
                                </UiTooltipContent>
                              </UiTooltip>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                        )
                      }

                      if (columnKey === "action") {
                        return (
                          <td key={columnKey} className="p-2 text-left" style={stickyStyle}>
                            <Badge
                              className={`text-xs px-1 py-0 ${
                                item.action === "RFQ"
                                  ? "bg-blue-100 text-blue-800 border-blue-200"
                                  : item.action === "Direct PO"
                                    ? "bg-green-100 text-green-800 border-green-200"
                                    : "bg-orange-100 text-orange-800 border-orange-200"
                              }`}
                            >
                              {item.action}
                            </Badge>
                          </td>
                        )
                      }

                      if (columnKey === "vendor") {
                        // Read from custom_vendors[] (loaded via GET /custom-vendors/ or bulk-batched later)
                        // Fallback: legacy item.vendor string for items where custom_vendors hasn't been loaded yet.
                        const customVendors: CustomVendor[] = Array.isArray(item.custom_vendors) ? item.custom_vendors : []
                        const vendorNames: string[] = customVendors.length > 0
                          ? customVendors.map((v: CustomVendor) => v.vendor_name)
                          : (item.vendor ? [String(item.vendor)] : [])
                        const isMissing = vendorNames.length === 0

                        return (
                          <td key={columnKey} className="p-2 text-left" style={stickyStyle}>
                            {isMissing ? (
                              <span className="text-gray-400 text-xs">-</span>
                            ) : vendorNames.length === 1 ? (
                              <Badge variant="outline" className="border-gray-200 text-gray-700 text-xs truncate max-w-[140px]">
                                {vendorNames[0]}
                              </Badge>
                            ) : (
                              <UiTooltip>
                                <UiTooltipTrigger>
                                  <span className="flex items-center gap-1 cursor-pointer overflow-hidden" style={{ maxWidth: '100%' }}>
                                    <Badge variant="outline" className="border-gray-200 text-gray-700 text-xs truncate max-w-[110px]">
                                      {vendorNames[0]}
                                    </Badge>
                                    <span className="text-blue-600 font-medium text-xs hover:text-blue-800 whitespace-nowrap flex-shrink-0">
                                      +{vendorNames.length - 1}
                                    </span>
                                  </span>
                                </UiTooltipTrigger>
                                <UiTooltipContent side="bottom" align="start">
                                  <div className="space-y-1">
                                    {vendorNames.map((name: string, index: number) => (
                                      <div key={index} className="text-xs">
                                        {index + 1}. {name}
                                      </div>
                                    ))}
                                  </div>
                                </UiTooltipContent>
                              </UiTooltip>
                            )}
                          </td>
                        )
                      }

                      if (columnKey === "assignedTo") {
                        const assignedUsersList = item.assignedTo
                          ? String(item.assignedTo).split(',').map((u: string) => u.trim()).filter(Boolean)
                          : []
                        const isMissing = assignedUsersList.length === 0

                        return (
                          <td key={columnKey} className="p-2 text-left" style={stickyStyle}>
                            {isMissing ? (
                              <span className="text-red-700 text-xs">Unassigned</span>
                            ) : assignedUsersList.length === 1 ? (
                              <Badge variant="outline" className="text-xs">{assignedUsersList[0]}</Badge>
                            ) : (
                              <UiTooltip>
                                <UiTooltipTrigger>
                                  <span className="text-blue-600 font-medium text-xs cursor-pointer">
                                    {assignedUsersList.length}
                                  </span>
                                </UiTooltipTrigger>
                                <UiTooltipContent side="bottom" align="start">
                                  <div className="space-y-1">
                                    {assignedUsersList.map((user: string, index: number) => (
                                      <div key={index} className="text-xs">
                                        {index + 1}. {user}
                                      </div>
                                    ))}
                                  </div>
                                </UiTooltipContent>
                              </UiTooltip>
                            )}
                          </td>
                        )
                      }

                      // Special handling for Digikey pricing column
                      if (columnKey === "priceDigikey") {
                        const pricing = (item as any).digikey_pricing

                        // Currency symbol helper
                        const getCurrencySymbol = (currency: string) => {
                          const symbols: Record<string, string> = {
                            'INR': '₹',
                            'USD': '$',
                            'EUR': '€',
                            'GBP': '£',
                            'JPY': '¥',
                            'CNY': '¥',
                          }
                          return symbols[currency] || '$'
                        }

                        // Handle new status-based pricing structure
                        const pricingStatus = pricing?.status
                        const displayPrice = pricing?.quantity_price ?? pricing?.unit_price
                        // Prices are always in item currency after conversion — use item symbol directly
                        const currencySymbol = (item as any).currency?.symbol || getCurrencySymbol((item as any).currency?.code || '') || '₹'

                        // Calculate if this is the cheapest price
                        const digikeyPrice = displayPrice ? (typeof displayPrice === 'number' ? displayPrice : parseFloat(displayPrice)) : null
                        const mouserPricing = (item as any).mouser_pricing
                        const mouserPrice = mouserPricing?.status === 'available'
                          ? (mouserPricing?.quantity_price ?? mouserPricing?.unit_price)
                          : null
                        const allPricesForCheapest = [
                          (item as any).pricePO,
                          (item as any).priceContract,
                          (item as any).priceQuote,
                          digikeyPrice,
                          mouserPrice ? (typeof mouserPrice === 'number' ? mouserPrice : parseFloat(mouserPrice)) : null,
                          (item as any).priceEXIM,
                        ].filter((p): p is number => p !== null && p !== undefined && !isNaN(p) && p > 0)
                        const cheapestPrice = allPricesForCheapest.length > 0 ? Math.min(...allPricesForCheapest) : null
                        const isDigikeyCheapest = digikeyPrice !== null && cheapestPrice !== null && Math.abs(digikeyPrice - cheapestPrice) < 0.001

                        // Render based on status
                        const renderPricingContent = () => {
                          if (!pricing) {
                            return <span className="text-xs text-gray-400">-</span>
                          }

                          switch (pricingStatus) {
                            case 'fetching':
                              return <span className="text-xs text-blue-500 animate-pulse">Fetching...</span>
                            case 'pending':
                              return <span className="text-xs text-orange-500">Pending...</span>
                            case 'not_found':
                              return <span className="text-xs text-gray-400">Not Listed</span>
                            case 'error':
                              return <span className="text-xs text-red-500">API Limit</span>
                            case 'no_mpn':
                              return <span className="text-xs text-gray-400">No MPN</span>
                            case 'not_configured':
                              return <span className="text-xs text-gray-400">Not Configured</span>
                            case 'available': {
                              // Variant-aware rendering — read data.variants[] when available
                              const variants: any[] = Array.isArray(pricing?.variants) ? pricing.variants : []
                              const hasVariants = variants.length > 0
                              const preferredIdx = (hasVariants && typeof pricing?.preferred_variant_index === 'number')
                                ? pricing.preferred_variant_index
                                : 0
                              const preferred = hasVariants ? (variants[preferredIdx] || variants[0]) : null

                              // Cell price: pick price break matching item qty, else legacy unit_price
                              const itemQtyDK = parseFloat(String((item as any).quantity)) || 1
                              let cellPrice: number | null = null
                              if (preferred && Array.isArray(preferred.price_breaks) && preferred.price_breaks.length > 0) {
                                const sorted = [...preferred.price_breaks].sort((a: any, b: any) => (a.quantity ?? a.min_quantity ?? 0) - (b.quantity ?? b.min_quantity ?? 0))
                                let matched = sorted[0]
                                for (const pb of sorted) {
                                  if ((pb.quantity ?? pb.min_quantity ?? 0) <= itemQtyDK) matched = pb
                                  else break
                                }
                                cellPrice = typeof matched.unit_price === 'number' ? matched.unit_price : parseFloat(matched.unit_price)
                              } else if (displayPrice !== null && displayPrice !== undefined) {
                                cellPrice = typeof displayPrice === 'number' ? displayPrice : parseFloat(displayPrice)
                              }

                              if (cellPrice === null || isNaN(cellPrice)) {
                                return <span className="text-xs text-gray-400">N/A</span>
                              }

                              const packaging: string | null = preferred?.packaging || pricing?.packaging || null
                              const moq: number | null = preferred?.moq ?? pricing?.moq ?? null
                              const hasMultipleVariants = variants.length > 1
                              const hasAnyFee = hasVariants && variants.some((v: any) => {
                                const f = v?.reeling_fee
                                return f !== undefined && f !== null && parseFloat(String(f)) > 0
                              })

                              return (
                                <UiTooltip>
                                  <UiTooltipTrigger asChild>
                                    <div className="cursor-help flex flex-col items-end gap-0.5 leading-snug">
                                      {/* Row 1: price + fee badge + chevron */}
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-sm font-semibold ${isDigikeyCheapest ? 'text-green-700 bg-green-50 px-1.5 py-0.5 rounded' : 'text-gray-900'}`}>
                                          {currencySymbol}{cellPrice.toFixed(3)}
                                        </span>
                                        {hasAnyFee && (
                                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-px rounded">
                                            +fee
                                          </span>
                                        )}
                                        {hasMultipleVariants && (
                                          <ChevronDown className="h-3 w-3 text-gray-400" />
                                        )}
                                      </div>

                                      {/* Row 2: packaging · MOQ */}
                                      {(packaging || moq !== null) && (
                                        <div className="flex items-center gap-1 text-[11px]">
                                          {packaging && <span className="text-gray-600 truncate max-w-[100px]">{packaging}</span>}
                                          {packaging && moq !== null && <span className="text-gray-300">·</span>}
                                          {moq !== null && (
                                            <span className={moq > 1 ? 'text-amber-700 font-semibold' : 'text-gray-500'}>
                                              MOQ {moq.toLocaleString()}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </UiTooltipTrigger>
                                  <UiTooltipContent side="left" className="bg-white border border-gray-300 shadow-xl p-0">
                                    {renderDistributorTooltip(pricing, 'Digi-Key', parseFloat(String((item as any).quantity)) || 1, (item as any).currency?.symbol || '₹')}
                                  </UiTooltipContent>
                                </UiTooltip>
                              )
                            }
                            default:
                              // Backward compatibility: if no status, check if price exists
                              if (displayPrice) {
                                return (
                                  <div className="text-xs">
                                    <div className="font-semibold text-green-700">
                                      {currencySymbol}
                                      {typeof displayPrice === 'number' ? displayPrice.toFixed(3) : parseFloat(displayPrice).toFixed(3)}
                                    </div>
                                  </div>
                                )
                              }
                              return <span className="text-xs text-gray-400">-</span>
                          }
                        }

                        return (
                          <td key={columnKey} className="p-2 text-right" style={stickyStyle}>
                            {renderPricingContent()}
                          </td>
                        )
                      }

                      // Special handling for Mouser pricing column
                      if (columnKey === "priceMouser") {
                        const pricing = (item as any).mouser_pricing

                        // Currency symbol helper
                        const getCurrencySymbol = (currency: string) => {
                          const symbols: Record<string, string> = {
                            'INR': '₹',
                            'USD': '$',
                            'EUR': '€',
                            'GBP': '£',
                            'JPY': '¥',
                            'CNY': '¥',
                          }
                          return symbols[currency] || '$'
                        }

                        // Handle new status-based pricing structure
                        const pricingStatus = pricing?.status
                        const displayPrice = pricing?.quantity_price ?? pricing?.unit_price
                        const displaySavings = pricing?.savings_info
                        const displayNextTier = pricing?.next_tier_info
                        const wasConverted = pricing?.wasConverted || false
                        const originalPrice = pricing?.original_quantity_price ?? pricing?.original_unit_price
                        // Mouser prices — always show ₹
                        const currencySymbol = '₹'

                        // Calculate if this is the cheapest price
                        const mouserPrice = displayPrice ? (typeof displayPrice === 'number' ? displayPrice : parseFloat(displayPrice)) : null
                        const digikeyPricing = (item as any).digikey_pricing
                        const digikeyPrice = digikeyPricing?.status === 'available'
                          ? (digikeyPricing?.quantity_price ?? digikeyPricing?.unit_price)
                          : null
                        // Note: EXIM excluded since column is hidden
                        const allPricesForCheapest = [
                          (item as any).pricePO,
                          (item as any).priceContract,
                          (item as any).priceQuote,
                          digikeyPrice ? (typeof digikeyPrice === 'number' ? digikeyPrice : parseFloat(digikeyPrice)) : null,
                          mouserPrice,
                        ].filter((p): p is number => p !== null && p !== undefined && !isNaN(p) && p > 0)
                        const cheapestPrice = allPricesForCheapest.length > 0 ? Math.min(...allPricesForCheapest) : null
                        const isMouserCheapest = mouserPrice !== null && cheapestPrice !== null && Math.abs(mouserPrice - cheapestPrice) < 0.001

                        // Render based on status
                        const renderMouserContent = () => {
                          if (!pricing) {
                            return <span className="text-xs text-gray-400">-</span>
                          }

                          switch (pricingStatus) {
                            case 'fetching':
                              return <span className="text-xs text-blue-500 animate-pulse">Fetching...</span>
                            case 'pending':
                              return <span className="text-xs text-orange-500">Pending...</span>
                            case 'not_found':
                              return <span className="text-xs text-gray-400">Not Listed</span>
                            case 'error':
                              return <span className="text-xs text-red-500">API Limit</span>
                            case 'no_mpn':
                              return <span className="text-xs text-gray-400">No MPN</span>
                            case 'not_configured':
                              return <span className="text-xs text-gray-400">Not Configured</span>
                            case 'available': {
                              // Variant-aware rendering — read data.variants[] when available
                              const variants: any[] = Array.isArray(pricing?.variants) ? pricing.variants : []
                              const hasVariants = variants.length > 0
                              const preferredIdx = (hasVariants && typeof pricing?.preferred_variant_index === 'number')
                                ? pricing.preferred_variant_index
                                : 0
                              const preferred = hasVariants ? (variants[preferredIdx] || variants[0]) : null

                              // Cell price: pick price break matching item qty, else legacy unit_price
                              const itemQtyMouser = parseFloat(String((item as any).quantity)) || 1
                              let cellPrice: number | null = null
                              if (preferred && Array.isArray(preferred.price_breaks) && preferred.price_breaks.length > 0) {
                                const sorted = [...preferred.price_breaks].sort((a: any, b: any) => (a.quantity ?? a.min_quantity ?? 0) - (b.quantity ?? b.min_quantity ?? 0))
                                let matched = sorted[0]
                                for (const pb of sorted) {
                                  if ((pb.quantity ?? pb.min_quantity ?? 0) <= itemQtyMouser) matched = pb
                                  else break
                                }
                                cellPrice = typeof matched.unit_price === 'number' ? matched.unit_price : parseFloat(matched.unit_price)
                              } else if (displayPrice !== null && displayPrice !== undefined) {
                                cellPrice = typeof displayPrice === 'number' ? displayPrice : parseFloat(displayPrice)
                              }

                              if (cellPrice === null || isNaN(cellPrice)) {
                                return <span className="text-xs text-gray-400">N/A</span>
                              }

                              const packaging: string | null = preferred?.packaging || pricing?.packaging || null
                              const moq: number | null = preferred?.moq ?? pricing?.moq ?? null
                              const hasMultipleVariants = variants.length > 1
                              const hasAnyFee = hasVariants && variants.some((v: any) => {
                                const f = v?.reeling_fee
                                return f !== undefined && f !== null && parseFloat(String(f)) > 0
                              })

                              return (
                                <UiTooltip>
                                  <UiTooltipTrigger asChild>
                                    <div className="cursor-help flex flex-col items-end gap-0.5 leading-snug">
                                      {/* Row 1: price + fee badge + chevron */}
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-sm font-semibold ${isMouserCheapest ? 'text-green-700 bg-green-50 px-1.5 py-0.5 rounded' : 'text-gray-900'}`}>
                                          {currencySymbol}{cellPrice.toFixed(3)}
                                        </span>
                                        {hasAnyFee && (
                                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-px rounded">
                                            +fee
                                          </span>
                                        )}
                                        {hasMultipleVariants && (
                                          <ChevronDown className="h-3 w-3 text-gray-400" />
                                        )}
                                      </div>

                                      {/* Row 2: packaging · MOQ */}
                                      {(packaging || moq !== null) && (
                                        <div className="flex items-center gap-1 text-[11px]">
                                          {packaging && <span className="text-gray-600 truncate max-w-[100px]">{packaging}</span>}
                                          {packaging && moq !== null && <span className="text-gray-300">·</span>}
                                          {moq !== null && (
                                            <span className={moq > 1 ? 'text-amber-700 font-semibold' : 'text-gray-500'}>
                                              MOQ {moq.toLocaleString()}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </UiTooltipTrigger>
                                  <UiTooltipContent side="left" className="bg-white border border-gray-300 shadow-xl p-0">
                                    {renderDistributorTooltip(pricing, 'Mouser', parseFloat(String((item as any).quantity)) || 1, '₹')}
                                  </UiTooltipContent>
                                </UiTooltip>
                              )
                            }
                            default:
                              // Backward compatibility: if no status, check if price exists
                              if (displayPrice) {
                                return (
                                  <div className="text-xs">
                                    <div className="font-semibold text-green-700">
                                      {currencySymbol}
                                      {typeof displayPrice === 'number' ? displayPrice.toFixed(3) : parseFloat(displayPrice).toFixed(3)}
                                    </div>
                                  </div>
                                )
                              }
                              return <span className="text-xs text-gray-400">-</span>
                          }
                        }

                        return (
                          <td key={columnKey} className="p-2 text-right" style={stickyStyle}>
                            {renderMouserContent()}
                          </td>
                        )
                      }

                      if (columnKey === "pricePO" || columnKey === "priceContract" || columnKey === "priceQuote" || columnKey === "priceRFQ") {
                        // Real pricing repo v2 lookup — keyed by item's MPN
                        const colToSource: Record<string, PricingSourceType> = {
                          pricePO: "PO",
                          priceContract: "CONTRACT",
                          priceQuote: "QUOTE",
                          priceRFQ: "RFQ",
                        }
                        const sourceType = colToSource[columnKey]
                        const mpn = pricingLookup.itemIdToMpn.get(item.id) ?? null
                        // Waterfall lookup key: enterprise_item_id || erp_item_code || item_code
                        const lookupKey = item.enterprise_item_id || item.erp_item_code || item.itemId || null
                        const perSource = lookupKey
                          ? pricingLookup.byItemId.get(lookupKey) ?? null
                          : null
                        const record = perSource ? perSource[sourceType] ?? null : null
                        const adminPrice = record ? getAdminPrice(record, pricingSettings.priceBasis) : null

                        // Cell content
                        let cellInner: React.ReactNode
                        if (!pricingEnabled) {
                          cellInner = (
                            <span
                              className="text-xs text-gray-400 italic"
                              title="Click the gear icon and press 'Load Pricing' to fetch real prices"
                            >
                              —
                            </span>
                          )
                        } else if (!lookupKey) {
                          cellInner = <span className="text-xs text-gray-400 italic">No ID</span>
                        } else if (pricingLookup.loading && !record) {
                          cellInner = <span className="text-xs text-gray-400">…</span>
                        } else if (!record || adminPrice === null) {
                          cellInner = (
                            <span
                              className="text-xs text-gray-400"
                              title={`No ${sourceType} pricing found for ${mpn ? 'MPN ' + mpn : 'this item'} in the selected range`}
                            >
                              —
                            </span>
                          )
                        } else {
                          const sym = record.admin_currency_symbol || record.admin_currency_code || ''
                          const expired = isExpiredContract(record)
                          cellInner = (
                            <button
                              type="button"
                              className={`text-xs font-medium underline-offset-2 hover:underline focus:outline-none ${
                                expired ? "text-red-600" : "text-gray-900"
                              }`}
                              title={`${record.supplier_name || ""} • ${
                                record.pricing_datetime?.slice(0, 10) || ""
                              } — click to open in Factwise`}
                              onClick={() => setPendingNavRecord(record)}
                            >
                              {sym}
                              {adminPrice.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 4,
                              })}
                              {expired && (
                                <span className="ml-1 text-[9px] uppercase">exp</span>
                              )}
                            </button>
                          )
                        }

                        return (
                          <td key={columnKey} className="p-2 text-right" style={stickyStyle}>
                            {cellInner}
                          </td>
                        )
                      }

                      if (columnKey === "priceEXIM") {
                        // EXIM stays on the existing item-field path (not in pricing repo v2)
                        const priceValue = (item as any).priceEXIM as number | undefined
                        const hasPrice = priceValue !== undefined && priceValue > 0
                        const itemCurrencySymbol = (item as any).currency?.symbol || '₹'
                        return (
                          <td key={columnKey} className="p-2 text-right" style={stickyStyle}>
                            <span
                              className={`text-xs font-medium ${hasPrice ? "text-gray-900" : "text-gray-400"}`}
                              title={hasPrice ? `${itemCurrencySymbol}${priceValue.toFixed(5)}` : "N/A"}
                            >
                              {hasPrice ? `${itemCurrencySymbol}${priceValue.toFixed(5)}` : "-"}
                            </span>
                          </td>
                        )
                      }

                      if (columnKey === "source") {
                        // Source column is always "Project" — no hardcoded distributor sources
                        return (
                          <td key={columnKey} className="p-2 text-center" style={stickyStyle}>
                            <span className="text-xs font-medium text-gray-900">
                              Project
                            </span>
                          </td>
                        )
                      }

                      if (columnKey === "unitPrice") {
                        const hasPrice = item.unitPrice && item.unitPrice > 0
                        const currencySymbol = (item as any).currency?.symbol || '₹'
                        return (
                          <td key={columnKey} className="p-2 text-right" style={stickyStyle}>
                            <span
                              className={`text-xs font-semibold ${hasPrice ? "text-gray-900" : "text-red-700"}`}
                              title={hasPrice ? `${currencySymbol}${item.unitPrice.toFixed(5)}` : "N/A"}
                            >
                              {hasPrice ? `${currencySymbol}${item.unitPrice.toFixed(5)}` : "N/A"}
                            </span>
                          </td>
                        )
                      }

                      if (columnKey === "totalPrice") {
                        const hasPrice = item.totalPrice && item.totalPrice > 0
                        return (
                          <td key={columnKey} className="p-2 text-right" style={stickyStyle}>
                            <span
                              className={`text-xs font-medium ${hasPrice ? "text-gray-900" : "text-red-700"}`}
                              title={hasPrice ? `${(item as any).currency?.symbol || '₹'}${item.totalPrice.toFixed(5)}` : "N/A"}
                            >
                              {hasPrice ? `${(item as any).currency?.symbol || '₹'}${item.totalPrice.toFixed(5)}` : "N/A"}
                            </span>
                          </td>
                        )
                      }

                      if (columnKey === "quantity") {
                        const displayQty = item.event_quantity != null ? item.event_quantity : item.quantity
                        const qtyLabel = item.event_quantity != null ? 'Event Qty' : 'BOM Qty'
                        return (
                          <td key={columnKey} className="p-2 text-right" style={stickyStyle}>
                            <div className="flex items-center justify-end w-full">
                              <span
                                className="text-gray-900 text-xs font-medium tabular-nums"
                                title={`${qtyLabel}: ${displayQty} ${item.unit}`}
                              >
                                {displayQty}
                              </span>
                            </div>
                          </td>
                        )
                      }

                      return (
                        <td key={columnKey} className="p-2 text-left" style={stickyStyle}>
                          <span className="text-gray-900 text-xs truncate block" title={String(value || "")}>
                            {String(value || "")}
                          </span>
                        </td>
                      )
                    })}
                    <td className="p-2 text-left">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedItemForAnalytics(item)
                            setShowAnalyticsPopup(true)
                          }}
                          className="h-5 w-5 p-0"
                          title="View Analytics"
                        >
                          <BarChart3 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
            {/* Pagination (left) */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700">
                Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredAndSortedItems.length)} to{" "}
                {Math.min(currentPage * itemsPerPage, filteredAndSortedItems.length)} of {filteredAndSortedItems.length}{" "}
                results
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  title="Go to first page"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-1 text-sm border rounded-md ${
                          currentPage === pageNum
                            ? "bg-blue-500 text-white border-blue-500"
                            : "border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  title="Go to last page"
                >
                  Last
                </button>
              </div>
            </div>
            {/* Selection + Actions (right) */}
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-700">
                {selectedItems.length > 0 ? (
                  <span className="text-blue-600 font-medium">
                    {selectedItems.length} of {filteredAndSortedItems.length} item
                    {selectedItems.length !== 1 ? "s" : ""} selected
                  </span>
                ) : (
                  <span>{/* Empty space when no selection */}</span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    console.log('Reset selections clicked')
                    setSelectedItems([])
                  }}
                  title="Reset Selection"
                  disabled={selectedItems.length === 0}
                >
                  <RotateCcw className="h-3 w-3 mr-2" />
                  Reset Selection
                </Button>

                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white h-8"
                  disabled={actionResultsLoading}
                  onClick={() => {
                    console.log('Execute action clicked, selected items:', selectedItems)
                    setActionResultsLoading(true)
                    setShowActionResultsPopup(true)
                    setTimeout(() => {
                      setActionResultsLoading(false)
                    }, 3000)
                  }}
                  title="Execute Action"
                >
                  {actionResultsLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></span>
                      Executing...
                    </span>
                  ) : (
                    'Execute Action'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Improved Autoassign Popovers */}
      <AutoAssignUsersPopover
        open={showAssignUsersPopup}
        onOpenChange={setShowAssignUsersPopup}
        selectedItemsCount={selectedItems.length}
        currentSettings={currentSettings}
        onExecute={handleAutoAssignUsers}
        onOpenSettings={() => {
          setSettingsInitialTab('users')
          setSettingsOpen(true)
        }}
        entityId={projectData.buyer_entity_id}
        templateId={projectData.template_id}
      />

      <AutoFillPricesPopover
        open={showFillPricesPopup}
        onOpenChange={setShowFillPricesPopup}
        selectedItemsCount={selectedItems.length}
        currentSettings={currentSettings}
        onExecute={handleAutoFillPrices}
        onOpenSettings={() => {
          setSettingsInitialTab('prices')
          setSettingsOpen(true)
        }}
      />

      <AutoAssignActionsPopover
        open={showAssignActionsPopup}
        onOpenChange={setShowAssignActionsPopup}
        selectedItemsCount={selectedItems.length}
        currentSettings={currentSettings}
        onExecute={handleAssignActions}
        onOpenSettings={() => {
          setSettingsInitialTab('actions')
          setSettingsOpen(true)
        }}
      />

      {/* Action Results Popup */}
      <Dialog open={showActionResultsPopup} onOpenChange={(open) => {
        if (!open && !actionResultsLoading) setShowActionResultsPopup(false)
      }}>
        <DialogContent className="w-[480px] max-w-[90vw]">
          {actionResultsLoading ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
                  Executing Actions...
                </DialogTitle>
                <DialogDescription>
                  Creating events and quotes based on your rules. Please wait.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center justify-center py-10 space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                <p className="text-sm text-gray-500">Processing items...</p>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckSquare className="h-5 w-5 text-green-600" />
                  </div>
                  Actions Executed Successfully
                </DialogTitle>
                <DialogDescription>
                  The following actions have been created based on your rules.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Event for Mechanical */}
                <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-blue-50">
                  <div>
                    <div className="font-medium text-gray-900">1 Event created</div>
                    <div className="text-sm text-gray-600">Tag: <span className="font-medium">Mechanical</span></div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-blue-600 border-blue-300 hover:bg-blue-100"
                    onClick={() => window.open('#', '_blank')}
                  >
                    Go to Event
                  </Button>
                </div>

                {/* Event for Electrical */}
                <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-blue-50">
                  <div>
                    <div className="font-medium text-gray-900">1 Event created</div>
                    <div className="text-sm text-gray-600">Tag: <span className="font-medium">Electrical</span></div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-blue-600 border-blue-300 hover:bg-blue-100"
                    onClick={() => window.open('#', '_blank')}
                  >
                    Go to Event
                  </Button>
                </div>

                {/* Quote for OEM Controlled Items */}
                <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-purple-50">
                  <div>
                    <div className="font-medium text-gray-900">1 Quote created</div>
                    <div className="text-sm text-gray-600">Tag: <span className="font-medium">OEM Controlled Items</span></div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-purple-600 border-purple-300 hover:bg-purple-100"
                    onClick={() => window.open('#', '_blank')}
                  >
                    Go to Quote
                  </Button>
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <Button onClick={() => setShowActionResultsPopup(false)}>
                  Done
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Analytics Popup */}
      {showAnalyticsPopup && selectedItemForAnalytics && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setShowAnalyticsPopup(false)}
        >
          <div
            className="bg-white rounded-lg p-6 w-[90vw] max-w-6xl mx-4 shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-base font-medium text-gray-800">
                    Analytics for {selectedItemForAnalytics.itemId}
                  </h3>
                  <p className="text-xs text-gray-500">{selectedItemForAnalytics.description}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAnalyticsPopup(false)}
                className="h-8 w-8 p-0"
              >
                ×
              </Button>
            </div>

            {/* Pricing history charts — per-source with currency toggle, rate type, date range, cheapest highlight */}
            <PricingCharts
              records={analyticsMpnHistory}
              loading={analyticsHistoryLoading}
              useAdminCurrency={analyticsUseAdminCurrency}
              onToggleAdminCurrency={setAnalyticsUseAdminCurrency}
            />

            {/* Online Pricing (Digikey/Mouser) — hidden for now */}

            <div className="flex justify-end mt-6">
              <Button
                variant="outline"
                onClick={() => setShowAnalyticsPopup(false)}
                className="text-gray-600 hover:text-gray-800"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm: open source PO/Contract/Quote/RFQ in Factwise */}
      <Dialog open={!!pendingNavRecord} onOpenChange={(o) => { if (!o) setPendingNavRecord(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open in Factwise?</DialogTitle>
            <DialogDescription>
              {pendingNavRecord && (() => {
                const url = buildFactwiseUrl(pendingNavRecord)
                const sourceLabel = ({
                  PO: 'Purchase Order',
                  CONTRACT: 'Contract',
                  QUOTE: 'Quote',
                  RFQ: 'RFQ',
                  DIGIKEY: 'Digi-Key listing',
                  MOUSER: 'Mouser listing',
                } as Record<string, string>)[pendingNavRecord.source] || pendingNavRecord.source
                const docId =
                  pendingNavRecord.po_id ||
                  pendingNavRecord.quote_id ||
                  pendingNavRecord.agreement_id ||
                  pendingNavRecord.rfq_event_id ||
                  pendingNavRecord.source_parent_id ||
                  ''
                const vendor = pendingNavRecord.supplier_name || pendingNavRecord.customer_name || ''
                return (
                  <>
                    <div className="mt-2 space-y-1.5 text-sm text-gray-700">
                      <div>Open <span className="font-semibold">{sourceLabel}</span>{vendor ? <> from <span className="font-semibold">{vendor}</span></> : ''} in Factwise?</div>
                      {!url && (
                        <div className="text-xs text-amber-600">No deep-link available for this record.</div>
                      )}
                    </div>
                  </>
                )
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingNavRecord(null)}>Cancel</Button>
            <Button
              disabled={!pendingNavRecord || !buildFactwiseUrl(pendingNavRecord)}
              onClick={() => {
                if (pendingNavRecord) navigateInFactwise(pendingNavRecord)
                setPendingNavRecord(null)
              }}
            >
              Open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto bg-gray-50 border-2 border-gray-300">
        <DialogHeader>
          <DialogTitle className="text-gray-900 font-semibold">{editFormData.isBulk ? `Bulk Edit (${editFormData.itemCount} items)` : 'Edit Item'}</DialogTitle>
          <DialogDescription className="text-gray-700">
            {editFormData.isBulk
              ? 'Enter values to update for all selected items. Fields left blank will not be changed.'
              : 'Make changes to the item details below.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-3">
          {/* Tags Section - Full Width */}
          <div className="space-y-1.5">
            <Label htmlFor="category" className="text-gray-900 font-medium">Tags</Label>
            {renderCategoryInput()}
          </div>

          {/* Vendors section — full-width, custom vendors from backend */}
          <div className="space-y-1.5">
            <Label className="text-gray-900 font-medium">
              {editFormData.isBulk ? 'Common Vendors' : 'Vendors'}
            </Label>

            {editFormData.isBulk && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                Showing only vendors common to all <span className="font-semibold">{editFormData.itemCount}</span> selected items. Adding or removing affects every selected item.
              </div>
            )}

            {/* Attached vendor pills */}
            <div className="flex flex-wrap items-center gap-2 min-h-[36px] p-2 bg-white border border-gray-300 rounded-md">
              {editAttachedVendors.length === 0 ? (
                <span className="text-gray-500 text-sm">
                  {editFormData.isBulk ? 'No common vendors across selected items' : 'No vendors attached'}
                </span>
              ) : (
                editAttachedVendors.map((v) => (
                  <Badge
                    key={v.enterprise_vendor_master_id}
                    variant="outline"
                    className="bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100 pl-2 pr-1 py-0.5 text-xs flex items-center gap-1"
                  >
                    <span className="max-w-[180px] truncate" title={`${v.vendor_name} · ${v.vendor_code}`}>
                      {v.vendor_name}
                    </span>
                    <button
                      type="button"
                      disabled={editVendorMutating}
                      onClick={() => handleRemoveCustomVendor(v.enterprise_vendor_master_id)}
                      className="ml-0.5 rounded-full hover:bg-blue-200 p-0.5 disabled:opacity-40"
                      title="Remove vendor"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>

            {/* Search input */}
            <div className="relative">
              <Input
                placeholder="Search vendors by name or code..."
                value={editVendorSearchInput}
                onChange={(e) => setEditVendorSearchInput(e.target.value)}
                disabled={editVendorMutating}
                className="border-gray-400 bg-white pr-10"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>

            {/* Inline results — click any row to auto-add immediately */}
            {editVendorSearchInput.trim().length > 0 && (
              <div className="border border-gray-300 rounded-md bg-white shadow-sm max-h-[240px] overflow-y-auto">
                {editVendorSearching ? (
                  <div className="p-3 text-sm text-gray-500 text-center">Searching...</div>
                ) : editVendorSearchResults.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500 text-center">
                    No vendors match "{editVendorSearchInput}"
                  </div>
                ) : (
                  <div className="py-1">
                    {editVendorSearchResults.map((v) => {
                      const statusColor =
                        v.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : v.status === 'INVITED'
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                            : v.status === 'INVITATION_REJECTED'
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                      return (
                        <button
                          key={v.enterprise_vendor_master_id}
                          type="button"
                          disabled={editVendorMutating}
                          onClick={() => handleAddSingleVendor(v.enterprise_vendor_master_id)}
                          className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed border-b border-gray-100 last:border-b-0"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{v.vendor_name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[11px] text-gray-500 font-mono">{v.vendor_code}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusColor}`}>
                                {v.status}
                              </span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Two Column Layout for Other Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-gray-900 font-medium">Assigned To</Label>

            {/* Selected Users as Badges */}
            <div className="flex flex-wrap items-center gap-2 min-h-[36px] p-2 bg-white border border-gray-300 rounded-md">
              {(() => {
                const selectedUsers = editFormData.assignedTo
                  ? String(editFormData.assignedTo).split(',').map((u: string) => u.trim()).filter(Boolean)
                  : []
                return selectedUsers.length === 0 ? (
                  <span className="text-gray-500 text-sm">No users assigned</span>
                ) : (
                  selectedUsers.map((user: string, index: number) => (
                    <Badge key={index} variant="outline" className="flex items-center gap-2 pl-3 pr-2 py-1 bg-green-100 border-green-300 text-green-900">
                      <span className="font-medium">{user}</span>
                      <button
                        onClick={() => {
                          const newUsers = selectedUsers.filter((_, i) => i !== index)
                          setEditFormData({ ...editFormData, assignedTo: newUsers.join(', ') })
                        }}
                        className="rounded-full hover:bg-green-200 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )
              })()}
            </div>

            {/* Searchable User Selector */}
            <div className="relative">
              <Input
                placeholder="Type to search and add users..."
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                onBlur={() => setTimeout(() => setUserSearchTerm(""), 200)}
                className="border-gray-400 bg-white pr-10"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

              {/* Dropdown appears ONLY when typing */}
              {userSearchTerm.length > 0 && (
                <div className="absolute z-50 w-full mt-1 border-2 border-gray-300 rounded-md bg-white max-h-[180px] overflow-y-auto shadow-lg">
                  {(() => {
                    const selectedUsers = editFormData.assignedTo
                      ? String(editFormData.assignedTo).split(',').map((u: string) => u.trim()).filter(Boolean)
                      : []
                    const filteredUsers = allUsers.filter(
                      user => !selectedUsers.includes(user) && user.toLowerCase().includes(userSearchTerm.toLowerCase())
                    )

                    return filteredUsers.length === 0 ? (
                      <div className="p-2 text-sm text-gray-500 text-center">
                        No users match "{userSearchTerm}"
                      </div>
                    ) : (
                      <div className="py-1">
                        {filteredUsers.map((user) => (
                          <button
                            key={user}
                            type="button"
                            onClick={() => {
                              const newUsers = [...selectedUsers, user]
                              setEditFormData({ ...editFormData, assignedTo: newUsers.join(', ') })
                              setUserSearchTerm("")
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 focus:bg-green-100 focus:outline-none"
                          >
                            {user}
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500">
              {allUsers.length} user{allUsers.length !== 1 ? 's' : ''} available
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="action" className="text-gray-900 font-medium">Action</Label>
            <Select
              value={editFormData.action || ''}
              onValueChange={(value) => setEditFormData({ ...editFormData, action: value })}
            >
              <SelectTrigger className="border border-gray-400">
              <SelectValue placeholder="Select an action" />
            </SelectTrigger>
              <SelectContent>
                {actionOptions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rate" className="text-gray-900 font-medium">Rate (Price per Unit)</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                {editFormData.currency?.symbol || '₹'}
              </span>
              <Input
                id="rate"
                type="number"
                min="0"
                step="0.01"
                value={editFormData.rate || ''}
                onChange={(e) => setEditFormData({ ...editFormData, rate: parseFloat(e.target.value) || 0 })}
                className="border border-gray-400"
                placeholder="Enter rate"
                disabled={editFormData.isBulk}
              />
            </div>
            {editFormData.isBulk && (
              <p className="text-xs text-gray-500">Bulk edit: Rate cannot be changed for multiple items</p>
            )}
          </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantity" className="text-gray-900 font-medium">Quantity</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="quantity"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editFormData.quantity || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, quantity: parseFloat(e.target.value) || 0 })}
                  className="border border-gray-400"
                  placeholder="Enter quantity"
                  disabled={editFormData.isBulk}
                />
                <span className="text-sm font-medium text-gray-700">
                  {editFormData.unit || 'units'}
                </span>
              </div>
              {editFormData.isBulk && (
                <p className="text-xs text-gray-500">Bulk edit: Quantity cannot be changed for multiple items</p>
              )}
            </div>
          </div>
          {/* End Two Column Layout */}
        </div>
        <DialogFooter>
          <Button onClick={() => setShowEditDialog(false)} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={handleEditRateQuantity}
            disabled={!editFormHasChanges}
            className={!editFormHasChanges ? 'opacity-50 cursor-not-allowed' : ''}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {/* Bulk Update Progress Indicator */}
      {bulkUpdateInProgress && (
        <div className="fixed bottom-4 right-4 z-50 bg-white border-2 border-blue-500 rounded-lg shadow-lg p-4 min-w-[300px]">
          <div className="flex items-center gap-3 mb-2">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
            <span className="font-medium text-gray-900">Updating Items...</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${bulkUpdateProgress.total > 0 ? (bulkUpdateProgress.current / bulkUpdateProgress.total) * 100 : 0}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>{bulkUpdateProgress.current} / {bulkUpdateProgress.total} items</span>
            {bulkUpdateProgress.failed > 0 && (
              <span className="text-red-500">{bulkUpdateProgress.failed} failed</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">Please don't refresh the page</p>
        </div>
      )}

      {/* Simple wide white popup for Settings */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/30"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="absolute inset-0 m-2 md:m-8 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-3 right-3 z-10">
              <button
                type="button"
                aria-label="Close"
                className="text-gray-500 hover:text-gray-700 text-xl"
                onClick={() => setSettingsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <SettingsPanel
                entityId={projectData.buyer_entity_id}
                allTags={allTags}
                allCustomers={projectData.customer ? [projectData.customer] : []}
                availableUsers={eligibleUsers}
                rfqResponsibleUsers={rfqResponsibleUsers}
                quoteResponsibleUsers={quoteResponsibleUsers}
                current={currentSettings}
                initialTab={settingsInitialTab}
                onSave={(s) => {
                  setSettingsProfiles((prev) => {
                    const next = { ...prev, [s.name]: s }
                    if (typeof window !== 'undefined') localStorage.setItem('appSettingsProfiles', JSON.stringify(next))
                    return next
                  })
                  setCurrentSettingsKey(s.name)
                  if (typeof window !== 'undefined') localStorage.setItem('currentSettingsProfile', s.name)
                  setSettingsOpen(false)
                }}
                onCancel={() => setSettingsOpen(false)}
                onAdminActionRulesLoaded={(rules) => setAdminActionRules(rules)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit User Assignment Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => {
        if (!open) {
          setEditingItem(null)
          setEditingUsers([])
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Users</DialogTitle>
            <DialogDescription>
              Select users to assign to {editingItem?.itemId || 'this item'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Users</Label>
              <div className="border rounded-md p-3 max-h-60 overflow-y-auto space-y-2">
                {allUsers.map((userName) => (
                  <label
                    key={userName}
                    className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={editingUsers.includes(userName)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditingUsers([...editingUsers, userName])
                        } else {
                          setEditingUsers(editingUsers.filter(u => u !== userName))
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{userName}</span>
                  </label>
                ))}
              </div>
              {editingUsers.length > 0 && (
                <p className="text-xs text-gray-600">
                  Selected: {editingUsers.join(', ')}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingItem(null)
                setEditingUsers([])
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                console.log('[DEBUG] Save button clicked - about to call handler')
                handleManualUserAssignment()
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
