package page.planr.android.feature.agenda

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.LinkInteractionListener
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Duration.Companion.milliseconds
import page.planr.android.core.design.component.PlaceholderScreen
import page.planr.android.core.design.component.rememberPlanrHaptics
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.PlanrTokens
import page.planr.android.core.design.theme.parseHexColor
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.feature.agenda.detail.EventDetail
import page.planr.android.feature.agenda.detail.EventDetailUiState
import page.planr.android.feature.agenda.detail.EventDetailViewModel
import page.planr.android.feature.agenda.detail.LocationTarget
import page.planr.android.feature.agenda.detail.TextLinks
import page.planr.android.feature.agenda.model.Ownership
import page.planr.android.feature.agenda.ui.AgendaFormats
import page.planr.android.feature.agenda.ui.AgendaIcons
import page.planr.android.feature.agenda.ui.RecurrenceScopeDialog
import page.planr.android.feature.agenda.ui.recurrenceSummary
import page.planr.android.feature.agenda.ui.rememberAgendaFormats

/**
 * One event or occurrence: when, whose, sharing, context, place and notes,
 * with Edit and Delete for events the viewer may change. The place opens in
 * a maps app (or, when it is a call link, the browser) and copies on a long
 * press; the notes are selectable, with their links, emails and phone
 * numbers tappable.
 *
 * @param eventId an event id or an occurrence key (`eventId:epochMs`), as
 *   [AgendaScreen]'s `onOpenEvent` passes it.
 * @param onEdit opens the editor for the same argument. When null the editor
 *   opens in place.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventDetailScreen(
    eventId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onEdit: ((String) -> Unit)? = null,
) {
    // In-place editing (no edit route): 0 = not editing, else the session number.
    var editSession by rememberSaveable(eventId) { mutableIntStateOf(0) }
    var editSessions by rememberSaveable(eventId) { mutableIntStateOf(0) }
    if (onEdit == null && editSession > 0) {
        EventEditScreen(
            target = EventEditTarget.Existing(eventId),
            onDone = { editSession = 0 },
            modifier = modifier,
            viewModelKey = "detail-edit:$eventId:$editSession",
        )
        return
    }

    val viewModel = hiltViewModel<EventDetailViewModel, EventDetailViewModel.Factory>(key = "detail:$eventId") {
        it.create(eventId)
    }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val deleting by viewModel.deleting.collectAsStateWithLifecycle()
    var askDeleteScope by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(viewModel) { viewModel.closed.collect { onBack() } }
    val snackbar = remember { SnackbarHostState() }
    val haptics = rememberPlanrHaptics()
    LaunchedEffect(viewModel) { viewModel.failed.collect { haptics.reject() } }

    val detail = (state as? EventDetailUiState.Ready)?.detail
    Scaffold(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(AgendaIcons.ArrowLeft, contentDescription = stringResource(R.string.agenda_back))
                    }
                },
                actions = {
                    if (detail?.canEdit == true) {
                        IconButton(onClick = { onEdit?.invoke(eventId) ?: run { editSession = ++editSessions } }) {
                            Icon(AgendaIcons.Pencil, contentDescription = stringResource(R.string.agenda_edit), modifier = Modifier.size(20.dp))
                        }
                        IconButton(
                            enabled = !deleting,
                            onClick = { if (detail.event.isRecurring) askDeleteScope = true else viewModel.delete() },
                        ) {
                            Icon(AgendaIcons.Trash, contentDescription = stringResource(R.string.agenda_delete), modifier = Modifier.size(20.dp))
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        when (val s = state) {
            EventDetailUiState.Loading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
            }
            EventDetailUiState.Missing -> PlaceholderScreen(
                title = stringResource(R.string.agenda_detail_missing_title),
                body = stringResource(R.string.agenda_detail_missing_body),
                modifier = Modifier.padding(padding),
            )
            is EventDetailUiState.Ready -> DetailBody(s.detail, snackbar, Modifier.padding(padding))
        }
    }

    if (askDeleteScope) {
        RecurrenceScopeDialog(
            delete = true,
            onChoose = { scope ->
                askDeleteScope = false
                viewModel.delete(scope)
            },
            onDismiss = { askDeleteScope = false },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DetailBody(detail: EventDetail, snackbar: SnackbarHostState, modifier: Modifier = Modifier) {
    val formats = rememberAgendaFormats()
    val occurrence = detail.occurrence
    val color = parseHexColor(detail.block.color, PlanrTokens.WarmStone)
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = PlanrSpacing.xl, vertical = PlanrSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Dot(color, Modifier.padding(top = 7.dp))
            Spacer(Modifier.width(PlanrSpacing.md))
            Text(
                text = occurrence.title.ifBlank { stringResource(R.string.agenda_untitled) },
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.semantics { heading() },
            )
        }

        val badges = buildList {
            if (occurrence.kind == EventKind.Context) add(stringResource(R.string.agenda_detail_context))
            if (occurrence.status == EventStatus.Planned) add(stringResource(R.string.agenda_status_planned))
            if (occurrence.status == EventStatus.Cancelled) add(stringResource(R.string.agenda_status_cancelled))
            if (occurrence.isException) add(stringResource(R.string.agenda_detail_edited))
            if (occurrence.inactive) add(stringResource(R.string.agenda_detail_inactive))
        }
        if (badges.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) { badges.forEach { Badge(it) } }
        }

        if (!detail.canEdit) {
            Text(
                text = stringResource(
                    R.string.agenda_detail_read_only,
                    detail.ownerName ?: stringResource(R.string.agenda_detail_other_calendar),
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        WhenBlock(detail, formats)

        // One quiet meta line: who · visibility · context.
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
            verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            MetaItem(leading = { Dot(parseHexColor(detail.ownerColor, color)) }) {
                if (detail.isOwn) stringResource(R.string.agenda_detail_you) else detail.ownerName.orEmpty()
            }
            Separator()
            val (icon, label) = visibilityOf(detail)
            MetaItem(leading = { Icon(icon, contentDescription = null, modifier = Modifier.size(14.dp)) }) { label }
            detail.category?.let { category ->
                Separator()
                MetaItem(leading = { Dot(parseHexColor(category.color, color)) }) { category.name }
            }
        }

        val copier = rememberCopier(snackbar)
        occurrence.location?.takeIf { it.isNotBlank() }?.let { location ->
            LocationLine(location, copier)
        }
        occurrence.description?.takeIf { it.isNotBlank() }?.let { notes ->
            NotesLine(notes, copier)
        }
    }
}

/** Copies text to the clipboard, then says so in [notice] (null: the system already shows it). */
private fun interface Copier {
    fun copy(text: String, notice: String?)
}

