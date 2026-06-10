// Tiny shared pieces used across the insights tabs.

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/** "42%" of a total, "0%" when the total is empty (never NaN). */
export function srPercent(ms: number, total: number): string {
  return `${total > 0 ? Math.round((ms / total) * 100) : 0}%`;
}
