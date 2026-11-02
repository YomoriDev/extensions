package eu.kanade.tachiyomi.extension.es.mhscans

import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.interceptor.rateLimitHost
import eu.kanade.tachiyomi.source.model.Filter
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import eu.kanade.tachiyomi.source.online.ParsedHttpSource
import eu.kanade.tachiyomi.util.asJsoup
import okhttp3.Headers
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.util.Calendar
import java.util.Locale

/**
 * MHScans (mhscans.com), the redesigned site.
 *
 * It is an Astro app: the library is a grid of `a.comic-card`, a comic page lists its chapters through
 * `/comics/{slug}/chapters?page=N` (the number of pages comes in the `x-pages` header) and the reader
 * (`/leer/{id}`) has every page as an `img.page-img`, hosted on a subdomain of the site.
 *
 * Paid chapters (the ones with a price) link to the login page and have no `data-chapter-id`, so they are not
 * listed: they can't be read without an account.
 */
class MHScans : ParsedHttpSource() {

    override val name = "MHScans"

    override val baseUrl = "https://mhscans.com"

    override val lang = "es"

    override val supportsLatest = true

    // A few requests per second are fine; when the site still answers 429 (or a temporary 5xx) the request is
    // repeated after the pause it asks for.
    override val client: OkHttpClient = network.cloudflareClient.newBuilder()
        .rateLimitHost(baseUrl.toHttpUrl(), 6, 1)
        .addInterceptor(RetryTemporaryErrorsInterceptor())
        .build()

    override fun headersBuilder(): Headers.Builder = super.headersBuilder()
        .add("Referer", "$baseUrl/")

    // ============================== Popular / latest / search ==============================

    override fun popularMangaRequest(page: Int): Request = GET("$baseUrl/library?sort=views&page=$page", headers)

    override fun latestUpdatesRequest(page: Int): Request = GET("$baseUrl/library?sort=updated&page=$page", headers)

    override fun searchMangaRequest(page: Int, query: String, filters: FilterList): Request {
        val url = "$baseUrl/library".toHttpUrl().newBuilder()
        if (query.isNotBlank()) url.addQueryParameter("q", query.trim())
        filters.forEach { filter ->
            when (filter) {
                is SortFilter -> url.addQueryParameter("sort", filter.selected)
                is TypeFilter -> filter.selected?.let { url.addQueryParameter("type", it) }
                is StatusFilter -> filter.selected?.let { url.addQueryParameter("status", it) }
                is GenreFilter -> filter.selected?.let { url.addQueryParameter("genre", it) }
                else -> {}
            }
        }
        if (url.build().queryParameter("sort") == null) url.addQueryParameter("sort", "views")
        url.addQueryParameter("page", page.toString())
        return GET(url.build(), headers)
    }

    override fun popularMangaSelector() = CARD_SELECTOR
    override fun latestUpdatesSelector() = CARD_SELECTOR
    override fun searchMangaSelector() = CARD_SELECTOR

    // The grid has no "next" link in its markup: there is one when the page links to the following page number
    override fun popularMangaNextPageSelector(): String? = null
    override fun latestUpdatesNextPageSelector(): String? = null
    override fun searchMangaNextPageSelector(): String? = null

    override fun popularMangaParse(response: Response) = listParse(response)
    override fun latestUpdatesParse(response: Response) = listParse(response)
    override fun searchMangaParse(response: Response) = listParse(response)

    private fun listParse(response: Response): MangasPage {
        val document = response.asJsoup()
        checkVerification(document)
        val mangas = document.select(CARD_SELECTOR).map(::cardToManga).distinctBy { it.url }
        val page = response.request.url.queryParameter("page")?.toIntOrNull() ?: 1
        val hasNext = mangas.isNotEmpty() && document.select("a[href*='page=${page + 1}']").isNotEmpty()
        return MangasPage(mangas, hasNext)
    }

    private fun cardToManga(element: Element) = SManga.create().apply {
        setUrlWithoutDomain(element.attr("abs:href"))
        val image = element.selectFirst("img")
        title = image?.attr("alt")?.takeIf { it.isNotBlank() }
            ?: element.selectFirst("p")?.text().orEmpty()
        thumbnail_url = image?.imageUrl()
    }

