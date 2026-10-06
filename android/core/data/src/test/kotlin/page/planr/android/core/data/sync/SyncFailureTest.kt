package page.planr.android.core.data.sync

import io.github.jan.supabase.exceptions.HttpRequestException
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.exceptions.UnknownRestException
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import java.io.IOException
import java.net.SocketTimeoutException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import page.planr.android.core.data.auth.NotSignedInException
import page.planr.android.core.data.remote.StaleWriteException

class SyncFailureTest {

    /** A PostgREST error answered with [status], as supabase-kt raises it. */
    private suspend fun restError(status: Int): RestException {
        val response = HttpClient(MockEngine { respond("{}", HttpStatusCode.fromValue(status)) })
            .get("https://abc.supabase.co/rest/v1/events")
        return UnknownRestException("error", response)
    }

    @Test
    fun `server errors, timeouts and rate limits are retried`() = runTest {
        for (status in listOf(500, 502, 503, 504, 408, 429)) {
            assertEquals(SyncFailureOutcome.Retry, syncFailureOutcome(restError(status)), "HTTP $status")
        }
    }

    @Test
    fun `other refusals fail until the next period`() = runTest {
        for (status in listOf(400, 401, 403, 404, 409, 422)) {
            assertEquals(SyncFailureOutcome.Fail, syncFailureOutcome(restError(status)), "HTTP $status")
        }
    }

    @Test
    fun `network errors are retried`() {
        assertEquals(SyncFailureOutcome.Retry, syncFailureOutcome(IOException("connection reset")))
        assertEquals(SyncFailureOutcome.Retry, syncFailureOutcome(SocketTimeoutException("read timed out")))
        assertEquals(
            SyncFailureOutcome.Retry,
            syncFailureOutcome(HttpRequestException("offline", HttpRequestBuilder())),
        )
    }

    @Test
    fun `a sign-out mid-sync ends it quietly`() {
        assertEquals(SyncFailureOutcome.Done, syncFailureOutcome(NotSignedInException()))
    }

    @Test
    fun `anything else fails`() {
        assertEquals(SyncFailureOutcome.Fail, syncFailureOutcome(SerializationException("bad row")))
        assertEquals(SyncFailureOutcome.Fail, syncFailureOutcome(StaleWriteException("events", "id")))
        assertEquals(SyncFailureOutcome.Fail, syncFailureOutcome(IllegalStateException("bug")))
    }
}
