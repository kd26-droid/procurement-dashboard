'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Users,
  DollarSign,
  CheckSquare,
  Settings,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  Zap,
} from 'lucide-react'
import { AppSettings } from '@/components/settings-dialog'
import {
  getAssignmentRules,
  type AssignmentRule,
  type TagUserMapping,
} from '@/lib/api'

// Types
interface AutoAssignUsersPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedItemsCount: number
  currentSettings: AppSettings
  onExecute: (scope: 'all' | 'unassigned' | 'selected', ruleOverrides?: Record<string, boolean>) => void
  onOpenSettings: () => void
  entityId: string
  templateId: string
}

interface AutoFillPricesPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedItemsCount: number
  currentSettings: AppSettings
  onExecute: (scope: 'all' | 'non-selected' | 'selected') => void
  onOpenSettings: () => void
}

interface AutoAssignActionsPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedItemsCount: number
  currentSettings: AppSettings
  onExecute: (scope: 'all' | 'unassigned' | 'selected') => void
  onOpenSettings: () => void
}

// Role label helper
function getRoleSummary(tm: TagUserMapping): string {
  const parts: string[] = []
  if (tm.rfq_assignee_user_ids?.length) parts.push(`${tm.rfq_assignee_user_ids.length} RFQ Assignee`)
  if (tm.quote_assignee_user_ids?.length) parts.push(`${tm.quote_assignee_user_ids.length} Quote Assignee`)
  if (tm.rfq_item_responsible_user_ids?.length) parts.push(`${tm.rfq_item_responsible_user_ids.length} RFQ Responsible`)
  if (tm.quote_item_responsible_user_ids?.length) parts.push(`${tm.quote_item_responsible_user_ids.length} Quote Responsible`)
  return parts.join(', ') || 'No users configured'
}

