package page.planr.android.navigation

/** What tapping the bottom bar's tab that is already showing does. */
internal enum class ReTapAction {
    /** A detail is on top: back to the tab's root. */
    PopToRoot,

    /**
     * An editor is on top: one back press, so its own Back handling decides
     * (asking to discard unsaved changes) instead of a pop that would skip it.
     */
    DispatchBack,

    /** The agenda's root: back to today. */
    GoToday,

    /** The task list's root: scroll to the top. */
    ScrollToTop,

    /** Nothing to do (the Insights root). */
    None,
}

/**
 * The tab whose stack is showing. The agenda is the root of every signed-in
 * stack and switching tabs pops back to it ([TopLevelTab] stacks never sit
 * on top of each other), so another tab's root on the stack wins over it.
 * [onStack] answers whether a route is on the back stack.
 */
internal fun shownTab(onStack: (String) -> Boolean): TopLevelTab? =
    TopLevelTab.entries.firstOrNull { it != TopLevelTab.Agenda && onStack(it.route) }
        ?: TopLevelTab.Agenda.takeIf { onStack(it.route) }

/**
 * Tapping [tab] in the bottom bar while [shown] is showing with [top] as the
 * current route. Null when [tab] is another tab: an ordinary switch.
 */
internal fun reTapAction(tab: TopLevelTab, shown: TopLevelTab?, top: String?): ReTapAction? = when {
    tab != shown -> null
    top == tab.route -> when (tab) {
        TopLevelTab.Agenda -> ReTapAction.GoToday
        TopLevelTab.Tasks -> ReTapAction.ScrollToTop
        TopLevelTab.Insights -> ReTapAction.None
    }
    isEditorRoute(top) -> ReTapAction.DispatchBack
    else -> ReTapAction.PopToRoot
}
