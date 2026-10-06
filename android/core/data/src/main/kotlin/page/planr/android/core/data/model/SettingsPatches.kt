package page.planr.android.core.data.model

import page.planr.android.core.data.health.SleepBlockPrefs
import page.planr.android.core.model.Member
import page.planr.android.core.recurrence.PatchField
import page.planr.android.core.recurrence.PatchField.Unchanged
import page.planr.android.core.recurrence.PatchField.Value

/**
 * A change to the signed-in member's own preference columns on `members`
 * (`MemberPreferencesPatch` in lib/supabase/mutations.ts). Only fields set to
 * [Value] are written; a null zone clears it (primary: follow the device;
 * secondary: off).
 */
data class MemberPreferencesPatch(
    val timezone: PatchField<String?> = Unchanged,
    val secondaryTimezone: PatchField<String?> = Unchanged,
    val showSuccessToasts: PatchField<Boolean> = Unchanged,
) {
    val isEmpty: Boolean get() = this == MemberPreferencesPatch()

    /** [member] as it reads once this patch is stored. */
    fun applyTo(member: Member): Member = member.copy(
        timezone = timezone.or(member.timezone),
        secondaryTimezone = secondaryTimezone.or(member.secondaryTimezone),
        showSuccessToasts = showSuccessToasts.or(member.showSuccessToasts),
    )

    /** This patch with [later]'s set fields on top. */
    operator fun plus(later: MemberPreferencesPatch) = MemberPreferencesPatch(
        timezone = later.timezone.over(timezone),
        secondaryTimezone = later.secondaryTimezone.over(secondaryTimezone),
        showSuccessToasts = later.showSuccessToasts.over(showSuccessToasts),
    )

    /** This patch without the fields [sent] set to the same value (a write that has landed). */
    fun without(sent: MemberPreferencesPatch) = MemberPreferencesPatch(
        timezone = timezone.unless(sent.timezone),
        secondaryTimezone = secondaryTimezone.unless(sent.secondaryTimezone),
        showSuccessToasts = showSuccessToasts.unless(sent.showSuccessToasts),
    )
}

/**
 * A change to the member's `member_sleep_prefs` row: the calendar-facing
 * sleep settings. Only fields set to [Value] are written. Hours must be in
 * the DB's ranges ([NIGHT_START_HOURS], [NIGHT_END_HOURS]).
 */
data class SleepPrefsPatch(
    val sleepCategoryId: PatchField<String?> = Unchanged,
    val nightWindowStartHour: PatchField<Int> = Unchanged,
    val nightWindowEndHour: PatchField<Int> = Unchanged,
    val autoAdjust: PatchField<Boolean> = Unchanged,
) {
    init {
        (nightWindowStartHour as? Value)?.let { require(it.value in NIGHT_START_HOURS) { "night start ${it.value}" } }
        (nightWindowEndHour as? Value)?.let { require(it.value in NIGHT_END_HOURS) { "night end ${it.value}" } }
    }

    val isEmpty: Boolean get() = this == SleepPrefsPatch()

    /** [prefs] as they read once this patch is stored. */
    fun applyTo(prefs: SleepBlockPrefs): SleepBlockPrefs = prefs.copy(
        sleepCategoryId = sleepCategoryId.or(prefs.sleepCategoryId),
        nightWindowStartHour = nightWindowStartHour.or(prefs.nightWindowStartHour),
        nightWindowEndHour = nightWindowEndHour.or(prefs.nightWindowEndHour),
        autoAdjust = autoAdjust.or(prefs.autoAdjust),
    )

    /** This patch with [later]'s set fields on top. */
    operator fun plus(later: SleepPrefsPatch) = SleepPrefsPatch(
        sleepCategoryId = later.sleepCategoryId.over(sleepCategoryId),
        nightWindowStartHour = later.nightWindowStartHour.over(nightWindowStartHour),
        nightWindowEndHour = later.nightWindowEndHour.over(nightWindowEndHour),
        autoAdjust = later.autoAdjust.over(autoAdjust),
    )

    /** This patch without the fields [sent] set to the same value (a write that has landed). */
    fun without(sent: SleepPrefsPatch) = SleepPrefsPatch(
        sleepCategoryId = sleepCategoryId.unless(sent.sleepCategoryId),
        nightWindowStartHour = nightWindowStartHour.unless(sent.nightWindowStartHour),
        nightWindowEndHour = nightWindowEndHour.unless(sent.nightWindowEndHour),
        autoAdjust = autoAdjust.unless(sent.autoAdjust),
    )

    companion object {
        /** `night_window_start_hour` check constraint. */
        val NIGHT_START_HOURS = 12..23

        /** `night_window_end_hour` check constraint. */
        val NIGHT_END_HOURS = 4..16
    }
}

private fun <T> PatchField<T>.or(current: T): T = if (this is Value) value else current

private fun <T> PatchField<T>.over(earlier: PatchField<T>): PatchField<T> = if (this is Value) this else earlier

private fun <T> PatchField<T>.unless(sent: PatchField<T>): PatchField<T> = if (this == sent) Unchanged else this