@Composable
private fun rememberCopier(snackbar: SnackbarHostState): Copier {
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    return remember(clipboard, snackbar, scope) {
        Copier { text, notice ->
            scope.launch {
                clipboard.setClipEntry(ClipEntry(ClipData.newPlainText(text, text)))
                notice?.let { snackbar.showSnackbar(it) }
            }
        }
    }
}

/** Android 13+ confirms a copy itself; earlier versions get a "Copied" of ours. */
private val systemConfirmsCopy: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU

/**
 * The place: a tap opens it in a maps app (or a call link in the browser), a
 * long press copies it. Without an app to open it, the tap copies instead.
 */
@Composable
private fun LocationLine(location: String, copier: Copier) {
    val context = LocalContext.current
    val target = remember(location) { LocationTarget.of(location) }
    val copied = stringResource(R.string.agenda_copied)
    val openFailed = stringResource(R.string.agenda_open_failed_copied)
    IconLine(
        icon = AgendaIcons.MapPin,
        text = location,
        modifier = Modifier
            .clip(RoundedCornerShape(PlanrSpacing.sm))
            .combinedClickable(
                onClickLabel = stringResource(
                    if (target is LocationTarget.Web) R.string.agenda_location_open_link else R.string.agenda_location_open_maps,
                ),
                onLongClickLabel = stringResource(R.string.agenda_copy),
                onLongClick = { copier.copy(location, copied.takeUnless { systemConfirmsCopy }) },
                onClick = { if (!context.view(target.uri())) copier.copy(location, openFailed) },
            )
            .padding(vertical = PlanrSpacing.xs),
    )
}

