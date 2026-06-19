// Field shape + validation for the event dialog (components/event/
// event-dialog.tsx). The write itself is re-checked by the mutation layer;
// this schema carries the user-facing messages, including the cross-field
// "end after start" rule, which needs the viewer's time zone to compare the
// date+time pairs the way the dialog will combine them on save.
import { z } from "zod";

import { itemAttributesSchema } from "@/lib/attributes/schema";
import type { RecurrenceForm } from "@/lib/recurrence/rrule-build";
import {
  combineDateTime,
  dateInputToUtcMs,
  DAY_IN_MS,
} from "@/lib/datetime/local";

const eventFormBase = z.object({
  itemKind: z.enum(["event", "context"]),
  title: z.string().trim().min(1, "Please add a title."),
  description: z.string(),
  location: z.string(),
  allDay: z.boolean(),
  inactive: z.boolean(),
  status: z.enum(["cancelled", "planned", "confirmed"]),
  startDate: z.iso.date(),
  startTime: z.string(),
  endDate: z.iso.date(),
  endTime: z.string(),
  categoryId: z.string(), // "none" | id
  visibility: z.enum(["private", "visible", "shared"]),
  /** Phase 4: withhold this event from every public share link (and present mode).
   *  Independent of `visibility` — a non-private event can still be hidden. */
  hiddenFromPublic: z.boolean(),
  /** own color override (hex); null = derive from category/owner */
  color: z.string().nullable(),
  recurrence: z.custom<RecurrenceForm>().nullable(),
  /** optimization attributes (series-level; full parsed bag so unknown keys survive saves) */
  attributes: itemAttributesSchema,
});

export type EventFormValues = z.infer<typeof eventFormBase>;

/**
 * All-day events are floating dates anchored to UTC midnight (the same
 * calendar date for everyone); timed events are interpreted in the viewer's
 * chosen zone. Shared by the schema's ordering check and the dialog's save
 * path so both always agree.
 */
export function computeEventTimes(
  values: Pick<EventFormValues, "allDay" | "startDate" | "startTime" | "endDate" | "endTime">,
  timeZone: string,
): { start: number; end: number } {
  const start = values.allDay
    ? dateInputToUtcMs(values.startDate)
    : combineDateTime(values.startDate, values.startTime, timeZone);
  const end = values.allDay
    ? dateInputToUtcMs(values.endDate) + DAY_IN_MS
    : combineDateTime(values.endDate, values.endTime, timeZone);
  return { start, end };
}

export function createEventFormSchema(timeZone: string) {
  return eventFormBase.superRefine((v, ctx) => {
    const { start, end } = computeEventTimes(v, timeZone);
    if (end <= start) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "End must be after start.",
      });
    }
  });
}
