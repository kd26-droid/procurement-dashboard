"use client"

import type React from "react"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LineChart, Line, BarChart, Bar, ComposedChart, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Label as RechartsLabel } from 'recharts'
import { Tooltip as UiTooltip, TooltipContent as UiTooltipContent, TooltipTrigger as UiTooltipTrigger } from "@/components/ui/tooltip"
import { SettingsDialog, SettingsPanel, AppSettings, buildDefaultSettings, MappingId, PriceSource } from "@/components/settings-dialog"
import { getProjectId, getProjectItems, getProjectOverview, getProjectUsers, updateProjectItem, bulkAssignUsers, autoAssignUsersByTags, notifyItemsAssigned, notifyItemUpdated, type ProjectItem } from '@/lib/api'
import { AutoAssignUsersPopover, AutoFillPricesPopover, AutoAssignActionsPopover } from "@/components/autoassign-popovers"
import { useToast } from "@/hooks/use-toast"
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
} from "lucide-react"

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
  })
  const [projectUsers, setProjectUsers] = useState<Array<{user_id: string, name: string, email: string, role: string}>>([])
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

  const [columnOrder, setColumnOrder] = useState([
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
    "source",
    "pricePO",
    "priceContract",
    "priceQuote",
    "priceDigikey",
    "priceEXIM",
  ])
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(["customer"]) // Hide customer column by default
  const [savedViews, setSavedViews] = useState<{ [key: string]: { order: string[]; hidden: string[] } }>({})
  const [currentView, setCurrentView] = useState("default")
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null)

  const [columnWidths, setColumnWidths] = useState({
    description: 280,
    category: 128,
    quantity: 80,
    vendor: 144,
    assignedTo: 144,
    unitPrice: 100,
    pricePO: 88,
    priceContract: 88,
    priceQuote: 88,
    priceDigikey: 88,
    priceEXIM: 88,
    source: 96,
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
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editFormData, setEditFormData] = useState<any>({})

  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<'users' | 'prices' | 'actions'>('users')
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

  // Load project data from API
  useEffect(() => {
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

        // Fetch overview, items, and users in parallel
        const [overviewResponse, itemsResponse, usersResponse] = await Promise.all([
          getProjectOverview(projectId),
          getProjectItems(projectId),
          getProjectUsers(projectId)
        ])

        // Set project data
        setProjectData({
          name: overviewResponse.project.project_name,
          id: overviewResponse.project.project_code,
          status: overviewResponse.project.status,
          created: overviewResponse.project.validity_from || '',
          deadline: overviewResponse.project.deadline || '',
          customer: overviewResponse.project.customer_name || '',
        })

        console.log('[Dashboard] Project:', overviewResponse.project.project_name)

        // Set users data
        setProjectUsers(usersResponse.users)
        console.log('[Dashboard] Loaded', usersResponse.users.length, 'users:', usersResponse.users.map(u => `${u.name} (${u.email})`))

        // Transform API data to match dashboard format
        const transformedItems = itemsResponse.items.map((item: ProjectItem, index: number) => ({
          id: index + 1,
          project_item_id: item.project_item_id,
          customer: '',
          itemId: item.item_code,
          description: item.item_name,
          quantity: item.quantity,
          unit: item.measurement_unit?.abbreviation || '',
          category: item.tags && item.tags.length > 0 ? item.tags.join(', ') : 'Uncategorized',
          assignedTo: item.assigned_users.map(u => u.name).join(', '),
          assigned_user_ids: item.assigned_users.map(u => u.user_id),
          unitPrice: item.rate || 0,
          totalPrice: item.amount || 0,
          currency: item.currency,
          vendor: '',
          action: '',
          dueDate: '',
          source: '',
          pricePO: 0,
          priceContract: 0,
          priceQuote: 0,
          priceDigikey: 0,
          priceEXIM: 0,
          manuallyEdited: item.custom_fields?.manually_edited || false,
        }))

        console.log('[Dashboard] Loaded', transformedItems.length, 'items')
        setLineItems(transformedItems)
        setLoading(false)
      } catch (error) {
        console.error('[Dashboard] Error loading data:', error)
        setLineItems([])
        setLoading(false)
      }
    }

    loadProjectData()
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
    const startWidth = columnWidths[columnKey as keyof typeof columnWidths] || 280 // default to 280 if not set

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX
      const minWidth = columnKey === 'description' ? 200 : 80 // minimum 200px for description, 80px for others
      const newWidth = Math.max(startWidth + diff, minWidth)
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
    const totalValue = lineItems.reduce((sum: number, item: any) => sum + item.totalPrice, 0)
    const avgPrice = totalItems > 0 ? totalValue / totalItems : 0

    const totalVendors = lineItems.filter((item: any) => item.vendor && item.vendor.trim() !== "").length
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

  const filteredAndSortedItems = useMemo(() => {
    let filtered = lineItems.filter((item: any) => {
      const matchesSearch =
        item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.itemId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.vendor.toLowerCase().includes(searchTerm.toLowerCase())

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

  // Auto Assign Users Handler
  const handleAutoAssignUsers = async (scope: 'all' | 'unassigned' | 'selected') => {
    const projectId = getProjectId()
    if (!projectId) {
      console.error('[Auto-Assign] No project ID found')
      return
    }

    try {
      const tagMap = currentSettings.users.tagUserMap || {}

      // Convert tag-user map from user names to user IDs
      const tagUserIdMap: Record<string, string[]> = {}
      Object.entries(tagMap).forEach(([tag, userNames]) => {
        const userIds = userNames
          .map(userName => {
            const user = projectUsers.find(u => u.name === userName)
            return user?.user_id
          })
          .filter((id: string | undefined): id is string => id !== undefined)

        if (userIds.length > 0) {
          tagUserIdMap[tag] = userIds
        }
      })

      console.log('[Auto-Assign] Tag-User ID Map:', tagUserIdMap)

      let apiScope: 'all' | 'unassigned' | 'item_ids'
      let itemIds: string[] | undefined

      if (scope === 'selected') {
        apiScope = 'item_ids'
        itemIds = selectedItems.map(id => {
          const item = lineItems.find((item: any) => item.id === id)
          return item?.project_item_id
        }).filter((id: string | undefined): id is string => id !== undefined)
      } else {
        apiScope = scope
      }

      console.log('[Auto-Assign] Calling API with scope:', apiScope, 'itemIds:', itemIds)

      const result = await autoAssignUsersByTags(projectId, tagUserIdMap, apiScope, itemIds)

      console.log('[Auto-Assign] Result:', result)

      if (result.success) {
        // Refresh items from API
        const itemsResponse = await getProjectItems(projectId)
        const transformedItems = itemsResponse.items.map((item, index) => ({
          id: index + 1,
          project_item_id: item.project_item_id,
          customer: '',
          itemId: item.item_code,
          description: item.item_name,
          quantity: item.quantity,
          unit: item.measurement_unit?.abbreviation || '',
          category: item.tags && item.tags.length > 0 ? item.tags.join(', ') : 'Uncategorized',
          assignedTo: item.assigned_users.map(u => u.name).join(', '),
          assigned_user_ids: item.assigned_users.map(u => u.user_id),
          unitPrice: item.rate || 0,
          totalPrice: item.amount || 0,
          vendor: '',
          action: '',
          dueDate: '',
          source: '',
          pricePO: 0,
          priceContract: 0,
          priceQuote: 0,
          priceDigikey: 0,
          priceEXIM: 0,
          manuallyEdited: item.custom_fields?.manually_edited || false,
        }))

        setLineItems(transformedItems)

        // Notify Factwise parent
        const updatedItemIds = itemsResponse.items.map(item => item.project_item_id)
        const allUserIds = Array.from(new Set(
          itemsResponse.items.flatMap(item => item.assigned_users.map(u => u.user_id))
        ))
        notifyItemsAssigned(updatedItemIds, allUserIds)

        console.log(`[Auto-Assign] Successfully updated ${result.updated} items`)

        // Show success toast
        toast({
          title: "Users Assigned Successfully",
          description: `Auto-assigned users to ${result.updated} item(s)${result.skipped > 0 ? `, skipped ${result.skipped} item(s)` : ''}`,
        })
      } else {
        console.error('[Auto-Assign] Failed:', result.message)

        // Show error toast
        toast({
          title: "Auto-Assign Failed",
          description: result.message || "Failed to auto-assign users",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('[Auto-Assign] Error:', error)

      // Show error toast
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
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

        // Refresh items from API to get latest data
        const itemsResponse = await getProjectItems(projectId)
        const transformedItems = itemsResponse.items.map((item, index) => ({
          id: index + 1,
          project_item_id: item.project_item_id,
          customer: '',
          itemId: item.item_code,
          description: item.item_name,
          quantity: item.quantity,
          unit: item.measurement_unit?.abbreviation || '',
          category: item.tags && item.tags.length > 0 ? item.tags.join(', ') : 'Uncategorized',
          assignedTo: item.assigned_users.map(u => u.name).join(', '),
          assigned_user_ids: item.assigned_users.map(u => u.user_id),
          unitPrice: item.rate || 0,
          totalPrice: item.amount || 0,
          vendor: '',
          action: '',
          dueDate: '',
          source: '',
          pricePO: 0,
          priceContract: 0,
          priceQuote: 0,
          priceDigikey: 0,
          priceEXIM: 0,
          manuallyEdited: item.custom_fields?.manually_edited || false,
        }))

        setLineItems(transformedItems)

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

      // If nothing changed, show message and return
      if (!hasChanges) {
        toast({
          title: "No Changes",
          description: "No fields were modified",
        })
        setShowEditDialog(false)
        setEditFormData({})
        return
      }

      console.log('[Edit Rate/Qty] Updating item:', editFormData.project_item_id, 'with payload:', updatePayload)

      // Use update item API
      const result = await updateProjectItem(projectId, editFormData.project_item_id, updatePayload)

      if (result.success) {
        console.log('[Edit Rate/Qty] Successfully updated rate and quantity')

        // Refresh items from API to get latest data
        const itemsResponse = await getProjectItems(projectId)
        const transformedItems = itemsResponse.items.map((item, index) => ({
          id: index + 1,
          project_item_id: item.project_item_id,
          customer: '',
          itemId: item.item_code,
          description: item.item_name,
          quantity: item.quantity,
          unit: item.measurement_unit?.abbreviation || '',
          category: item.tags && item.tags.length > 0 ? item.tags.join(', ') : 'Uncategorized',
          assignedTo: item.assigned_users.map(u => u.name).join(', '),
          assigned_user_ids: item.assigned_users.map(u => u.user_id),
          unitPrice: item.rate || 0,
          totalPrice: item.amount || 0,
          currency: item.currency,
          vendor: '',
          action: '',
          dueDate: '',
          source: '',
          pricePO: 0,
          priceContract: 0,
          priceQuote: 0,
          priceDigikey: 0,
          priceEXIM: 0,
          manuallyEdited: item.custom_fields?.manually_edited || false,
        }))

        setLineItems(transformedItems)

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

      // Find cheapest for unitPrice and totalPrice
      const allPrices = [pricePO, priceContract, priceQuote, priceDigikey, priceEXIM].filter((p: number) => p > 0)
      const unitPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0
      const totalPrice = Math.round(unitPrice * item.quantity * 100) / 100

      return { ...item, pricePO, priceContract, priceQuote, priceDigikey, priceEXIM, unitPrice, totalPrice }
    })

    setLineItems(updatedItems)
    document.body.click()
  }

  // Assign Actions Handler
  const handleAssignActions = (scope: 'all' | 'unassigned' | 'selected') => {
    let itemsToUpdate = lineItems
    if (scope === 'unassigned') {
      itemsToUpdate = lineItems.filter((item: any) => !item.action || item.action.trim() === '')
    } else if (scope === 'selected') {
      itemsToUpdate = lineItems.filter((item: any) => selectedItems.includes(item.id))
    }

    const updatedItems = lineItems.map((item: any) => {
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

  // Manual Edit Handlers
  const handleOpenEdit = () => {
    if (selectedItems.length === 0) return

    // Get the selected line items
    const itemsToEdit = lineItems.filter((item: any) => selectedItems.includes(item.id))

    // For bulk edit, use common values or empty strings
    if (selectedItems.length === 1) {
      // Single item edit - populate all fields
      const item = itemsToEdit[0]
      setEditFormData({
        isBulk: false,
        itemCount: 1,
        item: item, // Store the item in formData instead
        category: item.category || '',
        vendor: item.vendor || '',
        assignedTo: item.assignedTo || '',
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
      // Bulk edit - leave fields empty or use common values
      setEditFormData({
        isBulk: true,
        itemCount: selectedItems.length,
        category: '',
        vendor: '',
        assignedTo: '',
        action: '',
        unitPrice: 0,
        rate: 0,
        quantity: 0
      })
    }

    setShowEditDialog(true)
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

    console.log('[Edit] Saving changes for', selectedItems.length, 'items')
    console.log('[Edit] Form data:', editFormData)

    // If assignedTo is being changed, update via API
    if (editFormData.assignedTo !== undefined && editFormData.assignedTo !== null) {
      try {
        // Convert assigned user names to user IDs
        const assignedUserNames = editFormData.assignedTo
          .split(',')
          .map((name: string) => name.trim())
          .filter(Boolean)

        const selectedUserIds = assignedUserNames
          .map((userName: string) => {
            const user = projectUsers.find(u => u.name === userName)
            return user?.user_id
          })
          .filter((id: string | undefined): id is string => id !== undefined)

        console.log('[Edit] Assigning users:', assignedUserNames, 'IDs:', selectedUserIds)

        // Update each selected item
        const itemsToUpdate = lineItems.filter((item: any) => selectedItems.includes(item.id))

        for (const item of itemsToUpdate) {
          const result = await updateProjectItem(projectId, item.project_item_id, {
            assigned_user_ids: selectedUserIds,
            custom_fields: {
              manually_edited: true,
              last_manual_edit: new Date().toISOString()
            }
          })

          if (result.success) {
            console.log('[Edit] Successfully updated item:', item.itemId)
          } else {
            console.error('[Edit] Failed to update item:', item.itemId, result)
          }
        }

        // Refresh items from API
        const itemsResponse = await getProjectItems(projectId)
        const transformedItems = itemsResponse.items.map((item, index) => ({
          id: index + 1,
          project_item_id: item.project_item_id,
          customer: '',
          itemId: item.item_code,
          description: item.item_name,
          quantity: item.quantity,
          unit: item.measurement_unit?.abbreviation || '',
          category: item.tags && item.tags.length > 0 ? item.tags.join(', ') : 'Uncategorized',
          assignedTo: item.assigned_users.map(u => u.name).join(', '),
          assigned_user_ids: item.assigned_users.map(u => u.user_id),
          unitPrice: item.rate || 0,
          totalPrice: item.amount || 0,
          vendor: '',
          action: '',
          dueDate: '',
          source: '',
          pricePO: 0,
          priceContract: 0,
          priceQuote: 0,
          priceDigikey: 0,
          priceEXIM: 0,
          manuallyEdited: item.custom_fields?.manually_edited || false,
        }))

        setLineItems(transformedItems)

        // Notify Factwise parent
        const updatedItemIds = itemsToUpdate.map(item => item.project_item_id)
        notifyItemsAssigned(updatedItemIds, selectedUserIds)

        toast({
          title: "Changes Saved",
          description: `Updated ${selectedItems.length} item(s)`,
        })

      } catch (error) {
        console.error('[Edit] Error:', error)
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to save changes",
          variant: "destructive",
        })
      }
    } else {
      // No assignedTo change, just update local state for other fields
      const updatedItems = lineItems.map((item: any) => {
        if (!selectedItems.includes(item.id)) return item

        const updates: any = { manuallyEdited: true }

        if (editFormData.category && editFormData.category.trim()) {
          updates.category = editFormData.category
        }
        if (editFormData.vendor && editFormData.vendor.trim()) {
          updates.vendor = editFormData.vendor
        }
        if (editFormData.action && editFormData.action.trim()) {
          updates.action = editFormData.action
        }
        if (editFormData.unitPrice && editFormData.unitPrice > 0) {
          updates.unitPrice = editFormData.unitPrice
          updates.totalPrice = editFormData.unitPrice * item.quantity
        }

        return { ...item, ...updates }
      })

      setLineItems(updatedItems)
    }

    setShowEditDialog(false)
    setEditFormData({})
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
    pricePO: "PO Price",
    priceContract: "Contract",
    priceQuote: "Quote",
    priceDigikey: "Digi-Key",
    priceEXIM: "EXIM",
    source: "Source",
    unitPrice: "Price",
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
    // Deterministic pseudo-price based on itemId and source for realistic electronic component pricing
    const key = String(item.itemId || '') + '|' + source
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0

    // Generate realistic electronic component prices ($0.01 - $2.00)
    const basePrice = 0.01 + ((h % 200) / 100) // 0.01 to 2.01

    // Source-based price adjustments (percentage)
    const adj: Record<PriceSource, number> = {
      'PO': 0.95,          // 5% discount
      'Contract': 0.90,    // 10% discount
      'Quote': 1.00,       // No adjustment
      'Online - Digikey': 1.15,  // 15% premium
      'Online - Mouser': 1.12,   // 12% premium
      'Online - LCSC': 0.85,     // 15% discount
      'Online - Farnell': 1.18,  // 18% premium
      'EXIM': 0.88,        // 12% discount
    }

    const finalPrice = basePrice * (adj[source] || 1.00)
    return Math.max(0.01, Math.round(finalPrice * 1000) / 1000) // Round to 3 decimal places, min $0.01
  }

  // Generate realistic analytics data for each item
  const generateAnalyticsData = (item: any) => {
    const seed = item.id
    let randomSeed = seed * 9999

    // Better random number generator with varying seeds
    const random = (min: number, max: number) => {
      randomSeed = (randomSeed * 1103515245 + 12345) % (Math.pow(2, 31))
      const normalized = (randomSeed / Math.pow(2, 31))
      return Math.floor(normalized * (max - min + 1)) + min
    }

    const basePrice = item.unitPrice || 100 + random(50, 300)

    // Create consistent date ranges for all charts (last 6 months)
    const createDateRange = () => {
      return Array.from({ length: 6 }, (_, i) => {
        const monthsAgo = 5 - i
        const date = new Date()
        date.setMonth(date.getMonth() - monthsAgo)
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      })
    }
    const commonDates = createDateRange()

    // Professional, simple chart types
    const chartTypes = {
      po: 'line',        // Date vs Price/Quantity: two lines
      contract: 'bar',   // Vendor vs Price/Quantity: grouped bars
      exim: 'line',      // Date of Purchase vs Price/Quantity: two lines
      quote: 'line',     // Date vs Price/Quantity: two lines
      online: 'bar'      // Vendor vs Price/Quantity: grouped bars
    }

    // PO Module - Date vs Price/Quantity (More varied data)
    const poData = commonDates.map((date) => {
      const price = 3 + (random(0, 1200) / 100) // 3-15 USD range
      const quantityBase = random(10, 200) // 10-200 base quantity
      return {
        date,
        price: Math.round(price * 100) / 100, // Round to 2 decimal places
        quantity: quantityBase
      }
    })

    // Contract Module - Vendor vs Price/Quantity (More varied data)
    const vendors = ['Vendor A', 'Vendor B', 'Vendor C', 'Vendor D', 'Vendor E']
    const contractData = vendors.map((vendor) => {
      const price = 3 + (random(0, 1200) / 100) // 3-15 USD range
      const quantityBase = random(5, 150) // 5-150 base quantity
      return {
        vendor,
        price: Math.round(price * 100) / 100, // Round to 2 decimal places
        quantity: quantityBase
      }
    })

    // EXIM Module - Date vs Price/Quantity (More varied data)
    const eximData = commonDates.map((date) => {
      const price = 3 + (random(0, 1200) / 100) // 3-15 USD range
      const quantityBase = random(8, 180) // 8-180 base quantity
      return {
        date,
        price: Math.round(price * 100) / 100, // Round to 2 decimal places
        quantity: quantityBase
      }
    })

    // Quote Module - Date vs Price/Quantity (More varied data)
    const quoteData = commonDates.map((date) => {
      const price = 3 + (random(0, 1200) / 100) // 3-15 USD range
      const quantityBase = random(12, 220) // 12-220 base quantity
      return {
        date,
        price: Math.round(price * 100) / 100, // Round to 2 decimal places
        quantity: quantityBase
      }
    })

    // Online Pricing Module - Vendors vs Price/Quantity (More varied data)
    const onlineVendors = ['Digikey', 'Mouser', 'LCSC', 'Farnell']
    const onlineData = onlineVendors.map((vendor) => {
      const price = 3 + (random(0, 1200) / 100) // 3-15 USD range
      const quantityBase = random(15, 250) // 15-250 base quantity
      return {
        vendor,
        price: Math.round(price * 100) / 100, // Round to 2 decimal places
        quantity: quantityBase
      }
    })

    return { poData, contractData, eximData, quoteData, onlineData, chartTypes }
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
  ) => {
    const commonTooltip = (value: any, name: string) => [
      name === dataKey1 ? `$${Number(value).toFixed(2)}` : `${value} pcs`,
      name === dataKey1 ? 'Price' : 'Quantity'
    ]

    const xLabel = xAxisLabel
    const isCurrencyLeft = /price|rate/i.test(yLeftLabel) || /price|rate/i.test(dataKey1)
    const isCurrencyRight = /price|rate/i.test(yRightLabel) || /price|rate/i.test(dataKey2)
    const fmtCurrency = (n: number) => `$${Number(n).toFixed(0)}`
    const leftTickFormatter = (v: any) => (isCurrencyLeft ? fmtCurrency(v) : v)
    const rightTickFormatter = (v: any) => (isCurrencyRight ? fmtCurrency(v) : v)
    const hasSecondSeries = Boolean(dataKey2) && data.some((d) => d[dataKey2 as keyof typeof d] !== undefined)
    const xAxisProps = {
      dataKey: xAxisKey,
      tick: { fontSize: 12, fill: '#475569' },
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

    switch (type) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 18, left: 18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis {...xAxisProps} tickLine={false} axisLine={false}>
              <RechartsLabel value={xLabel} position="insideBottom" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </XAxis>
            <YAxis {...yLeftProps} tickLine={false} axisLine={false}>
              <RechartsLabel value={yLeftLabel} angle={-90} position="insideLeft" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </YAxis>
            <YAxis {...yRightProps} tickLine={false} axisLine={false}>
              <RechartsLabel value={yRightLabel} angle={-90} position="insideRight" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </YAxis>
            <Tooltip formatter={commonTooltip} contentStyle={{ fontSize: '11px', padding: '6px 8px' }} />
            <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey={dataKey1} stroke={color1} strokeWidth={1.75} dot={false} />
            <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey={dataKey2} stroke={color2} strokeWidth={1.5} dot={false} />
          </ComposedChart>
          </ResponsiveContainer>
        )
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 18, left: 18 }} barCategoryGap={"20%"} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis {...xAxisProps} tickLine={false} axisLine={false}>
              <RechartsLabel value={xLabel} position="insideBottom" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </XAxis>
            <YAxis {...yLeftProps} tickLine={false} axisLine={false}>
              <RechartsLabel value={yLeftLabel} angle={-90} position="insideLeft" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </YAxis>
            <YAxis {...yRightProps} tickLine={false} axisLine={false}>
              <RechartsLabel value={yRightLabel} angle={-90} position="insideRight" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </YAxis>
            <Tooltip formatter={commonTooltip} contentStyle={{ fontSize: '11px', padding: '6px 8px' }} />
            <Bar isAnimationActive={false} yAxisId="left" dataKey={dataKey1} fill={color1} barSize={35} radius={[3,3,0,0]} />
            {hasSecondSeries && (
              <Bar isAnimationActive={false} yAxisId="right" dataKey={dataKey2} fill={color2} barSize={35} radius={[3,3,0,0]} />
            )}
          </ComposedChart>
          </ResponsiveContainer>
        )
      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis {...xAxisProps}>
              <RechartsLabel value={xLabel} position="insideBottom" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </XAxis>
            <YAxis {...yLeftProps}>
              <RechartsLabel value="Price ($)" angle={-90} position="insideLeft" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </YAxis>
            <YAxis {...yRightProps}>
              <RechartsLabel value="Quantity (pcs)" angle={-90} position="insideRight" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
            </YAxis>
            <Tooltip formatter={commonTooltip} contentStyle={{ fontSize: '11px', padding: '6px 8px' }} />
            <Area yAxisId="left" type="monotone" dataKey={dataKey1} stroke={color1} fill={color1} fillOpacity={0.6} />
            <Line yAxisId="right" type="monotone" dataKey={dataKey2} stroke={color2} strokeWidth={2} />
          </ComposedChart>
          </ResponsiveContainer>
        )
      default: // composed (bars + line) — used for all 5 modules
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 18, left: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis {...xAxisProps}>
                <RechartsLabel value={xLabel} position="insideBottom" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
              </XAxis>
              <YAxis {...yLeftProps}>
                <RechartsLabel value={yLeftLabel} angle={-90} position="insideLeft" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
              </YAxis>
              <YAxis {...yRightProps}>
                <RechartsLabel value={yRightLabel} angle={-90} position="insideRight" offset={0} style={{ textAnchor: 'middle' }} fill="#64748b" fontSize={12} />
              </YAxis>
              <Tooltip formatter={commonTooltip} contentStyle={{ fontSize: '11px', padding: '6px 8px' }} />
              <Bar isAnimationActive={false} yAxisId="right" dataKey={dataKey2} fill={color2} barSize={35} radius={[3,3,0,0]} />
              <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey={dataKey1} stroke={color1} strokeWidth={1.75} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )
    }
  }

  // Generate analytics data for the selected item
  const analyticsData = useMemo(() => {
    if (!selectedItemForAnalytics) return null
    return generateAnalyticsData(selectedItemForAnalytics)
  }, [selectedItemForAnalytics])

  const renderCategoryInput = () => {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-400 bg-background p-2">
        {String(editFormData.category || '').split(',').filter((c: string) => c.trim()).map((cat: string, index: number) => (
          <Badge key={index} variant="outline" className="flex items-center gap-2 pl-2 pr-1">
            {cat}
            <button
              onClick={() => {
                const newCategories = String(editFormData.category || '').split(',').filter((c: string) => c.trim())
                newCategories.splice(index, 1)
                setEditFormData({ ...editFormData, category: newCategories.join(',') })
              }}
              className="rounded-full hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Input
          id="category-input"
          placeholder="Add a tag and press Enter..."
          className="flex-1 border-0 shadow-none focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              const newTag = e.currentTarget.value.trim()
              if (newTag) {
                const currentCategories = String(editFormData.category || '').split(',').filter((c: string) => c.trim())
                if (!currentCategories.includes(newTag)) {
                  setEditFormData({ ...editFormData, category: [...currentCategories, newTag].join(',') })
                }
                e.currentTarget.value = ''
              }
            }
          }}
        />
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

  return (
    <div className="min-h-screen bg-gray-50">
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
                    {Object.entries(columnLabels).map(([columnKey, label]) => {
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
                            columnKey === "description"
                              ? "200px"
                              : columnKey === "category"
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
                        {(columnKey === "description" || columnKey === "category" || columnKey === "quantity" || columnKey === "vendor" || columnKey === "assignedTo" || columnKey === "pricePO" || columnKey === "priceContract" || columnKey === "priceQuote" || columnKey === "priceDigikey" || columnKey === "priceEXIM" || columnKey === "source" || columnKey === "totalPrice") && (
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-300 opacity-0 group-hover:opacity-100"
                            onMouseDown={(e) => handleMouseDown(columnKey, e)}
                            style={{ zIndex: 10 }}
                          ></div>
                        )}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-100">
        {paginatedItems.map((item: any) => (
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
                        return (
                          <td key={columnKey} className="p-2 text-left" style={{ width: columnWidths.description }}>
                            <div className="flex items-center gap-2">
                              <span
                                className="text-gray-900 font-medium text-xs truncate block"
                                title={item.description}
                              >
                                {item.description}
                              </span>
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

                      if (columnKey === "category") {
                        const categories = (item.category || '').split(',').filter((c: string) => c.trim())
                        const isMissing = categories.length === 0

                        return (
                          <td key={columnKey} className="p-2 text-left" style={{ width: columnWidths.category }}>
                            {isMissing ? (
                              <span className="text-gray-400 text-xs">-</span>
                            ) : categories.length === 1 ? (
                              <Badge variant="outline" className="border-gray-200 text-gray-700 text-xs">
                                {categories[0]}
                              </Badge>
                            ) : (
                              <UiTooltip>
                                <UiTooltipTrigger>
                                  <span className="text-blue-600 font-medium text-xs cursor-pointer hover:text-blue-800">
                                    {categories.length}
                                  </span>
                                </UiTooltipTrigger>
                                <UiTooltipContent side="bottom" align="start">
                                  <div className="space-y-1">
                                    {categories.map((cat: string, index: number) => (
                                      <div key={index} className="text-xs">
                                        {index + 1}. {cat}
                                      </div>
                                    ))}
                                  </div>
                                </UiTooltipContent>
                              </UiTooltip>
                            )}
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
                        const assignedUsersList = item.assignedTo
                          ? String(item.assignedTo).split(',').map((u: string) => u.trim()).filter(Boolean)
                          : []
                        const isMissing = assignedUsersList.length === 0

                        return (
                          <td key={columnKey} className="p-2 text-left" style={{ width: columnWidths.assignedTo }}>
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

                      if (columnKey === "pricePO" || columnKey === "priceContract" || columnKey === "priceQuote" || columnKey === "priceDigikey" || columnKey === "priceEXIM") {
                        const priceValue = (item as any)[columnKey] as number | undefined
                        const hasPrice = priceValue !== undefined && priceValue > 0

                        // Calculate cheapest price
                        const allPrices = [
                          (item as any).pricePO,
                          (item as any).priceContract,
                          (item as any).priceQuote,
                          (item as any).priceDigikey,
                          (item as any).priceEXIM,
                        ].filter((p): p is number => p !== undefined && p > 0)

                        const cheapestPrice = allPrices.length > 0 ? Math.min(...allPrices) : null
                        const isCheapest = hasPrice && cheapestPrice !== null && priceValue === cheapestPrice

                        return (
                          <td key={columnKey} className="p-2 text-right" style={{ width: (columnWidths as any)[columnKey] }}>
                            <span
                              className={`text-xs font-medium ${
                                !hasPrice
                                  ? "text-gray-400"
                                  : isCheapest
                                    ? "text-green-700 bg-green-50 px-2 py-1 rounded"
                                    : "text-gray-900"
                              }`}
                              title={hasPrice ? `$${priceValue.toFixed(2)}` : "N/A"}
                            >
                              {hasPrice ? `$${priceValue.toFixed(2)}` : "-"}
                            </span>
                          </td>
                        )
                      }

                      if (columnKey === "source") {
                        // Find cheapest price source
                        const prices = [
                          { source: 'PO', value: (item as any).pricePO },
                          { source: 'Contract', value: (item as any).priceContract },
                          { source: 'Quote', value: (item as any).priceQuote },
                          { source: 'Digi-Key', value: (item as any).priceDigikey },
                          { source: 'EXIM', value: (item as any).priceEXIM },
                        ].filter((p): p is { source: string; value: number } => p.value !== undefined && p.value > 0)

                        const cheapest = prices.length > 0
                          ? prices.reduce((min: { source: string; value: number }, p: { source: string; value: number }) => p.value < min.value ? p : min)
                          : null

                        return (
                          <td key={columnKey} className="p-2 text-center" style={{ width: columnWidths.source }}>
                            <span className="text-xs font-medium text-gray-900">
                              {cheapest ? cheapest.source : '-'}
                            </span>
                          </td>
                        )
                      }

                      if (columnKey === "unitPrice") {
                        const hasPrice = item.unitPrice && item.unitPrice > 0
                        const currencySymbol = (item as any).currency?.symbol || '₹'
                        return (
                          <td key={columnKey} className="p-2 text-right" style={{ width: columnWidths.unitPrice }}>
                            <span
                              className={`text-xs font-semibold ${hasPrice ? "text-gray-900" : "text-red-700"}`}
                              title={hasPrice ? `${currencySymbol}${item.unitPrice.toFixed(2)}` : "N/A"}
                            >
                              {hasPrice ? `${currencySymbol}${item.unitPrice.toFixed(2)}` : "N/A"}
                            </span>
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

            {/* Module Cards */}
            {analyticsData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* PO */}
                <div className="bg-white p-4 rounded-lg border">
                  <h4 className="text-sm font-medium text-gray-800 mb-2">PO</h4>
                  <div className="h-56">
                    {renderChart(analyticsData.poData, 'composed', 'price', 'quantity', '#22c55e', '#93c5fd', 'date', 'Date of PO', 'Price', 'Quantity')}
                  </div>
                </div>

                {/* Contract */}
                <div className="bg-white p-4 rounded-lg border">
                  <h4 className="text-sm font-medium text-gray-800 mb-2">Contract</h4>
                  <div className="h-56">
                    {renderChart(analyticsData.contractData, 'composed', 'price', 'quantity', '#f472b6', '#93c5fd', 'vendor', 'Vendor name', 'Price', 'Quantity')}
                  </div>
                </div>

                {/* EXIM */}
                <div className="bg-white p-4 rounded-lg border">
                  <h4 className="text-sm font-medium text-gray-800 mb-2">EXIM</h4>
                  <div className="h-56">
                    {renderChart(analyticsData.eximData, 'composed', 'price', 'quantity', '#22c55e', '#93c5fd', 'date', 'Date of Purchase', 'Price', 'Quantity')}
                  </div>
                </div>

                {/* Quote */}
                <div className="bg-white p-4 rounded-lg border">
                  <h4 className="text-sm font-medium text-gray-800 mb-2">Quote</h4>
                  <div className="h-56">
                    {renderChart(analyticsData.quoteData, 'line', 'price', 'quantity', '#334155', '#94a3b8', 'date', 'Date', 'Price', 'Quantity')}
                  </div>
                </div>

                {/* Online Pricing (full width) */}
                <div className="bg-white p-4 rounded-lg border lg:col-span-2">
                  <h4 className="text-sm font-medium text-gray-800 mb-2">Online Pricing</h4>
                  <div className="h-56">
                    {renderChart(analyticsData.onlineData, 'composed', 'price', 'quantity', '#22c55e', '#93c5fd', 'vendor', 'Distributors', 'Price', 'Quantity')}
                  </div>
                </div>
              </div>
            )}

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

      {/* Manual Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editFormData.isBulk ? `Bulk Edit (${editFormData.itemCount} items)` : 'Edit Item'}</DialogTitle>
          <DialogDescription>
            {editFormData.isBulk
              ? 'Enter values to update for all selected items. Fields left blank will not be changed.'
              : 'Make changes to the item details below.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="category">Tag</Label>
            {renderCategoryInput()}
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor</Label>
            <Select
              value={editFormData.vendor || ''}
              onValueChange={(value) => setEditFormData({ ...editFormData, vendor: value })}
            >
              <SelectTrigger className="border border-gray-400">
              <SelectValue placeholder="Select a vendor" />
            </SelectTrigger>
              <SelectContent>
                {vendorOptions.map((vendor) => (
                  <SelectItem key={vendor} value={vendor}>
                    {vendor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Assigned To (Multiple Selection)</Label>
            <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2 border-gray-400">
              {allUsers.map((user) => {
                const selectedUsers = editFormData.assignedTo
                  ? String(editFormData.assignedTo).split(',').map((u: string) => u.trim()).filter(Boolean)
                  : []
                const isChecked = selectedUsers.includes(user)

                return (
                  <label
                    key={user}
                    className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        let newUsers: string[]
                        if (e.target.checked) {
                          newUsers = [...selectedUsers, user]
                        } else {
                          newUsers = selectedUsers.filter(u => u !== user)
                        }
                        setEditFormData({ ...editFormData, assignedTo: newUsers.join(', ') })
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{user}</span>
                  </label>
                )
              })}
            </div>
            {editFormData.assignedTo && (
              <p className="text-xs text-gray-600">
                Selected: {editFormData.assignedTo}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="action">Action</Label>
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
          <div className="space-y-2">
            <Label htmlFor="rate">Rate (Price per Unit)</Label>
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
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
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
              />
              <span className="text-sm font-medium text-gray-700">
                {editFormData.unit || 'units'}
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setShowEditDialog(false)} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleEditRateQuantity}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
                allTags={allTags}
                allUsers={allUsers}
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
