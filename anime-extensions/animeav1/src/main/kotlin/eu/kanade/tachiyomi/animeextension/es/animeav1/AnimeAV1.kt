package eu.kanade.tachiyomi.animeextension.es.animeav1

import eu.kanade.tachiyomi.animesource.model.AnimeFilter
import eu.kanade.tachiyomi.animesource.model.AnimeFilterList
import eu.kanade.tachiyomi.animesource.model.AnimesPage
import eu.kanade.tachiyomi.animesource.model.SAnime
import eu.kanade.tachiyomi.animesource.model.SEpisode
import eu.kanade.tachiyomi.animesource.model.Video
import eu.kanade.tachiyomi.animesource.online.AnimeHttpSource
import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.util.asJsoup
import okhttp3.Headers
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import okhttp3.Response

/**
 * AnimeAV1 (https://animeav1.com): anime in Spanish, subtitled and dubbed.
 *
 * The site is a server rendered SvelteKit app: lists and details are plain HTML, and the episode
 * page embeds a JS object with the available players ("embeds").
 */
class AnimeAV1 : AnimeHttpSource() {

    override val name = "AnimeAV1"

    override val baseUrl = "https://animeav1.com"

    override val lang = "es"

    override val supportsLatest = true

    override fun headersBuilder(): Headers.Builder = super.headersBuilder()
        .add("Referer", "$baseUrl/")

    // ============================== Popular ===============================

    override fun popularAnimeRequest(page: Int): Request =
        GET("$baseUrl/catalogo?order=popular&page=$page", headers)

    override fun popularAnimeParse(response: Response): AnimesPage = parseCatalog(response)

    // =============================== Latest ===============================

    override fun latestUpdatesRequest(page: Int): Request =
        GET("$baseUrl/catalogo?page=$page", headers)

    override fun latestUpdatesParse(response: Response): AnimesPage = parseCatalog(response)

    // =============================== Search ===============================

    override fun searchAnimeRequest(page: Int, query: String, filters: AnimeFilterList): Request {
        val url = "$baseUrl/catalogo".toHttpUrl().newBuilder()

        if (query.isNotBlank()) url.addQueryParameter("search", query)

        filters.forEach { filter ->
            when (filter) {
                is CategoryFilter -> filter.toUriPart().takeIf { it.isNotEmpty() }
                    ?.let { url.addQueryParameter("category", it) }
                is StatusFilter -> filter.toUriPart().takeIf { it.isNotEmpty() }
                    ?.let { url.addQueryParameter("status", it) }
                is OrderFilter -> filter.toUriPart().takeIf { it.isNotEmpty() }
                    ?.let { url.addQueryParameter("order", it) }
                is LetterFilter -> filter.toUriPart().takeIf { it.isNotEmpty() }
                    ?.let { url.addQueryParameter("letter", it) }
                is GenreFilter -> filter.state.filter { it.state }
                    .forEach { url.addQueryParameter("genre", it.slug) }
                else -> {}
            }
        }

        url.addQueryParameter("page", page.toString())
        return GET(url.build(), headers)
    }

    override fun searchAnimeParse(response: Response): AnimesPage = parseCatalog(response)

    private fun parseCatalog(response: Response): AnimesPage {
        val document = response.asJsoup()

        val animes = document.select("article").mapNotNull { card ->
            val link = card.selectFirst("a[href^=/media/]") ?: return@mapNotNull null
            SAnime.create().apply {
                url = link.attr("href")
                title = card.selectFirst("h3")?.text().orEmpty()
                thumbnail_url = card.select("img").map { it.attr("src") }
                    .firstOrNull { it.contains("/covers/") }
            }
        }.filter { it.title.isNotEmpty() }

        val currentPage = response.request.url.queryParameter("page")?.toIntOrNull() ?: 1
        val hasNextPage = document.select("a[href*=page=]").any {
            it.attr("href").contains("page=${currentPage + 1}")
        }

        return AnimesPage(animes, hasNextPage)
    }

