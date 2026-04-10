'use client'

/**
 * Per-source pricing history charts for the Strategy Dashboard analytics popup.
 * Mirrors the pricing dashboard's ItemAnalytics.tsx chart pattern:
 * - Rate type selector (Base Rate / Effective Rate / Quoted Rate)
 * - Admin currency toggle
 * - Date range + show count filters
 * - Rich tooltip with all rate fields + supplier + doc ID + status
 * - Cheapest price highlighted
 * - Mixed currencies warning
 */

import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { PricingRecord } from '@/lib/pricingRepo'

// ── Types ──

type RateType = 'rate' | 'effective_rate' | 'quoted_rate'
type ShowCount = '5' | '10' | '20' | 'all'

const RATE_OPTIONS: Array<{ value: RateType; label: string; original: string; admin: string }> = [
  { value: 'effective_rate', label: 'Effective Rate', original: 'effective_rate', admin: 'effective_rate_in_admin_currency' },
  { value: 'rate', label: 'Base Rate', original: 'rate', admin: 'rate_in_admin_currency' },
  { value: 'quoted_rate', label: 'Quoted Rate', original: 'quoted_rate', admin: 'quoted_rate_in_admin_currency' },
]

const COUNT_OPTIONS: Array<{ value: ShowCount; label: string }> = [
  { value: '5', label: 'Last 5' },
  { value: '10', label: 'Last 10' },
  { value: '20', label: 'Last 20' },
  { value: 'all', label: 'All' },
]

// ── Helpers ──

function getPrice(record: any, rateType: RateType, useAdmin: boolean): number | null {
  const cfg = RATE_OPTIONS.find(r => r.value === rateType)!
  const field = useAdmin ? cfg.admin : cfg.original
  const val = record[field]
  if (val == null || val === '') return null
  const num = typeof val === 'number' ? val : parseFloat(val)
  return isNaN(num) || num <= 0 ? null : num
}

