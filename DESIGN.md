---
name: Planner
description: A warm, shared calendar for two — quiet, precise, built to coordinate.
colors:
  terracotta: "#c0492a"
  terracotta-light: "#f2754e"
  warm-paper: "#faf8f5"
  stone-ink: "#292524"
  card-white: "#ffffff"
  warm-stone-100: "#f2ede7"
  warm-stone-accent: "#f1ebe4"
  stone-muted: "#78716c"
  warm-stone-border: "#e7e0d7"
  destructive-red: "#dc2626"
  member-a: "#c0492a"
  member-b: "#0f766e"
  shared-amber: "#b45309"
typography:
  title:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.375
    letterSpacing: "normal"
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  sm: "0.45rem"
  md: "0.6rem"
  lg: "0.75rem"
  xl: "1.05rem"
  pill: "1.95rem"
spacing:
  xs: "0.25rem"
  sm: "0.375rem"
  md: "0.625rem"
  lg: "0.75rem"
  xl: "1rem"
components:
  button-primary:
    backgroundColor: "{colors.terracotta}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  button-outline:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.stone-ink}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.stone-ink}"
    rounded: "{rounded.lg}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.stone-ink}"
    rounded: "{rounded.xl}"
    padding: "1rem"
  badge:
    backgroundColor: "{colors.terracotta}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
  event-block:
    backgroundColor: "{colors.member-a}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.375rem"
---

# Design System: Planner

## 1. Overview

**Creative North Star: "The Shared Almanac"**

Planner is the digital version of a well-kept household almanac that two people write
in together: a warm paper surface, exact about dates and times, calm to the touch, and
never shouting for attention. It is a tool, not a destination. Its job is to let two
people answer "are we both free, and whose is this?" at a glance and then get on with
their day. Every decision serves coordination and trust; nothing exists to impress.

The surface is **warm paper** (`#faf8f5`) with **stone ink** (`#292524`) and a single
committed accent, a **terracotta-coral** (`#c0492a`). Warmth is the material, not a
decoration layered on top: it lives in the paper, the stone neutrals, and the soft
shadows, which is what lets the interface stay quiet without turning cold or clinical.
Hierarchy is built from a deliberately shallow type scale and generous spacing rather
than big display type — this is a product register, so there is no hero tier, no
marketing voice, no ornament competing with the schedule itself.

What this system rejects is as defining as what it embraces. It is **not** a gamified
productivity app (no streaks, badges, confetti, or XP), **not** a generic SaaS dashboard
(no card-grid-everything, gradient accents, or hero-metric templates), and **not** a
cold minimal mono tool (understatement here is warm, never sterile). The line it walks:
quiet and precise, yet human.

**Key Characteristics:**
- Warm, paper-toned light surface; warm-charcoal dark mode — never pure white or pure black.
- One committed terracotta accent, used sparingly; color otherwise carries *meaning* (whose, what, what-state).
- Shallow type scale, single family in weight contrast; precision over flourish.
- Soft, warm-tinted shadows and hairline rings; mostly flat, depth only where it means "floating."
- Rounded, gentle geometry (0.75rem base radius) — approachable, not bubbly.
- Accessibility and color-meaning are load-bearing, not afterthoughts (WCAG AA throughout, never color-only signals).

## 2. Colors

A warm, low-saturation neutral field with one terracotta accent — and a small, strict set
of *semantic* colors that encode ownership and status.

### Primary
- **Terracotta Coral** (`#c0492a`): The single brand accent. Verified 4.97:1 on white. Reserved for primary actions, the focus ring, active navigation, and selection. In dark mode it lightens to **Warm Coral** (`#f2754e`, 6.19:1 on charcoal) so it stays legible without glare. It is also Member A's identity color.

### Secondary
- **Teal** (`#0f766e`): Member B's identity color. Not a general-purpose accent — it appears only where it means "this belongs to the second person."
- **Shared Amber** (`#b45309`): The color of jointly-owned events. Distinct from both members so "ours" reads instantly as neither "mine" nor "yours."

### Tertiary
- **Category swatches**: a fixed, contrast-checked set used for event/task categories — coral `#c0492a`, teal `#0f766e`, amber `#b45309`, green `#15803d`, blue `#0369a1`, rose `#be185d`, violet `#7c3aed`. White or dark "ink" is chosen per swatch so a filled chip always passes AA.

### Neutral
- **Warm Paper** (`#faf8f5`): The body background. The room everything sits in.
- **Card White** (`#ffffff`): Raised surfaces (cards, popovers, dialogs).
- **Warm Stone 100** (`#f2ede7`): Secondary buttons, muted fills, hover surfaces.
- **Warm Stone Border** (`#e7e0d7`): Borders, inputs, dividers — a warm hairline, never a hard gray line.
- **Stone Muted** (`#78716c`): Muted/secondary text. Verified for AA at body size; the warm neutral that replaces "light gray for elegance."
- **Stone Ink** (`#292524`): Primary text. Warm near-black, not `#000`.

