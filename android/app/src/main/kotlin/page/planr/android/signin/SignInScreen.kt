package page.planr.android.signin

import android.content.ActivityNotFoundException
import android.content.Context
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import page.planr.android.R
import page.planr.android.core.data.auth.SignInError
import page.planr.android.core.design.component.PlaceholderScreen
import page.planr.android.core.design.theme.PlanrSpacing

/**
 * Sign-in: one button that opens planr.page's consent flow in a Custom Tab
 * (passkey or passphrase on the web, then "Allow"). The App Link brings the
 * user back; [onSignedIn] fires once the session is stored.
 */
@Composable
fun SignInScreen(
    onSignedIn: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SignInViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var noBrowser by remember { mutableStateOf(false) }

    LaunchedEffect(state.signedIn) { if (state.signedIn) onSignedIn() }
    LaunchedEffect(viewModel) {
        viewModel.openBrowser.collect { url -> noBrowser = !context.openCustomTab(url) }
    }

    PlaceholderScreen(
        title = stringResource(R.string.app_name),
        body = when {
            !state.configured -> stringResource(R.string.sign_in_not_configured)
            state.sessionExpired -> stringResource(R.string.sign_in_session_expired)
            else -> stringResource(R.string.app_tagline)
        },
        modifier = modifier,
        action = {
            if (state.configured) {
                SignInAction(
                    completing = state.completing,
                    message = if (noBrowser) stringResource(R.string.sign_in_error_no_browser) else state.error?.let { errorText(it) },
                    onSignIn = {
                        noBrowser = false
                        viewModel.signIn()
                    },
                )
            }
        },
    )
}

@Composable
private fun SignInAction(completing: Boolean, message: String?, onSignIn: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(PlanrSpacing.lg))
        if (completing) {
            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
            Text(
                text = stringResource(R.string.sign_in_completing),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = PlanrSpacing.md),
            )
        } else {
            Button(onClick = onSignIn, modifier = Modifier.heightIn(min = PlanrSpacing.touchTarget)) {
                Text(stringResource(R.string.sign_in))
            }
        }
        if (message != null && !completing) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .padding(top = PlanrSpacing.md)
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }
}

@Composable
private fun errorText(error: SignInError): String = stringResource(
    when (error) {
        SignInError.Denied -> R.string.sign_in_error_denied
        SignInError.Expired, SignInError.NoPendingRequest -> R.string.sign_in_error_expired
        SignInError.StateMismatch -> R.string.sign_in_error_state
        SignInError.NoMember -> R.string.sign_in_error_no_member
        SignInError.Network -> R.string.sign_in_error_network
        SignInError.Rejected, SignInError.NotConfigured -> R.string.sign_in_error_rejected
    },
)

/**
 * Chrome builds, in order of preference, for the sign-in tab. The return to the
 * app is an App Link on auth.planr.page, and browsers differ in whether they
 * hand one to the app: Chrome does (and, for the app that opened the tab,
 * without a fresh tap), while Firefox by default keeps every link in the
 * browser ("Open links in apps" is off), stranding the user on the fallback
 * page.
 */
private val SIGN_IN_BROWSERS = listOf(
    "com.android.chrome",
    "com.chrome.beta",
    "com.chrome.dev",
    "com.chrome.canary",
)

/**
 * Opens [url] in a Custom Tab, in Chrome when it's installed (whatever the
 * default browser), else in the default browser. False when no browser can
 * handle it.
 */
private fun Context.openCustomTab(url: String): Boolean = try {
    val tab = CustomTabsIntent.Builder()
        .setShowTitle(true)
        .build()
    CustomTabsClient.getPackageName(this, SIGN_IN_BROWSERS, true)
        ?.let { tab.intent.setPackage(it) }
    tab.launchUrl(this, url.toUri())
    true
} catch (_: ActivityNotFoundException) {
    false
}
