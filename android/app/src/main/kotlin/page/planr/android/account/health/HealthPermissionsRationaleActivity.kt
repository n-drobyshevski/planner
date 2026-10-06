package page.planr.android.account.health

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import page.planr.android.R
import page.planr.android.core.data.appearance.ThemeModeStore
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme

/**
 * What Planr does with Health Connect data. Health Connect opens this from its
 * permission screen ("Read privacy policy") and from Android's permission
 * usage settings; it refuses to grant access to an app without it.
 */
@AndroidEntryPoint
class HealthPermissionsRationaleActivity : AppCompatActivity() {

    @Inject
    lateinit var themeMode: ThemeModeStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val forcedDark by themeMode.forcedDark.collectAsStateWithLifecycle()
            PlanrTheme(darkTheme = forcedDark ?: isSystemInDarkTheme()) {
                Surface(Modifier.fillMaxSize()) {
                    Column(
                        Modifier
                            .safeDrawingPadding()
                            .verticalScroll(rememberScrollState())
                            .padding(PlanrSpacing.xl),
                        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.md),
                    ) {
                        Text(
                            stringResource(R.string.health_rationale_title),
                            style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.semantics { heading() },
                        )
                        Text(stringResource(R.string.health_rationale_body), style = MaterialTheme.typography.bodyMedium)
                        TextButton(onClick = ::finish) { Text(stringResource(R.string.health_rationale_close)) }
                    }
                }
            }
        }
    }
}
