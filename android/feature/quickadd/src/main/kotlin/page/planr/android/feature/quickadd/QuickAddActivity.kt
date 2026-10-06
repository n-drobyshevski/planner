package page.planr.android.feature.quickadd

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import page.planr.android.core.data.appearance.ThemeModeStore
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.enablePlanrEdgeToEdge
import page.planr.android.feature.quickadd.model.SharedText

/**
 * A see-through activity that only hosts [QuickAddSheet] over whatever is
 * behind it (the home screen, for the Quick add widget and the launcher
 * shortcuts). It finishes when the sheet closes, whether saved or dismissed.
 *
 * Not exported: launch it with an explicit [intent], e.g. from a Glance
 * `actionStartActivity(QuickAddActivity.intent(context, QuickAddKind.Task))`.
 * Other apps reach it only through its exported share alias
 * (`ShareToQuickAddActivity`, `ACTION_SEND` of `text/plain`), which opens a
 * task prefilled from the text ([SharedText]). A calendar shared as plain
 * text goes on to the app's .ics import instead.
 */
@AndroidEntryPoint
class QuickAddActivity : ComponentActivity() {

    @Inject
    lateinit var themeMode: ThemeModeStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // After super: Hilt injects [themeMode] there.
        enablePlanrEdgeToEdge(themeMode.forcedDark.value)
        val text = sharedTextOf(intent)
        if (text != null && text.contains(VCALENDAR, ignoreCase = true)) {
            if (savedInstanceState == null) importCalendar(text)
            finish()
            return
        }
        val kind = kindOf(intent)
        // A share may carry only a subject (no EXTRA_TEXT): it still prefills the title.
        val shared = intent?.takeIf { it.action == Intent.ACTION_SEND }
            ?.let { SharedText.parse(it.getCharSequenceExtra(Intent.EXTRA_SUBJECT)?.toString(), text) }
        setContent {
            val forcedDark by themeMode.forcedDark.collectAsStateWithLifecycle()
            LaunchedEffect(forcedDark) { enablePlanrEdgeToEdge(forcedDark) }
            PlanrTheme(darkTheme = forcedDark ?: isSystemInDarkTheme()) {
                QuickAddSheet(
                    kind = kind,
                    shared = shared,
                    onDismiss = ::finish,
                    onSaved = { saved -> if (saved.confirm) confirm(saved.kind) },
                )
            }
        }
    }

    /**
     * The web's success toast; the sheet itself is gone by the time it shows.
     * No Undo here: over the home screen there is no snackbar to carry one,
     * so it is a plain confirmation and shows only with the member's
     * `show_success_toasts` ([QuickAddSaved.confirm]). A failed save keeps
     * the sheet open with its error.
     */
    private fun confirm(kind: QuickAddKind) {
        val message = when (kind) {
            QuickAddKind.Task -> R.string.quickadd_task_created
            QuickAddKind.Event -> R.string.quickadd_event_created
        }
        Toast.makeText(applicationContext, message, Toast.LENGTH_SHORT).show()
    }

    /** Hands an iCalendar to the app's import (MainActivity takes `text/calendar` SENDs). */
    private fun importCalendar(text: String) {
        val forward = Intent(Intent.ACTION_SEND)
            .setType("text/calendar")
            .setPackage(packageName)
            .putExtra(Intent.EXTRA_TEXT, text)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivity(forward)
        } catch (_: ActivityNotFoundException) {
            // No import in this build: nothing to open.
        }
    }

    companion object {
        private const val VCALENDAR = "BEGIN:VCALENDAR"

        /** The [QuickAddKind] name the sheet opens on; defaults to a task. */
        const val EXTRA_MODE = "page.planr.android.feature.quickadd.extra.MODE"

        /** An explicit intent that opens Quick add on [kind] in its own task. */
        fun intent(context: Context, kind: QuickAddKind): Intent =
            Intent(context, QuickAddActivity::class.java)
                .putExtra(EXTRA_MODE, kind.name)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)

        /** The text of a share (`ACTION_SEND`), or null for any other launch. */
        private fun sharedTextOf(intent: Intent?): String? =
            intent?.takeIf { it.action == Intent.ACTION_SEND }?.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()

        internal fun kindOf(intent: Intent?): QuickAddKind =
            intent?.getStringExtra(EXTRA_MODE)
                ?.let { name -> QuickAddKind.entries.firstOrNull { it.name == name } }
                ?: QuickAddKind.Task
    }
}
