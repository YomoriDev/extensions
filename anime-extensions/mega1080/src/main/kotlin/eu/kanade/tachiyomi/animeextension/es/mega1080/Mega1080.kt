package eu.kanade.tachiyomi.animeextension.es.mega1080

import eu.kanade.tachiyomi.animesource.model.AnimeFilter
import eu.kanade.tachiyomi.animesource.model.AnimeFilterList
import eu.kanade.tachiyomi.animesource.model.AnimesPage
import eu.kanade.tachiyomi.animesource.model.SAnime
import eu.kanade.tachiyomi.animesource.model.SEpisode
import eu.kanade.tachiyomi.animesource.model.Track
import eu.kanade.tachiyomi.animesource.model.Video
import eu.kanade.tachiyomi.animesource.online.AnimeHttpSource
import eu.kanade.tachiyomi.network.GET
import okhttp3.Headers
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject

/**
 * Mega1080 (https://mega1080.me): movies in Spanish (Latino / Castellano / Subtitulado).
 *
 * The site is a single page app that talks to a small JSON API (/api/rest): `listing`, `search`
 * and `player`. Each movie has one "episode" (the movie itself) whose players are embeds.
 */
class Mega1080 : AnimeHttpSource() {

    override val name = "Mega1080"

    override val baseUrl = "https://mega1080.me"

    override val lang = "es"

    override val supportsLatest = true

    private val api = "$baseUrl/api/rest"

    override fun headersBuilder(): Headers.Builder = super.headersBuilder()
        .add("Referer", "$baseUrl/")

    // =============================== Lists ================================

    override fun popularAnimeRequest(page: Int): Request =
        GET("$api/listing?post_type=movies&page=$page&order=latest", headers)

    override fun popularAnimeParse(response: Response): AnimesPage = parsePosts(response)

    override fun latestUpdatesRequest(page: Int): Request = popularAnimeRequest(page)

    override fun latestUpdatesParse(response: Response): AnimesPage = parsePosts(response)

    override fun searchAnimeRequest(page: Int, query: String, filters: AnimeFilterList): Request {
        // The site only searches with 3 to 15 characters
        val text = query.trim()
        if (text.length >= MIN_QUERY) {
            val url = "$api/search".toHttpUrl().newBuilder()
                .addQueryParameter("post_type", "movies")
                .addQueryParameter("query", text.take(MAX_QUERY))
                .addQueryParameter("page", page.toString())
            return GET(url.build(), headers)
        }

        val url = "$api/listing".toHttpUrl().newBuilder()
            .addQueryParameter("post_type", "movies")
            .addQueryParameter("page", page.toString())
            .addQueryParameter("order", "latest")
        val genres = filters.filterIsInstance<GenreFilter>().firstOrNull()
            ?.state?.filter { it.state }?.joinToString(",") { it.id.toString() }
        if (!genres.isNullOrEmpty()) url.addQueryParameter("genres", genres)
        return GET(url.build(), headers)
    }

    override fun searchAnimeParse(response: Response): AnimesPage = parsePosts(response)

    private fun parsePosts(response: Response): AnimesPage {
        val data = JSONObject(response.body.string()).getJSONObject("data")
        val posts = data.getJSONArray("posts")

        val animes = (0 until posts.length()).map { index ->
            val post = posts.getJSONObject(index)
            SAnime.create().apply {
                url = "/peliculas/${post.getString("slug")}?id=${post.getLong("_id")}"
                title = post.getString("title")
                description = post.optString("overview").takeIf { it.isNotBlank() }
                thumbnail_url = post.optJSONObject("images")?.optString("poster")
                    ?.takeIf { it.isNotBlank() }
                    ?.let { "$baseUrl/wp-content/uploads$it" }
                genre = post.optJSONArray("genres")?.let { ids ->
                    (0 until ids.length()).mapNotNull { GENRES[ids.getInt(it)] }.joinToString(", ")
                }?.takeIf { it.isNotEmpty() }
                status = SAnime.COMPLETED
            }
        }

        val pagination = data.optJSONObject("pagination")
        val hasNextPage = pagination != null &&
            pagination.optInt("current_page") < pagination.optInt("last_page")
        return AnimesPage(animes, hasNextPage)
    }

