# Product

## Register

product

## Users

Exactly two people who share a life and a schedule (partners / a household). Their context: coordinating around each other across a busy real week of work, commute, meals, sleep, and shared plans, on desktop at home and on a phone on the go. The job to be done: see both people's days at a glance, keep private things private from each other when needed, and turn intentions (tasks) into actual time on the calendar. They are repeat users who know the app, not first-timers being onboarded at scale.

## Product Purpose

A shared calendar and task planner built for two. It renders both members' events with per-person privacy (private / visible / shared), RFC-5545 recurrence that stays correct across DST, and a task layer (list + Kanban board, ordered "do in order" subtasks) that can be scheduled onto the calendar as real, draggable event blocks. Live two-user sync keeps both views current; Row-Level Security keeps private events server-side only. Success is two people coordinating without friction and trusting that private stays private, while the tool itself stays out of the way.

## Brand Personality

Calm and utilitarian. A quiet, reliable instrument that disappears into the task. Warmth lives in the palette as a restrained undertone, not as decoration or a selling point. The interface should read as uncluttered, legible, and trustworthy rather than expressive or attention-seeking. Voice: plain, direct, low-ceremony.

## Anti-references

- **Cluttered prosumer tools.** Dense toolbars, heavy chrome, power-tool overload. Controls must never crowd the schedule.
- **Generic SaaS template.** The indistinct shadcn-default look with no point of view. It should feel deliberate, not scaffolded.
- (Secondary: not corporate/enterprise-cold either, but the two avoids above are primary.)

## Design Principles

1. **The tool disappears.** The schedule is the subject; chrome, color, and controls recede. Every element earns its place.
2. **Calm over decoration.** Restraint is the aesthetic. Warmth is a quiet undertone, never the headline.
3. **Privacy is legible.** The private / visible / shared model must always be obvious and trustworthy at a glance.
4. **Density without clutter.** Real calendars are dense; pack information legibly, but never let controls or accent color compete with content.
5. **Quiet power.** Shortcuts and advanced features exist for the two who know the app, surfaced discoverably without cluttering the default.

## Accessibility & Inclusion

Target **WCAG AAA**. Normal-size text meets 7:1 contrast and large text 4.5:1 (current muted-foreground sits at ~4.5:1 and must be darkened). Never convey meaning by color alone: overdue state, event status, and member identity each need a non-color signal (icon, label, or pattern). Touch targets at least 44x44. Honor `prefers-reduced-motion` (already global). Never disable zoom (already honored). Primary flows must be completable keyboard-only with visible focus.
