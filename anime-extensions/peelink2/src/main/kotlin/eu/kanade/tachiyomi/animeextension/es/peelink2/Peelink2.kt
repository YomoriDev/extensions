package eu.kanade.tachiyomi.animeextension.es.peelink2

import eu.kanade.tachiyomi.animesource.model.AnimeFilterList
import eu.kanade.tachiyomi.animesource.model.AnimesPage
import eu.kanade.tachiyomi.animesource.model.SAnime
import eu.kanade.tachiyomi.animesource.model.SEpisode
import eu.kanade.tachiyomi.animesource.model.Video
import eu.kanade.tachiyomi.animesource.online.AnimeHttpSource
import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.awaitSuccess
import okhttp3.FormBody
import okhttp3.Headers
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import org.jsoup.Jsoup
import java.util.Base64

/**
 * Peelink2 (https://www.peelink2.com): free movies in Spanish (Latino / Castellano / Subtitulado).
 *
 * A WordPress site. Each movie page keeps its players as base64 iframes in `px_repros['lang_N']`;
 * the hosts are voe.sx and uqload.vc. A movie is one "episode" (the movie itself).
 */
class Peelink2 : AnimeHttpSource() {

    override val name = "Peelink2"

    override val baseUrl = "https://www.peelink2.com"

    override val lang = "es"

    override val supportsLatest = true

    override fun headersBuilder(): Headers.Builder = super.headersBuilder()
        .add("Referer", "$baseUrl/")

    // =============================== Lists ================================

    override fun popularAnimeRequest(page: Int): Request =
        GET(if (page <= 1) "$baseUrl/inicio" else "$baseUrl/inicio/page/$page", headers)

    override fun popularAnimeParse(response: Response): AnimesPage {
        val doc = Jsoup.parse(response.body.string(), baseUrl)
        val animes = doc.select("div.bloque > a[href]").mapNotNull(::cardToAnime)
            .distinctBy { it.url }
        return AnimesPage(animes, animes.isNotEmpty())
    }

    override fun latestUpdatesRequest(page: Int): Request = popularAnimeRequest(page)

    override fun latestUpdatesParse(response: Response): AnimesPage = popularAnimeParse(response)

    /**
     * The site's own search does not work, so we filter the newest pages of the catalog by title.
     * Page N of a search covers SEARCH_PAGES_PER_PAGE catalog pages.
     */
    override suspend fun getSearchAnime(page: Int, query: String, filters: AnimeFilterList): AnimesPage {
        val text = query.trim().lowercase()
        if (text.isEmpty()) return fetchCatalog(page)

        val first = (page - 1) * SEARCH_PAGES_PER_PAGE + 1
        val found = mutableListOf<SAnime>()
        var any = false
        for (n in first until first + SEARCH_PAGES_PER_PAGE) {
            val result = runCatching { fetchCatalog(n) }.getOrNull() ?: break
            if (result.animes.isEmpty()) break
            any = true
            found += result.animes.filter { it.title.lowercase().contains(text) }
        }
        return AnimesPage(found.distinctBy { it.url }, any && page < MAX_SEARCH_PAGES)
    }

    private suspend fun fetchCatalog(page: Int): AnimesPage =
        client.newCall(popularAnimeRequest(page)).awaitSuccess().use { popularAnimeParse(it) }

    override fun searchAnimeRequest(page: Int, query: String, filters: AnimeFilterList): Request =
        popularAnimeRequest(page)

    override fun searchAnimeParse(response: Response): AnimesPage = popularAnimeParse(response)

    private fun cardToAnime(link: org.jsoup.nodes.Element): SAnime? {
        val img = link.selectFirst("img[alt]:not([alt=Ver película])") ?: return null
        val href = link.attr("abs:href").takeIf { it.startsWith(baseUrl) } ?: return null
        return SAnime.create().apply {
            url = href.removePrefix(baseUrl)
            title = cleanTitle(img.attr("alt"))
            thumbnail_url = img.attr("abs:src").takeIf { it.isNotBlank() }
            status = SAnime.COMPLETED
        }
    }

    // ============================ Details / episodes ======================

    override suspend fun getAnimeDetails(anime: SAnime): SAnime {
        val doc = client.newCall(GET(baseUrl + anime.url, headers)).awaitSuccess()
            .use { Jsoup.parse(it.body.string(), baseUrl) }
        return anime.apply {
            doc.selectFirst("h1.post-title, h1.entry-title")?.text()?.let { title = cleanTitle(it) }
            doc.selectFirst("meta[property=og:image]")?.attr("content")
                ?.takeIf { it.isNotBlank() }?.let { thumbnail_url = it }
            description = doc.selectFirst("div.post-body p")?.text()
                ?.substringAfter(" : ", "")?.ifBlank { null }
                ?: doc.selectFirst("div.post-body p")?.text()?.takeIf { it.isNotBlank() }
            status = SAnime.COMPLETED
            initialized = true
        }
    }

    override suspend fun getEpisodeList(anime: SAnime): List<SEpisode> = listOf(
        SEpisode.create().apply {
            url = anime.url
            name = "Película"
            episode_number = 1f
        },
    )

    // ================================ Videos ==============================

    override fun videoListRequest(episode: SEpisode): Request = GET(baseUrl + episode.url, headers)

