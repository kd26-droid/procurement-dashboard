'use client'

import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search,
  Trash2,
  Plus,
  Settings2,
  Users,
  DollarSign,
  CheckSquare,
  Link2
} from 'lucide-react'
import { cn } from '@/lib/utils'

// --- TYPE DEFINITIONS ---
export type MappingId =
  | 'Direct - Materials'
  | 'Indirect - Materials'
  | 'Direct - Capex'
  | 'Indirect - Capex'

export type PriceSource =
  | 'PO'
  | 'Contract'
  | 'Quote'
  | 'Online - Digikey'
  | 'Online - Mouser'
  | 'Online - LCSC'
  | 'Online - Farnell'
  | 'EXIM'

export type ActionPurpose = 'Quote' | 'PO' | 'Contract'
export type ItemIdType = 'HSN' | 'MPN' | 'CPN'

export type UsersSettings = {
  tagUserMap: Record<string, string[]>
}

export type PricesSettings = {
  mappingItemId: Record<MappingId, string>
  itemIdOptions: string[]
  sourcesByMapping: Record<MappingId, PriceSource[]>
}

export type ActionsSettings = {
  purpose: ActionPurpose
  itemIdType: ItemIdType
  sources: PriceSource[]
  maxAgeDays: number
}

export type AppSettings = {
  name: string
  users: UsersSettings
  prices: PricesSettings
  actions: ActionsSettings
}

// --- CONSTANTS ---
const DEFAULT_MAPPING_IDS: MappingId[] = [
  'Direct - Materials',
  'Indirect - Materials',
  'Direct - Capex',
  'Indirect - Capex',
]

const DEFAULT_PRICE_SOURCES: PriceSource[] = [
  'PO',
  'Contract',
  'Quote',
  'Online - Digikey',
  'Online - Mouser',
  'Online - LCSC',
  'Online - Farnell',
  'EXIM',
]


// --- HELPER FUNCTIONS ---
export const buildDefaultSettings = (name = 'Default'): AppSettings => ({
  name,
  users: { tagUserMap: {} },
  prices: {
    mappingItemId: {
      'Direct - Materials': 'Item ID',
      'Indirect - Materials': 'Item ID',
      'Direct - Capex': 'Item ID',
      'Indirect - Capex': 'Item ID',
    },
    itemIdOptions: ['MPN ID', 'HSN Code', 'Item ID'],
    sourcesByMapping: DEFAULT_MAPPING_IDS.reduce(
      (acc, id) => ({ ...acc, [id]: ['PO', 'Contract', 'Quote'] as PriceSource[] }),
      {} as Record<MappingId, PriceSource[]>,
    ),
  },
  actions: {
    purpose: 'Quote',
    itemIdType: 'MPN',
    sources: ['PO', 'Contract', 'Quote'],
    maxAgeDays: 365,
  },
})

export function allowedSourcesForItemIdType(t: ItemIdType): PriceSource[] {
  if (t === 'HSN') return ['Quote', 'PO', 'Contract', 'EXIM']
  return DEFAULT_PRICE_SOURCES
}

// --- PROPS TYPE ---
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  allTags: string[]
  allUsers: string[]
  current: AppSettings
  onSave: (settings: AppSettings) => void
}

// Action Formula Types
type ActionFormula = {
  id: string
  purpose: ActionPurpose
  itemIdType: ItemIdType
  source: PriceSource
  dateOperator: 'before' | 'after' | 'range'
  dateValue: string
  action: string
}

