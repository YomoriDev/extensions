import { BaseExtension } from '../base/BaseExtension.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

const GENRE_MAP = {
  "+18": "351",
  "+19": "309",
  "academia": "183",
  "acción": "64",
  "adulto": "92",
  "aliens": "203",
  "amigos con derechos": "134",
  "amigos de la infancia": "142",
  "anti-heroe": "349",
  "apocaliptico": "156",
  "apocalíptico": "156",
  "artes marciales": "81",
  "aventura": "65",
  "bestias": "343",
  "ciencia ficción": "85",
  "comedia": "67",
  "crimen": "251",
  "cultivo": "166",
  "cyberpunk": "86",
  "deporte": "219",
  "deportes": "219",
  "doujinshi": "322",
  "drama": "75",
  "ecchi": "68",
  "ejercito": "176",
  "fantasía": "69",
  "girls love": "162",
  "gore": "177",
  "guerra": "144",
  "harem": "88",
  "historias cortas": "190",
  "horror": "70",
  "isekai": "97",
  "josei": "169",
  "madrastra": "197",
  "madre e hija": "172",
  "maduro": "352",
  "magia": "98",
  "manwha": "310",
  "manhwa": "310",
  "milfs": "103",
  "misterio": "83",
  "mujer casada": "104",
  "musica": "212",
  "música": "212",
  "pimer amor": "135",
  "primer amor": "189",
  "psicológico": "82",
  "recuentos de la vida": "117",
  "reencarnación": "99",
  "relacion secreta": "119",
  "relación secreta": "119",
  "romance": "89",
  "seinen": "138",
  "shoujo": "93",
  "shounen": "78",
  "sistema": "100",
  "sobrenatural": "101",
  "superpoderes": "257",
  "tragedia": "80",
  "universidad": "106",
  "vampiros": "157",
  "venganza": "130",
  "vida escolar": "299",
  "yuri": "161"
};

