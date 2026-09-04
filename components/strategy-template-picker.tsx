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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  GitBranch,
  RotateCcw,
  Settings,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  CostCenterListItem,
  EntityListItem,
  GeneralLedgerListItem,
  IncotermListItem,
  ModuleTemplateDetail,
  ModuleTemplateSectionItem,
  TemplateListItem,
  getModuleTemplateById,
  listCostCenters,
  listGeneralLedgers,
  listIncoterms,
  listBuyerEntities,
  listTemplates,
} from "@/lib/api"

export type StrategyAction = "Event" | "Quote"
type PeriodValue = "DAYS" | "WEEKS" | "MONTHS"
type PaymentReferenceDate = string

export interface StrategyEventDefaults {
  default_event_payment_type?: "PER_INVOICE_ITEM"
  default_event_prepayment_percentage?: number
  default_event_payment_terms?: {
    term: number
    period: PeriodValue
    applied_from: PaymentReferenceDate
  }
  default_event_incoterm_id?: string | null
  default_event_lead_time?: number | null
  default_event_lead_time_period?: PeriodValue | null
  default_delivery_date?: string | null
  default_event_project_id?: string | null
  default_event_cost_centre_id?: string | null
  default_event_gl_id?: string | null
  default_customer_entity_id?: string | null
  default_customer_entity_name?: string | null
  requisition_information?: Array<{
    requisition_number: string
    requisition_approved: boolean
  }>
  default_event_quantity_tolerance_percentage?: number | null
  default_event_item_additional_information?: string
  default_custom_sections?: Array<{
    name: string
    section_type: "ITEM"
    custom_fields: Array<{
      name: string
      type: string
      value: string | string[] | number | boolean | null
      is_required: boolean
      is_mandatory: boolean
      is_visible: boolean
      is_negotiable: boolean
      description: string
    }>
  }>
}

export interface StrategyTemplatePickerSelection {
  action: StrategyAction
  entityId: string
  templateId: string
  splitByItem: boolean
  itemCount: number
  eventDefaults?: StrategyEventDefaults
}

interface Props {
  open: boolean
  /** Which action this picker is for. Drives template-type filter + labels. */
  action: StrategyAction
  /** How many items will be created — shown in the dialog header. */
  itemCount: number
  /** Default for the split toggle — comes from admin setting / per-user override. */
  defaultSplit: boolean
  projectId?: string
  projectName?: string
  customerEntityId?: string | null
  customerName?: string | null
  onConfirm: (selection: StrategyTemplatePickerSelection) => void
  onCancel: () => void
}

const TEMPLATE_TYPE: Record<StrategyAction, "RFQ" | "QUOTE_CALCULATOR"> = {
  Event: "RFQ",
  Quote: "QUOTE_CALCULATOR",
}

const POPOVER_SELECT_PROPS = {
  side: "bottom" as const,
  align: "start" as const,
  sideOffset: 6,
  avoidCollisions: false,
  className: "z-[30000] max-h-72 rounded-md border-gray-300 bg-white shadow-lg",
}

const TEMPLATE_STANDARD_FIELD_BACKEND_NAMES = {
  Quantity: "QUANTITY",
  "Delivery date": "DELIVERY_DATE",
  "Target rate": "BASE_RATE",
  "Shipping rate": "SHIPPING_RATE",
  Customer: "CUSTOMER_NAME",
  "Payment terms": "PAYMENT_TERMS",
  Incoterms: "INCOTERMS",
  "Lead time": "LEAD_TIME",
  "GR tolerance": "GR_TOLERANCE",
  Requisition: "REQUISITION",
  "Additional information": "ADDITIONAL_INFORMATION",
  Project: "PROJECT",
  "Cost center": "COST_CENTER",
  GL: "GL",
  "Additional costs": "ADDITIONAL_COSTS",
  Taxes: "TAX",
  Discount: "DISCOUNT",
  BOM: "BOM",
  Vendor: "VENDOR",
  "Shipping Address": "SHIPPING_ADDRESS",
  Attachments: "ITEM_ATTACHMENT",
} as const

type TemplateStandardField =
  (typeof TEMPLATE_STANDARD_FIELD_BACKEND_NAMES)[keyof typeof TEMPLATE_STANDARD_FIELD_BACKEND_NAMES]

type SupportedDefaultTermField =
  | "DELIVERY_DATE"
  | "PROJECT"
  | "COST_CENTER"
  | "GL"
  | "CUSTOMER_NAME"
  | "INCOTERMS"
  | "LEAD_TIME"
  | "GR_TOLERANCE"
  | "REQUISITION"
  | "ADDITIONAL_INFORMATION"
  | "PAYMENT_TERMS"

const SUPPORTED_DEFAULT_TERM_FIELDS = new Set<TemplateStandardField>([
  "DELIVERY_DATE",
  "PROJECT",
  "COST_CENTER",
  "GL",
  "CUSTOMER_NAME",
  "INCOTERMS",
  "LEAD_TIME",
  "GR_TOLERANCE",
  "REQUISITION",
  "ADDITIONAL_INFORMATION",
  "PAYMENT_TERMS",
])

interface EventDefaultsFormState {
  paymentMode: "INVOICE" | "PO"
  paymentTerm: string
  paymentPeriod: PeriodValue
  paymentAppliedFrom: PaymentReferenceDate
  prepaymentPercentage: string
  incotermId: string
  leadTime: string
  leadTimePeriod: PeriodValue
  deliveryDate: string
  projectId: string
  costCenterId: string
  glId: string
  customerEntityId: string
  customerName: string
  requisitionNumber: string
  requisitionApproved: boolean
  quantityTolerance: string
  additionalInformation: string
  customFields: Record<string, string | string[] | boolean | null>
}

const EMPTY_EVENT_DEFAULTS: EventDefaultsFormState = {
  paymentMode: "INVOICE",
  paymentTerm: "",
  paymentPeriod: "DAYS",
  paymentAppliedFrom: "INVOICE_DATE",
  prepaymentPercentage: "",
  incotermId: "",
  leadTime: "",
  leadTimePeriod: "DAYS",
  deliveryDate: "",
  projectId: "",
  costCenterId: "",
  glId: "",
  customerEntityId: "",
  customerName: "",
  requisitionNumber: "",
  requisitionApproved: false,
  quantityTolerance: "",
  additionalInformation: "",
  customFields: {},
}