### Named Rules
**The One Accent Rule.** Terracotta is the *only* decorative accent, and it stays rare — primary action, focus, active state, selection. If a screen has two terracotta things competing for "the" action, one of them is wrong.

**The Color-Means-Something Rule.** Outside the single accent, color is never decorative. A hue on screen answers a question: *whose is this* (Member A coral / Member B teal), *is it ours* (shared amber), or *what category* (the swatch set). Adding color "for visual interest" is prohibited; it breaks the legibility the whole product depends on.

**The Warm-Neutral Rule.** Every neutral is tinted warm (stone, not zinc/slate by default). Pure `#000`, pure `#fff` text, and cold grays are forbidden in the default theme; they read as a different, colder product.

## 3. Typography

**Display / Body Font:** Plus Jakarta Sans (with `ui-sans-serif, system-ui, sans-serif`)
**Mono Font:** Geist Mono (with `ui-monospace, monospace`)

**Character:** One humanist-geometric sans does all the structural work, separated by weight and size rather than by mixing faces — calm, contemporary, unfussy. Geist Mono appears only for times and tabular figures, where aligned digits make a schedule scannable. There is intentionally **no display tier**: a coordination tool has no headline to shout.

### Hierarchy
- **Title** (500, 1rem / `text-base`, line-height 1.375): Card titles, dialog headers, section labels. The top of the scale.
- **Body** (400, 0.875rem / `text-sm`, line-height ~1.5): Default reading size across the app.
- **Label** (500, 0.75rem / `text-xs`): Badges, chips, metadata, secondary controls.
- **Mono / Time** (400, 0.6875rem / `text-[11px]`, `tabular-nums`): Event times and any aligned-figure context. Geist Mono, tabular numerals.
- **Input floor**: form fields render at 16px on phones (`text-base` → `md:text-sm`) to defeat iOS focus-zoom; touch targets stay ≥ 2.75rem on mobile.

### Named Rules
**The Shallow-Scale Rule.** The scale tops out near 1rem. Hierarchy comes from weight, color, and spacing — not from large type. If a heading needs to be big to feel important, the layout is wrong.

**The Tabular-Time Rule.** Times and aligned figures are always `tabular-nums`. A schedule that jitters as digits change width is a schedule that's hard to scan.

## 4. Elevation

The system is **mostly flat, with soft warm light**. Resting surfaces are defined by a hairline ring (`ring-1` at ~10% ink), not a shadow — cards sit on the paper, they don't float above it. Shadows are reserved for things that genuinely *are* floating: event blocks in the grid, popovers, dialogs, dropdowns. Every shadow is tinted with warm stone (`rgb(28 25 23 / …)`), never neutral black, so depth stays consistent with the paper.

### Shadow Vocabulary
- **Soft** (`box-shadow: 0 1px 2px rgb(28 25 23 / 0.06), 0 4px 12px rgb(28 25 23 / 0.06)`): Event blocks and lightly-raised elements. A gentle lift, not a drop shadow.
- **Soft Large** (`box-shadow: 0 2px 6px rgb(28 25 23 / 0.07), 0 12px 28px rgb(28 25 23 / 0.08)`): Popovers, dialogs, menus — surfaces that clearly leave the page.
- **Hairline ring** (`box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground), transparent 90%)`): The resting-state border for cards. Defines an edge without weight.

### Named Rules
**The Flat-At-Rest Rule.** Surfaces are flat by default, held by a hairline ring. A shadow appears only when an element is genuinely floating (overlay, dragged event, open menu). Decorative shadows on resting cards are forbidden.

**The Warm-Shadow Rule.** Shadow color is warm stone (`28 25 23`), never `0 0 0`. A cold shadow on this paper reads as a foreign element pasted in.

## 5. Components

Components are compact and quiet: small heights, gentle radii, restrained states. They are sized for an app you scan and operate quickly, not a landing page you admire.

### Buttons
- **Shape:** Gently rounded (`0.75rem`, `rounded-lg`). Compact heights — default `2rem` (`h-8`), with `xs`/`sm`/`lg` from `1.5rem`–`2.25rem`. Text `0.875rem`, weight 500.
- **Primary:** Terracotta fill, white text. Hover dims to ~80% opacity. The one loud control on a screen.
- **Outline / Secondary / Ghost:** Paper or warm-stone fills with stone ink; hover lands on `muted`. These carry most of the app's actions — primary is rare by design.
- **Destructive:** *Tinted, not solid* — `destructive/10` fill with red text, deepening to `/20` on hover. Quiet about danger until you hover; never a loud red block.
- **Hover / Focus / Active:** Color-only hover (no lift). Focus is a 3px terracotta ring at 50% (`ring-3 ring-ring/50`) plus a ring-colored border. Active nudges down 1px (`translate-y-px`) for a tactile press.

