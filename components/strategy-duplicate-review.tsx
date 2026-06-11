/**
 * StrategyDuplicateReview — mirrors the Factwise project page's
 * DuplicateReviewPopup. When the user picks items that have unselected
 * duplicate siblings (same enterprise_item appearing under another BOM),
 * we show this dialog so they can choose whether to add the siblings.
 */
"use client"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useEffect, useMemo, useState } from "react"
import type { DuplicateItem, DuplicateOccurrence } from "@/lib/api"

export interface StrategyDuplicateReviewSelection {
  /** project_item_ids the user agreed to ADD on top of their original picks. */
  additionalItemIds: string[]
}

interface Props {
  open: boolean
  duplicateItems: DuplicateItem[]
  /** Currently-selected project_item_ids — used to compute the unselected siblings. */
  selectedProjectItemIds: string[]
  /** Confirm — onClose runs with whatever the user wants to add (possibly empty). */
  onConfirm: (selection: StrategyDuplicateReviewSelection) => void
  /** Skip / Cancel — proceeds with current selection, no additions. */
  onSkip: () => void
}

interface ReviewRow {
  dup: DuplicateItem
  selectedOccs: DuplicateOccurrence[]
  unselectedOccs: DuplicateOccurrence[]
}

export function StrategyDuplicateReview({
  open,
  duplicateItems,
  selectedProjectItemIds,
  onConfirm,
  onSkip,
}: Props) {
  // Identify duplicate groups where the user picked SOME but not ALL.
  const rows: ReviewRow[] = useMemo(() => {
    return duplicateItems
      .map((dup) => {
        const selected = dup.occurrences.filter((o) =>
          selectedProjectItemIds.includes(o.project_item_id)
        )
        const unselected = dup.occurrences.filter(
          (o) =>
            !selectedProjectItemIds.includes(o.project_item_id) &&
            o.pending_quantity > 0
        )
        return { dup, selectedOccs: selected, unselectedOccs: unselected }
      })
      .filter((r) => r.selectedOccs.length > 0 && r.unselectedOccs.length > 0)
  }, [duplicateItems, selectedProjectItemIds])

  // Default: every unselected sibling pre-checked (matches the project popup).
  const [picked, setPicked] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!open) return
    const next = new Set<string>()
    rows.forEach((r) =>
      r.unselectedOccs.forEach((o) => next.add(o.project_item_id))
    )
    setPicked(next)
  }, [open, rows])

  if (rows.length === 0) return null

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onSkip()}>
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">
            Duplicate items found
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Some of your selected items appear in other BOMs too. Add the other
            occurrences so all of them get covered, or skip to proceed with just
            what you picked.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {rows.map(({ dup, selectedOccs, unselectedOccs }) => (
            <div
              key={dup.enterprise_item_id}
              className="rounded-md border border-gray-200 p-3 bg-gray-50"
            >
              <div className="mb-2">
                <div className="font-medium text-sm text-gray-900">
                  {dup.enterprise_item_code} — {dup.enterprise_item_name}
                </div>
                <div className="text-xs text-gray-600">
                  Selected {selectedOccs.length} of {dup.occurrence_count}{" "}
                  occurrences ({unselectedOccs.length} more available).
                </div>
              </div>

              <div className="space-y-1">
                {unselectedOccs.map((occ) => (
                  <label
                    key={occ.project_item_id}
                    className="flex items-center gap-2 text-sm cursor-pointer text-gray-900"
                  >
                    <Checkbox
                      checked={picked.has(occ.project_item_id)}
                      onCheckedChange={() => toggle(occ.project_item_id)}
                    />
                    <span className="flex-1">
                      <span className="font-mono text-xs text-gray-600">
                        {occ.bom_path || occ.bom_code || "Project"}
                      </span>
                      <span className="ml-2 text-xs text-gray-600">
                        pending qty: {occ.pending_quantity}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onSkip}>
            Skip — use my selection
          </Button>
          <Button
            onClick={() =>
              onConfirm({ additionalItemIds: Array.from(picked) })
            }
          >
            Add {picked.size} item{picked.size === 1 ? "" : "s"} &amp; continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