    // =============================== Details ==============================

    override fun animeDetailsParse(response: Response): SAnime {
        val document = response.asJsoup()

        return SAnime.create().apply {
            title = document.selectFirst("h1")?.text().orEmpty()
            description = document.selectFirst("div.entry")?.text()
            genre = document.select("a[href^=/catalogo?genre=]").joinToString { it.text() }
            thumbnail_url = document.select("img").map { it.attr("src") }
                .firstOrNull { it.contains("/covers/") }

            val info = document.select("header span").joinToString(" ") { it.text() }
            status = when {
                info.contains("Finalizado", ignoreCase = true) -> SAnime.COMPLETED
                info.contains("emisi", ignoreCase = true) -> SAnime.ONGOING
                else -> SAnime.UNKNOWN
            }
        }
    }

    // =============================== Episodes =============================

    override fun episodeListParse(response: Response): List<SEpisode> {
        val document = response.asJsoup()
        val slug = response.request.url.pathSegments.last { it.isNotEmpty() }

        return document.select("a[href^=/media/$slug/]")
            .mapNotNull { link ->
                val number = link.attr("href").substringAfterLast('/').toIntOrNull()
                    ?: return@mapNotNull null
                SEpisode.create().apply {
                    url = "/media/$slug/$number"
                    name = "Episodio $number"
                    episode_number = number.toFloat()
                }
            }
            .distinctBy { it.url }
            .sortedByDescending { it.episode_number }
    }

    // ================================ Videos ==============================

    override fun videoListRequest(episode: SEpisode): Request = GET(baseUrl + episode.url, headers)

    override fun videoListParse(response: Response): List<Video> {
        val html = response.body.string()

        // embeds:{SUB:[{server:"HLS",url:"..."},...],DUB:[...]},downloads:{...}
        val embeds = EMBEDS_REGEX.find(html)?.groupValues?.get(1) ?: return emptyList()

        val videos = mutableListOf<Video>()
        for (group in AUDIO_REGEX.findAll(embeds)) {
            val audio = group.groupValues[1] // SUB or DUB
            for (entry in SERVER_REGEX.findAll(group.groupValues[2])) {
                val server = entry.groupValues[1]
                val url = entry.groupValues[2]
                videos += runCatching { extract(server, url, audio) }.getOrDefault(emptyList())
            }
        }

        return videos.sortedByDescending { it.videoTitle.contains("SUB") }
    }

    private fun extract(server: String, url: String, audio: String): List<Video> {
        val label = if (audio == "DUB") "DUB" else "SUB"
        return when (server) {
            "MP4Upload" -> mp4Upload(url, label)
            // "HLS" (player.zilla-networks.com) is not used: its segments answer 403 to anything
            // that is not a browser (Cloudflare check), so it can't be played from the app.
            // Voe, Byse and UPNShare need their own extractors: not supported yet
            else -> emptyList()
        }
    }

    /** MP4Upload embeds a direct mp4 link in the player script. */
    private fun mp4Upload(embedUrl: String, label: String): List<Video> {
        val page = client.newCall(GET(embedUrl, headers)).execute().use { it.body.string() }
        val videoUrl = MP4_REGEX.find(page)?.groupValues?.get(1) ?: return emptyList()
        val videoHeaders = headersBuilder().set("Referer", "https://www.mp4upload.com/").build()
        return listOf(Video(videoUrl = videoUrl, videoTitle = "MP4Upload - $label", headers = videoHeaders))
    }

    // ================================ Filters =============================

    override fun getFilterList(): AnimeFilterList = AnimeFilterList(
        AnimeFilter.Header("Los filtros se combinan con la búsqueda"),
        CategoryFilter(),
        StatusFilter(),
        OrderFilter(),
        LetterFilter(),
        GenreFilter(GENRES.map { GenreCheckBox(it.first, it.second) }),
    )

