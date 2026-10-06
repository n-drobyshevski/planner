package page.planr.android.core.data.local.dao

/**
 * Whether [cached] and [fetched] hold the same rows, in any order. Entities
 * are data classes over the row's columns and its whole payload, so equal
 * sets mean a snapshot write would change nothing. Duplicates in [fetched]
 * (never expected) count as a change.
 */
internal fun <T> sameRows(cached: List<T>, fetched: List<T>): Boolean =
    cached.size == fetched.size && cached.toHashSet() == fetched.toHashSet()
