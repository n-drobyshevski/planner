package page.planr.android.feature.agenda.detail

import androidx.compose.ui.text.LinkAnnotation
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TextLinksTest {

    private fun targets(text: String) = TextLinks.find(text).map { it.target }

    private fun spans(text: String) = TextLinks.find(text).map { text.substring(it.start, it.end) }

    @Test
    fun `web addresses keep their path but not the sentence's punctuation`() {
        val text = "Agenda at https://example.com/a?b=1, slides on www.example.org/deck."
        assertEquals(listOf("https://example.com/a?b=1", "https://www.example.org/deck"), targets(text))
        assertEquals(listOf("https://example.com/a?b=1", "www.example.org/deck"), spans(text))
    }

    @Test
    fun `a closing parenthesis belongs to the link only when the link opened it`() {
        assertEquals(listOf("https://example.com/x"), targets("(see https://example.com/x)"))
        assertEquals(
            listOf("https://en.wikipedia.org/wiki/Planner_(programming_language)"),
            targets("https://en.wikipedia.org/wiki/Planner_(programming_language)"),
        )
    }

    @Test
    fun `emails become mailto links`() {
        assertEquals(listOf("mailto:anna.k+cal@mail.example.com"), targets("Write to anna.k+cal@mail.example.com."))
    }

    @Test
    fun `phone numbers need seven digits and dial without formatting`() {
        assertEquals(listOf("tel:+4930123456"), targets("Call +49 30 123456 before"))
        assertEquals(listOf("tel:5551234567"), targets("Office (555) 123-4567"))
        assertEquals(listOf("tel:89123456789"), targets("8 912 345 67 89"))
        assertTrue(targets("Room 12345, gate 7").isEmpty())
    }

    @Test
    fun `dates, times and amounts are not phone numbers`() {
        assertTrue(targets("Due 2026-10-06 at 10:00-11:30").isEmpty())
        assertTrue(targets("Budget 1 500 000").isEmpty())
        assertTrue(targets("Starts 2026-10-06 14:00, ends 06-10-2026 18:30").isEmpty())
        assertTrue(targets("2026-10-06 - 2026-10-07").isEmpty())
    }

    @Test
    fun `year and amount ranges are not phone numbers`() {
        assertTrue(targets("Season 2026-2027").isEmpty())
        assertTrue(targets("Budget 1500-2000").isEmpty())
        assertTrue(targets("Budget 1500 - 2000 EUR").isEmpty())
        assertTrue(targets("Pages 120-4500").isEmpty())
        // A dial prefix, parentheses or a third group still make it a number.
        assertEquals(listOf("tel:+15002000"), targets("Call +1500-2000"))
        assertEquals(listOf("tel:4951234567"), targets("495-123-4567"))
    }

    @Test
    fun `an upper-case scheme is lower-cased so a browser still matches it`() {
        assertEquals(listOf("https://Example.com/A"), targets("HTTPS://Example.com/A"))
    }

    @Test
    fun `digits and at signs inside a link stay part of it`() {
        val text = "https://meet.example.com/j/12345678901?u=me@example.com"
        assertEquals(listOf(text), targets(text))
    }

    @Test
    fun `a bare scheme is not a link`() {
        assertTrue(targets("http:// and www.").isEmpty())
    }

    @Test
    fun `annotate marks every link as a url span`() {
        val text = "Zoom https://zoom.us/j/1 or call +1 555 123 4567"
        val annotated = TextLinks.annotate(text)
        assertEquals(text, annotated.text)
        val links = annotated.getLinkAnnotations(0, text.length)
        assertEquals(listOf("https://zoom.us/j/1", "tel:+15551234567"), links.map { (it.item as LinkAnnotation.Url).url })
        assertEquals("https://zoom.us/j/1", text.substring(links[0].start, links[0].end))
    }

    @Test
    fun `a location with a web link opens it, anything else opens maps`() {
        assertEquals(LocationTarget.Web("https://meet.example.com/abc"), LocationTarget.of(" https://meet.example.com/abc "))
        assertEquals(LocationTarget.Web("https://zoom.us/j/9"), LocationTarget.of("Zoom: https://zoom.us/j/9 (passcode 1234)"))
        assertEquals(LocationTarget.Place("Alexanderplatz 1, Berlin"), LocationTarget.of("Alexanderplatz 1, Berlin "))
    }
}
