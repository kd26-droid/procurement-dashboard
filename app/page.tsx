"use client"

import type React from "react"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { initialLineItems } from '../data/lineItems'
import { SettingsDialog, AppSettings, buildDefaultSettings, MappingId, PriceSource } from "@/components/settings-dialog"
import { AutoAssignUsersPopover, AutoFillPricesPopover, AutoAssignActionsPopover } from "@/components/autoassign-popovers"
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
} from "lucide-react"

// Sample data based on the specification
const projectData = {
  name: "Q4 Office Supplies Procurement",
  id: "PROJ-2024-001",
  status: "Active",
  created: "2024-01-15",
  deadline: "2024-03-31",
}


export default function ProcurementDashboard() {
  const [lineItems, setLineItems] = useState(initialLineItems)
  const [selectedItems, setSelectedItems] = useState<number[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [vendorFilter, setVendorFilter] = useState<string[]>([])
  const [actionFilter, setActionFilter] = useState<string[]>([])
  const [assignedFilter, setAssignedFilter] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [sortField, setSortField] = useState<string>("")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [editingItem, setEditingItem] = useState<number | null>(null)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [reverseFilter, setReverseFilter] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  const [columnOrder, setColumnOrder] = useState([
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
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([])
  const [savedViews, setSavedViews] = useState<{ [key: string]: { order: string[]; hidden: string[] } }>({})
  const [currentView, setCurrentView] = useState("default")
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null)

  const [columnWidths, setColumnWidths] = useState({
    category: 128,
    quantity: 80,
    vendor: 144,
    assignedTo: 144,
    unitPrice: 112,
    totalPrice: 128,
  })

  const [isResizing, setIsResizing] = useState(false)
  const [resizeColumn, setResizeColumn] = useState<string | null>(null)

  // Popup states
  const [showAssignUsersPopup, setShowAssignUsersPopup] = useState(false)
  const [showFillPricesPopup, setShowFillPricesPopup] = useState(false)
  const [showAssignActionsPopup, setShowAssignActionsPopup] = useState(false)
  const [showAnalyticsPopup, setShowAnalyticsPopup] = useState(false)
  const [selectedItemForAnalytics, setSelectedItemForAnalytics] = useState<any>(null)

  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsProfiles, setSettingsProfiles] = useState<Record<string, AppSettings>>({})
  const [currentSettingsKey, setCurrentSettingsKey] = useState<string>('Default')

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

  const currentSettings: AppSettings = useMemo(() => {
    return settingsProfiles[currentSettingsKey] || buildDefaultSettings('Default')
  }, [settingsProfiles, currentSettingsKey])

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
    const set = new Set<string>(['John Smith', 'Sarah Johnson', 'Mike Wilson', 'Lisa Chen', 'David Brown'])
    for (const it of lineItems) {
      const people = Array.isArray(it.assignedTo)
        ? (it.assignedTo as string[])
        : String(it.assignedTo || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
      people.forEach((p) => set.add(p))
    }
    return Array.from(set).sort()
  }, [lineItems])

  const handleMouseDown = (columnKey: string, e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    setResizeColumn(columnKey)

    const startX = e.clientX
    const startWidth = columnWidths[columnKey as keyof typeof columnWidths]

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX
      const newWidth = Math.max(startWidth + diff, 80) // minimum 80px
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
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }

  const dynamicMetrics = useMemo(() => {
    const totalItems = lineItems.length
    const totalValue = lineItems.reduce((sum, item) => sum + item.totalPrice, 0)
    const avgPrice = totalItems > 0 ? totalValue / totalItems : 0

    const totalVendors = lineItems.filter((item) => item.vendor && item.vendor.trim() !== "").length
    const avgVendorsPerItem = totalItems > 0 ? totalVendors / totalItems : 0

    return [
      {
        label: "Total Value",
        value: `$${(totalValue / 1000).toFixed(1)}K`,
        icon: DollarSign,
        trendIcon: TrendingUp,
        trendValue: "+35.2%",
        bgColor: "bg-gradient-to-br from-purple-50 to-purple-100",
        textColor: "text-purple-600",
        valueColor: "text-purple-900",
        iconColor: "text-purple-500",
      },
      {
        label: "Avg Price",
        value: `$${(avgPrice / 1000).toFixed(1)}K`,
        icon: BarChart3,
        trendIcon: TrendingUp,
        trendValue: "+15.3%",
        bgColor: "bg-gradient-to-br from-teal-50 to-teal-100",
        textColor: "text-teal-600",
        valueColor: "text-teal-900",
        iconColor: "text-teal-500",
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

  const filteredAndSortedItems = useMemo(() => {
    let filtered = lineItems.filter((item) => {
      const matchesSearch =
        item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.itemId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.vendor.toLowerCase().includes(searchTerm.toLowerCase())

      const vendorMatch = vendorFilter.length === 0 || vendorFilter.includes(item.vendor || "tbd")
      const actionMatch = actionFilter.length === 0 || actionFilter.includes(item.action)
      const assignedMatch = assignedFilter.length === 0 || assignedFilter.includes(item.assignedTo || "unassigned")
      const categoryMatch = categoryFilter.length === 0 || categoryFilter.includes(item.category)

      return matchesSearch && vendorMatch && actionMatch && assignedMatch && categoryMatch
    })

    if (activeFilter) {
      switch (activeFilter) {
        case "prices":
          filtered = filtered.filter((item) => (reverseFilter ? item.unitPrice > 0 : item.unitPrice === 0))
          break
        case "actions":
          filtered = filtered.filter((item) =>
            reverseFilter
              ? item.assignedTo && item.assignedTo.trim() !== ""
              : !item.assignedTo || item.assignedTo.trim() === "",
          )
          break
        case "users":
          filtered = filtered.filter((item) =>
            reverseFilter
              ? item.assignedTo && item.assignedTo.trim() !== ""
              : !item.assignedTo || item.assignedTo.trim() === "",
          )
          break
        case "vendors":
          filtered = filtered.filter((item) =>
            reverseFilter ? item.vendor && item.vendor.trim() !== "" : !item.vendor || item.vendor.trim() === "",
          )
          break
      }
    }

    if (sortField) {
      filtered.sort((a, b) => {
        let aValue = a[sortField as keyof typeof a]
        let bValue = b[sortField as keyof typeof b]

        if (typeof aValue === "string") {
          aValue = aValue.toLowerCase()
          bValue = (bValue as string).toLowerCase()
        }

        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1
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
  ])

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredAndSortedItems.slice(startIndex, endIndex)
  }, [filteredAndSortedItems, currentPage])

  const totalPages = Math.ceil(filteredAndSortedItems.length / itemsPerPage)

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

  const handleEditItem = (id: number, field: string, value: string) => {
    setLineItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, [field]: field === "unitPrice" || field === "quantity" ? Number.parseFloat(value) || 0 : value }
          : item,
      ),
    )

    if (field === "quantity" || field === "unitPrice") {
      setLineItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, totalPrice: item.quantity * item.unitPrice } : item)),
      )
    }
  }

  const toggleColumnVisibility = (columnKey: string) => {
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
      setHiddenColumns(savedViews[viewName].hidden)
      setCurrentView(viewName)
    }
  }

  // Auto Assign Users Handler
  const handleAutoAssignUsers = (scope: 'all' | 'unassigned' | 'selected') => {
    let itemsToUpdate = lineItems
    if (scope === 'unassigned') {
      itemsToUpdate = lineItems.filter((item) => !item.assignedTo || item.assignedTo.trim().length === 0)
    } else if (scope === 'selected') {
      itemsToUpdate = lineItems.filter((item) => selectedItems.includes(item.id))
    }

    const tagMap = currentSettings.users.tagUserMap || {}

    const updatedItems = lineItems.map((item) => {
      if (!itemsToUpdate.some((u) => u.id === item.id)) return item
      const tags = Array.isArray(item.category)
        ? (item.category as string[])
        : String(item.category || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
      const userSet = new Set<string>()
      tags.forEach((t) => (tagMap[t] || []).forEach((u) => userSet.add(u)))
      const usersForItem = Array.from(userSet)
      if (usersForItem.length === 0) return item
      return { ...item, assignedTo: usersForItem.join(', ') }
    })

    setLineItems(updatedItems)
    document.body.click()
  }

  // Auto Fill Prices Handler
  const handleAutoFillPrices = (scope: 'all' | 'non-selected' | 'selected') => {
    let itemsToUpdate = lineItems
    if (scope === 'non-selected') {
      itemsToUpdate = lineItems.filter((item) => !selectedItems.includes(item.id))
    } else if (scope === 'selected') {
      itemsToUpdate = lineItems.filter((item) => selectedItems.includes(item.id))
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

    const updatedItems = lineItems.map((item) => {
      if (!itemsToUpdate.some((u) => u.id === item.id)) return item

      // Skip certain items to keep them blank
      if (excludedItemIds.includes(item.id)) return item

      const mapping = pickMappingId()
      const { price, source } = pickCheapest(item, mapping)
      const unitPrice = Math.round(price * 100) / 100
      const totalPrice = Math.round(unitPrice * item.quantity * 100) / 100
      return { ...item, unitPrice, totalPrice, priceSource: source }
    })

    setLineItems(updatedItems)
    document.body.click()
  }

  // Assign Actions Handler
  const handleAssignActions = (scope: 'all' | 'unassigned' | 'selected') => {
    let itemsToUpdate = lineItems
    if (scope === 'unassigned') {
      itemsToUpdate = lineItems.filter((item) => !item.action || item.action.trim() === '')
    } else if (scope === 'selected') {
      itemsToUpdate = lineItems.filter((item) => selectedItems.includes(item.id))
    }

    const updatedItems = lineItems.map((item) => {
      if (!itemsToUpdate.some((u) => u.id === item.id)) return item
      const hasPrice = !!item.unitPrice && item.unitPrice > 0
      const hasVendor = !!item.vendor && String(item.vendor).trim() !== ''

      // If no price, always RFQ
      if (!hasPrice) return { ...item, action: 'RFQ' }

      // If price exists but no vendor, can only be RFQ or Quote
      if (hasPrice && !hasVendor) {
        // Randomly choose between RFQ and Quote
        return { ...item, action: Math.random() > 0.5 ? 'RFQ' : 'Quote' }
      }

      // Both price and vendor exist → randomly assign Quote or PO
      const actions = ['Quote', 'Direct PO']
      return { ...item, action: actions[Math.floor(Math.random() * actions.length)] }
    })

    setLineItems(updatedItems)
    document.body.click()
  }

  const handleColumnDrag = (draggedCol: string, targetCol: string) => {
    const draggedIndex = columnOrder.indexOf(draggedCol)
    const targetIndex = columnOrder.indexOf(targetCol)

    const newOrder = [...columnOrder]
    newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, draggedCol)

    setColumnOrder(newOrder)
  }

  const visibleColumns = columnOrder.filter((col) => !hiddenColumns.includes(col))

  const columnLabels = {
    customer: "Customer",
    itemId: "Item ID",
    description: "Description",
    quantity: "Qty",
    unit: "Unit",
    category: "Tag",
    action: "Action",
    assignedTo: "Assigned",
    dueDate: "Due Date",
    vendor: "Vendor",
    unitPrice: "Price",
    totalPrice: "Total Amount",
  }

  // Helpers for price icons
  const priceSourceIcon = (src?: PriceSource) => {
    if (!src) return null
    if (src === 'PO') return <FileText className="h-3 w-3 text-gray-500" />
    if (src === 'Contract') return <FileSignature className="h-3 w-3 text-emerald-600" />
    if (src === 'Quote') return <FileText className="h-3 w-3 text-indigo-600" />
    if (src === 'EXIM') return <Package className="h-3 w-3 text-purple-600" />
    return <Globe className="h-3 w-3 text-teal-600" />
  }

  function mockPriceForSource(item: any, source: PriceSource): number {
    // Deterministic pseudo-price based on itemId and source
    const key = String(item.itemId || '') + '|' + source
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    const base = 50 + (h % 500) // 50..549
    // Mild source-based adjustment
    const adj: Record<PriceSource, number> = {
      'PO': -10,
      'Contract': -20,
      'Quote': 0,
      'Online - Digikey': 15,
      'Online - Mouser': 12,
      'Online - LCSC': -5,
      'Online - Farnell': 18,
      'EXIM': -8,
    }
    return Math.max(1, base + (adj[source] || 0))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="mb-4">
            {/* Project Information - spans 2 columns on large screens */}
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Procurement Strategy</h1>
              <div className="flex items-center gap-2">
                <Select value={currentSettingsKey} onValueChange={(v) => {
                  setCurrentSettingsKey(v)
                  if (typeof window !== 'undefined') localStorage.setItem('currentSettingsProfile', v)
                }}>
                  <SelectTrigger className="w-40 h-8 text-xs" title="Select Settings Profile">
                    <SelectValue placeholder="Settings profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(settingsProfiles).map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <span className="text-xs text-gray-500">Status:</span>
                  <Badge className="ml-1 bg-green-50 text-green-700 border-green-200 text-xs">
                    {projectData.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Deadline:</span>
                  <p className="font-medium text-gray-900 text-sm">{projectData.deadline}</p>
                </div>
              </div>
            </div>

            {/* All 4 metrics in a 2x2 grid - spans exactly half the width */}
            <div className="grid grid-cols-2 gap-4">
              {dynamicMetrics.map((metric, index) => {
                const Icon = metric.icon
                const TrendIcon = metric.trendIcon
                return (
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
                    Pending: {lineItems.filter((item) => item.unitPrice === 0).length} / Identified:{" "}
                    {lineItems.filter((item) => item.unitPrice > 0).length}
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
                    Pending: {lineItems.filter((item) => !item.action || item.action.trim() === "").length} /
                    Defined: {lineItems.filter((item) => item.action && item.action.trim() !== "").length}
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
                    Pending: {lineItems.filter((item) => !item.assignedTo || item.assignedTo.trim() === "").length} /
                    Assigned: {lineItems.filter((item) => item.assignedTo && item.assignedTo.trim() !== "").length}
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
                    Missing: {lineItems.filter((item) => !item.vendor || item.vendor.trim() === "").length} / Assigned:{" "}
                    {lineItems.filter((item) => item.vendor && item.vendor.trim() !== "").length}
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
                    variant="outline"
                    className={`w-40 justify-between ${
                      vendorFilter.length > 0 && vendorFilter.length < 5
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : ""
                    }`}
                  >
                    {vendorFilter.length === 0 || vendorFilter.length === 5
                      ? "All Vendors"
                      : vendorFilter.length === 1
                        ? vendorFilter[0] === "tbd"
                          ? "TBD"
                          : vendorFilter[0]
                        : `${vendorFilter.length} selected`}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-0">
                  <div className="p-2 space-y-1">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded border-b border-gray-200">
                      <input
                        type="checkbox"
                        checked={vendorFilter.length === 5}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setVendorFilter(["Office Plus", "Dell Business", "Paper World", "Monitor Pro", "tbd"])
                          } else {
                            setVendorFilter([])
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Select All</span>
                    </label>
                    {["Office Plus", "Dell Business", "Paper World", "Monitor Pro", "TBD"].map((vendor) => (
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
                    variant="outline"
                    className={`w-40 justify-between ${
                      actionFilter.length > 0 && actionFilter.length < 3
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : ""
                    }`}
                  >
                    {actionFilter.length === 0 || actionFilter.length === 3
                      ? "All Actions"
                      : actionFilter.length === 1
                        ? actionFilter[0]
                        : `${actionFilter.length} selected`}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-0">
                  <div className="p-2 space-y-1">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded border-b border-gray-200">
                      <input
                        type="checkbox"
                        checked={actionFilter.length === 4}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setActionFilter(["RFQ", "Direct PO", "Quote", "Contract"])
                          } else {
                            setActionFilter([])
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Select All</span>
                    </label>
                    {["RFQ", "Direct PO", "Quote", "Contract"].map((action) => (
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
                    variant="outline"
                    className={`w-40 justify-between ${
                      assignedFilter.length > 0 && assignedFilter.length < 4
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : ""
                    }`}
                  >
                    {assignedFilter.length === 0 || assignedFilter.length === 4
                      ? "All Assigned"
                      : assignedFilter.length === 1
                        ? assignedFilter[0] === "unassigned"
                          ? "Unassigned"
                          : assignedFilter[0]
                        : `${assignedFilter.length} selected`}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-0">
                  <div className="p-2 space-y-1">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded border-b border-gray-200">
                      <input
                        type="checkbox"
                        checked={assignedFilter.length === 4}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAssignedFilter(["John Smith", "Sarah Johnson", "Mike Wilson", "unassigned"])
                          } else {
                            setAssignedFilter([])
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Select All</span>
                    </label>
                    {["John Smith", "Sarah Johnson", "Mike Wilson", "Unassigned"].map((assigned) => (
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
                    variant="outline"
                    className={`w-40 justify-between ${
                      categoryFilter.length > 0 && categoryFilter.length < 4
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : ""
                    }`}
                  >
                    {categoryFilter.length === 0 || categoryFilter.length === 4
                      ? "All Categories"
                      : categoryFilter.length === 1
                        ? categoryFilter[0]
                        : `${categoryFilter.length} selected`}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-0">
                  <div className="p-2 space-y-1">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded border-b border-gray-200">
                      <input
                        type="checkbox"
                        checked={categoryFilter.length === 4}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCategoryFilter(["Office Supplies", "Electronics", "Furniture", "Software"])
                          } else {
                            setCategoryFilter([])
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Select All</span>
                    </label>
                    {["Office Supplies", "Electronics", "Furniture", "Software"].map((category) => (
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
                    {Object.entries(columnLabels).map(([columnKey, label]) => (
                      <div
                        key={columnKey}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded"
                        onClick={() => {
                          console.log('Column clicked:', columnKey)
                          toggleColumnVisibility(columnKey)
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
                    ))}
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

              {/* Reset Selections Button */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 bg-transparent"
                onClick={() => {
                  console.log('Reset selections clicked')
                  setSelectedItems([])
                }}
                title="Reset Selections"
                disabled={selectedItems.length === 0}
              >
                <RotateCcw className="h-3 w-3 text-gray-600" />
              </Button>

              {/* Execute Action Button */}
              <Button
                size="sm"
                className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  console.log('Execute action clicked, selected items:', selectedItems)
                  // Add your execute action logic here
                }}
                title="Execute Action"
                disabled={selectedItems.length === 0}
              >
                Execute Action
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="p-2 text-left font-medium text-gray-700 text-xs bg-gray-50 w-10">
                    <input
                      type="checkbox"
                      checked={
                        selectedItems.length === filteredAndSortedItems.length && filteredAndSortedItems.length > 0
                      }
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  {visibleColumns.map((columnKey) => {
                    const isNumeric = columnKey === "quantity" || columnKey === "unitPrice" || columnKey === "totalPrice"
                    return (
                      <th
                        key={columnKey}
                        className={`p-2 font-medium text-gray-700 text-xs relative group whitespace-nowrap select-none bg-gray-50 ${
                          isNumeric ? "text-right" : "text-left"
                        }`}
                        style={{
                          width: columnWidths[columnKey as keyof typeof columnWidths] || "auto",
                          minWidth:
                            columnKey === "category"
                              ? "128px"
                              : columnKey === "quantity"
                                ? "80px"
                                : columnKey === "vendor" || columnKey === "assignedTo"
                                  ? "144px"
                                  : columnKey === "unitPrice" || columnKey === "totalPrice"
                                    ? "112px"
                                    : "auto",
                        }}
                        draggable
                        onDragStart={() => setDraggedColumn(columnKey)}
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
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-300 opacity-0 group-hover:opacity-100"
                  onMouseDown={(e) => handleMouseDown(columnKey, e)}
                  style={{ zIndex: 10 }}
                ></div>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-100">
        {paginatedItems.map((item) => (
          <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => handleSelectItem(item.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    {visibleColumns.map((columnKey) => {
                      const value = item[columnKey as keyof typeof item]

                      if (columnKey === "customer") {
                        return (
                          <td key={columnKey} className="p-2 text-left">
                            <div className="flex items-center">
                              <span
                                className="font-medium text-gray-900 text-xs truncate max-w-20"
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
                          <td key={columnKey} className="p-2 text-left">
                            <span
                              className="font-mono text-xs text-gray-600 bg-gray-100 px-1 py-0.5 rounded"
                              title={item.itemId}
                            >
                              {item.itemId}
                            </span>
                          </td>
                        )
                      }

                      if (columnKey === "description") {
                        return (
                          <td key={columnKey} className="p-2 text-left max-w-28">
                            {editingItem === item.id ? (
                              <Input
                                value={item.description}
                                onChange={(e) => handleEditItem(item.id, "description", e.target.value)}
                                onBlur={() => setEditingItem(null)}
                                onKeyDown={(e) => e.key === "Enter" && setEditingItem(null)}
                                className="w-full text-xs h-6"
                              />
                            ) : (
                              <span
                                className="text-gray-900 font-medium text-xs truncate block"
                                title={item.description}
                              >
                                {item.description}
                              </span>
                            )}
                          </td>
                        )
                      }

                      if (columnKey === "category") {
                        const categories = Array.isArray(item.category) ? item.category : [item.category || ""]
                        const displayCategory = categories[0] || ""
                        const hasMultiple = categories.length > 1
                        const isTextTruncated = displayCategory && displayCategory.length > 12
                        const isMissing = !displayCategory || displayCategory === ""

                        return (
                          <td key={columnKey} className="p-2 text-left" style={{ width: columnWidths.category }}>
                            <div className="flex items-center gap-1 w-full">
                              <Badge
                                variant="outline"
                                className={`text-xs px-1 py-0 truncate flex-shrink-0 ${
                                  isMissing ? "border-red-300 text-red-700 bg-red-50" : "border-gray-200 text-gray-700"
                                }`}
                                title={hasMultiple ? categories.join(", ") : displayCategory || "No tag"}
                              >
                                <span className="truncate max-w-20">{displayCategory || "No tag"}</span>
                              </Badge>
                              {(hasMultiple || isTextTruncated) && !isMissing && (
                                <span
                                  className="text-blue-600 text-xs font-medium flex-shrink-0"
                                  title={hasMultiple ? categories.join(", ") : displayCategory}
                                >
                                  +{hasMultiple ? categories.length - 1 : "..."}
                                </span>
                              )}
                            </div>
                          </td>
                        )
                      }

                      if (columnKey === "action") {
                        return (
                          <td key={columnKey} className="p-2 text-left">
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
                        const vendors = Array.isArray(item.vendor) ? item.vendor : [item.vendor || ""]
                        const displayVendor = vendors[0] || ""
                        const hasMultiple = vendors.length > 1
                        const isTextTruncated = displayVendor && displayVendor.length > 15
                        const isMissing = !displayVendor || displayVendor === ""

                        return (
                          <td key={columnKey} className="p-2 text-left" style={{ width: columnWidths.vendor }}>
                            <div className="flex items-center gap-1 w-full">
                              <span
                                className={`text-xs truncate block flex-shrink max-w-24 ${
                                  isMissing ? "text-red-700" : "text-gray-900"
                                }`}
                                title={hasMultiple ? vendors.join(", ") : displayVendor || "No vendor"}
                              >
                                {displayVendor || "No vendor"}
                              </span>
                              {(hasMultiple || isTextTruncated) && !isMissing && (
                                <span
                                  className="text-blue-600 text-xs font-medium flex-shrink-0"
                                  title={hasMultiple ? vendors.join(", ") : displayVendor}
                                >
                                  +{hasMultiple ? vendors.length - 1 : "..."}
                                </span>
                              )}
                            </div>
                          </td>
                        )
                      }

                      if (columnKey === "assignedTo") {
                        const people = Array.isArray(item.assignedTo) ? item.assignedTo : [item.assignedTo || ""]
                        const displayPerson = people[0] || ""
                        const hasMultiple = people.length > 1
                        const isTextTruncated = displayPerson && displayPerson.length > 15
                        const isMissing = !displayPerson || displayPerson === ""

                        return (
                          <td key={columnKey} className="p-2 text-left" style={{ width: columnWidths.assignedTo }}>
                            <div className="flex items-center gap-1 w-full">
                              <span
                                className={`text-xs truncate block flex-shrink max-w-24 ${
                                  isMissing ? "text-red-700" : "text-gray-900"
                                }`}
                                title={hasMultiple ? people.join(", ") : displayPerson || "Unassigned"}
                              >
                                {displayPerson || "Unassigned"}
                              </span>
                              {(hasMultiple || isTextTruncated) && !isMissing && (
                                <span
                                  className="text-blue-600 text-xs font-medium flex-shrink-0"
                                  title={hasMultiple ? people.join(", ") : displayPerson}
                                >
                                  +{hasMultiple ? people.length - 1 : "..."}
                                </span>
                              )}
                            </div>
                          </td>
                        )
                      }

                      if (columnKey === "unitPrice") {
                        const hasPrice = item.unitPrice && item.unitPrice > 0
                        return (
                          <td key={columnKey} className="p-2 text-right" style={{ width: columnWidths.unitPrice }}>
                            <div className="flex items-center justify-end gap-1">
                              <span
                                className={`text-xs ${hasPrice ? "text-gray-900" : "text-red-700"}`}
                                title={hasPrice ? `$${item.unitPrice.toFixed(2)}` : "N/A"}
                              >
                                {hasPrice ? `$${item.unitPrice.toFixed(2)}` : "N/A"}
                              </span>
                              {hasPrice && priceSourceIcon((item as any).priceSource)}
                            </div>
                          </td>
                        )
                      }

                      if (columnKey === "totalPrice") {
                        const hasPrice = item.totalPrice && item.totalPrice > 0
                        return (
                          <td key={columnKey} className="p-2 text-right" style={{ width: columnWidths.totalPrice }}>
                            <span
                              className={`text-xs font-medium ${hasPrice ? "text-gray-900" : "text-red-700"}`}
                              title={hasPrice ? `$${item.totalPrice.toFixed(2)}` : "N/A"}
                            >
                              {hasPrice ? `$${item.totalPrice.toFixed(2)}` : "N/A"}
                            </span>
                          </td>
                        )
                      }

                      if (columnKey === "quantity") {
                        return (
                          <td key={columnKey} className="p-2 text-right" style={{ width: columnWidths.quantity }}>
                            <div className="flex items-center justify-end w-full">
                              <span
                                className="text-gray-900 text-xs font-medium tabular-nums"
                                title={`${item.quantity} ${item.unit}`}
                              >
                                {item.quantity}
                              </span>
                            </div>
                          </td>
                        )
                      }

                      return (
                        <td key={columnKey} className="p-2 text-left">
                          <span className="text-gray-900 text-xs truncate block max-w-20" title={String(value || "")}>
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
                          onClick={() => setEditingItem(editingItem === item.id ? null : item.id)}
                          className="h-5 w-5 p-0"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
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
              {selectedItems.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-gray-600 hover:text-gray-800 bg-transparent"
                    disabled={selectedItems.length === 0}
                  >
                    Revert Changes
                  </Button>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={selectedItems.length === 0}
                  >
                    Execute
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700">
                Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredAndSortedItems.length)} to{" "}
                {Math.min(currentPage * itemsPerPage, filteredAndSortedItems.length)} of {filteredAndSortedItems.length}{" "}
                results
              </span>
              <div className="flex items-center space-x-2">
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
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <AutoFillPricesPopover
        open={showFillPricesPopup}
        onOpenChange={setShowFillPricesPopup}
        selectedItemsCount={selectedItems.length}
        currentSettings={currentSettings}
        onExecute={handleAutoFillPrices}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <AutoAssignActionsPopover
        open={showAssignActionsPopup}
        onOpenChange={setShowAssignActionsPopup}
        selectedItemsCount={selectedItems.length}
        currentSettings={currentSettings}
        onExecute={handleAssignActions}
        onOpenSettings={() => setSettingsOpen(true)}
      />

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
                  <h3 className="text-lg font-semibold text-gray-900">
                    Analytics for {selectedItemForAnalytics.itemId}
                  </h3>
                  <p className="text-sm text-gray-500">{selectedItemForAnalytics.description}</p>
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

            {/* Module Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PO Module */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Purchase Orders
                </h4>
                <div className="space-y-2">
                  <div className="h-48 bg-white rounded border p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={[
                        { month: 'Jan', count: 8 },
                        { month: 'Feb', count: 12 },
                        { month: 'Mar', count: 15 },
                        { month: 'Apr', count: 10 },
                        { month: 'May', count: 18 },
                        { month: 'Jun', count: 22 }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-xs text-blue-700">
                    X-axis: Time (Months), Y-axis: PO Count
                  </div>
                </div>
              </div>

              {/* Contract Module */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Contracts
                </h4>
                <div className="space-y-2">
                  <div className="h-48 bg-white rounded border p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { duration: '6m', value: 50000 },
                        { duration: '1y', value: 120000 },
                        { duration: '2y', value: 250000 },
                        { duration: '3y', value: 180000 },
                        { duration: '5y', value: 450000 }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="duration" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#16a34a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-xs text-green-700">
                    X-axis: Contract Duration, Y-axis: Value ($)
                  </div>
                </div>
              </div>

              {/* EXIM Module */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                <h4 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Export/Import
                </h4>
                <div className="space-y-2">
                  <div className="h-48 bg-white rounded border p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { country: 'USA', volume: 1200 },
                        { country: 'Germany', volume: 800 },
                        { country: 'China', volume: 1500 },
                        { country: 'Japan', volume: 600 },
                        { country: 'UK', volume: 400 }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="country" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="volume" fill="#9333ea" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-xs text-purple-700">
                    X-axis: Country, Y-axis: Shipment Volume
                  </div>
                </div>
              </div>

              {/* Quote Module */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
                <h4 className="font-semibold text-orange-900 mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Quotes
                </h4>
                <div className="space-y-2">
                  <div className="h-48 bg-white rounded border p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { vendor: 'Supplier A', price: 299 },
                        { vendor: 'Supplier B', price: 350 },
                        { vendor: 'Supplier C', price: 275 },
                        { vendor: 'Supplier D', price: 425 },
                        { vendor: 'Supplier E', price: 320 }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="vendor" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="price" fill="#ea580c" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-xs text-orange-700">
                    X-axis: Vendor, Y-axis: Quote Price ($)
                  </div>
                </div>
              </div>

              {/* Online Pricing Module */}
              <div className="bg-gradient-to-br from-teal-50 to-teal-100 p-4 rounded-lg border border-teal-200">
                <h4 className="font-semibold text-teal-900 mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Online Pricing
                </h4>
                <div className="space-y-2">
                  <div className="h-48 bg-white rounded border p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={[
                        { day: '1', price: 295 },
                        { day: '2', price: 299 },
                        { day: '3', price: 285 },
                        { day: '4', price: 305 },
                        { day: '5', price: 299 },
                        { day: '6', price: 310 },
                        { day: '7', price: 295 }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="price" stroke="#0d9488" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-xs text-teal-700">
                    X-axis: Time (Days), Y-axis: Price Trend ($)
                  </div>
                </div>
              </div>

              {/* Summary Statistics */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-lg border border-gray-200 md:col-span-2">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Cross-Platform Summary for {selectedItemForAnalytics.itemId}
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="bg-white p-3 rounded border">
                      <div className="text-sm font-medium text-gray-600">Purchase Orders</div>
                      <div className="text-2xl font-bold text-blue-600">22</div>
                      <div className="text-xs text-gray-500">Active POs for this item</div>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <div className="text-sm font-medium text-gray-600">Contracts</div>
                      <div className="text-2xl font-bold text-green-600">3</div>
                      <div className="text-xs text-gray-500">Long-term agreements</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-white p-3 rounded border">
                      <div className="text-sm font-medium text-gray-600">Total Value</div>
                      <div className="text-2xl font-bold text-gray-800">${selectedItemForAnalytics.totalPrice.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">Across all modules</div>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <div className="text-sm font-medium text-gray-600">Current Price</div>
                      <div className="text-2xl font-bold text-teal-600">$299</div>
                      <div className="text-xs text-gray-500">Real-time market price</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

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

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        allTags={allTags}
        allUsers={allUsers}
        current={currentSettings}
        onSave={(s) => {
          setSettingsProfiles((prev) => {
            const next = { ...prev, [s.name]: s }
            if (typeof window !== 'undefined') localStorage.setItem('appSettingsProfiles', JSON.stringify(next))
            return next
          })
          setCurrentSettingsKey(s.name)
          if (typeof window !== 'undefined') localStorage.setItem('currentSettingsProfile', s.name)
        }}
      />
    </div>
  )
}
