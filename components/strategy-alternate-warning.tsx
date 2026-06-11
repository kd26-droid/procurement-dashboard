/**
 * StrategyAlternateWarning — mirrors the Factwise project page's
 * AlternateWithoutParentWarningPopup. When the user picks an alternate BOM
 * item without its parent in the same selection, this warns them and offers
 * to auto-add the parents.
 *
 * Lighter UI than the project version (which is just a one-liner + buttons);
 * we list each alternate→parent pair so the user knows what gets added.
 */
"use client"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

export interface AlternateWarning {
  alternateCode: string
  alternateName: string
  /** Strategy lineItem row id of the alternate. */
  alternateRowId: number
  parentCode: string
  parentName: string
  /** Strategy lineItem row id of the parent (null if not present in the table). */
  parentRowId: number | null
  bomCode: string
}

export interface StrategyAlternateWarningSelection {
  /** Strategy lineItem row ids of the parents to auto-add to the selection. */
  parentRowIds: number[]
}

interface Props {
  open: boolean
  warnings: AlternateWarning[]
  onConfirm: (sel: StrategyAlternateWarningSelection) => void
  onCancel: () => void
}

export function StrategyAlternateWarning({
  open,
  warnings,
  onConfirm,
  onCancel,
}: Props) {
  if (warnings.length === 0) return null

  const addableParentIds = Array.from(
    new Set(
      warnings
        .map((w) => w.parentRowId)
        .filter((x): x is number => typeof x === 'number'),
    ),
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <AlertTriangle className="size-5 text-amber-500" />
            Alternate items without their parent
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            You picked alternates whose primary parent isn't in your selection.
            We can auto-add the parent items so the BOM stays consistent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2 max-h-[300px] overflow-y-auto">
          {warnings.map((w) => (
            <div
              key={`${w.alternateRowId}-${w.parentCode}`}
              className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900"
            >
              <div className="font-medium">
                {w.alternateCode}
                <span className="text-gray-500 font-normal">
                  {' '}— {w.alternateName}
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                Alternate in BOM <span className="font-mono">{w.bomCode}</span>.
                Parent: <span className="font-medium text-gray-900">{w.parentCode}</span>
                {w.parentName ? ` — ${w.parentName}` : ''}
                {w.parentRowId === null && (
                  <span className="ml-2 text-amber-700">
                    (parent not in your project — cannot auto-add)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm({ parentRowIds: addableParentIds })}
          >
            {addableParentIds.length > 0
              ? `Add ${addableParentIds.length} parent${addableParentIds.length === 1 ? '' : 's'} & continue`
              : 'Continue anyway'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