interface TemplateCustomField {
  id: string
  sectionName: string
  templateName: string
  label: string
  type: string
  choiceType?: string
  choices: string[]
  isRequired: boolean
  isMandatory: boolean
  isVisible: boolean
  isNegotiable: boolean
  description: string
  defaultValue?: unknown
}

type DefaultTermRow =
  | {
      type: "standard"
      key: string
      field: SupportedDefaultTermField
      label: string
      description: string
      required: boolean
    }
  | { type: "custom"; key: string; field: TemplateCustomField }

const itemDefaultSectionNames = new Set([
    "Item Terms",
    "Payment and Delivery Terms",
    "Additional Details",
])

function getTemplateStandardField(
  item: ModuleTemplateSectionItem
): TemplateStandardField | null {
  return (
    TEMPLATE_STANDARD_FIELD_BACKEND_NAMES[
      item.name as keyof typeof TEMPLATE_STANDARD_FIELD_BACKEND_NAMES
    ] || null
  )
}

function sortByTemplateSequence<T extends { sequence?: number }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const aSequence = typeof a.sequence === "number" ? a.sequence : Number.MAX_SAFE_INTEGER
    const bSequence = typeof b.sequence === "number" ? b.sequence : Number.MAX_SAFE_INTEGER
    return aSequence - bSequence
  })
}

function isTemplateItemVisible(item: {
  additional_information?: Record<string, any> | null
}) {
  const info = item.additional_information || {}
  return info.is_hidden !== true && info.showField !== false
}

function isTemplateBuiltInField(item: ModuleTemplateSectionItem) {
  return (
    item.is_builtin_field === true ||
    item.item_type === "FW" ||
    item.section_item_type === "FW"
  )
}

function getItemLabel(item: ModuleTemplateSectionItem) {
  return item.alternate_name || item.name
}

function getSectionLabel(section: { alternate_name?: string | null; name: string }) {
  return section.alternate_name || section.name
}

function getTemplateConstraintType(item: ModuleTemplateSectionItem) {
  const constraints = item.constraints || {}
  return constraints.field_type || constraints.fieldType || "SHORTTEXT"
}

function normalizeCustomFieldType(type: string) {
  switch (type) {
    case "SHORT_TEXT":
      return "SHORTTEXT"
    case "LONG_TEXT":
      return "LONGTEXT"
    case "DECIMAL":
      return "FLOAT"
    default:
      return type
  }
}

function getRawTemplateDefaultValue(item: ModuleTemplateSectionItem) {
  const raw = item as any
  const info = item.additional_information || {}
  return (
    raw.default_value ??
    raw.defaultValue ??
    raw.value ??
    info.default_value ??
    info.defaultValue ??
    info.value
  )
}

function getChoiceLabel(choice: any) {
  if (choice === null || choice === undefined) return ""
  if (typeof choice !== "object") return String(choice).trim()
  return String(
    choice.option_name ??
      choice.name ??
      choice.value ??
      choice.label ??
      choice.alternate_name ??
      choice.display_name ??
      ""
  ).trim()
}

function getTemplateChoiceLabels(item: ModuleTemplateSectionItem) {
  const constraints = item.constraints || {}
  const rawChoices: any[] = Array.isArray(constraints.choices)
    ? constraints.choices
    : Array.isArray((item as any).options)
      ? (item as any).options
      : []
  const choiceLabels = rawChoices.map(getChoiceLabel)

  return Array.from(
    new Set(choiceLabels.filter((choice: string) => choice.length > 0))
  )
}

function toTemplateCustomField(
  sectionName: string,
  item: ModuleTemplateSectionItem
): TemplateCustomField {
  const info = item.additional_information || {}
  const constraints = item.constraints || {}
  const fieldType = normalizeCustomFieldType(getTemplateConstraintType(item))
  const choiceType = constraints.choice_type || constraints.choiceType

  return {
    id: `${sectionName}::${item.name}`,
    sectionName,
    templateName: item.name,
    label: getItemLabel(item),
    type: fieldType,
    choiceType,
    choices: getTemplateChoiceLabels(item),
    isRequired: !!item.is_required || !!item.is_mandatory,
    isMandatory: !!item.is_mandatory,
    isVisible: isTemplateItemVisible(item),
    isNegotiable: !!info.is_negotiable,
    description: item.description || "",
    defaultValue: getRawTemplateDefaultValue(item),
  }
}

const STANDARD_PAYMENT_REFERENCE_OPTIONS: Array<{
  optionName: string
  value: PaymentReferenceDate
  label: string
}> = [
  { optionName: "Invoice date", value: "INVOICE_DATE", label: "Invoice date" },
  { optionName: "Dispatch date", value: "DISPATCH_DATE", label: "Dispatch date" },
  { optionName: "Receipt date", value: "RECEIPT_DATE", label: "Receipt date" },
]

function getPaymentTermsItem(
  template: ModuleTemplateDetail | null
): ModuleTemplateSectionItem | null {
  if (!template?.section_list) return null
  for (const section of sortByTemplateSequence(template.section_list)) {
    for (const item of sortByTemplateSequence(section.section_items || [])) {
      if (item.name === "Payment terms" && isTemplateItemVisible(item)) {
        return item
      }
    }
  }
  return null
}

function templateUsesPoPaymentTerms(template: ModuleTemplateDetail | null) {
  const paymentItem = getPaymentTermsItem(template)
  const paymentType = String(
    paymentItem?.additional_information?.payment_type || ""
  ).toLowerCase()
  return paymentType.includes("po terms") || paymentType.includes("deliverable")
}

function getPaymentReferenceOptions(template: ModuleTemplateDetail | null) {
  const paymentItem = getPaymentTermsItem(template)
  const info = paymentItem?.additional_information || {}
  const selectedNames = Array.isArray(info.payment_from_options)
    ? info.payment_from_options.map((option: any) => String(option).toLowerCase())
    : []
  const options = Array.isArray(paymentItem?.options) ? paymentItem.options : []
  const rows: Array<{ value: PaymentReferenceDate; label: string }> = []
  const addOption = (value: PaymentReferenceDate, label: string) => {
    if (!rows.some((row) => row.value === value)) rows.push({ value, label })
  }

  options.forEach((option: any) => {
    const rawName = String(option?.name || option?.option_name || option || "")
    if (selectedNames.length > 0 && !selectedNames.includes(rawName.toLowerCase())) {
      return
    }
    const standard = STANDARD_PAYMENT_REFERENCE_OPTIONS.find(
      (entry) => entry.optionName.toLowerCase() === rawName.toLowerCase()
    )
    if (standard) {
      addOption(standard.value, option.alternate_name || standard.label)
      return
    }
    if (rawName) {
      addOption(option?.alternate_name || rawName, option?.alternate_name || rawName)
    }
  })

  if (rows.length > 0) return rows

  STANDARD_PAYMENT_REFERENCE_OPTIONS.forEach((option) => {
    if (
      selectedNames.length === 0 ||
      selectedNames.includes(option.optionName.toLowerCase())
    ) {
      addOption(option.value, option.label)
    }
  })

  return rows.length > 0 ? rows : [{ value: "INVOICE_DATE", label: "Invoice date" }]
}

