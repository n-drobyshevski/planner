# Planner design system — conventions

A calm, shared calendar-for-two. Warm-paper surfaces, **one** terracotta accent
(`primary`), understated. Warmth comes from restraint, never decoration. Avoid
gamified-productivity and generic-SaaS-dashboard chrome.

## Setup & wrapping

Components are styled by Tailwind utility classes bound to CSS-variable tokens —
**no theme provider is needed for styling**. Light mode is the default; dark mode
applies when an ancestor has the `.dark` class. Two components need a behavioral
wrapper:

- **Sidebar** — wrap in `<SidebarProvider>` (provides collapse state).
- **Tooltip** — wrap the tree (or app root) in `<TooltipProvider>`.

Compound components are composed from their named parts (e.g. `Card` +
`CardHeader`/`CardTitle`/`CardContent`/`CardFooter`/`CardAction`; `Dialog` +
`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`). All parts are
importable from the bundle even when only the lead component has its own card.

## Styling idiom — Tailwind utilities mapped to semantic tokens

Style with these **semantic** utilities (never raw hex or `bg-orange-500`). Each
has a paired `-foreground`:

| Surface / role | utilities |
|---|---|
| Page surface | `bg-background` `text-foreground` |
| Accent (terracotta) — primary actions | `bg-primary` `text-primary-foreground` |
| Quiet fill | `bg-secondary` / `bg-muted` `text-muted-foreground` |
| Hover / active wash | `bg-accent` `text-accent-foreground` |
| Card / popover surfaces | `bg-card` `bg-popover` |
| Hairlines & focus | `border-border` `ring-ring` |
| Danger | `text-destructive` / `bg-destructive/10` |

Shape & type: controls and pills use `rounded-2xl`; cards use the larger radius
built into `Card`. Titles use `font-heading`; body uses `font-sans` (the default).
Member identity / event colors: `member-a`, `member-b`, `event-shared`. Prefer the
component's own `variant`/`size` props over restyling (e.g. `<Button variant=
"outline" size="sm">`, `<Badge variant="secondary">`). Button icons take
`data-icon="inline-start"` / `"inline-end"` for correct spacing.

## Where the truth lives

- Tokens & component CSS: `styles.css` → `_ds_bundle.css` (`@theme` block).
- Per-component API and usage: each `<Name>.d.ts` (`<Name>Props`) and
  `<Name>.prompt.md`.

## Idiomatic example

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent,
  CardFooter, CardAction, Button, Badge } from "planner";
import { Clock } from "lucide-react";

<Card className="w-80">
  <CardHeader>
    <CardTitle>Dinner with Mara</CardTitle>
    <CardDescription>Thursday · shared</CardDescription>
    <CardAction><Badge variant="secondary">Planned</Badge></CardAction>
  </CardHeader>
  <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
    <Clock className="size-4" /> 7:30 PM – 9:30 PM
  </CardContent>
  <CardFooter className="gap-2">
    <Button size="sm">Confirm</Button>
    <Button size="sm" variant="ghost">Reschedule</Button>
  </CardFooter>
</Card>
```