    override fun popularMangaFromElement(element: Element) = cardToManga(element)
    override fun latestUpdatesFromElement(element: Element) = cardToManga(element)
    override fun searchMangaFromElement(element: Element) = cardToManga(element)

    // ==================================== Details ====================================

    override fun mangaDetailsParse(document: Document) = SManga.create().apply {
        checkVerification(document)
        title = document.selectFirst("h1")?.text().orEmpty()
        description = document.selectFirst("#comic-description")?.text()?.takeIf { it.isNotBlank() }

        status = when (document.selectFirst(".comic-meta__status")?.text()?.trim()?.lowercase(Locale.ROOT)) {
            "en emisión", "en emision", "en curso" -> SManga.ONGOING
            "completado", "finalizado" -> SManga.COMPLETED
            "en hiato", "pausado", "en pausa" -> SManga.ON_HIATUS
            "cancelado" -> SManga.CANCELLED
            else -> SManga.UNKNOWN
        }

        // The type and the first genre sit next to the status, the rest are chips under the description
        val inline = document.select(".comic-meta > span:not(.comic-meta__status):not(.comic-meta__sep)").map { it.text().trim() }
        val chips = document.select("li.comic-chip").map { it.text().trim() }
        genre = (inline + chips).filter { it.isNotBlank() }.distinct().joinToString().ifBlank { null }

        // The page also has the banner, the logo and the covers of other comics: the poster has its own class
        thumbnail_url = document.selectFirst("img.comic-cover__img")?.imageUrl()?.takeIf { it.isNotBlank() }
    }

    // ==================================== Chapters ====================================

    override fun chapterListRequest(manga: SManga): Request = GET("$baseUrl${manga.url.trimEnd('/')}/chapters?page=1", headers)

    override fun chapterListSelector() = "a[data-chapter-id]"

    override fun chapterListParse(response: Response): List<SChapter> {
        val slug = response.request.url.pathSegments.getOrNull(1).orEmpty()
        val chapters = mutableListOf<SChapter>()
        val seen = mutableSetOf<String>()

        fun collect(document: Document) {
            document.select(chapterListSelector()).forEach { link ->
                val chapter = chapterFromElement(link)
                if (seen.add(chapter.url)) chapters += chapter
            }
        }

        collect(response.asJsoup())
        val pages = response.header("x-pages")?.toIntOrNull() ?: 1
        for (page in 2..minOf(pages, MAX_CHAPTER_PAGES)) {
            client.newCall(GET("$baseUrl/comics/$slug/chapters?page=$page", headers)).execute().use {
                if (!it.isSuccessful) return@use
                collect(it.asJsoup())
            }
        }
        return chapters
    }

    override fun chapterFromElement(element: Element) = SChapter.create().apply {
        setUrlWithoutDomain(element.attr("abs:href"))
        val label = element.attr("data-chapter-label").trim()
        val number = element.attr("data-chapter-num")
        name = label.ifBlank { element.selectFirst("span")?.text()?.trim() ?: "Capítulo $number" }
        chapter_number = number.toFloatOrNull() ?: -1f
        // Only a relative text ("Hace 2 días") is shown, there is no exact time
        date_upload = element.selectFirst("span.uppercase")?.text()?.let(::parseRelativeDate) ?: 0L
    }

    // ===================================== Pages =====================================

    override fun pageListParse(document: Document): List<Page> {
        checkVerification(document)
        return document.select("img.page-img")
            .map { it.imageUrl() }
            .filter { it.isNotBlank() }
            .distinct()
            .mapIndexed { index, url -> Page(index, imageUrl = url) }
    }

    override fun imageUrlParse(document: Document): String = throw UnsupportedOperationException()

    override fun imageRequest(page: Page): Request = GET(page.imageUrl!!, headers)

    // ==================================== Filters ====================================

    override fun getFilterList() = FilterList(
        Filter.Header("Los filtros se combinan con la búsqueda"),
        SortFilter(),
        TypeFilter(),
        StatusFilter(),
        GenreFilter(),
    )

