package eu.kanade.tachiyomi.animeextension.es.mega1080

/** Decoder for the classic Dean Edwards "p.a.c.k.e.r" JavaScript packer used by several video hosts. */
object Unpacker {

    private val PACKED = Regex("""\}\('(.*)',(\d+),(\d+),'(.*?)'\.split\('\|'\)""", RegexOption.DOT_MATCHES_ALL)
    private val WORD = Regex("""\b\w+\b""")
    private const val ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

    /** Returns the unpacked script of the first packed block in [html], or null if there is none. */
    fun unpack(html: String): String? {
        val match = PACKED.find(html) ?: return null
        val payload = match.groupValues[1].replace("\\'", "'")
        val radix = match.groupValues[2].toInt()
        val count = match.groupValues[3].toInt()
        val words = match.groupValues[4].split("|")

        fun encode(n: Int): String {
            val rest = n % radix
            val digit = if (rest < 62) ALPHABET[rest].toString() else (rest + 29).toChar().toString()
            return (if (n < radix) "" else encode(n / radix)) + digit
        }

        val table = HashMap<String, String>(count)
        for (i in count - 1 downTo 0) {
            val key = encode(i)
            table[key] = words.getOrNull(i)?.ifEmpty { key } ?: key
        }
        return WORD.replace(payload) { table[it.value] ?: it.value }
    }
}
