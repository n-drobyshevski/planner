package page.planr.android.importics

import java.io.ByteArrayInputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class IncomingIntentTest {

    private fun classify(
        action: String?,
        data: String? = null,
        stream: String? = null,
        text: String? = null,
        widgetRoute: String? = null,
    ) = IncomingIntent.classify(action, data, stream, text, widgetAction = WIDGET, widgetRoute = widgetRoute)

    @Test
    fun `an https VIEW stays the sign-in callback`() {
        val url = "https://auth.planr.page/app/auth/callback?code=c&state=s"
        assertEquals(IncomingIntent.AuthCallback(url), classify(IncomingIntent.ACTION_VIEW, data = url))
    }

    @Test
    fun `a VIEW of a content or file uri is an ics file to read`() {
        val content = "content://com.android.providers.downloads.documents/document/42"
        assertEquals(IncomingIntent.IcsFile(content), classify(IncomingIntent.ACTION_VIEW, data = content))
        assertEquals(IncomingIntent.IcsFile("FILE:///sdcard/a.ics"), classify(IncomingIntent.ACTION_VIEW, data = "FILE:///sdcard/a.ics"))
    }

    @Test
    fun `other VIEWs are ignored`() {
        listOf(null, "", "http://planr.page/x", "planr://x", ":nothing", "intent:#Intent;end", "1a://x").forEach {
            assertNull(classify(IncomingIntent.ACTION_VIEW, data = it), "data: $it")
        }
    }

    @Test
    fun `a SEND carries the file as a stream, or the calendar as text`() {
        val stream = "content://com.google.android.gm.sapi/attachment/1"
        assertEquals(IncomingIntent.IcsFile(stream), classify(IncomingIntent.ACTION_SEND, stream = stream))
        val ics = "BEGIN:VCALENDAR\r\nEND:VCALENDAR"
        assertEquals(IncomingIntent.IcsText(ics), classify(IncomingIntent.ACTION_SEND, text = ics))
        assertNull(classify(IncomingIntent.ACTION_SEND, text = "just a note"))
        assertNull(classify(IncomingIntent.ACTION_SEND, stream = "https://example.com/a.ics"))
    }

    @Test
    fun `a widget tap keeps its route for LaunchRoute to validate`() {
        assertEquals(IncomingIntent.WidgetOpen("day/2026-10-07"), classify(WIDGET, widgetRoute = "day/2026-10-07"))
        assertNull(classify("android.intent.action.MAIN"))
        assertNull(classify(null))
    }

    @Test
    fun `files are read as UTF-8 without a BOM, up to the cap`() {
        val ics = "\uFEFFBEGIN:VCALENDAR\r\nSUMMARY:Йога\r\nEND:VCALENDAR"
        assertEquals(
            IcsFileReader.Result.Text("BEGIN:VCALENDAR\r\nSUMMARY:Йога\r\nEND:VCALENDAR"),
            IcsBytes.read(ByteArrayInputStream(ics.toByteArray()), maxBytes = 1_000),
        )
        assertEquals(IcsFileReader.Result.TooLarge, IcsBytes.read(ByteArrayInputStream(ByteArray(40_000) { 'a'.code.toByte() }), maxBytes = 39_999))
        assertEquals(IcsFileReader.Result.Unreadable, IcsBytes.read(ByteArrayInputStream(byteArrayOf(0x50, 0x4B, 0x00, 0x03)), maxBytes = 1_000))
    }

    private companion object {
        const val WIDGET = "page.planr.android.widgets.OPEN"
    }
}