function getDefaultTermRows(template: ModuleTemplateDetail | null): DefaultTermRow[] {
  if (!template?.section_list) return []
  const addedStandardFields = new Set<SupportedDefaultTermField>()
  const addedCustomFields = new Set<string>()
  const eventLevelFields = new Set<TemplateStandardField>()
  const standardItems = new Map<TemplateStandardField, ModuleTemplateSectionItem>()
  const customRowsBySection = new Map<string, DefaultTermRow[]>()

  template.section_list
    .filter(
      (section) =>
        section.name === "Event Details" || section.name === "PO Group Details"
    )
    .flatMap((section) => section.section_items || [])
    .forEach((item) => {
      const standardField = getTemplateStandardField(item)
      if (standardField && isTemplateItemVisible(item)) {
        eventLevelFields.add(standardField)
      }
    })

  sortByTemplateSequence(template.section_list)
    .filter((section) => itemDefaultSectionNames.has(section.name))
    .forEach((section) => {
      const sectionCustomRows: DefaultTermRow[] = []
      sortByTemplateSequence(section.section_items || []).forEach((item) => {
        if (!isTemplateItemVisible(item)) return
        if (item.parent_section_item !== undefined && item.parent_section_item !== null) {
          return
        }
        if (item.field_level === "OTHER") return

        if (isTemplateBuiltInField(item)) {
          const standardField = getTemplateStandardField(item)
          if (
            standardField &&
            SUPPORTED_DEFAULT_TERM_FIELDS.has(standardField) &&
            !eventLevelFields.has(standardField) &&
            !standardItems.has(standardField)
          ) {
            standardItems.set(standardField, item)
          }
          return
        }

        const customField = toTemplateCustomField(getSectionLabel(section), item)
        if (!addedCustomFields.has(customField.id)) {
          sectionCustomRows.push({
            type: "custom",
            key: `custom::${customField.id}`,
            field: customField,
          })
          addedCustomFields.add(customField.id)
        }
      })
      customRowsBySection.set(section.name, sectionCustomRows)
    })

  const rows: DefaultTermRow[] = []
  const pushStandard = (field: SupportedDefaultTermField) => {
    const item = standardItems.get(field)
    if (!item || addedStandardFields.has(field)) return
    rows.push({
      type: "standard",
      key: `standard::${field}`,
      field,
      label: getItemLabel(item),
      description: item.description || "",
      required: !!item.is_required,
    })
    addedStandardFields.add(field)
  }
  const pushCustomSection = (sectionName: string) => {
    rows.push(...(customRowsBySection.get(sectionName) || []))
  }

  // This order mirrors RFQ CreateEventItemTerms.tsx. Payment terms is kept at
  // the end because this popup renders it as an expandable detail block.
  pushStandard("DELIVERY_DATE")
  pushStandard("PROJECT")
  pushStandard("COST_CENTER")
  pushStandard("GL")
  pushStandard("CUSTOMER_NAME")
  pushCustomSection("Item Terms")
  pushStandard("INCOTERMS")
  pushStandard("LEAD_TIME")
  pushStandard("GR_TOLERANCE")
  pushCustomSection("Payment and Delivery Terms")
  pushStandard("REQUISITION")
  pushStandard("ADDITIONAL_INFORMATION")
  pushCustomSection("Additional Details")
  pushStandard("PAYMENT_TERMS")

  return rows
}

function getVisibleDefaultTermFields(rows: DefaultTermRow[]): SupportedDefaultTermField[] {
  return rows
    .filter((row): row is Extract<DefaultTermRow, { type: "standard" }> =>
      row.type === "standard"
    )
    .map((row) => row.field)
}

function getTemplateCustomFields(rows: DefaultTermRow[]): TemplateCustomField[] {
  return rows
    .filter((row): row is Extract<DefaultTermRow, { type: "custom" }> =>
      row.type === "custom"
    )
    .map((row) => row.field)
}

function emptyValueForCustomField(field: TemplateCustomField) {
  switch (field.type) {
    case "BOOLEAN":
      return null
    case "CHOICE":
      return field.choiceType === "MULTI_SELECT" ? [] : null
    default:
      return ""
  }
}

function normalizeCustomFieldValueForPayload(
  field: TemplateCustomField,
  value: string | string[] | boolean | null | undefined
) {
  if (Array.isArray(value)) return value.length > 0 ? value : null
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === "boolean") return value
  return null
}

function getCustomFieldInitialValue(field: TemplateCustomField) {
  const rawValue = field.defaultValue
  if (rawValue !== undefined && rawValue !== null) {
    if (field.type === "BOOLEAN") return rawValue === true || rawValue === "true"
    if (Array.isArray(rawValue)) return rawValue.map((value) => String(value))
    return String(rawValue)
  }
  return emptyValueForCustomField(field)
}

function buildInitialEventDefaultsFromTemplate(
  template: ModuleTemplateDetail | null,
  projectId = "",
  customerEntityId: string | null = null,
  customerName: string | null = null
): EventDefaultsFormState {
  const paymentReferenceOptions = getPaymentReferenceOptions(template)
  const customFields = getTemplateCustomFields(getDefaultTermRows(template))
  const customValues = customFields.reduce<EventDefaultsFormState["customFields"]>(
    (acc, field) => {
      acc[field.id] = getCustomFieldInitialValue(field)
      return acc
    },
    {}
  )

  return {
    ...EMPTY_EVENT_DEFAULTS,
    paymentMode: templateUsesPoPaymentTerms(template) ? "PO" : "INVOICE",
    paymentTerm: "1",
    paymentPeriod: "MONTHS",
    paymentAppliedFrom: paymentReferenceOptions[0]?.value || "INVOICE_DATE",
    prepaymentPercentage: "0",
    projectId,
    customerEntityId: customerEntityId || "",
    customerName: customerName || "",
    customFields: customValues,
  }
}

