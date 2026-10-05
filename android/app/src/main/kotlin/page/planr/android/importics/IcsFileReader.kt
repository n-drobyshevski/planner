package page.planr.android.importics

import android.content.Context
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.IOException
import java.io.InputStream
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import page.planr.android.feature.agenda.importics.IcsImportRequests

/** Reads an .ics file the user opened, shared or picked, for the import review. */
class IcsFileReader @Inject constructor(
    @param:ApplicationContext private val context: Context,
) {
    sealed interface Result {
        data class Text(val text: String) : Result

        /** Over [IcsImportRequests.MAX_BYTES]. */
        data object TooLarge : Result

        /** Missing, not permitted, or not text. */
        data object Unreadable : Result
    }

    /** Reads [uri] (`content:` or `file:`) on the IO dispatcher, at most [IcsImportRequests.MAX_BYTES]. */
    suspend fun read(uri: Uri): Result = withContext(Dispatchers.IO) {
        try {
            val stream = context.contentResolver.openInputStream(uri) ?: return@withContext Result.Unreadable
            stream.use { IcsBytes.read(it, IcsImportRequests.MAX_BYTES) }
        } catch (_: IOException) {
            Result.Unreadable
        } catch (_: SecurityException) {
            Result.Unreadable
        } catch (_: IllegalArgumentException) {
            Result.Unreadable
        }
    }
}

/** The byte-level part of [IcsFileReader], kept free of Android for tests. */
internal object IcsBytes {
    private const val BUFFER = 16 * 1024

    /** Reads [input] up to [maxBytes] and decodes it; [IcsFileReader.Result.TooLarge] past that. */
    fun read(input: InputStream, maxBytes: Long): IcsFileReader.Result {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(BUFFER)
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            out.write(buffer, 0, n)
            if (out.size() > maxBytes) return IcsFileReader.Result.TooLarge
        }
        val text = decode(out.toByteArray())
        // A binary file decodes to replacement characters and NULs, never to a calendar.
        return if ('\u0000' in text) IcsFileReader.Result.Unreadable else IcsFileReader.Result.Text(text)
    }

    /** UTF-8 (RFC 5545's charset), without a byte-order mark. */
    fun decode(bytes: ByteArray): String = bytes.toString(Charsets.UTF_8).removePrefix("\uFEFF")
}