    private open class UriPartFilter(
        name: String,
        private val options: Array<Pair<String, String>>,
    ) : AnimeFilter.Select<String>(name, options.map { it.first }.toTypedArray()) {
        fun toUriPart(): String = options[state].second
    }

    private class CategoryFilter : UriPartFilter(
        "Tipo",
        arrayOf(
            "Todos" to "",
            "TV Anime" to "tv-anime",
            "Película" to "pelicula",
            "OVA" to "ova",
            "Especial" to "especial",
            "ONA" to "ona",
        ),
    )

    private class StatusFilter : UriPartFilter(
        "Estado",
        arrayOf(
            "Todos" to "",
            "En emisión" to "emision",
            "Finalizado" to "finalizado",
        ),
    )

    private class OrderFilter : UriPartFilter(
        "Ordenar por",
        arrayOf(
            "Predeterminado" to "",
            "Populares" to "popular",
            "Puntuación" to "score",
            "Recién agregados" to "latest_added",
            "Título" to "title",
        ),
    )

    private class LetterFilter : UriPartFilter(
        "Letra",
        (listOf("Todas" to "") + ('A'..'Z').map { it.toString() to it.toString() }).toTypedArray(),
    )

    private class GenreCheckBox(name: String, val slug: String) : AnimeFilter.CheckBox(name)

    private class GenreFilter(genres: List<GenreCheckBox>) :
        AnimeFilter.Group<GenreCheckBox>("Géneros", genres)

    companion object {
        private val EMBEDS_REGEX = Regex("""embeds:\{(.*?)\},downloads:""", RegexOption.DOT_MATCHES_ALL)
        private val AUDIO_REGEX = Regex("""(SUB|DUB):\[(.*?)\]""", RegexOption.DOT_MATCHES_ALL)
        private val SERVER_REGEX = Regex("""\{server:"([^"]+)",url:"([^"]+)"\}""")
        private val MP4_REGEX = Regex("""src:\s*"(https?://[^"]+\.mp4[^"]*)"""")

        private val GENRES = listOf(
            "Acción" to "accion",
            "Aventura" to "aventura",
            "Ciencia Ficción" to "ciencia-ficcion",
            "Comedia" to "comedia",
            "Deportes" to "deportes",
            "Drama" to "drama",
            "Fantasía" to "fantasia",
            "Misterio" to "misterio",
            "Recuentos de la Vida" to "recuentos-de-la-vida",
            "Romance" to "romance",
            "Seinen" to "seinen",
            "Shoujo" to "shoujo",
            "Shounen" to "shounen",
            "Sobrenatural" to "sobrenatural",
            "Suspenso" to "suspenso",
            "Terror" to "terror",
            "Antropomórfico" to "antropomorfico",
            "Artes Marciales" to "artes-marciales",
            "Carreras" to "carreras",
            "Detectives" to "detectives",
            "Ecchi" to "ecchi",
            "Elenco Adulto" to "elenco-adulto",
            "Escolares" to "escolares",
            "Espacial" to "espacial",
            "Gore" to "gore",
            "Gourmet" to "gourmet",
            "Harem" to "harem",
            "Histórico" to "historico",
            "Idols (Hombre)" to "idols-hombre",
            "Idols (Mujer)" to "idols-mujer",
            "Infantil" to "infantil",
            "Isekai" to "isekai",
            "Josei" to "josei",
            "Juegos Estrategia" to "juegos-estrategia",
            "Mahou Shoujo" to "mahou-shoujo",
            "Mecha" to "mecha",
            "Militar" to "militar",
            "Mitología" to "mitologia",
            "Música" to "musica",
            "Parodia" to "parodia",
            "Psicológico" to "psicologico",
            "Samurai" to "samurai",
            "Shoujo Ai" to "shoujo-ai",
            "Shounen Ai" to "shounen-ai",
            "Superpoderes" to "superpoderes",
            "Vampiros" to "vampiros",
        )
    }
}
