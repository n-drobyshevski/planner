package page.planr.android.navigation

import androidx.navigation.NavController

/**
 * Whether the back arrow of [screen] may pop the stack whose top is [top]:
 * only while [screen] is still the top. After the first tap the leaving
 * screen stays drawn, and tappable, through its exit transition; a second
 * tap there must not pop what is underneath (for Settings or the Inbox
 * opened from the agenda, the start destination itself, which would leave
 * an empty NavHost with no bottom bar).
 */
internal fun mayLeave(screen: String, top: String?): Boolean = top == screen

/** Pops [screen] off the stack, once: a repeat tap during its exit does nothing. */
internal fun NavController.leave(screen: String) {
    if (mayLeave(screen, currentDestination?.route)) popBackStack()
}
