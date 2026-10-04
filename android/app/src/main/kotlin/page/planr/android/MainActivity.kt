package page.planr.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import dagger.hilt.android.AndroidEntryPoint
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.navigation.PlanrNavHost

/**
 * The single activity. Also the target of the OAuth App Link
 * (`https://planr.page/app/auth/callback`); Phase 2 reads the code from the
 * intent in onCreate/onNewIntent and completes the PKCE exchange.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            PlanrTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    PlanrNavHost()
                }
            }
        }
    }
}
