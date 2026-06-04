# Product

## Register

product

## Users

A private calendar for two people who share a life and need to coordinate it — the
app says it plainly in its own metadata: *"a warm, shared calendar for two."* This is
personal software, not a commercial product: a known pair of users (partners / a
household), each with their own identity in the app, signing in with a short PIN. They
reach for it to answer everyday questions — *"are we both free Thursday?"*, *"whose turn
is the errand?"*, *"did we already plan something that night?"* — usually in passing,
often on a phone, between other things.

## Product Purpose

Help two people keep one shared schedule straight without friction. The core job is
**coordination**: see both schedules together, tell at a glance whose plan is whose and
what is jointly owned, avoid double-booking, and agree on shared events. Tasks (board,
list, backlog, scheduling) support the surrounding life-admin, but the calendar is the
heart. Success is quiet: the two of them trust the calendar, stop double-booking, and
rarely have to think about the tool itself.

## Brand Personality

Quiet, precise, calm — a neutral utility that does the coordination and then recedes,
closer to a well-made paper planner than to an "app." Warm and humane, because it is a
personal space shared between two people rather than an office tool, but the warmth is
carried by restraint, not decoration: gentle surfaces, one committed accent, generous
spacing. Three words: **calm, precise, understated.**

## Anti-references

- **Gamified productivity apps.** No streaks, badges, confetti, XP, or dopamine nudges.
  Coordinating two lives is not a game to win.
- **Generic SaaS dashboards.** No card-grid-everything, gradient accents, hero-metric
  "big number + sparkline" templates, or marketing-landing chrome bolted onto an app.
- **Cold, minimal mono tools.** Understated is the goal, but never sterile. Stark
  black-on-white, zero-warmth, "designer-brutalist" coldness is the wrong kind of quiet.
- *Acceptable territory (not ruled out): a clean, professional scheduler. The line to
  avoid is template-y / loud / cold — not "simple."*

## Design Principles

1. **Calm over clever.** The planner should recede. It is a quiet thing two people
   glance at in passing, not an app competing for attention. Default to less: fewer
   surfaces, less motion, no novelty for its own sake.
2. **Coordination is the through-line.** Every calendar screen exists to answer "are we
   both free, and whose is this?" Whose-event-is-whose and what-is-shared must be legible
   instantly; surface conflicts, never bury them.
3. **Warm, but through restraint.** Keep the human warmth — this is a shared, personal
   space, not enterprise software — but carry it with tone, spacing, and one committed
   brand color, never with decoration or generic-SaaS gloss.
4. **Precise and trustworthy.** Times, dates, recurrence, time zones, and edits must be
   exact and predictable. A shared calendar is only worth using if both people can trust
   every entry on it.
5. **Honor the existing craft.** The visual system, the accessibility work, and the
   theming are already deliberate and well-tuned. Extend and refine them; do not
   reinvent or flatten them.

## Accessibility & Inclusion

Baseline **WCAG 2.1 AA**, already pursued throughout the codebase: body and large-text
contrast verified against every theme, on-brand focus rings, full keyboard reach.
**Reduced motion** is honored globally (animation and transition near-disabled under
`prefers-reduced-motion`). Identity and category colors are tuned to stay distinguishable
and legible (per-swatch white/dark "ink" chosen for AA), which also helps color-vision
deficiency — and color is never the only signal: labels, position, and overlays (the
cancelled-stripe and planned-dotted event treatments) carry meaning too. Mobile:
comfortable touch targets and a 16px input floor to prevent iOS auto-zoom. Keep AA as the
floor for all new work.
