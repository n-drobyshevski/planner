/**
 * Secondary toast line shown when an event is deleted. Escalated only for JOINT
 * events (filed under a Shared context, so both members co-own them): removing
 * one visibly clears the partner's calendar too, which deserves a beat of
 * reassurance. Personal events return `undefined` (the plain "Event deleted"
 * toast is enough). Pure so it can be unit-tested without the component tree.
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
