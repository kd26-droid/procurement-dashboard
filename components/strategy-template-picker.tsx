/**
 * StrategyTemplatePicker — opens on the strategy dashboard when the user
 * clicks Execute Action. Lets them pick an entity + template + split toggle.
 *
 * It does NOT call the create APIs itself. On confirm it returns the
 * selection to the caller via `onConfirm`. The caller postMessages the
 * selection to the parent Factwise window, which then runs its proven
 * Create Event / Create Quote code path to actually create the records.
 *
 * If both Event and Quote groups are present, the parent shows one picker
 * after the other in a queue.
 */
"use client"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useEffect, useMemo, useState } from "react"
import {
  EntityListItem,
  TemplateListItem,
  listBuyerEntities,
  listTemplates,
} from "@/lib/api"

export type StrategyAction = "Event" | "Quote"

export interface StrategyTemplatePickerSelection {
  action: StrategyAction
  entityId: string
  templateId: string
  splitByItem: boolean
  itemCount: number
}

interface Props {
  open: boolean
  /** Which action this picker is for. Drives template-type filter + labels. */
  action: StrategyAction
  /** How many items will be created — shown in the dialog header. */
  itemCount: number
  /** Default for the split toggle — comes from admin setting / per-user override. */
  defaultSplit: boolean
  onConfirm: (selection: StrategyTemplatePickerSelection) => void
  onCancel: () => void
}

const TEMPLATE_TYPE: Record<StrategyAction, "RFQ" | "QUOTE_CALCULATOR"> = {
  Event: "RFQ",
  Quote: "QUOTE_CALCULATOR",
}

export function StrategyTemplatePicker({
  open,
  action,
  itemCount,
  defaultSplit,
  onConfirm,
  onCancel,
}: Props) {
  const [entities, setEntities] = useState<EntityListItem[]>([])
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [entityId, setEntityId] = useState<string>("")
  const [templateId, setTemplateId] = useState<string>("")
  const [split, setSplit] = useState<boolean>(defaultSplit)
  const [loadingEntities, setLoadingEntities] = useState(false)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state every time the dialog reopens for a new action.
  useEffect(() => {
    if (!open) return
    setEntityId("")
    setTemplateId("")
    setSplit(defaultSplit)
    setError(null)
  }, [open, action, defaultSplit])

  // Fetch buyer-active entities once per open.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingEntities(true)
    listBuyerEntities()
      .then((res) => {
        if (cancelled) return
        setEntities(res)
        // Auto-select first when there is one — same UX as the Factwise popups.
        if (res.length > 0) setEntityId(res[0].entity_id)
      })
      .catch((e: any) => !cancelled && setError(e?.message || String(e)))
      .finally(() => !cancelled && setLoadingEntities(false))
    return () => {
      cancelled = true
    }
  }, [open])

  // Auto-select first entity whenever entityId is empty and entities are
  // available. Fires when the picker switches action (Event → Quote) — the
  // reset effect wipes entityId to "" but the entity-fetch effect above
  // doesn't refire (deps are just [open] which stays true). Without this,
  // the entity dropdown stays empty and the template dropdown is disabled
  // because of the !entityId check in its disabled condition.
  useEffect(() => {
    if (!open) return
    if (entityId) return
    if (entities.length === 0) return
    setEntityId(entities[0].entity_id)
  }, [open, entityId, entities])

  // Fetch templates each time the entity changes (or dialog opens).
  useEffect(() => {
    if (!open || !entityId) return
    let cancelled = false
    setLoadingTemplates(true)
    setTemplateId("")
    listTemplates(TEMPLATE_TYPE[action], entityId)
      .then((res) => {
        if (cancelled) return
        setTemplates(res)
        const def = res.find((t) => t.is_default) || res[0]
        if (def) setTemplateId(def.template_id)
      })
      .catch((e: any) => !cancelled && setError(e?.message || String(e)))
      .finally(() => !cancelled && setLoadingTemplates(false))
    return () => {
      cancelled = true
    }
  }, [open, entityId, action])

  const canConfirm = useMemo(
    () => !!entityId && !!templateId && !loadingTemplates && !loadingEntities,
    [entityId, templateId, loadingTemplates, loadingEntities]
  )

  const actionLabel = action === "Event" ? "Create Event" : "Create Quote"

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-gray-900">{actionLabel}</DialogTitle>
          <DialogDescription className="text-gray-600">
            {itemCount} item{itemCount === 1 ? "" : "s"} selected. Pick a
            template and entity — Factwise will create using its standard{" "}
            {action.toLowerCase()} flow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="strategy-picker-entity">Entity</Label>
            <Select value={entityId} onValueChange={setEntityId} disabled={loadingEntities || entities.length <= 1}>
              <SelectTrigger
              id="strategy-picker-entity"
              className="w-full text-gray-900"
            >
                <SelectValue
                  placeholder={loadingEntities ? "Loading…" : "Select entity"}
                />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.entity_id} value={e.entity_id}>
                    {e.entity_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="strategy-picker-template">
              {action} Template
            </Label>
            <Select
              value={templateId}
              onValueChange={setTemplateId}
              disabled={
                loadingTemplates || templates.length === 0 || !entityId
              }
            >
              <SelectTrigger
              id="strategy-picker-template"
              className="w-full text-gray-900"
            >
                <SelectValue
                  placeholder={
                    loadingTemplates
                      ? "Loading templates…"
                      : templates.length === 0
                      ? "No ONGOING template for this entity"
                      : "Select template"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.template_id} value={t.template_id}>
                    {t.name}
                    {t.is_default ? "  (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingTemplates && templates.length === 0 && entityId && (
              <p className="text-xs text-red-600">
                Ask your admin to publish an {action.toLowerCase()} template for
                this entity, or pick another entity.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-3">
            <div className="flex-1 pr-3">
              <Label
                htmlFor="strategy-picker-split"
                className="text-sm font-medium text-gray-900 cursor-pointer"
              >
                Split into one {action.toLowerCase()} per item
              </Label>
              <p className="text-xs text-gray-600 mt-0.5">
                {split
                  ? `ON — ${itemCount} separate ${action.toLowerCase()}${itemCount === 1 ? '' : 's'} will be created, one per item.`
                  : `OFF — one combined ${action.toLowerCase()} will be created with all ${itemCount} item${itemCount === 1 ? '' : 's'}.`}
              </p>
            </div>
            {/* Inline-styled switch so it's visible regardless of theme. */}
            <button
              id="strategy-picker-split"
              type="button"
              role="switch"
              aria-checked={split}
              onClick={() => setSplit(!split)}
              className={[
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
                split
                  ? 'bg-blue-600 focus:ring-blue-500'
                  : 'bg-gray-300 focus:ring-gray-400',
              ].join(' ')}
            >
              <span className="sr-only">Toggle split-by-item</span>
              <span
                className={[
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform',
                  split ? 'translate-x-5' : 'translate-x-0',
                ].join(' ')}
              />
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-600">Error loading data: {error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({
                action,
                entityId,
                templateId,
                splitByItem: split,
                itemCount,
              })
            }
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