function fmtRate(val: any, symbol: string): string {
  if (val == null || val === '') return '\u2014'
  const num = typeof val === 'number' ? val : parseFloat(val)
  return isNaN(num) ? '\u2014' : `${symbol}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

function fmtDate(dt: string | null | undefined): string {
  if (!dt) return '\u2014'
  return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Source-specific tooltip fields ──

interface TooltipConfig {
  idLabel: string
  idField: string
  showQuotedRate: boolean
  statusField: string
}

const SOURCE_TOOLTIP_CONFIG: Record<string, TooltipConfig> = {
  PO: { idLabel: 'PO ID', idField: 'po_id', showQuotedRate: false, statusField: 'status_display' },
  CONTRACT: { idLabel: 'Contract ID', idField: 'agreement_id', showQuotedRate: false, statusField: 'contract_status' },
  QUOTE: { idLabel: 'Sheet ID', idField: 'quote_id', showQuotedRate: true, statusField: 'costing_sheet_status' },
  RFQ: { idLabel: 'Event ID', idField: 'event_id', showQuotedRate: false, statusField: 'event_status' },
}

// ── Generic Chart Tooltip ──

function ChartTooltip({
  active, payload, rateType, useAdminCurrency, sourceType,
}: {
  active?: boolean; payload?: any[]; rateType: RateType; useAdminCurrency: boolean; sourceType: string;
}) {
  if (!active || !payload?.length) return null
  const dataPoint = payload[0]?.payload
  if (!dataPoint?.entry) return null
  const e: PricingRecord = dataPoint.entry
  const cfg = SOURCE_TOOLTIP_CONFIG[sourceType] || SOURCE_TOOLTIP_CONFIG.PO

  const cs = useAdminCurrency
    ? (e.admin_currency_symbol || e.currency_symbol || '')
    : (e.currency_symbol || '')

  const nativeCs = e.currency_symbol || ''
  const adminCs = e.admin_currency_symbol || ''
  const showConversion = useAdminCurrency && e.currency_code !== e.admin_currency_code && e.conversion_rate

  return (
    <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-3 text-sm max-w-[320px] z-50 pointer-events-none">
      <p className="font-bold text-gray-900 mb-1.5 truncate">{e.supplier_name || 'Unknown'}</p>
      <div className="space-y-1 text-gray-600">
        <div className="flex justify-between gap-3">
          <span className="text-gray-400">{cfg.idLabel}</span>
          <span className="font-medium text-gray-800">{(e as any)[cfg.idField] || '\u2014'}</span>
        </div>
        <hr className="border-gray-100" />
        <div className="flex justify-between gap-3">
          <span>Base Rate</span>
          <span className="font-medium">{fmtRate(useAdminCurrency ? e.rate_in_admin_currency : e.rate, cs)}</span>
        </div>
        {cfg.showQuotedRate && (
          <div className="flex justify-between gap-3">
            <span>Quoted Rate</span>
            <span className="font-medium">{fmtRate(useAdminCurrency ? e.quoted_rate_in_admin_currency : (e as any).quoted_rate, cs)}</span>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <span>Effective Rate</span>
          <span className="font-medium">{fmtRate(useAdminCurrency ? e.effective_rate_in_admin_currency : e.effective_rate, cs)}</span>
        </div>
        <hr className="border-gray-100" />
        <div className="flex justify-between gap-3">
          <span>Total Cost</span>
          <span className="font-medium">{fmtRate(useAdminCurrency ? e.total_item_cost_in_admin_currency : e.total_item_cost, cs)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Quantity</span>
          <span className="font-medium">{typeof e.quantity === 'number' ? e.quantity.toLocaleString() : e.quantity || '\u2014'}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Status</span>
          <span className="font-medium">{(e as any)[cfg.statusField] || e.status_display || '\u2014'}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Date</span>
          <span className="font-medium">{fmtDate(e.pricing_datetime)}</span>
        </div>
        {showConversion && (
          <>
            <hr className="border-gray-100" />
            <div className="flex justify-between gap-3 text-[11px] text-gray-400">
              <span>Native ({e.currency_code})</span>
              <span>{nativeCs}{typeof e.rate === 'number' ? e.rate.toFixed(2) : e.rate}</span>
            </div>
            <div className="flex justify-between gap-3 text-[11px] text-gray-400">
              <span>FX Rate</span>
              <span>{e.conversion_rate}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Source Chart Component ──

interface SourceChartProps {
  entries: PricingRecord[]
  sourceType: string
  useAdminCurrency: boolean
  color: string
}

export function SourceChart({ entries, sourceType, useAdminCurrency, color }: SourceChartProps) {
  const [rateType, setRateType] = useState<RateType>('effective_rate')
  const [showCount, setShowCount] = useState<ShowCount>('10')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const adminCurrencySymbol = useMemo(() => {
    const e = entries.find(e => e.admin_currency_symbol)
    return e?.admin_currency_symbol || ''
  }, [entries])

  const adminCurrencyCode = useMemo(() => {
    const e = entries.find(e => e.admin_currency_code)
    return e?.admin_currency_code || ''
  }, [entries])

  const hasMixedCurrencies = useMemo(() => {
    const codes = new Set(entries.map(e => e.currency_code).filter(Boolean))
    return codes.size > 1
  }, [entries])

  const currencySymbol = useAdminCurrency ? adminCurrencySymbol : ''
  const rateLabel = useAdminCurrency ? `Rate (${adminCurrencyCode})` : 'Rate'

  const { chartData, cheapestIdx, totalInRange } = useMemo(() => {
    const data = entries
      .map((e, idx) => {
        const price = getPrice(e, rateType, useAdminCurrency)
        if (price === null) return null
        const dateStr = e.pricing_datetime
          ? new Date(e.pricing_datetime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
          : 'N/A'
        return {
          date: dateStr,
          xKey: `${dateStr}-${idx}`,
          price,
          quantity: typeof e.quantity === 'number' ? e.quantity : (parseFloat(String(e.quantity)) || 0),
          supplier: e.supplier_name || 'Unknown',
          entry: e,
          idx,
        }
      })
      .filter(Boolean) as any[]

    data.sort((a: any, b: any) => new Date(a.entry.pricing_datetime || 0).getTime() - new Date(b.entry.pricing_datetime || 0).getTime())

    let filtered = data
    if (dateFrom) {
      const from = new Date(dateFrom); from.setHours(0, 0, 0, 0)
      filtered = filtered.filter((d: any) => new Date(d.entry.pricing_datetime || 0).getTime() >= from.getTime())
    }
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(23, 59, 59, 999)
      filtered = filtered.filter((d: any) => new Date(d.entry.pricing_datetime || 0).getTime() <= to.getTime())
    }
    const totalInRange = filtered.length
    if (showCount !== 'all') filtered = filtered.slice(-parseInt(showCount))

    let cheapest = -1
    if (filtered.length > 1) {
      let minPrice = Infinity
      filtered.forEach((d: any, i: number) => {
        if (d.price <= minPrice) { minPrice = d.price; cheapest = i }
      })
    }

    return { chartData: filtered, cheapestIdx: cheapest, totalInRange }
  }, [entries, rateType, useAdminCurrency, dateFrom, dateTo, showCount])

  if (entries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-400">No {sourceType} history for this item</p>
      </div>
    )
  }

  const CustomDot = (props: any) => {
    const { cx, cy, index } = props
    if (cx == null || cy == null || index !== cheapestIdx) return null
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="#22c55e" stroke="#fff" strokeWidth={2} />
        <text x={cx} y={cy - 12} textAnchor="middle" fill="#16a34a" fontSize={9} fontWeight="bold">Lowest</text>
      </g>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters row 1: rate type + show count */}
      <div className="flex flex-col gap-1.5 mb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <select
              value={rateType}
              onChange={(e) => setRateType(e.target.value as RateType)}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {RATE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {!useAdminCurrency && hasMixedCurrencies && (
              <span className="text-[10px] text-amber-600 leading-tight">Mixed currencies</span>
            )}
          </div>
          <select
            value={showCount}
            onChange={(e) => setShowCount(e.target.value as ShowCount)}
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {COUNT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Filters row 2: date range + entry count */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-500">From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <span className="text-[11px] text-gray-500">To</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }}
                className="text-[10px] text-red-500 hover:text-red-700 px-1">Clear</button>
            )}
          </div>
          <span className="text-[11px] text-gray-400">
            {chartData.length}{totalInRange > chartData.length ? ` of ${totalInRange}` : ''} entries
          </span>
        </div>
      </div>

      {/* Chart */}
      {chartData.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center" style={{ minHeight: '250px' }}>
          <p className="text-sm text-gray-400">No entries in this date range</p>
        </div>
      ) : (() => {
        const needsScroll = chartData.length > 8
        const chartWidth = needsScroll ? chartData.length * 80 : '100%'
        return (
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden" style={{ minHeight: '250px' }}>
            <div style={{ width: typeof chartWidth === 'number' ? `${chartWidth}px` : chartWidth, height: '100%', minHeight: '250px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="xKey"
                    tickFormatter={(val: string) => val.replace(/-\d+$/, '')}
                    tick={{ fontSize: 11, fill: '#374151', fontWeight: 500 }}
                    tickLine={false}
                    axisLine={{ stroke: '#d1d5db' }}
                    dy={6}
                    interval={0}
                  />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    tick={{ fontSize: 11, fill: '#374151' }}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                    label={{ value: 'Quantity', angle: -90, position: 'insideLeft', offset: -4, style: { fontSize: 11, fill: '#6b7280', fontWeight: 500 } }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#374151' }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                    tickFormatter={(v) => `${currencySymbol}${v.toLocaleString()}`}
                    label={{ value: rateLabel, angle: 90, position: 'insideRight', offset: -4, style: { fontSize: 11, fill: '#6b7280', fontWeight: 500 } }}
                  />
                  <Tooltip
                    content={<ChartTooltip rateType={rateType} useAdminCurrency={useAdminCurrency} sourceType={sourceType} />}
                    cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }}
                    position={{ y: 0 }}
                    offset={20}
                  />
                  <Legend
                    verticalAlign="bottom"
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    iconSize={10}
                    payload={[
                      { value: rateLabel, type: 'line' as const, color },
                      { value: 'Quantity', type: 'square' as const, color: '#93c5fd' },
                    ]}
                  />
                  <Bar isAnimationActive={false} yAxisId="left" dataKey="quantity" fill="#93c5fd" barSize={35} radius={[3, 3, 0, 0]} />
                  <Line
                    isAnimationActive={false}
                    yAxisId="right"
                    type="monotone"
                    dataKey="price"
                    stroke={color}
                    strokeWidth={2}
                    dot={<CustomDot />}
                    activeDot={{ r: 5, fill: color, stroke: '#fff', strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Wrapper: splits pricing records by source and renders per-source charts ──

const SOURCE_COLORS: Record<string, string> = {
  PO: '#22c55e',
  CONTRACT: '#f472b6',
  QUOTE: '#8b5cf6',
  RFQ: '#0ea5e9',
}

export interface PricingChartsProps {
  records: PricingRecord[] | null
  loading: boolean
  useAdminCurrency: boolean
  onToggleAdminCurrency: (val: boolean) => void
}

export function PricingCharts({ records, loading, useAdminCurrency, onToggleAdminCurrency }: PricingChartsProps) {
  const bySource = useMemo(() => {
    const map: Record<string, PricingRecord[]> = { PO: [], CONTRACT: [], QUOTE: [], RFQ: [] }
    if (records) {
      for (const r of records) {
        if (r.source in map) map[r.source].push(r)
      }
    }
    return map
  }, [records])

  const hasMixedCurrencies = useMemo(() => {
    if (!records) return false
    const codes = new Set(records.map(r => r.currency_code).filter(Boolean))
    return codes.size > 1
  }, [records])

  const adminCurrencyCode = useMemo(() => {
    if (!records) return ''
    const r = records.find(r => r.admin_currency_code)
    return r?.admin_currency_code || ''
  }, [records])

  const totalRecords = records?.length || 0
  const nullAdminCount = records?.filter(r => r.rate_in_admin_currency == null).length || 0

  return (
    <>
      {/* Currency toggle + info bar */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useAdminCurrency}
              onChange={(e) => onToggleAdminCurrency(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-xs font-medium text-gray-700">
              Show in admin currency{adminCurrencyCode ? ` (${adminCurrencyCode})` : ''}
            </span>
          </label>
          {!useAdminCurrency && hasMixedCurrencies && (
            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-medium">
              Mixed currencies — prices may not be directly comparable
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          {nullAdminCount > 0 && useAdminCurrency && (
            <span className="text-amber-600">
              {nullAdminCount} of {totalRecords} records excluded (no FX rate)
            </span>
          )}
          <span>{totalRecords} total records</span>
        </div>
      </div>

      {loading && (
        <div className="text-xs text-gray-500 mb-3">Loading pricing history...</div>
      )}

      {/* Per-source chart cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(['PO', 'CONTRACT', 'QUOTE', 'RFQ'] as const).map(source => (
          <div key={source} className="bg-white p-4 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-800">{source === 'CONTRACT' ? 'Contract' : source}</h4>
              <span className="text-[11px] text-gray-400">{bySource[source].length} entries</span>
            </div>
            <div className="h-80">
              <SourceChart
                entries={bySource[source]}
                sourceType={source}
                useAdminCurrency={useAdminCurrency}
                color={SOURCE_COLORS[source] || '#6b7280'}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