    // ============================ Details / episode =======================

    /** Everything we need is already in the listing, so no extra request is made. */
    override suspend fun getAnimeDetails(anime: SAnime): SAnime = anime.apply { initialized = true }

    /** A movie is a single "episode". */
    override suspend fun getEpisodeList(anime: SAnime): List<SEpisode> = listOf(
        SEpisode.create().apply {
            url = anime.url
            name = "Película"
            episode_number = 1f
        },
    )

    // ================================ Videos ==============================

    override fun videoListRequest(episode: SEpisode): Request {
        val id = episode.url.substringAfter("id=", "")
        return GET("$api/player?post_id=$id", headers)
    }

    override fun videoListParse(response: Response): List<Video> {
        val players = JSONObject(response.body.string()).optJSONArray("data") ?: return emptyList()
        val videos = mutableListOf<Video>()
        for (index in 0 until players.length()) {
            val player = players.getJSONObject(index)
            val embed = player.optString("url")
            val label = "${player.optString("lang")} ${player.optString("quality")}".trim()
            videos += runCatching {
                when {
                    embed.contains("vimeos.") -> vimeos(embed, label)
                    else -> emptyList()
                }
            }.getOrDefault(emptyList())
        }
        return videos
    }

    /** vimeos.net hides an HLS master playlist (and subtitles) in a p.a.c.k.e.r script. */
    private fun vimeos(embedUrl: String, label: String): List<Video> {
        val page = client.newCall(GET(embedUrl, headers)).execute().use { it.body.string() }
        val script = Unpacker.unpack(page) ?: return emptyList()

        val master = Regex("""file\s*:\s*"(https?://[^"]+\.m3u8[^"]*)"""").find(script)
            ?.groupValues?.get(1) ?: return emptyList()
        val subtitles = Regex("""\{file:"(https?://[^"]+\.vtt)",label:"([^"]+)"""").findAll(script)
            .map { Track(it.groupValues[1], it.groupValues[2]) }
            .toList()

        val origin = embedUrl.toHttpUrl().let { "${it.scheme}://${it.host}/" }
        val videoHeaders = headersBuilder().set("Referer", origin).build()
        return listOf(
            Video(
                videoUrl = master,
                videoTitle = "Vimeos - $label",
                headers = videoHeaders,
                subtitleTracks = subtitles,
            ),
        )
    }

    // ================================ Filters =============================

    override fun getFilterList(): AnimeFilterList = AnimeFilterList(
        AnimeFilter.Header("Los géneros solo se aplican sin texto de búsqueda"),
        GenreFilter(GENRES.entries.map { GenreCheckBox(it.value, it.key) }),
    )

    private class GenreCheckBox(name: String, val id: Int) : AnimeFilter.CheckBox(name)

    private class GenreFilter(genres: List<GenreCheckBox>) :
        AnimeFilter.Group<GenreCheckBox>("Géneros", genres)

    companion object {
        private const val MIN_QUERY = 3
        private const val MAX_QUERY = 15

        private val GENRES = linkedMapOf(
            26 to "Acción",
            25 to "Aventura",
            51 to "Animación",
            27 to "Ciencia ficción",
            192 to "Comedia",
            136 to "Crimen",
            20085 to "Documental",
            157 to "Drama",
            52 to "Familia",
            86 to "Fantasía",
            404 to "Historia",
            249 to "Misterio",
            307 to "Música",
            215 to "Romance",
            87 to "Suspense",
            422 to "Terror",
            158 to "Bélica",
            1594 to "Western",
            10517 to "Película de TV",
        )
    }
}
