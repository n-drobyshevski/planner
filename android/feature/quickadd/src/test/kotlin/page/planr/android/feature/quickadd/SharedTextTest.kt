package page.planr.android.feature.quickadd

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import page.planr.android.feature.quickadd.model.SharedText

class SharedTextTest {

    @Test
    fun `the subject is the title and the text the notes`() {
        assertEquals(
            SharedText(title = "Flat viewing", notes = "Sat 11:00\nhttps://example.com/flat/42"),
            SharedText.parse(subject = "  Flat viewing ", text = "\nSat 11:00\nhttps://example.com/flat/42\n"),
        )
    }

    @Test
    fun `without a subject the first non-blank line is the title`() {
        val shared = SharedText.parse(subject = "  ", text = "\n\n   Call the plumber  \nabout the boiler")
        assertEquals("Call the plumber", shared?.title)
        assertEquals("Call the plumber  \nabout the boiler", shared?.notes)
    }

    @Test
    fun `a link on its own is the title, not repeated as notes`() {
        assertEquals(
            SharedText(title = "https://example.com/a", notes = ""),
            SharedText.parse(subject = null, text = " https://example.com/a "),
        )
    }

    @Test
    fun `a multi-line subject keeps only its first line`() {
        assertEquals("Re: dinner", SharedText.parse(subject = "Re: dinner\nFwd", text = null)?.title)
    }

    @Test
    fun `long text is capped without splitting an emoji`() {
        val shared = SharedText.parse(subject = null, text = "a".repeat(199) + "😀" + "b".repeat(5000))!!
        assertEquals("a".repeat(199), shared.title)
        assertEquals(SharedText.NOTES_MAX, shared.notes.length)
    }

    @Test
    fun `nothing but whitespace is nothing to add`() {
        assertNull(SharedText.parse(subject = " ", text = " \n\t"))
        assertNull(SharedText.parse(subject = null, text = null))
    }
}