    override fun videoListParse(response: Response): List<Video> {
        val html = response.body.string()
        val videos = mutableListOf<Video>()
        for ((key, encoded) in PLAYER.findAll(html).map { it.groupValues[1] to it.groupValues[2] }) {
            val embed = runCatching {
                val fragment = String(Base64.getMimeDecoder().decode(encoded), Charsets.UTF_8)
                IFRAME_SRC.find(fragment)?.groupValues?.get(1)
            }.getOrNull() ?: continue
            val label = when (key.substringBefore('_')) {
                "latino" -> "Latino"
                "sub" -> "Subtitulado"
                "es", "castellano" -> "Castellano"
                else -> key.substringBefore('_').replaceFirstChar { it.uppercase() }
            }
            videos += runCatching {
                when {
                    embed.contains("uqload") -> uqload(embed, label)
                    embed.contains("voe.sx") || embed.contains("/e/") -> voe(embed, label)
                    else -> emptyList()
                }
            }.getOrDefault(emptyList())
        }
        return videos
    }

    /** voe.sx hides its stream in an obfuscated JSON blob. */
    private fun voe(embedUrl: String, label: String): List<Video> {
        var page = ""
        var finalUrl = embedUrl
        var next: String? = embedUrl
        repeat(3) {
            val target = next ?: return@repeat
            client.newCall(GET(target, headers)).execute().use { response ->
                page = response.body.string()
                finalUrl = response.request.url.toString()
            }
            next = REDIRECT.find(page)?.groupValues?.get(1)
        }

        val blob = JSON_SCRIPT.find(page)?.groupValues?.get(1)?.trim() ?: return emptyList()
        val encoded = if (blob.startsWith("[")) {
            org.json.JSONArray(blob).getString(0)
        } else {
            blob.trim('"')
        }
        val data = JSONObject(decodeVoe(encoded))
        val url = data.optString("source").ifBlank { data.optString("direct_access_url") }
        if (url.isBlank()) return emptyList()

        val origin = finalUrl.toHttpUrl().let { "${it.scheme}://${it.host}/" }
        val videoHeaders = headersBuilder().set("Referer", origin).build()
        return listOf(Video(videoUrl = url, videoTitle = "Voe - $label", headers = videoHeaders))
    }

    private fun decodeVoe(encoded: String): String {
        var text = StringBuilder().also { out ->
            encoded.forEach { c ->
                out.append(
                    when (c) {
                        in 'a'..'z' -> 'a' + (c - 'a' + 13) % 26
                        in 'A'..'Z' -> 'A' + (c - 'A' + 13) % 26
                        else -> c
                    },
                )
            }
        }.toString()
        for (pattern in listOf("@$", "^^", "~@", "%?", "*~", "!!", "#&")) text = text.replace(pattern, "")
        text = String(Base64.getMimeDecoder().decode(text), Charsets.ISO_8859_1)
        text = text.map { (it.code - 3).toChar() }.joinToString("").reversed()
        return String(Base64.getMimeDecoder().decode(text), Charsets.UTF_8)
    }

    /** uqload.vc: the "play" click is a POST to /dl whose answer holds a packed jwplayer config. */
    private fun uqload(embedUrl: String, label: String): List<Video> {
        val clean = embedUrl.substringBefore("?")
        val code = clean.substringAfterLast("/")
        val origin = clean.toHttpUrl().let { "${it.scheme}://${it.host}" }

        client.newCall(GET(clean, headers)).execute().close()
        val body = FormBody.Builder()
            .add("op", "embed")
            .add("file_code", code)
            .add("auto", "1")
            .add("referer", "$baseUrl/")
            .build()
        val request = Request.Builder()
            .url("$origin/dl")
            .headers(headersBuilder().set("Referer", clean).build())
            .post(body)
            .build()
        val page = client.newCall(request).execute().use { it.body.string() }

        val script = Unpacker.unpack(page) ?: page
        val url = SOURCE_FILE.find(script)?.groupValues?.get(1) ?: return emptyList()
        val videoHeaders = headersBuilder().set("Referer", "$origin/").build()
        return listOf(Video(videoUrl = url, videoTitle = "Uqload - $label", headers = videoHeaders))
    }

    // ================================ Helpers =============================

    private fun cleanTitle(raw: String): String = raw
        .replace(Regex("^\\s*Ver\\s+", RegexOption.IGNORE_CASE), "")
        .replace(Regex("\\s*(100%\\s*)?(Online|En L[ií]nea)(\\s+Gratis)?\\s*$", RegexOption.IGNORE_CASE), "")
        .trim()

    companion object {
        private const val SEARCH_PAGES_PER_PAGE = 6
        private const val MAX_SEARCH_PAGES = 12

        private val PLAYER = Regex("""px_repros\['([a-z_0-9]+)'\]\s*=\s*'([^']+)'""")
        private val IFRAME_SRC = Regex("""src=["']([^"']+)""", RegexOption.IGNORE_CASE)
        private val REDIRECT = Regex("""window\.location\.href\s*=\s*['"]([^'"]+)""")
        private val JSON_SCRIPT = Regex(
            """<script type="application/json"[^>]*>(.*?)</script>""",
            RegexOption.DOT_MATCHES_ALL,
        )
        private val SOURCE_FILE = Regex("""sources\s*:\s*\[\s*\{?\s*(?:file\s*:\s*)?["'](https?://[^"']+)["']""")
    }
}
