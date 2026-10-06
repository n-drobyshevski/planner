package page.planr.android.feature.quickadd

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

/**
 * A see-through activity that only hosts [QuickAddSheet] over whatever is
 * behind it (the home screen, for the Quick add widget). It finishes when the
 * sheet closes, whether saved or dismissed.
 *
 * Not exported: launch it with an explicit [intent], e.g. from a Glance
 * `actionStartActivity(QuickAddActivity.intent(context, QuickAddKind.Task))`.
 */
@AndroidEntryPoint
class QuickAddActivity : ComponentActivity() {

    @Inject
    lateinit var themeMode: ThemeModeStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // After super: Hilt injects [themeMode] there.
        enablePlanrEdgeToEdge(themeMode.forcedDark.value)
        val kind = kindOf(intent)
        setContent {
            val forcedDark by themeMode.forcedDark.collectAsStateWithLifecycle()
            LaunchedEffect(forcedDark) { enablePlanrEdgeToEdge(forcedDark) }
            PlanrTheme(darkTheme = forcedDark ?: isSystemInDarkTheme()) {
                QuickAddSheet(
                    kind = kind,
                    onDismiss = ::finish,
                    onSaved = { saved -> confirm(saved) },
                )
            }
        }
    }

    /** The web's success toast; the sheet itself is gone by the time it shows. */
    private fun confirm(kind: QuickAddKind) {
        val message = when (kind) {
            QuickAddKind.Task -> R.string.quickadd_task_created
            QuickAddKind.Event -> R.string.quickadd_event_created
        }
        Toast.makeText(applicationContext, message, Toast.LENGTH_SHORT).show()
    }

    companion object {
        /** The [QuickAddKind] name the sheet opens on; defaults to a task. */
        const val EXTRA_MODE = "page.planr.android.feature.quickadd.extra.MODE"

        /** An explicit intent that opens Quick add on [kind] in its own task. */
        fun intent(context: Context, kind: QuickAddKind): Intent =
            Intent(context, QuickAddActivity::class.java)
                .putExtra(EXTRA_MODE, kind.name)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)

        internal fun kindOf(intent: Intent?): QuickAddKind =
            intent?.getStringExtra(EXTRA_MODE)
                ?.let { name -> QuickAddKind.entries.firstOrNull { it.name == name } }
                ?: QuickAddKind.Task
    }
}