### Chips / Badges
- **Style:** Full pill (`1.95rem`, `rounded-4xl`), `1.25rem` tall, `text-xs` weight 500. Variants: terracotta `default`, warm-stone `secondary`, tinted `destructive`, hairline `outline`, `ghost`.
- **Use:** Status and category markers. Category chips take their fill from the contrast-checked swatch set, with per-swatch legible ink.

### Cards / Containers
- **Corner Style:** Soft (`1.05rem`, `rounded-xl`).
- **Background:** Card white on warm paper.
- **Shadow Strategy:** None at rest — a hairline `ring-1 ring-foreground/10` (see Elevation). Flat by default.
- **Footer:** Separated by a top border over a `muted/50` fill.
- **Internal Padding:** `1rem` (`py-4`/`px-4`); a denser `sm` size drops to `0.75rem`.

### Inputs / Fields
- **Style:** `2rem` tall, `rounded-lg`, transparent fill with a warm-stone border. Padding `0.25rem 0.625rem`.
- **Focus:** Border shifts to terracotta + a 3px terracotta ring at 50%. No glow, no animation beyond the color/ring change.
- **Placeholder:** Stone-muted at full AA contrast — never a faint gray hint.
- **Error / Disabled:** `aria-invalid` → destructive border + ring; disabled → muted fill, reduced opacity, no pointer.

### Navigation
- **Style:** A warm sidebar surface (`#f6f2ec`), one notch warmer than the paper body, plus a top toolbar. Active items use the terracotta `sidebar-primary`; rest/hover stay in warm neutrals. Typography is the app's title/label scale, not enlarged.
- **Mobile:** Sidebar collapses to a sheet; safe-area insets (`pt-safe`/`pb-safe`) clear the notch and home indicator.

### Event Block (signature component)
The defining custom component — a timed block in the calendar grid, and the clearest expression of the product's core job. It is small (`0.6rem` radius, `1.5px` border, `text-xs`, soft shadow) and encodes three things at a glance:
- **Ownership by fill.** *Mine* and *shared/joint* events are **solid-filled** with their owner/category color and white text. **Another person's** event renders **outlined** (tinted fill, colored border, colored text) — "look, don't touch," and not editable by you. This filled-vs-outlined split is how "whose is this?" is answered without reading a word.
- **Shared marker.** Jointly-owned events carry a small `Users` icon and the shared-amber identity.
- **Status overlays.** `cancelled` → diagonal stripes + grayscale + strikethrough; `planned` → dotted outline ("pencilled in"); `inactive` → dimmed + grayscale; `confirmed` → plain fill. Status is never color-only — the texture/outline carries it too.
- **State:** Selected → `ring-2 ring-foreground`. Hover raises z-index so a covered block is revealed in full (a pure z change, no layout shift). Times shown in `tabular-nums`.

## 6. Do's and Don'ts

### Do:
- **Do** keep terracotta rare — primary action, focus, active, selection only (**The One Accent Rule**).
- **Do** let color mean something outside the accent: whose (coral / teal), ours (amber), or category (the swatch set).
- **Do** tint every neutral and every shadow warm (stone `#…`, shadow `rgb(28 25 23 / …)`); use warm near-black `#292524` for text, never `#000`.
- **Do** build hierarchy from weight, color, and spacing on a shallow scale that tops out near 1rem.
- **Do** keep surfaces flat at rest with a hairline ring; reserve soft shadows for genuinely-floating elements.
- **Do** encode event ownership as filled (mine/shared) vs outlined (theirs), and carry status with texture/outline, not color alone.
- **Do** hold WCAG AA on body and large text in every theme, keep placeholders at full contrast, and honor `prefers-reduced-motion`.
- **Do** keep `tabular-nums` on all times and aligned figures.

### Don't:
- **Don't** add gamification — no streaks, badges, confetti, XP, or dopamine nudges. Coordinating two lives is not a game to win.
- **Don't** reach for generic SaaS-dashboard patterns: no card-grid-everything, no gradient accents, no hero-metric "big number + sparkline" templates, no marketing-landing chrome inside the app.
- **Don't** drift cold or sterile (the "cold minimal mono tool" failure): stark black-on-white, zero-warmth, designer-brutalist coldness is the wrong kind of quiet.
- **Don't** use `border-left`/`border-right` > 1px as a colored side-stripe on cards, list items, or alerts. Use full borders, a background tint, or a leading icon instead.
- **Don't** use gradient text (`background-clip: text`) or decorative glassmorphism. Emphasis comes from weight and size.
- **Don't** introduce a second decorative accent or a display type tier — if a heading needs to be big to feel important, fix the layout.
- **Don't** ship cold/neutral shadows or pure-gray borders; they read as a different, colder product pasted onto the paper.
- **Don't** convey status, ownership, or errors with color alone.
