import { cn } from "@/lib/utils";

/**
 * One settings section rendered inside the shell's content panel: a header
 * (title + optional description) over a stack of field groups separated by warm
 * hairlines. This is the "lighter chrome" that replaces the old per-section
 * <Card> — the panel is the only surface; groups are divided by a rule, never
 * nested cards (DESIGN.md). Each direct child is a field group (FieldSet / Field
 * / a form.Field that renders one); the container draws the dividers and the
 * symmetric vertical padding, trimmed at the first/last edge.
 */
export function SettingsSection({
  title,
  description,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-6", className)}>
      <header className="space-y-1.5">
        <h2 className="font-heading text-base font-medium text-balance text-foreground">
          {title}
        </h2>
        {description && (
          <p className="max-w-prose text-sm leading-normal text-muted-foreground">
            {description}
          </p>
        )}
      </header>
      <div className="divide-y divide-border/60 [&>*]:py-7 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
        {children}
      </div>
    </section>
  );
}