function buildDefaultCustomSections(
  customFields: TemplateCustomField[],
  values: Record<string, string | string[] | boolean | null>
): StrategyEventDefaults["default_custom_sections"] | undefined {
  if (customFields.length === 0) return undefined
  const sectionMap = new Map<string, NonNullable<StrategyEventDefaults["default_custom_sections"]>[number]>()
  customFields.forEach((field) => {
    const normalizedValue = normalizeCustomFieldValueForPayload(
      field,
      values[field.id] !== undefined
        ? values[field.id]
        : emptyValueForCustomField(field)
    )
    if (normalizedValue === null) return
    const section =
      sectionMap.get(field.sectionName) ||
      {
      name: field.sectionName,
      section_type: "ITEM" as const,
      custom_fields: [],
      }
    section.custom_fields.push({
      name: field.label,
      type:
        field.type === "CHOICE" && field.choiceType === "MULTI_SELECT"
          ? "MULTI_CHOICE"
          : field.type,
      value: normalizedValue,
      is_required: field.isRequired,
      is_mandatory: field.isMandatory,
      is_visible: field.isVisible,
      is_negotiable: field.isNegotiable,
      description: field.description,
    })
    sectionMap.set(field.sectionName, section)
  })
  const sections = Array.from(sectionMap.values()).filter(
    (section) => section.custom_fields.length > 0
  )
  return sections.length > 0 ? sections : undefined
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === "") return null
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}

function buildEventDefaults(
  defaults: EventDefaultsFormState,
  visibleFields: SupportedDefaultTermField[],
  customFields: TemplateCustomField[]
): StrategyEventDefaults | undefined {
  const payload: StrategyEventDefaults = {}

  if (
    visibleFields.includes("PAYMENT_TERMS") &&
    defaults.paymentMode === "INVOICE"
  ) {
    const paymentTerm = numberOrNull(defaults.paymentTerm)
    const prepayment = numberOrNull(defaults.prepaymentPercentage)
    if (paymentTerm !== null) {
      payload.default_event_payment_type = "PER_INVOICE_ITEM"
      payload.default_event_payment_terms = {
        term: paymentTerm,
        period: defaults.paymentPeriod,
        applied_from: defaults.paymentAppliedFrom,
      }
      payload.default_event_prepayment_percentage = prepayment ?? 0
    } else if (prepayment !== null) {
      payload.default_event_prepayment_percentage = prepayment
    }
  }

  if (visibleFields.includes("INCOTERMS") && defaults.incotermId) {
    payload.default_event_incoterm_id =
      defaults.incotermId === "NONE" ? null : defaults.incotermId
  }

  if (visibleFields.includes("LEAD_TIME")) {
    const leadTime = numberOrNull(defaults.leadTime)
    if (leadTime !== null) {
      payload.default_event_lead_time = leadTime
      payload.default_event_lead_time_period = defaults.leadTimePeriod
    }
  }

  if (visibleFields.includes("DELIVERY_DATE") && defaults.deliveryDate) {
    payload.default_delivery_date = defaults.deliveryDate
  }

  if (visibleFields.includes("PROJECT") && defaults.projectId) {
    payload.default_event_project_id = defaults.projectId
  }

  if (visibleFields.includes("COST_CENTER") && defaults.costCenterId) {
    payload.default_event_cost_centre_id =
      defaults.costCenterId === "NONE" ? null : defaults.costCenterId
  }

  if (visibleFields.includes("GL") && defaults.glId) {
    payload.default_event_gl_id =
      defaults.glId === "NONE" ? null : defaults.glId
  }

  if (defaults.customerEntityId) {
    payload.default_customer_entity_id =
      defaults.customerEntityId === "NONE" ? null : defaults.customerEntityId
    payload.default_customer_entity_name =
      defaults.customerEntityId === "NONE" ? null : defaults.customerName || null
  }

  if (visibleFields.includes("REQUISITION") && defaults.requisitionNumber.trim()) {
    payload.requisition_information = [
      {
        requisition_number: defaults.requisitionNumber.trim(),
        requisition_approved: defaults.requisitionApproved,
      },
    ]
  }

  if (visibleFields.includes("GR_TOLERANCE")) {
    const tolerance = numberOrNull(defaults.quantityTolerance)
    if (tolerance !== null) {
      payload.default_event_quantity_tolerance_percentage = tolerance
    }
  }

  if (
    visibleFields.includes("ADDITIONAL_INFORMATION") &&
    defaults.additionalInformation.trim()
  ) {
    payload.default_event_item_additional_information =
      defaults.additionalInformation.trim()
  }

  const defaultCustomSections = buildDefaultCustomSections(
    customFields,
    defaults.customFields
  )
  if (defaultCustomSections) {
    payload.default_custom_sections = defaultCustomSections
  }

  return Object.keys(payload).length > 0 ? payload : undefined
}

