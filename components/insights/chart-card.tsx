"use client";

// ChartCard — the shared frame every insights chart renders through:
//   · takeaway headline (a sentence of meaning, not just a metric name)
//   · optional per-chart controls (chart type, previous-period comparison)
//   · optional togglable series chips (legend that doubles as a filter)
//   · optional accessible table alternative behind a disclosure
// Per-chart settings persist per viewer per device in localStorage — a low
// value lens like the insights filters, deliberately NOT synced or in the URL.

import { useState } from "react";
import {
  ChartColumn,
  ChartLine,
  ChartArea,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./tab-bits";

const STORAGE_PREFIX = "planner:insights:chart:v1:";

export type ChartType = "bar" | "line" | "area";

export interface ChartSettings {
  chartType: ChartType;
  showComparison: boolean;
  hiddenSeries: ReadonlySet<string>;
}

interface StoredSettings {
  type?: ChartType;
  comparison?: boolean;
  hidden?: string[];
}

const CHART_TYPES: ChartType[] = ["bar", "line", "area"];
const TYPE_ICONS = { bar: ChartColumn, line: ChartLine, area: ChartArea } as const;
const TYPE_LABELS = { bar: "Bar", line: "Line", area: "Area" } as const;

function readStored(storageKey: string): StoredSettings {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const p = parsed as StoredSettings;
      return {
        type: CHART_TYPES.includes(p.type as ChartType) ? p.type : undefined,
        comparison: typeof p.comparison === "boolean" ? p.comparison : undefined,
        hidden: Array.isArray(p.hidden)
          ? p.hidden.filter((k): k is string => typeof k === "string")
          : undefined,
      };
    }
  } catch {
    /* private mode / corrupt entry — defaults */
  }
  return {};
}

function writeStored(storageKey: string, next: StoredSettings) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    /* private mode — settings still apply for this mount via state */
  }
}

/**
 * Per-chart display settings, persisted per viewer per device. Chart cards
 * mount inside ssr:false tab chunks, so reading localStorage in the lazy
 * initializer is hydration-safe (same pattern as the Optimize dismissals).
 */
export function useChartSettings(
  viewerId: string,
  chartId: string,
  defaults?: { chartType?: ChartType; showComparison?: boolean },
) {
  const storageKey = `${STORAGE_PREFIX}${viewerId}:${chartId}`;
  const [settings, setSettings] = useState<ChartSettings>(() => {
    const stored = readStored(storageKey);
    return {
      chartType: stored.type ?? defaults?.chartType ?? "bar",
      showComparison: stored.comparison ?? defaults?.showComparison ?? false,
      hiddenSeries: new Set(stored.hidden ?? []),
    };
  });

  function persist(next: ChartSettings) {
    setSettings(next);
    writeStored(storageKey, {
      type: next.chartType,
      comparison: next.showComparison,
      hidden: [...next.hiddenSeries],
    });
  }

  return {
    settings,
    setChartType: (chartType: ChartType) => persist({ ...settings, chartType }),
    setShowComparison: (showComparison: boolean) =>
      persist({ ...settings, showComparison }),
    toggleSeries: (key: string) => {
      const hidden = new Set(settings.hiddenSeries);
      if (hidden.has(key)) hidden.delete(key);
      else hidden.add(key);
      persist({ ...settings, hiddenSeries: hidden });
    },
  };
}

export interface ChartCardSeries {
  key: string;
  label: string;
  color: string;
}

export function ChartCard({
  id,
  viewerId,
  title,
  headline,
  chartTypes,
  comparison = false,
  comparisonLabel = "Compare with previous period",
  defaultChartType,
  series,
  table,
  tableLabel = "View as table",
  footnote,
  className,
  children,
}: {
  /** Stable id for settings persistence (per viewer per device). */
  id: string;
  viewerId: string;
  /** Small uppercase section label. */
  title: string;
  /** The takeaway — one sentence of meaning ("Most time went to Work, up 2h"). */
  headline?: string;
  /** Offer a chart-type switch between these (omit / 1 entry = no switch). */
  chartTypes?: ChartType[];
  /** Offer the previous-period ghost-overlay toggle. */
  comparison?: boolean;
  comparisonLabel?: string;
  defaultChartType?: ChartType;
  /** Togglable series — rendered as legend chips that double as filters. */
  series?: ChartCardSeries[];
  /** Accessible table alternative, behind a disclosure. */
  table?: React.ReactNode;
  tableLabel?: string;
  footnote?: string;
  className?: string;
  children: (settings: ChartSettings) => React.ReactNode;
}) {
  const { settings, setChartType, setShowComparison, toggleSeries } =
    useChartSettings(viewerId, id, {
      chartType: defaultChartType ?? chartTypes?.[0],
      showComparison: false,
    });

  const typeChoices = chartTypes && chartTypes.length > 1 ? chartTypes : null;
  const hasControls = Boolean(typeChoices || comparison);

  return (
    <section className={cn("space-y-1.5", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <SectionLabel>{title}</SectionLabel>
          {headline && <p className="text-sm font-medium">{headline}</p>}
        </div>
        {hasControls && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mt-1 size-11 shrink-0 text-muted-foreground sm:size-8"
                aria-label={`Chart options: ${title}`}
              >
                <SlidersHorizontal />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-3 p-3">
              {typeChoices && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Chart type</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={settings.chartType}
                    onValueChange={(v) => v && setChartType(v as ChartType)}
                    className="w-full"
                  >
                    {typeChoices.map((t) => {
                      const Icon = TYPE_ICONS[t];
                      return (
                        <ToggleGroupItem
                          key={t}
                          value={t}
                          aria-label={`${TYPE_LABELS[t]} chart`}
                          className="min-h-9 flex-1 gap-1.5"
                        >
                          <Icon aria-hidden className="size-3.5" />
                          {TYPE_LABELS[t]}
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </div>
              )}
              {comparison && (
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`${id}-compare`} className="text-xs">
                    {comparisonLabel}
                  </Label>
                  <Switch
                    id={`${id}-compare`}
                    checked={settings.showComparison}
                    onCheckedChange={setShowComparison}
                  />
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {series && series.length > 1 && (
        <ul className="flex flex-wrap gap-1" aria-label="Toggle series">
          {series.map((s) => {
            const hidden = settings.hiddenSeries.has(s.key);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  aria-pressed={!hidden}
                  onClick={() => toggleSeries(s.key)}
                  className={cn(
                    "flex min-h-7 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-opacity",
                    hidden ? "opacity-45" : "bg-card",
                  )}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: s.color }}
                    aria-hidden
                  />
                  <span className={cn("max-w-32 truncate", hidden && "line-through")}>
                    {s.label}
                  </span>
                  <span className="sr-only">{hidden ? "(hidden)" : "(shown)"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {children(settings)}

      {footnote && <p className="text-[11px] text-muted-foreground">{footnote}</p>}

      {table && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 gap-1.5 px-1.5 text-xs text-muted-foreground sm:min-h-7"
            >
              <Table2 aria-hidden className="size-3.5" />
              {tableLabel}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>{table}</CollapsibleContent>
        </Collapsible>
      )}
    </section>
  );
}
