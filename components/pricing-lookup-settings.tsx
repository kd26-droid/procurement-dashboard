'use client'

/**
 * Pricing Lookup Settings — popover triggered by a small gear button
 * placed near the PO/Contract/Quote/RFQ column headers.
 *
 * Lets the user pick:
 *  - Time range (last N days)
 *  - Price basis (which field to compare)
 *  - Source types to query
 *  - Whether to exclude expired contracts / draft & zero-rate quotes
 *
 * Persists to localStorage via use-pricing-lookup helpers.
 */

import React, { useState } from 'react'
import { Settings2, Info, DollarSign, ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  DEFAULT_PRICING_SETTINGS,
  type PricingLookupSettings,
} from '@/hooks/use-pricing-lookup'
import type { PriceBasis, PricingSourceType } from '@/lib/pricingRepo'

const TIME_RANGE_OPTIONS: Array<{ label: string; value: number | 'all' }> = [
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
  { label: 'Last 180 days', value: 180 },
  { label: 'Last 365 days', value: 365 },
  { label: 'All time', value: 'all' },
]

const PRICE_BASIS_OPTIONS: Array<{ label: string; value: PriceBasis; hint?: string }> = [
  { label: 'Effective Rate (Admin Currency)', value: 'effective_rate_in_admin_currency', hint: 'Recommended — comparable across currencies' },
  { label: 'Rate (Admin Currency)', value: 'rate_in_admin_currency' },
  { label: 'Total Item Cost (Admin Currency)', value: 'total_item_cost_in_admin_currency' },
  { label: 'Effective Rate (Native)', value: 'effective_rate', hint: 'Original document currency' },
  { label: 'Base Rate (Native)', value: 'rate' },
  { label: 'Quoted Rate (Native)', value: 'quoted_rate' },
  { label: 'Landed Rate', value: 'landed_rate', hint: 'RFQ only — others show as no data' },
  { label: 'Total Item Cost (Native)', value: 'total_item_cost' },
  { label: 'Landed Total', value: 'landed_total', hint: 'RFQ only — others show as no data' },
  { label: 'Landed Rate (Admin Currency)', value: 'landed_rate_in_admin_currency', hint: 'RFQ only' },
  { label: 'Landed Total (Admin Currency)', value: 'landed_total_in_admin_currency', hint: 'RFQ only' },
]

const SOURCE_OPTIONS: Array<{ label: string; value: PricingSourceType }> = [
  { label: 'PO', value: 'PO' },
  { label: 'Contract', value: 'CONTRACT' },
  { label: 'Quote', value: 'QUOTE' },
  { label: 'RFQ', value: 'RFQ' },
  { label: 'Digi-Key', value: 'DIGIKEY' },
  { label: 'Mouser', value: 'MOUSER' },
]

export interface PricingLookupSettingsButtonProps {
  settings: PricingLookupSettings
  onChange: (next: PricingLookupSettings) => void
  loading?: boolean
  className?: string
  /** True when a pricing fetch has already been run at least once. */
  enabled?: boolean
  /** Click handler that runs the pricing fetch. */
  onLoadPricing?: () => void
  /**
   * Trigger variant:
   *  - 'gear'  = small ghost icon button (used in column headers)
   *  - 'split' = full "Load Pricing" button with a caret that opens settings
   */
  variant?: 'gear' | 'split'
}