// AutoAssign Users Popover Component — with rules preview
export function AutoAssignUsersPopover({
  open,
  onOpenChange,
  selectedItemsCount,
  currentSettings,
  onExecute,
  onOpenSettings,
  entityId,
  templateId,
}: AutoAssignUsersPopoverProps) {
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Per-rule overrides: true = enabled, false = disabled
  const [ruleOverrides, setRuleOverrides] = useState<Record<string, boolean>>({})
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())

  // Fetch rules when dialog opens
  useEffect(() => {
    if (!open || !entityId) return

    const fetchRules = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await getAssignmentRules(entityId)
        const allRules = response.rules || []

        // Filter to applicable rules: active + template matches
        const applicable = allRules.filter((rule) => {
          if (!rule.is_active) return false
          if (rule.template_filter.length > 0 && templateId) {
            return rule.template_filter.includes(templateId)
          }
          return true // empty template_filter = all templates
        })

        setRules(applicable)

        // Default: all applicable rules enabled
        const defaults: Record<string, boolean> = {}
        applicable.forEach((r) => { defaults[r.rule_id] = true })
        setRuleOverrides(defaults)
      } catch (err) {
        console.error('[AutoAssign] Failed to fetch rules:', err)
        setError(err instanceof Error ? err.message : 'Failed to load rules')
      } finally {
        setLoading(false)
      }
    }

    fetchRules()
  }, [open, entityId, templateId])

  const toggleRule = (ruleId: string) => {
    setRuleOverrides((prev) => ({ ...prev, [ruleId]: !prev[ruleId] }))
  }

  const toggleExpanded = (ruleId: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      if (next.has(ruleId)) next.delete(ruleId)
      else next.add(ruleId)
      return next
    })
  }

  const enabledCount = Object.values(ruleOverrides).filter(Boolean).length
  const totalTagMappings = rules.reduce((sum, r) => {
    if (!ruleOverrides[r.rule_id]) return sum
    return sum + (r.outputs?.tag_mappings?.length || 0)
  }, 0)

  const handleExecute = (scope: 'all' | 'unassigned' | 'selected') => {
    onExecute(scope, ruleOverrides)
    onOpenChange(false)
  }

  // Summarize conditions as readable text
  const conditionText = (rule: AssignmentRule): string => {
    if (!rule.conditions || rule.conditions.length === 0) return 'All items (no conditions)'
    return rule.conditions.map((c, i) => {
      const prefix = i === 0 ? 'IF' : (c.conjunction || 'AND')
      const op = c.operator.replace(/_/g, ' ')
      return `${prefix} ${c.field} ${op} "${c.value}"`
    }).join(' ')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] max-w-[90vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            Auto Assign Users
          </DialogTitle>
          <DialogDescription>
            Assign users to items based on rules configured in Admin Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rules Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading assignment rules...
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Rules List */}
          {!loading && !error && (
            <>
              {rules.length === 0 ? (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-700 font-medium">No rules match this project</p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Configure assignment rules in Factwise Admin → Entity Settings → Assignment Rules.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm font-medium text-gray-700">
                      {enabledCount} of {rules.length} rule{rules.length !== 1 ? 's' : ''} enabled
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {totalTagMappings} tag mapping{totalTagMappings !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {rules.map((rule) => {
                    const isEnabled = ruleOverrides[rule.rule_id] ?? true
                    const isExpanded = expandedRules.has(rule.rule_id)
                    const outputs: any = rule.outputs || {}
                    const tagMappings = outputs.tag_mappings || []
                    const hasFlatOutputs = !!(
                      (outputs.rfq_item_responsible_user_ids?.length) ||
                      (outputs.quote_item_responsible_user_ids?.length) ||
                      (outputs.rfq_assignee_user_ids?.length) ||
                      (outputs.quote_assignee_user_ids?.length)
                    )

                    return (
                      <div
                        key={rule.rule_id}
                        className={`rounded-lg border transition-all ${
                          isEnabled
                            ? 'border-blue-200 bg-blue-50/50'
                            : 'border-gray-200 bg-gray-50 opacity-60'
                        }`}
                      >
                        {/* Rule header */}
                        <div className="flex items-center gap-3 p-3">
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => toggleRule(rule.rule_id)}
                          />
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => toggleExpanded(rule.rule_id)}
                          >
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {rule.name}
                              </p>
                              {tagMappings.length > 0 && (
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  {tagMappings.length} tag{tagMappings.length !== 1 ? 's' : ''}
                                </Badge>
                              )}
                              {hasFlatOutputs && !tagMappings.length && (
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  Direct assign
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {conditionText(rule)}
                            </p>
                          </div>
                          <button
                            onClick={() => toggleExpanded(rule.rule_id)}
                            className="p-1 rounded hover:bg-gray-200/50 transition-colors shrink-0"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-gray-500" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-500" />
                            )}
                          </button>
                        </div>

                        {/* Expanded: flat outputs + tag mappings */}
                        {isExpanded && (hasFlatOutputs || tagMappings.length > 0) && (
                          <div className="px-3 pb-3 pt-0 border-t border-gray-200/60">
                            <div className="space-y-1.5 mt-2">
                              {/* Flat outputs */}
                              {hasFlatOutputs && (() => {
                                const parts: Array<{ label: string; count: number }> = []
                                if (outputs.rfq_item_responsible_user_ids?.length) parts.push({ label: 'RFQ Responsible', count: outputs.rfq_item_responsible_user_ids.length })
                                if (outputs.quote_item_responsible_user_ids?.length) parts.push({ label: 'Quote Responsible', count: outputs.quote_item_responsible_user_ids.length })
                                if (outputs.rfq_assignee_user_ids?.length) parts.push({ label: 'RFQ Assignee', count: outputs.rfq_assignee_user_ids.length })
                                if (outputs.quote_assignee_user_ids?.length) parts.push({ label: 'Quote Assignee', count: outputs.quote_assignee_user_ids.length })
                                return parts.map((p, i) => (
                                  <div key={`flat-${i}`} className="text-xs text-gray-600">
                                    <span className="font-medium">{p.label}:</span> {p.count} user{p.count !== 1 ? 's' : ''} (all matched items)
                                  </div>
                                ))
                              })()}
                              {/* Tag mappings */}
                              {tagMappings.map((tm: TagUserMapping, idx: number) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2 text-xs"
                                >
                                  <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                                    {tm.tag}
                                  </Badge>
                                  <span className="text-gray-500">→</span>
                                  <span className="text-gray-600">
                                    {getRoleSummary(tm)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* Scope Options */}
          {!loading && rules.length > 0 && enabledCount > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-1">
                Apply to
              </p>

              <div
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all group"
                onClick={() => handleExecute('all')}
              >
                <div>
                  <div className="font-medium text-sm text-gray-900 group-hover:text-blue-700">All items</div>
                  <div className="text-xs text-gray-500">Evaluate rules against every item</div>
                </div>
                <ArrowRight className="h-4 w-4 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all group"
                onClick={() => handleExecute('unassigned')}
              >
                <div>
                  <div className="font-medium text-sm text-gray-900 group-hover:text-blue-700">Unassigned items only</div>
                  <div className="text-xs text-gray-500">Skip items that already have assignments</div>
                </div>
                <ArrowRight className="h-4 w-4 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div
                className={`flex items-center justify-between p-3 rounded-lg border border-gray-200 transition-all ${
                  selectedItemsCount === 0
                    ? 'opacity-50 cursor-not-allowed bg-gray-50'
                    : 'hover:border-blue-300 hover:bg-blue-50 cursor-pointer group'
                }`}
                onClick={() => selectedItemsCount > 0 && handleExecute('selected')}
              >
                <div>
                  <div className={`font-medium text-sm ${selectedItemsCount === 0 ? 'text-gray-400' : 'text-gray-900 group-hover:text-blue-700'}`}>
                    Selected items
                  </div>
                  <div className={`text-xs ${selectedItemsCount === 0 ? 'text-gray-400' : 'text-gray-500'}`}>
                    {selectedItemsCount === 0 ? 'No items selected' : `Apply rules to ${selectedItemsCount} selected items`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedItemsCount > 0 ? "default" : "secondary"}>
                    {selectedItemsCount}
                  </Badge>
                  {selectedItemsCount > 0 && (
                    <ArrowRight className="h-4 w-4 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// AutoFill Prices Popover Component
export function AutoFillPricesPopover({
  open,
  onOpenChange,
  selectedItemsCount,
  currentSettings,
  onExecute,
  onOpenSettings
}: AutoFillPricesPopoverProps) {
  const hasConfiguredSources = Object.values(currentSettings.prices.sourcesByMapping || {})
    .some(sources => sources.length > 0)

  const handleExecute = (scope: 'all' | 'non-selected' | 'selected') => {
    onExecute(scope)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] max-w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            Auto Fill Prices
          </DialogTitle>
          <DialogDescription>
            Fill prices automatically by finding the cheapest from your configured sources.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Settings Preview */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">Price Sources: </span>
                <span className="text-muted-foreground">
                  {hasConfiguredSources ? 'Configured' : 'None configured'}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={onOpenSettings}>
                <Settings className="h-4 w-4 mr-1" />
                Settings
              </Button>
            </div>
          </div>

          {/* Action Options */}
          <div className="space-y-3">
            <div
              className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 cursor-pointer transition-all group"
              onClick={() => handleExecute('all')}
            >
              <div>
                <div className="font-medium text-gray-900 group-hover:text-green-700">Autofill prices for all items</div>
                <div className="text-sm text-gray-500">Fill prices for all items in the table</div>
              </div>
              <ArrowRight className="h-4 w-4 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <div
              className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 cursor-pointer transition-all group"
              onClick={() => handleExecute('non-selected')}
            >
              <div>
                <div className="font-medium text-gray-900 group-hover:text-green-700">Autofill prices for non-selected items</div>
                <div className="text-sm text-gray-500">Fill prices for all items that have not been selected</div>
              </div>
              <ArrowRight className="h-4 w-4 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <div
              className={`flex items-center justify-between p-4 rounded-lg border border-gray-200 transition-all ${
                selectedItemsCount === 0
                  ? 'opacity-50 cursor-not-allowed bg-gray-50'
                  : 'hover:border-green-300 hover:bg-green-50 cursor-pointer group'
              }`}
              onClick={() => selectedItemsCount > 0 && handleExecute('selected')}
            >
              <div>
                <div className={`font-medium ${selectedItemsCount === 0 ? 'text-gray-400' : 'text-gray-900 group-hover:text-green-700'}`}>
                  Autofill prices for selected items
                </div>
                <div className={`text-sm ${selectedItemsCount === 0 ? 'text-gray-400' : 'text-gray-500'}`}>
                  {selectedItemsCount === 0 ? 'No items selected' : `Fill prices for ${selectedItemsCount} selected items`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={selectedItemsCount > 0 ? "default" : "secondary"}>
                  {selectedItemsCount}
                </Badge>
                {selectedItemsCount > 0 && (
                  <ArrowRight className="h-4 w-4 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </div>
          </div>

          {!hasConfiguredSources && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-700">
                Configure price sources in settings to enable auto-fill
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// AutoAssign Actions Popover Component
export function AutoAssignActionsPopover({
  open,
  onOpenChange,
  selectedItemsCount,
  currentSettings,
  onExecute,
  onOpenSettings
}: AutoAssignActionsPopoverProps) {
  const hasActionSettings = currentSettings.actions.sources.length > 0

  const handleExecute = (scope: 'all' | 'unassigned' | 'selected') => {
    onExecute(scope)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] max-w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <CheckSquare className="h-5 w-5 text-purple-600" />
            </div>
            Assign Actions
          </DialogTitle>
          <DialogDescription>
            Automatically assign next actions based on price and vendor availability.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Settings Preview */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">Action Rules: </span>
                <span className="text-muted-foreground">
                  {hasActionSettings ? `${currentSettings.actions.purpose} (${currentSettings.actions.itemIdType})` : 'Basic rules only'}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={onOpenSettings}>
                <Settings className="h-4 w-4 mr-1" />
                Settings
              </Button>
            </div>
          </div>


          {/* Action Options */}
          <div className="space-y-3">
            <div
              className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-all group"
              onClick={() => handleExecute('all')}
            >
              <div>
                <div className="font-medium text-gray-900 group-hover:text-purple-700">Autoassign for all items</div>
                <div className="text-sm text-gray-500">Assign actions to every item in the table</div>
              </div>
              <ArrowRight className="h-4 w-4 text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <div
              className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-all group"
              onClick={() => handleExecute('unassigned')}
            >
              <div>
                <div className="font-medium text-gray-900 group-hover:text-purple-700">Autoassign for non-assigned items</div>
                <div className="text-sm text-gray-500">Assign actions to items without actions</div>
              </div>
              <ArrowRight className="h-4 w-4 text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <div
              className={`flex items-center justify-between p-4 rounded-lg border border-gray-200 transition-all ${
                selectedItemsCount === 0
                  ? 'opacity-50 cursor-not-allowed bg-gray-50'
                  : 'hover:border-purple-300 hover:bg-purple-50 cursor-pointer group'
              }`}
              onClick={() => selectedItemsCount > 0 && handleExecute('selected')}
            >
              <div>
                <div className={`font-medium ${selectedItemsCount === 0 ? 'text-gray-400' : 'text-gray-900 group-hover:text-purple-700'}`}>
                  Autoassign for selected items
                </div>
                <div className={`text-sm ${selectedItemsCount === 0 ? 'text-gray-400' : 'text-gray-500'}`}>
                  {selectedItemsCount === 0 ? 'No items selected' : `Assign actions to ${selectedItemsCount} selected items`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={selectedItemsCount > 0 ? "default" : "secondary"}>
                  {selectedItemsCount}
                </Badge>
                {selectedItemsCount > 0 && (
                  <ArrowRight className="h-4 w-4 text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