    private open class ValueFilter(name: String, private val options: List<Pair<String, String?>>) :
        Filter.Select<String>(name, options.map { it.first }.toTypedArray()) {
        val selected: String? get() = options[state].second
    }

    private class SortFilter : ValueFilter(
        "Ordenar por",
        listOf(
            "Más vistos" to "views",
            "Última actualización" to "updated",
            "Mejor calificados" to "rating",
            "Título" to "title",
        ),
    )

    private class TypeFilter : ValueFilter(
        "Tipo",
        listOf(
            "Todos" to null,
            "Manga" to "Manga",
            "Manhua" to "Manhua",
            "Manhwa" to "Manhwa",
            "Doujinshi" to "Doujinshi",
            "Novela" to "Novel",
            "Otro" to "Other",
        ),
    )

    private class StatusFilter : ValueFilter(
        "Estado",
        listOf(
            "Todos" to null,
            "En emisión" to "Ongoing",
            "Completado" to "Completed",
            "Pausado" to "Hiatus",
            "Cancelado" to "Cancelled",
        ),
    )

    private class GenreFilter : ValueFilter(
        "Género",
        listOf(
            "Todos" to null,
            "Acción" to "Acción",
            "Aliado" to "Aliado",
            "Artes marciales" to "Artes Marciales",
            "Aventura" to "Aventura",
            "Ciencia ficción" to "Ciencia ficción",
            "Comedia" to "Comedia",
            "Drama" to "Drama",
            "Fantasía" to "Fantasía",
            "Reencarnación" to "Reencarnación",
            "Shounen" to "Shounen",
            "Sistema" to "Sistema",
        ),
    )

    // ==================================== Helpers ====================================

    /** The first request after a while gets a "verifying your browser" page instead of the content. */
    private fun checkVerification(document: Document) {
        if (document.title().startsWith("Un momento") || document.getElementById("mv-verifying") != null) {
            throw Exception("El sitio pide verificar el navegador: abre la fuente en WebView una vez y vuelve a intentar")
        }
    }

    private fun Element.imageUrl(): String = attr("abs:data-src").ifBlank { attr("abs:src") }

    /** Dates look like "Hace 2 días", "Hace 3 sem", "Hace 5 horas". Returns 0 when the text is not understood. */
    private fun parseRelativeDate(text: String): Long {
        val match = RELATIVE_DATE.find(text.trim().lowercase(Locale.ROOT)) ?: return 0L
        val amount = match.groupValues[1].toIntOrNull() ?: 1
        val field = when (match.groupValues[2]) {
            "min", "minuto", "minutos" -> Calendar.MINUTE
            "h", "hora", "horas" -> Calendar.HOUR_OF_DAY
            "día", "dia", "días", "dias", "d" -> Calendar.DAY_OF_YEAR
            "sem", "semana", "semanas" -> Calendar.WEEK_OF_YEAR
            "mes", "meses" -> Calendar.MONTH
            "año", "años", "ano", "anos" -> Calendar.YEAR
            else -> return 0L
        }
        return Calendar.getInstance().apply { add(field, -amount) }.timeInMillis
    }

    /** Repeats the request when the site answers 429 or a temporary 502/503/504, waiting what it asks for. */
    private class RetryTemporaryErrorsInterceptor : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            var response = chain.proceed(chain.request())
            var attempt = 0
            while (response.code in RETRY_CODES && attempt < MAX_RETRIES) {
                val wait = response.header("Retry-After")?.toLongOrNull()?.times(1000)
                    ?: (RETRY_BASE_MS * (attempt + 1))
                response.close()
                Thread.sleep(wait.coerceIn(500, MAX_WAIT_MS))
                attempt++
                response = chain.proceed(chain.request())
            }
            return response
        }
    }

    companion object {
        private const val CARD_SELECTOR = "a.comic-card"
        private const val MAX_CHAPTER_PAGES = 40
        private val RETRY_CODES = setOf(429, 502, 503, 504)
        private const val MAX_RETRIES = 4
        private const val RETRY_BASE_MS = 1500L
        private const val MAX_WAIT_MS = 10_000L

        private val RELATIVE_DATE = Regex("""hace\s+(?:(\d+)|una|un)\s*([a-zñáéíóú]+)""")
    }
}