// --- MAIN COMPONENT ---
export function SettingsDialog({ open, onOpenChange, allTags, allUsers, current, onSave }: Props) {
  const [local, setLocal] = useState<AppSettings>(current)
  const [newItemId, setNewItemId] = useState('')
  const [tagSearch, setTagSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])

  // Multiple formulas state
  const [actionFormulas, setActionFormulas] = useState<ActionFormula[]>([])
  const [currentFormula, setCurrentFormula] = useState<ActionFormula>({
    id: '',
    purpose: 'Quote',
    itemIdType: 'MPN',
    source: 'Online - Digikey',
    dateOperator: 'after',
    dateValue: '2024-08-01',
    action: 'Create Quote'
  })

  useEffect(() => {
    if (open) {
      setLocal(JSON.parse(JSON.stringify(current)))
      setSelectedTags([])
      setSelectedUsers([])
      setTagSearch('')
      setUserSearch('')
      setActionFormulas([])
    }
  }, [open, current])

  // Event handlers
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const toggleUser = (user: string) => {
    setSelectedUsers(prev => prev.includes(user) ? prev.filter(u => u !== user) : [...prev, user])
  }

  const linkTagsToUsers = () => {
    if (selectedTags.length === 0 || selectedUsers.length === 0) return

    setLocal(prev => {
      const newMap = { ...prev.users.tagUserMap }
      selectedTags.forEach(tag => {
        newMap[tag] = [...selectedUsers]
      })
      return {
        ...prev,
        users: { ...prev.users, tagUserMap: newMap }
      }
    })

    setSelectedTags([])
    setSelectedUsers([])
  }

  const removeTagMapping = (tag: string) => {
    setLocal(prev => {
      const newMap = { ...prev.users.tagUserMap }
      delete newMap[tag]
      return {
        ...prev,
        users: { ...prev.users, tagUserMap: newMap }
      }
    })
  }

  const setMappingItemId = (mapping: MappingId, itemId: string) => {
    setLocal(prev => ({
      ...prev,
      prices: {
        ...prev.prices,
        mappingItemId: { ...prev.prices.mappingItemId, [mapping]: itemId }
      }
    }))
  }

  const addNewItemId = () => {
    const id = newItemId.trim()
    if (!id || local.prices.itemIdOptions.includes(id)) return

    setLocal(prev => ({
      ...prev,
      prices: {
        ...prev.prices,
        itemIdOptions: [...prev.prices.itemIdOptions, id]
      }
    }))
    setNewItemId('')
  }

  const togglePriceSource = (mapping: MappingId, source: PriceSource) => {
    setLocal(prev => {
      const sources = new Set(prev.prices.sourcesByMapping[mapping] || [])
      if (sources.has(source)) {
        sources.delete(source)
      } else {
        sources.add(source)
      }
      return {
        ...prev,
        prices: {
          ...prev.prices,
          sourcesByMapping: {
            ...prev.prices.sourcesByMapping,
            [mapping]: Array.from(sources)
          }
        }
      }
    })
  }


  // Formula handlers
  const addFormula = () => {
    const newFormula = {
      ...currentFormula,
      id: Date.now().toString(),
      action: `Create ${currentFormula.purpose}`
    }
    setActionFormulas(prev => [...prev, newFormula])
    setCurrentFormula({
      id: '',
      purpose: 'Quote',
      itemIdType: 'MPN',
      source: 'Online - Digikey',
      dateOperator: 'after',
      dateValue: '2024-08-01',
      action: 'Create Quote'
    })
  }

  const removeFormula = (id: string) => {
    setActionFormulas(prev => prev.filter(f => f.id !== id))
  }

  const updateCurrentFormula = (field: keyof ActionFormula, value: any) => {
    setCurrentFormula(prev => ({
      ...prev,
      [field]: value,
      action: field === 'purpose' ? `Create ${value}` : prev.action
    }))
  }

  const handleSave = () => {
    onSave(local)
    onOpenChange(false)
  }

  const filteredTags = allTags.filter(tag =>
    tag.toLowerCase().includes(tagSearch.toLowerCase())
  )

  const filteredUsers = allUsers.filter(user =>
    user.toLowerCase().includes(userSearch.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[1200px] h-[85vh] max-h-[800px] p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                  <Settings2 className="h-5 w-5 text-white" />
                </div>
                Settings
              </DialogTitle>
              <DialogDescription className="mt-1">
                Configure automation rules for user assignment, price discovery, and actions
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="users" className="h-full flex flex-col">
            <TabsList className="mx-6 mt-4 grid w-fit grid-cols-3">
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Users
              </TabsTrigger>
              <TabsTrigger value="prices" className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Prices
              </TabsTrigger>
              <TabsTrigger value="actions" className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4" />
                Actions
              </TabsTrigger>
            </TabsList>

            {/* Users Tab */}
            <TabsContent value="users" className="flex-1 px-6 overflow-y-auto">
              <div className="space-y-6 pb-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Link Tags to Users</CardTitle>
                    <CardDescription>
                      Select tags and users to create assignment mappings
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Tags Selection */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-semibold">Tags ({selectedTags.length})</Label>
                        </div>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search tags..."
                            value={tagSearch}
                            onChange={(e) => setTagSearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <ScrollArea className="h-48 border rounded-md p-2">
                          <div className="space-y-2">
                            {filteredTags.map(tag => (
                              <div key={tag} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`tag-${tag}`}
                                  checked={selectedTags.includes(tag)}
                                  onCheckedChange={() => toggleTag(tag)}
                                />
                                <Label
                                  htmlFor={`tag-${tag}`}
                                  className="text-sm cursor-pointer"
                                >
                                  {tag}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>

                      {/* Users Selection */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-semibold">Users ({selectedUsers.length})</Label>
                        </div>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search users..."
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <ScrollArea className="h-48 border rounded-md p-2">
                          <div className="space-y-2">
                            {filteredUsers.map(user => (
                              <div key={user} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`user-${user}`}
                                  checked={selectedUsers.includes(user)}
                                  onCheckedChange={() => toggleUser(user)}
                                />
                                <Label
                                  htmlFor={`user-${user}`}
                                  className="text-sm cursor-pointer"
                                >
                                  {user}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    </div>

                    <div className="mt-4">
                      <Button
                        onClick={linkTagsToUsers}
                        disabled={selectedTags.length === 0 || selectedUsers.length === 0}
                        className="w-full"
                      >
                        <Link2 className="h-4 w-4 mr-2" />
                        Link {selectedTags.length} Tags to {selectedUsers.length} Users
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Current Mappings */}
                <Card>
                  <CardHeader>
                    <CardTitle>Current Mappings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.keys(local.users.tagUserMap).length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          No mappings created yet
                        </p>
                      ) : (
                        Object.entries(local.users.tagUserMap).map(([tag, users]) => (
                          <div key={tag} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <div className="font-semibold">{tag}</div>
                              <div className="flex gap-1 mt-1">
                                {users.map(user => (
                                  <Badge key={user} variant="secondary" className="text-xs">
                                    {user}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTagMapping(tag)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Prices Tab */}
            <TabsContent value="prices" className="flex-1 px-6 overflow-y-auto">
              <div className="space-y-6 pb-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Item ID Mapping */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Item ID Mapping</CardTitle>
                      <CardDescription>
                        Define which Item ID to use for each mapping type
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {DEFAULT_MAPPING_IDS.map(mapping => (
                        <div key={mapping} className="flex items-center justify-between">
                          <Label className="text-sm font-medium">{mapping}</Label>
                          <Select
                            value={local.prices.mappingItemId[mapping]}
                            onValueChange={(value) => setMappingItemId(mapping, value)}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {local.prices.itemIdOptions.map(option => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}

                      <Separator />

                      <div className="space-y-2">
                        <Label>Add New Item ID</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="e.g., CPN-Alternate"
                            value={newItemId}
                            onChange={(e) => setNewItemId(e.target.value)}
                          />
                          <Button onClick={addNewItemId} size="sm">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Price Sources */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Price Sources</CardTitle>
                      <CardDescription>
                        Select sources for price comparison
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-80">
                        <div className="space-y-4">
                          {DEFAULT_MAPPING_IDS.map(mapping => (
                            <div key={mapping}>
                              <Label className="text-sm font-medium">{mapping}</Label>
                              <div className="grid grid-cols-2 gap-1 mt-2">
                                {DEFAULT_PRICE_SOURCES.map(source => {
                                  const isActive = (local.prices.sourcesByMapping[mapping] || []).includes(source)
                                  return (
                                    <button
                                      key={source}
                                      type="button"
                                      onClick={() => togglePriceSource(mapping, source)}
                                      className={cn(
                                        "px-2 py-1 text-xs rounded border transition-colors",
                                        isActive
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-background hover:bg-muted"
                                      )}
                                    >
                                      {source}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Actions Tab */}
            <TabsContent value="actions" className="flex-1 px-6 overflow-y-auto">
              <div className="space-y-6 pb-6">

                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Action Formula Builder</CardTitle>
                      <CardDescription>
                        Create rules to automatically assign actions to items
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Formula Builder */}
                      <div className="p-4 border rounded-lg bg-gray-50">
                        <Label className="text-sm font-medium mb-4 block">Build Rule</Label>

                        <div className="space-y-4">
                          {/* If Statement */}
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-medium">IF</span>

                            {/* Purpose */}
                            <span className="text-gray-600">purpose is</span>
                            <Select
                              value={currentFormula.purpose}
                              onValueChange={(value) => updateCurrentFormula('purpose', value)}
                            >
                              <SelectTrigger className="w-24 font-bold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Quote">Quote</SelectItem>
                                <SelectItem value="PO">PO</SelectItem>
                                <SelectItem value="Contract">Contract</SelectItem>
                              </SelectContent>
                            </Select>

                            <span className="font-medium">AND</span>

                            {/* Item ID */}
                            <span className="text-gray-600">item ID is</span>
                            <Select
                              value={currentFormula.itemIdType}
                              onValueChange={(value) => updateCurrentFormula('itemIdType', value)}
                            >
                              <SelectTrigger className="w-20 font-bold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MPN">MPN</SelectItem>
                                <SelectItem value="CPN">CPN</SelectItem>
                                <SelectItem value="HSN">HSN</SelectItem>
                              </SelectContent>
                            </Select>

                            <span className="font-medium">AND</span>

                            {/* Source */}
                            <span className="text-gray-600">source is</span>
                            <Select
                              value={currentFormula.source}
                              onValueChange={(value) => updateCurrentFormula('source', value)}
                            >
                              <SelectTrigger className="w-32 font-bold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PO">PO</SelectItem>
                                  <SelectItem value="Contract">Contract</SelectItem>
                                <SelectItem value="Quote">Quote</SelectItem>
                                <SelectItem value="Online - Digikey">Digikey</SelectItem>
                                <SelectItem value="Online - Mouser">Mouser</SelectItem>
                                <SelectItem value="Online - LCSC">LCSC</SelectItem>
                                <SelectItem value="Online - Farnell">Farnell</SelectItem>
                                <SelectItem value="EXIM">EXIM</SelectItem>
                              </SelectContent>
                            </Select>

                            <span className="font-medium">AND</span>

                            {/* Date */}
                            <span className="text-gray-600">date is</span>
                            <Select
                              value={currentFormula.dateOperator}
                              onValueChange={(value) => updateCurrentFormula('dateOperator', value)}
                            >
                              <SelectTrigger className="w-24 font-bold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="before">before</SelectItem>
                                <SelectItem value="after">after</SelectItem>
                                <SelectItem value="range">range</SelectItem>
                              </SelectContent>
                            </Select>

                            <Input
                              type="date"
                              value={currentFormula.dateValue}
                              onChange={(e) => updateCurrentFormula('dateValue', e.target.value)}
                              className="w-32 font-bold"
                            />
                          </div>

                          {/* Then Statement */}
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-medium">THEN</span>
                            <span className="text-gray-600">action is</span>
                            <span className="font-bold">
                              {currentFormula.action}
                            </span>
                          </div>
                        </div>

                        {/* Add Formula Button */}
                        <div className="mt-4 flex justify-end">
                          <Button onClick={addFormula}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Rule
                          </Button>
                        </div>
                      </div>

                      {/* Created Rules */}
                      {actionFormulas.length > 0 && (
                        <div className="mt-6 space-y-2">
                          <Label className="text-sm font-medium">Created Rules</Label>
                          {actionFormulas.map((formula) => (
                            <div key={formula.id} className="p-3 border rounded-lg bg-gray-50">
                              <div className="flex items-center justify-between">
                                <div className="text-sm">
                                  IF purpose = <strong>{formula.purpose}</strong> AND
                                  item ID is <strong>{formula.itemIdType}</strong> AND
                                  source is <strong>{formula.source}</strong> AND
                                  date is {formula.dateOperator} <strong>{new Date(formula.dateValue).toLocaleDateString()}</strong>,
                                  THEN action is <strong>{formula.action}</strong>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFormula(formula.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      </CardContent>
                    </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-gray-50">
          <div className="flex items-center gap-4 mr-auto">
            <Label>Profile Name:</Label>
            <Input
              value={local.name}
              onChange={(e) => setLocal(prev => ({ ...prev, name: e.target.value }))}
              className="w-40"
            />
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}