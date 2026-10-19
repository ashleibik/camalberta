"use client"

import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CAMERA_STATUSES } from "@/lib/db/schema"
import { sourceLabel, STATUS_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  DEFAULT_FILTERS,
  useAppState,
  type AreaFilter,
  type SourceFilter,
  type StatusFilter,
} from "./app-state"
import { useVisibleCameras } from "./use-visible-cameras"

const AREA_OPTIONS: { value: AreaFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "calgary", label: "Calgary" },
  { value: "bow_valley", label: "Bow Valley" },
  { value: "qe2", label: "QEII" },
  { value: "edmonton", label: "Edmonton" },
]

function FilterRow({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </Label>
      {children}
    </div>
  )
}

export function Filters({ className }: { className?: string }) {
  const { filters, setFilter, resetFilters } = useAppState()
  const { sources, quadrants } = useVisibleCameras()

  const isDefault =
    JSON.stringify({ ...filters, search: "" }) ===
    JSON.stringify({ ...DEFAULT_FILTERS, search: "" })

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Filters
        </h2>
        {!isDefault && (
          <Button
            variant="ghost"
            size="xs"
            onClick={resetFilters}
            className="text-muted-foreground"
          >
            <X aria-hidden="true" />
            Reset
          </Button>
        )}
      </div>

      <ToggleGroup
        type="single"
        value={filters.area}
        onValueChange={(v) => v && setFilter("area", v as AreaFilter)}
        className="w-full"
        variant="outline"
      >
        {AREA_OPTIONS.map((opt) => (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            className="min-w-0 flex-auto px-2 text-xs"
          >
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <FilterRow label="Source" htmlFor="filter-source">
        <Select
          value={filters.source}
          onValueChange={(v) => setFilter("source", v as SourceFilter)}
        >
          <SelectTrigger id="filter-source" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>
                {sourceLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>

      <FilterRow label="Quadrant" htmlFor="filter-quadrant">
        <Select
          value={filters.quadrant}
          onValueChange={(v) => setFilter("quadrant", v)}
          disabled={quadrants.length === 0}
        >
          <SelectTrigger id="filter-quadrant" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All quadrants</SelectItem>
            {quadrants.map((q) => (
              <SelectItem key={q} value={q}>
                {q}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>

      <FilterRow label="Status" htmlFor="filter-status">
        <Select
          value={filters.status}
          onValueChange={(v) => setFilter("status", v as StatusFilter)}
        >
          <SelectTrigger id="filter-status" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {CAMERA_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>

      <label className="flex items-center gap-2 pt-1 text-sm">
        <Checkbox
          checked={filters.favoritesOnly}
          onCheckedChange={(checked) =>
            setFilter("favoritesOnly", checked === true)
          }
        />
        Favorites only
      </label>
    </div>
  )
}
