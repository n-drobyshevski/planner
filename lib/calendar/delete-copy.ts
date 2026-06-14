/**
 * Secondary toast line shown when an event is deleted. Escalated only for JOINT
 * events (filed under a Shared context, so both members co-own them): removing
 * one visibly clears the partner's calendar too, which deserves a beat of
 * reassurance. Personal events return `undefined` (the plain "Event deleted"
 * toast is enough). Pure so it can be unit-tested without the component tree.
 *
 * i18n: the two sentences this returns live in the `toasts` namespace as ICU
 * messages — `toasts.alsoRemovedFromMemberCalendar` ({name}) and
 * `toasts.alsoRemovedFromSharedCalendar`. A pure helper can't call the
 * next-intl `useTranslations` hook, so the localized copy is resolved at the
 * call site: the caller picks the variant + arg via `sharedRemovalVariant`
 * below and runs it through its own `t(...)`. This function keeps returning the
 * English source string for non-localized callers (and the unit test).
 */
export function sharedRemovalNote(
  isShared: boolean,
  partnerName: string | null,
): string | undefined {
  if (!isShared) return undefined;
  return partnerName
    ? `Also removed from ${partnerName}'s calendar.`
    : "Also removed from the shared calendar.";
}

/**
 * The i18n-ready counterpart to {@link sharedRemovalNote}: returns the `toasts`
 * key + ICU args to feed a `useTranslations("toasts")` translator at the call
 * site, or `undefined` for personal events (no extra line). Pure, so it stays
 * unit-testable; the caller owns the actual `t(key, vars)` resolution.
 */
export function sharedRemovalVariant(
  isShared: boolean,
  partnerName: string | null,
): { key: "alsoRemovedFromMemberCalendar"; vars: { name: string } }
  | { key: "alsoRemovedFromSharedCalendar"; vars?: undefined }
  | undefined {
  if (!isShared) return undefined;
  return partnerName
    ? { key: "alsoRemovedFromMemberCalendar", vars: { name: partnerName } }
    : { key: "alsoRemovedFromSharedCalendar" };
}