export function PricingLookupSettingsButton({
  settings,
  onChange,
  loading,
  className,
  enabled,
  onLoadPricing,
  variant = 'gear',
}: PricingLookupSettingsButtonProps) {
  const [open, setOpen] = useState(false)

  const update = (patch: Partial<PricingLookupSettings>) => {
    onChange({ ...settings, ...patch })
  }

  const timeRangeValue: number | 'all' =
    settings.daysBack === null ? 'all' : settings.daysBack

  const landedSelected =
    settings.priceBasis === 'landed_rate' || settings.priceBasis === 'landed_total'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {variant === 'split' ? (
        <div className={`inline-flex items-stretch rounded-md border border-input bg-background ${className ?? ''}`}>
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground rounded-l-md disabled:opacity-50 disabled:pointer-events-none"
            disabled={loading}
            onClick={() => {
              if (!onLoadPricing) return
              onLoadPricing()
            }}
            title={enabled ? 'Reload pricing for all MPNs' : 'Load cheapest pricing per MPN from pricing repository'}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <DollarSign className="h-4 w-4" />
            )}
            {loading ? 'Loading…' : enabled ? 'Reload Pricing' : 'Load Pricing'}
          </button>
          <div className="w-px bg-border" />
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center justify-center px-2 hover:bg-accent hover:text-accent-foreground rounded-r-md"
              title="Pricing lookup settings"
              aria-label="Pricing lookup settings"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </div>
      ) : (
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${className ?? ''}`}
            title="Pricing lookup settings"
            aria-label="Pricing lookup settings"
          >
            <Settings2 className={`h-4 w-4 ${loading ? 'animate-pulse text-blue-500' : ''}`} />
          </Button>
        </PopoverTrigger>
      )}
      <PopoverContent align="end" className="w-80 p-4">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold leading-none">Pricing Lookup</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Cheapest historical price per MPN, pulled from the pricing repository.
            </p>
          </div>

          <Separator />

          {/* Time range */}
          <div className="space-y-2">
            <Label htmlFor="pricing-time-range" className="text-xs font-medium">
              Time range
            </Label>
            <Select
              value={String(timeRangeValue)}
              onValueChange={(v) => update({ daysBack: v === 'all' ? null : Number(v) })}
            >
              <SelectTrigger id="pricing-time-range" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={String(opt.value)} value={String(opt.value)} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price basis */}
          <div className="space-y-2">
            <Label htmlFor="pricing-basis" className="text-xs font-medium">
              Price basis
            </Label>
            <Select
              value={settings.priceBasis}
              onValueChange={(v) => update({ priceBasis: v as PriceBasis })}
            >
              <SelectTrigger id="pricing-basis" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICE_BASIS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      {opt.hint && (
                        <span className="text-[10px] text-muted-foreground">{opt.hint}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {landedSelected && (
              <div className="flex gap-1.5 items-start text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  Landed fields only exist on RFQ records. PO, Contract and Quote columns will
                  show as no data.
                </span>
              </div>
            )}
          </div>

          {/* Source types */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Sources to query</Label>
            <div className="grid grid-cols-2 gap-2">
              {SOURCE_OPTIONS.map((opt) => {
                const checked = settings.sourceTypes.includes(opt.value)
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 text-xs cursor-pointer select-none"
                  >
                    <Switch
                      checked={checked}
                      onCheckedChange={(c) => {
                        const next = c
                          ? Array.from(new Set([...settings.sourceTypes, opt.value]))
                          : settings.sourceTypes.filter((s) => s !== opt.value)
                        update({ sourceTypes: next })
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Filters</Label>
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span>Exclude expired contracts</span>
              <Switch
                checked={settings.excludeExpiredContracts}
                onCheckedChange={(c) => update({ excludeExpiredContracts: c })}
              />
            </label>
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span>Exclude draft & zero-rate quotes</span>
              <Switch
                checked={settings.excludeZeroRateAndDraftQuotes}
                onCheckedChange={(c) => update({ excludeZeroRateAndDraftQuotes: c })}
              />
            </label>
          </div>

          <Separator />

          {onLoadPricing && variant !== 'split' && (
            <Button
              type="button"
              size="sm"
              className="w-full h-8 text-xs"
              disabled={loading}
              onClick={() => {
                onLoadPricing()
                setOpen(false)
              }}
            >
              {loading
                ? 'Loading…'
                : enabled
                ? 'Reload Pricing'
                : 'Load Pricing'}
            </Button>
          )}

          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onChange(DEFAULT_PRICING_SETTINGS)}
            >
              Reset
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
