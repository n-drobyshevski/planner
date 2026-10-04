package page.planr.android.signin

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import page.planr.android.R
import page.planr.android.core.data.config.PlanrConfig
import page.planr.android.core.design.component.PlaceholderScreen
import page.planr.android.core.design.theme.PlanrSpacing

/**
 * Sign-in entry. Placeholder: Phase 2 replaces the button with the Custom Tab
 * OAuth (PKCE) flow against planr.page and only calls [onSignedIn] once a
 * session is stored.
 */
@Composable
fun SignInScreen(
    onSignedIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val configured = PlanrConfig.fromBuildConfig().isConfigured
    PlaceholderScreen(
        title = stringResource(R.string.app_name),
        body = if (configured) {
            stringResource(R.string.app_tagline)
        } else {
            stringResource(R.string.sign_in_not_configured)
        },
        modifier = modifier,
        action = {
            Button(onClick = onSignedIn, modifier = Modifier.padding(top = PlanrSpacing.lg)) {
                Text(stringResource(R.string.sign_in))
            }
        },
    )
}
