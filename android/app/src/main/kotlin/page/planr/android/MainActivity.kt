package page.planr.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.design.theme.PlanrTheme
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
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var sessionManager: SessionManager

    /** A widget's requested destination, until the nav host has opened it. */
    private var launchRoute by mutableStateOf<LaunchRoute?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Only on a fresh launch: a recreated activity must not replay an old
        // callback, or reopen a widget's target over where the user went since.
        if (savedInstanceState == null) handleIntent(intent)
        setContent {
            PlanrTheme {
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
        when (intent?.action) {
            Intent.ACTION_VIEW -> intent.data?.toString()?.let(sessionManager::handleCallback)
            WidgetLaunch.ACTION_OPEN -> launchRoute = LaunchRoute.parse(WidgetLaunch.routeOf(intent))
        }
    }
}
