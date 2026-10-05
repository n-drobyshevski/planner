package page.planr.android.core.insights

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.analytics.BalanceAnalytics
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.int
import page.planr.android.core.insights.fixtures.Fixtures.spans
import page.planr.android.core.insights.fixtures.Fixtures.window
import page.planr.android.core.insights.model.Bucket
import page.planr.android.core.insights.model.MsWindow

/** Golden parity of [BalanceAnalytics] with lib/analytics/balance.ts (fixtures/balance.json). */
class BalanceFixturesTest {

    @TestFactory
    fun categoryShares(): List<DynamicTest> = Fixtures.section("balance", "categoryShares") { input ->
        Fixtures.array(
            BalanceAnalytics.categoryShares(
                current = input.spans("current"),
                previous = input.spans("previous"),
                curWindow = input.window("curWindow"),
                prevWindow = input.window("prevWindow"),
            ).map { Fixtures.json(it) },
        )
    }

    @TestFactory
    fun categoryByBucket(): List<DynamicTest> = Fixtures.section("balance", "categoryByBucket") { input ->
        Fixtures.json(
            BalanceAnalytics.categoryByBucket(input.spans("spans"), input.buckets("buckets"), input.int("topN")),
        )
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections("balance", setOf("categoryShares", "categoryByBucket"))

    @Test
    fun `no time in either window yields no rows`() {
        assertEquals(
            emptyList(),
            BalanceAnalytics.categoryShares(emptyList(), emptyList(), MsWindow(0, 1), MsWindow(0, 0)),
        )
    }
}

/** `[{ start, end }]` → buckets. */
private fun JsonObject.buckets(k: String): List<Bucket> = getValue(k).jsonArray.map { Fixtures.window(it.jsonObject) }
