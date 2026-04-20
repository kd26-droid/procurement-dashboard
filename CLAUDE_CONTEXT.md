# Procurement Strategy Dashboard — Context Primer

## Repo
- Path: `/Users/kartikd/Downloads/procurement po/procurement-dashboard/`
- Stack: Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Recharts
- Branches: `main` (prod → procurement-dashboard-orcin.vercel.app), `dev` (preview)
- GitHub: kd26-droid/procurement-dashboard (`gh auth switch --user kd26-droid` if pushes fail)
- Deploy: `cd "/Users/kartikd/Downloads/procurement po/procurement-dashboard" && npx vercel --prod`

## Run locally
```
lsof -ti:3000 | xargs kill -9 2>/dev/null
cd "/Users/kartikd/Downloads/procurement po/procurement-dashboard"
npm run dev -- -p 3000
```
Embedded in Factwise as iframe. Standalone URL needs `?project_id=...&token=<JWT>&api_env=dev`.

## Files
- `app/page.tsx` — entire dashboard (~6900 lines). Single file.
- `lib/api.ts` — backend wrappers + types
- `components/settings-dialog.tsx` — settings panel
- `components/autoassign-popovers.tsx` — top-bar popovers
- `components/ui/*` — shadcn primitives

## Backend
- Dev: `https://poiigw0go0.execute-api.us-east-1.amazonaws.com/dev`
- Prod: `https://qc9s5bz8d7.execute-api.us-east-1.amazonaws.com/prod`
- Auth: JWT from `?token=` → `Authorization: Bearer <token>`
- Most endpoints under `/organization/project/{projectId}/strategy/...`

Key `lib/api.ts` functions: `getProjectOverview`, `getProjectItems`, `getProjectDetail`, `getProjectUsers`, `updateProjectItem`, `bulkAssignUsersWithRoles` (roles: RFQ_ASSIGNEE, QUOTE_ASSIGNEE, RFQ_RESPONSIBLE, QUOTE_RESPONSIBLE, ASSIGNED), `getProjectTags`, `updateItemTags`, `triggerDigikeyPricing`/`triggerMouserPricing`/`get*JobStatus`, `getAssignmentRules`, `getActionRules`, `searchVendors`, `getItemCustomVendors`, `addItemCustomVendors`, `removeItemCustomVendor`.

## Data flow
1. Mount: parallel `getProjectOverview` + `getProjectItems` (100, skip_pricing_jobs) + `getProjectUsers` + `getProjectTags`
2. If total > 100: background loader fetches remaining pages
3. All items loaded → `triggerPricingJobs` → Digikey/Mouser async
4. `useEffect([allItemsLoaded])` also hydrates `custom_vendors` per item in waves of 8
5. `buyer_entity_id` known → `getActionRules` eagerly

## Columns (columnOrder)
itemId, description, bom, quantity, unit, category, projectManager, rfqAssignee, quoteAssignee, rfqResponsible, quoteResponsible, action, assignedTo, dueDate, vendor, unitPrice, source, priceDigikey, priceMouser.

**Removed from UI**: pricePO, priceContract, priceQuote, priceEXIM.

## Digikey/Mouser cells
Variant-aware (`data.variants[]`). Cell: preferred variant price + packaging + MOQ chip (amber if > 1) + `+fee` badge + chevron. Tooltip: one card per variant with full Qty/Unit/Total table, totals recomputed when reeling fee applies. Helper: `renderDistributorTooltip(pricing, label)` near top of `app/page.tsx`. Fallback to legacy `unit_price` if `variants[]` missing.

## Custom vendors
Vendor column reads `item.custom_vendors[]` (type `CustomVendor`). Tag-style badges.

Edit popup (single + bulk):
- Blue `[Vendor x]` pills; x = immediate DELETE
- Bulk mode: amber banner, shows intersection common to all selected items
- Search debounced 300ms → `searchVendors({ search, excludeForItemId })`
- **Click a result = immediate POST** (no checkboxes/add button)
- Bulk loops add/remove in parallel
- `editVendorDirty` enables Save; Save just closes popup

Background hydrator in `useEffect([allItemsLoaded])` — temporary until backend batches `custom_vendors` into `getProjectItems`.

## Auto-assign
- `handleAutoAssignUsers`: rules → custom sections → per-item condition eval (AND/OR) → tag→role map → `bulkAssignUsersWithRoles`. LocalStorage maps beat backend rules.
- `handleAssignActions`: rule-driven via `getActionRules`.

## CSV export
`handleExportCSV`. Vendor = semicolon-separated. Prices = 5 decimals + currency symbols. "Per Unit Qty" = Item Qty / BOM Slab Qty.

## Intentional hardcoding
- `source` column always `"Project"`
- No PO/Contract/Quote/EXIM columns on prod
- Vendor names are REAL (custom vendors API) — never reintroduce hardcoded vendor lists

## Gotchas
- Settings migration: old `tagUserMap` → new `rfqAssigneeMap` fallback in `currentSettings` memo
- `skipSuccessCheck: true` required for assignment rules, action rules, custom vendors
- Vercel auto-deploys on push; `npx vercel --prod` manually if preview errors
- NEVER restore PO/Contract/Quote/EXIM columns, hardcoded vendor names, or cheapest-source logic on main

## Test project
- Project: `10cae319-0543-4609-8d9c-601a802dd13a`
- Item CHAIRRRRR: `545a33dc-3fbb-463b-aa77-dbc22e88ce63` (MPN SN74HC595DR)
- Sample vendor IDs: `cfa0d219-2b8c-434e-906e-2e5015d0b7bf`, `8517c224-1af1-4dd3-812f-8c2a385a72e0`, `e2617729-5cfb-4c73-9ba4-58f82bda860c`

## Recent work on dev (not main)
- Variant-aware Digikey/Mouser cells + tooltips (commit a2ecc80)
- Custom vendors end-to-end (column, popup, bulk, CSV, hydration) — local only, NOT committed

## Conventions
- Don't refactor unrelated code
- `npx next build` before pushing
- Terse responses; no preamble
- Vendor search = single-click autoadd. Never add checkboxes/add-button back.
