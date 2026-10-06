package page.planr.android

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.annotation.StringRes
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.IntentCompat
import androidx.core.net.toUri
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.launch
import page.planr.android.core.data.appearance.ThemeModeStore
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.enablePlanrEdgeToEdge
import page.planr.android.feature.agenda.importics.IcsImportRequests
import page.planr.android.feature.agenda.model.AgendaDayRequests
import page.planr.android.importics.IcsFileReader
import page.planr.android.importics.IncomingIntent
import page.planr.android.navigation.LaunchRoute
import page.planr.android.navigation.PlanrNavHost
import page.planr.android.widgets.WidgetLaunch

/**
 * The single activity, and the target of the OAuth App Link
 * (`https://auth.planr.page/app/auth/callback`). It is singleTask, so returning
 * from the Custom Tab arrives in [onNewIntent]; a cold start (the process was
 * killed while the user was on the web) arrives in [onCreate]. Either way the
 * callback goes to [SessionManager], which validates `state` and exchanges
 * the code.
 *
 * Widget taps arrive the same two ways, with [WidgetLaunch.ACTION_OPEN] and a
 * route; it is validated ([LaunchRoute.parse]) and opened once signed in.
 *
 * So do .ics files: a VIEW of a `content:` / `file:` URI (opened from Files,
 * Gmail, a download) or a SEND of a calendar. The file is read right away
 * (on IO, at most 5 MB), handed to [IcsImportRequests], and the import review
 * ([LaunchRoute.Import]) opens once signed in.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var sessionManager: SessionManager

    @Inject
    lateinit var agendaDayRequests: AgendaDayRequests

    @Inject
    lateinit var icsImportRequests: IcsImportRequests

    @Inject
    lateinit var icsFileReader: IcsFileReader

    @Inject
    lateinit var themeMode: ThemeModeStore

    /** A widget's requested destination, until the nav host has opened it. */
    private var launchRoute by mutableStateOf<LaunchRoute?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enablePlanrEdgeToEdge(themeMode.forcedDark.value)
        // Only on a fresh launch: a recreated activity must not replay an old
        // callback, or reopen a widget's target over where the user went since.
        if (savedInstanceState == null) handleIntent(intent)
        setContent {
            // The member's theme_preference; null (always, from Android 12) follows the configuration.
            val forcedDark by themeMode.forcedDark.collectAsStateWithLifecycle()
            LaunchedEffect(forcedDark) { enablePlanrEdgeToEdge(forcedDark) }
            PlanrTheme(darkTheme = forcedDark ?: isSystemInDarkTheme()) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    val authState by sessionManager.authState.collectAsStateWithLifecycle()
                    // While the stored session is read (a few ms), show just the surface.
                    if (authState != AuthState.Loading) {
                        PlanrNavHost(
                            signedIn = authState is AuthState.SignedIn,
                            launchRoute = launchRoute,
                            onLaunchRouteHandled = { launchRoute = null },
                            onOpenDay = agendaDayRequests::request,
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        intent ?: return
        val incoming = IncomingIntent.classify(
            action = intent.action,
            data = intent.dataString,
            stream = if (intent.action == Intent.ACTION_SEND) {
                IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.toString()
            } else {
                null
            },
            text = if (intent.action == Intent.ACTION_SEND) intent.getStringExtra(Intent.EXTRA_TEXT) else null,
            widgetAction = WidgetLaunch.ACTION_OPEN,
            widgetRoute = if (intent.action == WidgetLaunch.ACTION_OPEN) WidgetLaunch.routeOf(intent) else null,
        )
        when (incoming) {
            is IncomingIntent.AuthCallback -> sessionManager.handleCallback(incoming.url)
            is IncomingIntent.WidgetOpen -> launchRoute = LaunchRoute.parse(incoming.route)
            is IncomingIntent.IcsFile -> readIcs(incoming.uri.toUri())
            is IncomingIntent.IcsText -> reviewIcs(incoming.text)
            null -> Unit
        }
    }

    private fun readIcs(uri: Uri) {
        lifecycleScope.launch {
            when (val result = icsFileReader.read(uri)) {
                is IcsFileReader.Result.Text -> reviewIcs(result.text)
                IcsFileReader.Result.TooLarge -> toast(R.string.import_file_too_large)
                IcsFileReader.Result.Unreadable -> toast(R.string.import_file_unreadable)
            }
        }
    }

    private fun reviewIcs(text: String) {
        icsImportRequests.offer(text)
        launchRoute = LaunchRoute.Import
    }

    private fun toast(@StringRes message: Int) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