export function StrategyTemplatePicker({
  open,
  action,
  itemCount,
  defaultSplit,
  projectId = "",
  projectName = "",
  customerEntityId = null,
  customerName = null,
  onConfirm,
  onCancel,
}: Props) {
  const [entities, setEntities] = useState<EntityListItem[]>([])
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [entityId, setEntityId] = useState<string>("")
  const [templateId, setTemplateId] = useState<string>("")
  const [split, setSplit] = useState<boolean>(defaultSplit)
  const [termsExpanded, setTermsExpanded] = useState(false)
  const [paymentTermsExpanded, setPaymentTermsExpanded] = useState(false)
  const [templateDetail, setTemplateDetail] = useState<ModuleTemplateDetail | null>(null)
  const [incoterms, setIncoterms] = useState<IncotermListItem[]>([])
  const [costCenters, setCostCenters] = useState<CostCenterListItem[]>([])
  const [generalLedgers, setGeneralLedgers] = useState<GeneralLedgerListItem[]>([])
  const [eventDefaults, setEventDefaults] =
    useState<EventDefaultsFormState>(EMPTY_EVENT_DEFAULTS)
  const [loadingEntities, setLoadingEntities] = useState(false)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [loadingTemplateDetail, setLoadingTemplateDetail] = useState(false)
  const [loadingIncoterms, setLoadingIncoterms] = useState(false)
  const [loadingAccountingOptions, setLoadingAccountingOptions] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state every time the dialog reopens for a new action.
  useEffect(() => {
    if (!open) return
    setEntityId("")
    setTemplateId("")
    setSplit(defaultSplit)
    setTermsExpanded(false)
    setPaymentTermsExpanded(false)
    setTemplateDetail(null)
    setCostCenters([])
    setGeneralLedgers([])
    setEventDefaults({
      ...EMPTY_EVENT_DEFAULTS,
      projectId,
      customerEntityId: customerEntityId || "",
      customerName: customerName || "",
    })
    setError(null)
  }, [open, action, defaultSplit, projectId, customerEntityId, customerName])

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

  useEffect(() => {
    if (!open || action !== "Event") return
    let cancelled = false
    setLoadingIncoterms(true)
    listIncoterms()
      .then((res) => {
        if (!cancelled) setIncoterms(res)
      })
      .catch((e: any) => {
        if (!cancelled) {
          console.warn("[StrategyTemplatePicker] Failed to load incoterms", e)
          setIncoterms([])
        }
      })
      .finally(() => !cancelled && setLoadingIncoterms(false))
    return () => {
      cancelled = true
    }
  }, [open, action])

  useEffect(() => {
    setCostCenters([])
    setGeneralLedgers([])
    if (!open || action !== "Event" || !entityId) return
    let cancelled = false
    setLoadingAccountingOptions(true)
    Promise.all([listCostCenters(entityId), listGeneralLedgers(entityId)])
      .then(([costCenterRows, generalLedgerRows]) => {
        if (cancelled) return
        setCostCenters(costCenterRows)
        setGeneralLedgers(generalLedgerRows)
      })
      .catch((e: any) => {
        if (!cancelled) {
          console.warn(
            "[StrategyTemplatePicker] Failed to load accounting options",
            e
          )
          setCostCenters([])
          setGeneralLedgers([])
        }
      })
      .finally(() => !cancelled && setLoadingAccountingOptions(false))
    return () => {
      cancelled = true
    }
  }, [open, action, entityId])

  useEffect(() => {
    setTemplateDetail(null)
    setEventDefaults(EMPTY_EVENT_DEFAULTS)
    setPaymentTermsExpanded(false)
    if (!open || action !== "Event" || !entityId || !templateId) return
    let cancelled = false
    setLoadingTemplateDetail(true)
    getModuleTemplateById(entityId, templateId)
      .then((res) => {
        if (!cancelled) {
          setTemplateDetail(res)
          setEventDefaults(
            buildInitialEventDefaultsFromTemplate(
              res,
              projectId,
              customerEntityId,
              customerName
            )
          )
        }
      })
      .catch((e: any) => !cancelled && setError(e?.message || String(e)))
      .finally(() => !cancelled && setLoadingTemplateDetail(false))
    return () => {
      cancelled = true
    }
  }, [open, action, entityId, templateId, projectId, customerEntityId, customerName])

  const defaultTermRows = useMemo(
    () => getDefaultTermRows(templateDetail),
    [templateDetail]
  )
  const visibleDefaultTermFields = useMemo(
    () => getVisibleDefaultTermFields(defaultTermRows),
    [defaultTermRows]
  )
  const templateCustomFields = useMemo(
    () => getTemplateCustomFields(defaultTermRows),
    [defaultTermRows]
  )
  const paymentReferenceOptions = useMemo(
    () => getPaymentReferenceOptions(templateDetail),
    [templateDetail]
  )

  const updateEventDefault = <K extends keyof EventDefaultsFormState>(
    field: K,
    value: EventDefaultsFormState[K]
  ) => {
    setEventDefaults((prev) => ({ ...prev, [field]: value }))
  }
  const updateCustomDefaultField = (
    fieldId: string,
    value: string | string[] | boolean | null
  ) => {
    setEventDefaults((prev) => ({
      ...prev,
      customFields: {
        ...prev.customFields,
        [fieldId]: value,
      },
    }))
  }

  const canConfirm = useMemo(
    () =>
      !!entityId &&
      !!templateId &&
      !loadingTemplates &&
      !loadingEntities &&
      !loadingTemplateDetail,
    [entityId, templateId, loadingTemplates, loadingEntities, loadingTemplateDetail]
  )

  const actionLabel = action === "Event" ? "Create Event" : "Create Quote"
  const paymentSummary =
    eventDefaults.paymentMode === "PO"
      ? "Template PO terms"
      : [
          eventDefaults.paymentTerm
            ? `${eventDefaults.paymentTerm} ${eventDefaults.paymentPeriod.toLowerCase()} from ${eventDefaults.paymentAppliedFrom.replace(/_/g, " ").toLowerCase()}`
            : "",
          Number(eventDefaults.prepaymentPercentage) > 0
            ? `Prepayment ${eventDefaults.prepaymentPercentage}%`
            : "",
        ]
          .filter(Boolean)
          .join(" | ")

  const handleConfirm = () => {
    onConfirm({
      action,
      entityId,
      templateId,
      splitByItem: split,
      itemCount,
      eventDefaults:
        action === "Event"
          ? buildEventDefaults(
              eventDefaults,
              visibleDefaultTermFields,
              templateCustomFields
            )
          : undefined,
    })
  }

  const renderCustomDefaultField = (field: TemplateCustomField) => {
    const value = eventDefaults.customFields[field.id]
    const label = `${field.label}${field.isRequired ? "" : " (optional)"}`

    if (field.type === "LONGTEXT") {
      return (
        <div key={field.id} className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor={`strategy-custom-${field.id}`}>{label}</Label>
          <Textarea
            id={`strategy-custom-${field.id}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => updateCustomDefaultField(field.id, e.target.value)}
          />
        </div>
      )
    }

    if (field.type === "DATE" || field.type === "DATETIME") {
      return (
        <div key={field.id} className="space-y-1.5">
          <Label htmlFor={`strategy-custom-${field.id}`}>{label}</Label>
          <Input
            id={`strategy-custom-${field.id}`}
            type={field.type === "DATETIME" ? "datetime-local" : "date"}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => updateCustomDefaultField(field.id, e.target.value)}
          />
        </div>
      )
    }

    if (field.type === "INTEGER" || field.type === "FLOAT") {
      return (
        <div key={field.id} className="space-y-1.5">
          <Label htmlFor={`strategy-custom-${field.id}`}>{label}</Label>
          <Input
            id={`strategy-custom-${field.id}`}
            type="number"
            step={field.type === "FLOAT" ? "any" : "1"}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => updateCustomDefaultField(field.id, e.target.value)}
          />
        </div>
      )
    }

    if (field.type === "BOOLEAN") {
      return (
        <div
          key={field.id}
          className="space-y-1.5"
        >
          <Label htmlFor={`strategy-custom-${field.id}`}>{label}</Label>
          <div className="flex h-9 items-center gap-5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 shadow-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                id={`strategy-custom-${field.id}-no`}
                name={`strategy-custom-${field.id}`}
                type="radio"
                checked={value === false}
                onChange={() => updateCustomDefaultField(field.id, false)}
                className="h-4 w-4 accent-blue-600"
              />
              <span>No</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                id={`strategy-custom-${field.id}-yes`}
                name={`strategy-custom-${field.id}`}
                type="radio"
                checked={value === true}
                onChange={() => updateCustomDefaultField(field.id, true)}
                className="h-4 w-4 accent-blue-600"
              />
              <span>Yes</span>
            </label>
            <button
              type="button"
              className="ml-auto rounded p-1 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
              onClick={() => updateCustomDefaultField(field.id, null)}
              aria-label={`Reset ${field.label}`}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )
    }

    if (
      field.type === "CHOICE" &&
      field.choiceType === "MULTI_SELECT" &&
      field.choices.length > 0
    ) {
      const selectedValues = Array.isArray(value) ? value : []
      const selectedSummary =
        selectedValues.length > 0
          ? selectedValues.join(", ")
          : `Select ${field.label}`
      return (
        <div key={field.id} className="space-y-1.5">
          <Label htmlFor={`strategy-custom-${field.id}`}>{label}</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                id={`strategy-custom-${field.id}`}
                type="button"
                className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-950 shadow-sm outline-none transition-[border-color,box-shadow] hover:border-gray-400 focus-visible:border-blue-500 focus-visible:ring-[3px] focus-visible:ring-blue-100"
              >
                <span
                  className={[
                    "min-w-0 flex-1 truncate",
                    selectedValues.length > 0 ? "text-gray-950" : "text-gray-500",
                  ].join(" ")}
                >
                  {selectedSummary}
                </span>
                {selectedValues.length > 0 ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      updateCustomDefaultField(field.id, [])
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        event.stopPropagation()
                        updateCustomDefaultField(field.id, [])
                      }
                    }}
                    aria-label={`Clear ${field.label}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                ) : null}
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="bottom"
              align="start"
              sideOffset={6}
              avoidCollisions={false}
              onCloseAutoFocus={(event) => event.preventDefault()}
              className="z-[30000] max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-md border border-gray-300 bg-white p-1 text-gray-950 shadow-lg"
            >
              {field.choices.map((choice) => {
                const checked = selectedValues.includes(choice)
                return (
                  <DropdownMenuItem
                    key={choice}
                    onSelect={(event) => {
                      event.preventDefault()
                      const next = checked
                        ? selectedValues.filter((item) => item !== choice)
                        : [...selectedValues, choice]
                      updateCustomDefaultField(field.id, next)
                    }}
                    className="flex cursor-pointer items-center gap-2 text-gray-950 focus:bg-blue-50 focus:text-gray-950"
                  >
                    <span
                      className={[
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        checked
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-gray-400 bg-white",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      {checked ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="truncate">{choice}</span>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    }

    if (field.type === "CHOICE" && field.choices.length > 0) {
      return (
        <div key={field.id} className="space-y-1.5">
          <Label htmlFor={`strategy-custom-${field.id}`}>{label}</Label>
          <Select
            value={typeof value === "string" && value ? value : "NONE"}
            onValueChange={(selectedValue) =>
              updateCustomDefaultField(
                field.id,
                selectedValue === "NONE" ? "" : selectedValue
              )
            }
          >
            <SelectTrigger id={`strategy-custom-${field.id}`}>
                <SelectValue placeholder={`Select ${field.label}`} />
            </SelectTrigger>
            <SelectContent {...POPOVER_SELECT_PROPS}>
              <SelectItem value="NONE">NA(None)</SelectItem>
              {field.choices.map((choice) => (
                <SelectItem key={choice} value={choice}>
                  {choice}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    return (
      <div key={field.id} className="space-y-1.5">
        <Label htmlFor={`strategy-custom-${field.id}`}>{label}</Label>
        <Input
          id={`strategy-custom-${field.id}`}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => updateCustomDefaultField(field.id, e.target.value)}
        />
      </div>
    )
  }

  const renderDefaultTermField = (
    row: Extract<DefaultTermRow, { type: "standard" }>
  ) => {
    const optionalText = row.required ? "" : " (optional)"
    switch (row.field) {
      case "PAYMENT_TERMS":
        return (
          <div key={row.key} className="sm:col-span-2 lg:col-span-3">
            <Collapsible
              open={paymentTermsExpanded}
              onOpenChange={setPaymentTermsExpanded}
            >
              <div className="rounded-md border border-gray-200 bg-gray-50">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {row.label}
                      </div>
                      <div className="text-xs text-gray-600">
                        {paymentSummary || "Not set"}
                      </div>
                    </div>
                    <ChevronDown
                      className={[
                        "h-4 w-4 shrink-0 text-gray-600 transition-transform",
                        paymentTermsExpanded ? "rotate-180" : "",
                      ].join(" ")}
                      aria-hidden="true"
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {eventDefaults.paymentMode === "PO" ? (
                    <p className="border-t border-gray-200 px-3 py-3 text-xs text-gray-600">
                      Pay as per PO terms is configured in this template and will
                      be applied automatically.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 border-t border-gray-200 px-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="strategy-default-payment-term">
                          Payment terms duration
                        </Label>
                        <Input
                          id="strategy-default-payment-term"
                          type="number"
                          min="0"
                          value={eventDefaults.paymentTerm}
                          onChange={(e) =>
                            updateEventDefault("paymentTerm", e.target.value)
                          }
                          placeholder="Credit period"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="strategy-default-payment-period">
                          Period
                        </Label>
                        <Select
                          value={eventDefaults.paymentPeriod}
                          onValueChange={(value) =>
                            updateEventDefault("paymentPeriod", value as PeriodValue)
                          }
                        >
                          <SelectTrigger id="strategy-default-payment-period">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent {...POPOVER_SELECT_PROPS}>
                            <SelectItem value="DAYS">Days</SelectItem>
                            <SelectItem value="WEEKS">Weeks</SelectItem>
                            <SelectItem value="MONTHS">Months</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="strategy-default-payment-from">
                          Payment terms applied from
                        </Label>
                        <Select
                          value={eventDefaults.paymentAppliedFrom}
                          onValueChange={(value) =>
                            updateEventDefault(
                              "paymentAppliedFrom",
                              value as PaymentReferenceDate
                            )
                          }
                        >
                          <SelectTrigger id="strategy-default-payment-from">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent {...POPOVER_SELECT_PROPS}>
                            {paymentReferenceOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="strategy-default-prepayment">
                          Prepayment %
                        </Label>
                        <Input
                          id="strategy-default-prepayment"
                          type="number"
                          min="0"
                          max="100"
                          value={eventDefaults.prepaymentPercentage}
                          onChange={(e) =>
                            updateEventDefault(
                              "prepaymentPercentage",
                              e.target.value
                            )
                          }
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>
          </div>
        )
      case "PROJECT":
        return (
          <div key={row.key} className="space-y-1.5">
            <Label htmlFor="strategy-default-project">{row.label}{optionalText}</Label>
            <Input
              id="strategy-default-project"
              value={projectName || eventDefaults.projectId || "Current project"}
              disabled
            />
          </div>
        )
      case "COST_CENTER":
        return (
          <div key={row.key} className="space-y-1.5">
            <Label htmlFor="strategy-default-cost-center">{row.label}{optionalText}</Label>
            <Select
              value={eventDefaults.costCenterId || "NONE"}
              onValueChange={(value) =>
                updateEventDefault("costCenterId", value === "NONE" ? "" : value)
              }
              disabled={loadingAccountingOptions}
            >
              <SelectTrigger id="strategy-default-cost-center">
                <SelectValue
                  placeholder={
                    loadingAccountingOptions
                      ? "Loading cost centers..."
                      : "Select cost center"
                  }
                />
              </SelectTrigger>
              <SelectContent {...POPOVER_SELECT_PROPS}>
                <SelectItem value="NONE">NA(None)</SelectItem>
                {costCenters.map((costCenter) => (
                  <SelectItem
                    key={costCenter.costCenterUid}
                    value={costCenter.costCenterUid}
                  >
                    {costCenter.costCenterId
                      ? `${costCenter.costCenterId} - ${costCenter.costCenterName}`
                      : costCenter.costCenterName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      case "GL":
        return (
          <div key={row.key} className="space-y-1.5">
            <Label htmlFor="strategy-default-gl">{row.label}{optionalText}</Label>
            <Select
              value={eventDefaults.glId || "NONE"}
              onValueChange={(value) =>
                updateEventDefault("glId", value === "NONE" ? "" : value)
              }
              disabled={loadingAccountingOptions}
            >
              <SelectTrigger id="strategy-default-gl">
                <SelectValue
                  placeholder={
                    loadingAccountingOptions ? "Loading GL..." : "Select GL"
                  }
                />
              </SelectTrigger>
              <SelectContent {...POPOVER_SELECT_PROPS}>
                <SelectItem value="NONE">NA(None)</SelectItem>
                {generalLedgers.map((gl) => (
                  <SelectItem key={gl.glUid} value={gl.glUid}>
                    {gl.glCode
                      ? `${gl.glCode} - ${gl.glAccountName}`
                      : gl.glAccountName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      case "CUSTOMER_NAME":
        return (
          <div key={row.key} className="space-y-1.5">
            <Label htmlFor="strategy-default-customer">{row.label}{optionalText}</Label>
            <Input
              id="strategy-default-customer"
              value={eventDefaults.customerName || "No project customer"}
              disabled
            />
          </div>
        )
      case "INCOTERMS":
        return (
          <div key={row.key} className="space-y-1.5">
            <Label htmlFor="strategy-default-incoterm">{row.label}{optionalText}</Label>
            <Select
              value={eventDefaults.incotermId || "NONE"}
              onValueChange={(value) =>
                updateEventDefault("incotermId", value === "NONE" ? "" : value)
              }
              disabled={loadingIncoterms}
            >
              <SelectTrigger id="strategy-default-incoterm">
                <SelectValue
                  placeholder={
                    loadingIncoterms ? "Loading incoterms..." : "Select incoterm"
                  }
                />
              </SelectTrigger>
              <SelectContent {...POPOVER_SELECT_PROPS}>
                <SelectItem value="NONE">No default</SelectItem>
                {incoterms.map((term) => (
                  <SelectItem key={term.incoterm_id} value={term.incoterm_id}>
                    {term.incoterm_abbreviation}
                    {term.incoterm_full_name
                      ? ` (${term.incoterm_full_name})`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      case "LEAD_TIME":
        return (
          <div key={row.key} className="space-y-1.5">
            <Label htmlFor="strategy-default-lead-time">
              {row.label}{optionalText}
            </Label>
            <div className="grid h-9 grid-cols-[1fr_0.85fr] overflow-hidden rounded-md border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-[3px] focus-within:ring-blue-100">
              <input
                id="strategy-default-lead-time"
                type="number"
                min="0"
                value={eventDefaults.leadTime}
                onChange={(e) => updateEventDefault("leadTime", e.target.value)}
                placeholder="0"
                className="min-w-0 border-0 bg-white px-3 py-2 text-sm text-gray-950 outline-none placeholder:text-gray-400"
              />
              <Select
                value={eventDefaults.leadTimePeriod}
                onValueChange={(value) =>
                  updateEventDefault("leadTimePeriod", value as PeriodValue)
                }
              >
                <SelectTrigger
                  id="strategy-default-lead-period"
                  className="h-9 rounded-none border-y-0 border-r-0 border-l border-gray-300 shadow-none focus-visible:ring-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent {...POPOVER_SELECT_PROPS}>
                  <SelectItem value="DAYS">Day(s)</SelectItem>
                  <SelectItem value="WEEKS">Week(s)</SelectItem>
                  <SelectItem value="MONTHS">Month(s)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )
      case "DELIVERY_DATE":
        return (
          <div key={row.key} className="space-y-1.5">
            <Label htmlFor="strategy-default-delivery-date">
              {row.label}{optionalText}
            </Label>
            <Input
              id="strategy-default-delivery-date"
              type="date"
              value={eventDefaults.deliveryDate}
              onChange={(e) => updateEventDefault("deliveryDate", e.target.value)}
            />
          </div>
        )
      case "GR_TOLERANCE":
        return (
          <div key={row.key} className="space-y-1.5">
            <Label htmlFor="strategy-default-gr-tolerance">
              {row.label}{optionalText}
            </Label>
            <Input
              id="strategy-default-gr-tolerance"
              type="number"
              min="0"
              max="100"
              value={eventDefaults.quantityTolerance}
              onChange={(e) =>
                updateEventDefault("quantityTolerance", e.target.value)
              }
              placeholder="Tolerance percentage"
            />
          </div>
        )
      case "REQUISITION":
        return (
          <div key={row.key} className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="strategy-default-requisition">{row.label}{optionalText}</Label>
              <Input
                id="strategy-default-requisition"
                value={eventDefaults.requisitionNumber}
                onChange={(e) =>
                  updateEventDefault("requisitionNumber", e.target.value)
                }
                placeholder="Requisition number"
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={eventDefaults.requisitionApproved}
                onChange={(e) =>
                  updateEventDefault("requisitionApproved", e.target.checked)
                }
              />
              Approved
            </label>
          </div>
        )
      case "ADDITIONAL_INFORMATION":
        return (
          <div key={row.key} className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="strategy-default-additional-info">
              {row.label}{optionalText}
            </Label>
            <Textarea
              id="strategy-default-additional-info"
              value={eventDefaults.additionalInformation}
              onChange={(e) =>
                updateEventDefault("additionalInformation", e.target.value)
              }
              placeholder="Add default item information"
            />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] overflow-hidden !max-w-[1060px] gap-0 rounded-lg border border-slate-200 bg-white p-0 shadow-2xl">
        <div className="max-h-[calc(92vh-72px)] overflow-y-auto px-4 py-4 sm:px-6">
        <DialogHeader className="mb-4 flex-row items-start gap-4 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
          <DialogTitle className="text-xl font-semibold text-slate-950">{actionLabel}</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-slate-500">
            Create an {action.toLowerCase()} using the selected template and apply default terms.
          </DialogDescription>
          <DialogDescription className="sr-only">
            {itemCount} item{itemCount === 1 ? "" : "s"} selected. Pick a
            template and entity — Factwise will create using its standard{" "}
            {action.toLowerCase()} flow.
          </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-indigo-100 bg-indigo-50/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {itemCount} item{itemCount === 1 ? "" : "s"} selected
                </div>
                <div className="text-xs text-slate-500">
                  Factwise will create an {action.toLowerCase()} using the selected template.
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="strategy-picker-entity" className="text-sm font-medium text-slate-800">
              Entity <span className="text-red-500">*</span>
            </Label>
            <Select value={entityId} onValueChange={setEntityId} disabled={loadingEntities || entities.length <= 1}>
              <SelectTrigger
              id="strategy-picker-entity"
              className="w-full text-gray-900"
            >
                <Building2 className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                <SelectValue
                  placeholder={loadingEntities ? "Loading…" : "Select entity"}
                />
              </SelectTrigger>
              <SelectContent {...POPOVER_SELECT_PROPS}>
                {entities.map((e) => (
                  <SelectItem key={e.entity_id} value={e.entity_id}>
                    {e.entity_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="strategy-picker-template" className="text-sm font-medium text-slate-800">
              {action} Template <span className="text-red-500">*</span>
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
                <FileText className="h-4 w-4 text-indigo-600" aria-hidden="true" />
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
              <SelectContent {...POPOVER_SELECT_PROPS}>
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

          </div>

          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex min-w-0 items-center gap-3 pr-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                <GitBranch className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
              <Label
                htmlFor="strategy-picker-split"
                className="cursor-pointer text-sm font-semibold text-slate-900"
              >
                Split into one {action.toLowerCase()} per item
              </Label>
              <p className="mt-0.5 text-xs text-slate-500">
                {split
                  ? `ON — ${itemCount} separate ${action.toLowerCase()}${itemCount === 1 ? '' : 's'} will be created, one per item.`
                  : `OFF — one combined ${action.toLowerCase()} will be created with all ${itemCount} item${itemCount === 1 ? '' : 's'}.`}
              </p>
              </div>
            </div>
            {/* Inline-styled switch so it's visible regardless of theme. */}
            <button
              id="strategy-picker-split"
              type="button"
              role="switch"
              aria-checked={split}
              onClick={() => setSplit(!split)}
              className={[
                'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-2',
                split
                  ? 'bg-indigo-600'
                  : 'bg-slate-200',
              ].join(' ')}
            >
              <span className="sr-only">Toggle split-by-item</span>
              <span
                className={[
                  'pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transition-transform',
                  split ? 'translate-x-5' : 'translate-x-0',
                ].join(' ')}
              />
            </button>
          </div>

          {action === "Event" && (
            <Collapsible open={termsExpanded} onOpenChange={setTermsExpanded}>
              <div className="rounded-md border border-slate-200 bg-white shadow-sm">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                        <Settings className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        Default item terms
                      </div>
                      <div className="text-xs text-slate-500">
                        Apply these values to all newly created items.
                      </div>
                      </div>
                    </div>
                    <ChevronDown
                      className={[
                        "h-4 w-4 shrink-0 text-slate-600 transition-transform",
                        termsExpanded ? "rotate-180" : "",
                      ].join(" ")}
                      aria-hidden="true"
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-3 border-t border-slate-200 px-4 py-4">
                    {loadingTemplateDetail ? (
                      <p className="text-xs text-slate-500">
                        Loading template item terms...
                      </p>
                    ) : visibleDefaultTermFields.length === 0 &&
                      templateCustomFields.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No default item term fields are enabled for this template.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {defaultTermRows.map((row) =>
                          row.type === "standard"
                            ? renderDefaultTermField(row)
                            : renderCustomDefaultField(row.field)
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

          {error && (
            <p className="text-xs text-red-600">Error loading data: {error}</p>
          )}
        </div>
        </div>

        <DialogFooter className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
          <Button
            variant="outline"
            onClick={onCancel}
            className="border-slate-300 bg-white px-6 text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Button>
          <Button
            disabled={!canConfirm}
            className="bg-indigo-600 px-6 text-white shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300"
            onClick={handleConfirm}
          >
            {actionLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