/** The notes, selectable, with links, emails and phone numbers tappable. */
@Composable
private fun NotesLine(notes: String, copier: Copier) {
    val context = LocalContext.current
    val openFailed = stringResource(R.string.agenda_open_failed_copied)
    val styles = TextLinkStyles(
        style = SpanStyle(color = MaterialTheme.colorScheme.primary, textDecoration = TextDecoration.Underline),
    )
    val listener = remember(context, copier, openFailed) {
        LinkInteractionListener { link ->
            val url = (link as? LinkAnnotation.Url)?.url ?: return@LinkInteractionListener
            if (!context.view(url.toUri())) copier.copy(url.substringAfter("mailto:").substringAfter("tel:"), openFailed)
        }
    }
    val annotated = remember(notes, styles, listener) { TextLinks.annotate(notes, styles, listener) }
    Row(verticalAlignment = Alignment.Top) {
        Icon(AgendaIcons.Notes, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp).size(16.dp))
        Spacer(Modifier.width(PlanrSpacing.md))
        SelectionContainer(Modifier.fillMaxWidth()) {
            Text(annotated, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

private fun LocationTarget.uri(): Uri = when (this) {
    is LocationTarget.Web -> url.toUri()
    is LocationTarget.Place -> ("geo:0,0?q=" + Uri.encode(query)).toUri()
}

/** Opens [uri] in whichever app handles it; false when none does. */
private fun Context.view(uri: Uri): Boolean = try {
    startActivity(Intent(Intent.ACTION_VIEW, uri))
    true
} catch (_: ActivityNotFoundException) {
    false
}

/** The "when" focal point: date context line, then the time (or the dates for all-day). */
@Composable
private fun WhenBlock(detail: EventDetail, formats: AgendaFormats) {
    val occurrence = detail.occurrence
    val zone = detail.zone
    val currentYear = kotlin.time.Clock.System.now().toLocalDateTime(zone).year
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        if (occurrence.allDay) {
            val first = occurrence.start.toLocalDateTime(TimeZone.UTC).date
            val last = (occurrence.end - 1.milliseconds).toLocalDateTime(TimeZone.UTC).date
            Text(
                text = if (last <= first) formats.dayTitle(first, currentYear) else formats.rangeTitle(first, last),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            )
            Text(stringResource(R.string.agenda_all_day), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            val start = occurrence.start.toLocalDateTime(zone)
            val end = occurrence.end.toLocalDateTime(zone)
            if (start.date == end.date) {
                Text(formats.dayTitle(start.date, currentYear), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    text = "${formats.time(start.time)} – ${formats.time(end.time)}",
                    style = PlanrTheme.type.timeMedium.copy(fontSize = MaterialTheme.typography.titleMedium.fontSize),
                )
            } else {
                Text(
                    text = "${formats.shortDate(start.date)} ${formats.time(start.time)} – ${formats.shortDate(end.date)} ${formats.time(end.time)}",
                    style = PlanrTheme.type.timeMedium,
                )
            }
        }
        detail.recurrence?.let { rule ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                Icon(AgendaIcons.Repeat, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(PlanrSpacing.sm))
                Text(
                    recurrenceSummary(rule, formats, zone),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun visibilityOf(detail: EventDetail): Pair<ImageVector, String> = when {
    detail.occurrence.isPrivate -> AgendaIcons.Lock to stringResource(R.string.agenda_visibility_private)
    detail.block.ownership == Ownership.Shared -> AgendaIcons.Users to stringResource(R.string.agenda_visibility_shared)
    else -> AgendaIcons.Eye to stringResource(R.string.agenda_visibility_visible)
}

@Composable
private fun MetaItem(leading: @Composable () -> Unit, label: @Composable () -> String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        leading()
        Spacer(Modifier.width(6.dp))
        Text(label(), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun Separator() {
    Text("·", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun IconLine(icon: ImageVector, text: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.Top) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp).size(16.dp))
        Spacer(Modifier.width(PlanrSpacing.md))
        Text(text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun Dot(color: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    Box(modifier.size(10.dp).clip(CircleShape).background(color))
}

/** An outline pill (`Badge variant="outline"`). */
@Composable
private fun Badge(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
            .padding(horizontal = PlanrSpacing.sm, vertical = 2.dp),
    )
}