export class ManhwaLatinoExtension extends BaseExtension {
  constructor(config = {}) {
    super({
      id: config.id || 'manhwalatino',
      name: config.name || 'ManhwaLatino',
      version: config.version || '2.5.0',
      baseUrl: config.baseUrl || 'https://manhwalatino.lat',
      icon: config.icon || 'https://manhwalatino.lat/favicon.ico',
      lang: config.lang || 'es'
    });
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    };
  }

  _buildSearchUrl(page = 1, filters = {}) {
    const params = new URLSearchParams();
    if (page > 1) {
      params.append('page', String(page));
    }

    if (filters.query && filters.query.trim()) {
      params.append('title', filters.query.trim());
    }

    if (filters.status && filters.status !== 'Ver todo') {
      const s = filters.status.toLowerCase();
      if (s.includes('activo') || s.includes('emisión')) params.append('status', 'ongoing');
      else if (s.includes('finalizado') || s.includes('completado')) params.append('status', 'completed');
    }

    if (filters.type && filters.type !== 'Ver todo') {
      const t = filters.type.toLowerCase();
      if (t.includes('manhwa')) params.append('type', 'manhwa');
      else if (t.includes('manhua')) params.append('type', 'manhua');
      else if (t.includes('manga')) params.append('type', 'manga');
    }

    const sort = filters.sort || 'popular';
    if (sort === 'reciente' || sort === 'recent' || sort === 'latest') {
      params.append('order', 'update');
    } else if (sort === 'rating' || sort === 'valoracion') {
      params.append('order', 'rating');
    } else if (sort === 'az' || sort === 'title' || sort === 'alfabetico') {
      params.append('order', 'title');
    } else {
      params.append('order', 'popular');
    }

    if (filters.genres && filters.genres.length > 0) {
      for (const g of filters.genres) {
        const gId = GENRE_MAP[g.toLowerCase().trim()];
        if (gId) {
          params.append('genre[]', gId);
        }
      }
    }

    const qs = params.toString();
    return `${this.baseUrl}/manga/${qs ? '?' + qs : ''}`;
  }

  async _fetchRawPage(page = 1, filters = {}) {
    const url = this._buildSearchUrl(page, filters);
    try {
      const res = await axios.get(url, { headers: this.headers, timeout: 12000 });
      const html = res.data;
      const $ = cheerio.load(html);
      const mangas = [];

      $('.bsx').each((_, el) => {
        const link = $(el).find('a').first();
        const href = link.attr('href');
        const title = $(el).find('.tt, [itemprop="headline"]').text().trim() || link.attr('title') || '';
        const img = $(el).find('img').first();
        const cover = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src') || '';
        const latestChapter = $(el).find('.epxs').text().trim() || 'Disponible';
        const score = $(el).find('.numscore').text().trim();
        const type = $(el).find('.type').text().trim() || 'Manhwa';

        let status = 'Activo';
        const statusText = $(el).find('.status, .status_tag').text().trim().toLowerCase();
        if (statusText.includes('complet') || statusText.includes('final')) status = 'Finalizado';

        if (href && title && !mangas.some(m => m.url === href)) {
          mangas.push({
            id: href.replace(/\/+$/, '').split('/').pop(),
            title,
            url: href,
            cover,
            latestChapter,
            score: score ? `⭐ ${score}` : '',
            type,
            status
          });
        }
      });

      return mangas;
    } catch (err) {
      console.warn(`[ManhwaLatino] Error fetching raw page ${page}:`, err.message);
      return [];
    }
  }

  async getCatalog(page = 1, filters = {}) {
    try {
      const p = Math.max(1, parseInt(page, 10) || 1);
      const targetCount = 35; // 35 mangas por página normalizado
      const sourceCountPerPage = 30; // ManhwaLatino entrega 30 mangas por página fuente

      const startIdx = (p - 1) * targetCount;
      const endIdx = p * targetCount;
      const startPage = Math.floor(startIdx / sourceCountPerPage) + 1;
      const endPage = Math.floor((endIdx - 1) / sourceCountPerPage) + 1;

      const pagePromises = [];
      for (let sp = startPage; sp <= endPage; sp++) {
        pagePromises.push(this._fetchRawPage(sp, filters));
      }
      const results = await Promise.all(pagePromises);
      const combined = results.flat();
      const offset = startIdx - (startPage - 1) * sourceCountPerPage;
      const mangas = combined.slice(offset, offset + targetCount);

      const hasNext = combined.length > offset + mangas.length || mangas.length === targetCount;

      // ManhwaLatino tiene 209 títulos (7 páginas de 30 = 6 páginas de 35)
      const totalCount = 209;
      const totalPages = Math.max(1, Math.ceil(totalCount / targetCount));

      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page: p,
        mangas,
        hasNextPage: p < totalPages && hasNext,
        totalPages,
        totalCount
      };
    } catch (err) {
      console.error('[ManhwaLatino Error] getCatalog:', err.message);
      return {
        success: false,
        extension: this.name,
        extensionId: this.id,
        page,
        mangas: [],
        hasNextPage: false,
        totalPages: 1,
        totalCount: 0
      };
    }
  }

  async search(query, page = 1, filters = {}) {
    return this.getCatalog(page, { ...filters, query });
  }

  async getMangaDetails(mangaUrl) {
    try {
      const res = await axios.get(mangaUrl, { headers: this.headers, timeout: 12000 });
      const html = res.data;
      const $ = cheerio.load(html);

      const title = $('h1.entry-title, .entry-title').first().text().trim();
      const cover = $('.thumb img, .entry-content img').first().attr('data-src') || $('.thumb img').attr('src') || '';
      const synopsis = $('.entry-content p, .sinopsis, [itemprop="description"]').first().text().trim() || 'Sin sinopsis disponible.';
      const author = $('.tsinfo .imptdt:contains("Autor") i, .tsinfo .imptdt:contains("Author") i').text().trim() || '';
      
      let status = 'Activo';
      const statusRaw = $('.tsinfo .imptdt:contains("Status") i, .tsinfo .imptdt:contains("Estado") i').text().trim().toLowerCase();
      if (statusRaw.includes('complet') || statusRaw.includes('final')) status = 'Finalizado';

      const typeRaw = $('.tsinfo .imptdt:contains("Type") i, .tsinfo .imptdt:contains("Tipo") i').text().trim();
      const type = typeRaw || 'Manhwa';

      const genres = $('.mgen a, .genres-content a').map((_, a) => $(a).text().trim()).get();

      const chapters = [];
      $('#chapterlist li, .eplister li').each((_, li) => {
        const a = $(li).find('a').first();
        const href = a.attr('href');
        const chNum = $(li).find('.chapternum').text().trim() || a.text().trim();
        const date = $(li).find('.chapterdate').text().trim();

        if (href && !chapters.some(c => c.url === href)) {
          chapters.push({
            name: chNum,
            chapterNumber: chNum.replace(/[^\d.]/g, '') || '1',
            url: href,
            date
          });
        }
      });

      return {
        id: mangaUrl.replace(/\/+$/, '').split('/').pop(),
        title,
        url: mangaUrl,
        cover,
        synopsis,
        author,
        status,
        type,
        genres,
        chapters
      };
    } catch (err) {
      console.error('[ManhwaLatino Error] getMangaDetails:', err.message);
      return {
        id: 'fallback',
        title: 'ManhwaLatino Manga',
        url: mangaUrl,
        cover: '',
        synopsis: 'Manga sincronizado desde ManhwaLatino.',
        status: 'Activo',
        genres: ['Manhwa'],
        chapters: []
      };
    }
  }

  async extractChapter(chapterUrl) {
    try {
      const res = await axios.get(chapterUrl, { headers: this.headers, timeout: 12000 });
      const html = res.data;
      const $ = cheerio.load(html);

      let imageUrls = [];

      // 1. Extraer desde payload oficial JavaScript ts_reader
      const tsMatch = html.match(/ts_reader\.run\((.*?)\);/s);
      if (tsMatch) {
        try {
          const json = JSON.parse(tsMatch[1]);
          if (json.sources?.[0]?.images) {
            imageUrls = json.sources[0].images;
          }
        } catch (e) {}
      }

      // 2. Fallback HTML selector
      if (imageUrls.length === 0) {
        $('#readerarea img, .reading-content img, .page-break img').each((_, img) => {
          const src = $(img).attr('data-src') || $(img).attr('data-lazy-src') || $(img).attr('src') || '';
          if (src && !src.includes('logo') && !src.includes('banner')) {
            imageUrls.push(src.trim());
          }
        });
      }

      const pages = imageUrls.map((url, idx) => ({
        index: idx + 1,
        url
      }));

      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        mangaTitle: 'ManhwaLatino',
        chapterTitle: 'Capítulo',
        currentUrl: chapterUrl,
        totalPages: pages.length,
        pages
      };
    } catch (err) {
      console.error('[ManhwaLatino Error] extractChapter:', err.message);
      return {
        success: false,
        extension: this.name,
        extensionId: this.id,
        mangaTitle: 'ManhwaLatino',
        chapterTitle: 'Capítulo',
        currentUrl: chapterUrl,
        totalPages: 0,
        pages: []
      };
    }
  }
}

export default ManhwaLatinoExtension;
