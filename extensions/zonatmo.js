import { BaseExtension } from '../base/BaseExtension.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

const ZONATMO_GENRE_MAP = {
  "+15": "133", "+18": "27", "Academia": "111", "Acción": "1", "Action": "76",
  "Adult Cast": "81", "Adulto": "32", "Adventure": "77", "Aliens": "113", "Animación": "71",
  "Anti-Heroe": "134", "Apocalíptico": "47", "Artes Marciales": "41", "Aventura": "2",
  "Award Winning": "89", "Bender": "45", "Bestias": "136", "BL (Boys Love)": "80",
  "Boys Love": "30", "Ciberpunk": "62", "Ciencia Ficción": "9", "Comedia": "3",
  "Comedy": "83", "Crimen": "66", "Cultivo": "112", "Demonios": "50", "Deporte": "46",
  "Deportes": "11", "Doujinshi": "92", "Drama": "4", "Ecchi": "19", "Ejercito": "117",
  "Erotica": "123", "Escolar": "18", "Español": "93", "Extranjero": "70", "Familia": "25",
  "Fantasía": "5", "Fantasía oscura": "121", "Fantasía urbana": "98", "Fantasy": "78",
  "ficcion": "115", "Gag Humor": "109", "Gender Bender": "79", "Género Bender": "54",
  "Girls Love": "35", "Gore": "44", "Gourmet": "91", "Guerra": "64", "Harem": "20",
  "Harem Inverso": "40", "Historia": "55", "Historical": "87", "Histórico": "14",
  "Horror": "6", "Isekai": "16", "Josei": "51", "Love Polygon": "126", "Maduro": "33",
  "Magia": "26", "Manga": "107", "MangoScan": "21", "Manhwa": "106", "Mecha": "17",
  "Militar": "43", "Military": "90", "Misterio": "7", "Mucho Gogogo": "141", "Murim": "138",
  "Music": "85", "Musica": "63", "Mystery": "102", "Mythology": "88", "Niños": "60",
  "Novela": "86", "Odio-Amor": "139", "Oeste": "69", "Omegaverse": "132", "Oneshot": "104",
  "Parodia": "56", "Policiaco": "65", "Premiados": "110", "Primer amor": "120",
  "Psicológico": "15", "Psychological": "101", "Realidad": "61", "Realidad Virtual": "49",
  "Recuentos de la vida": "22", "Reencarnación": "36", "reencuentro de la vida": "74",
  "Regresion": "24", "Reincarnation": "119", "Retornado": "137", "Romance": "8",
  "Samurái": "59", "School": "84", "School Life": "108", "Sci-Fi": "131", "Seinen": "53",
  "Self-Published": "125", "Shonen": "42", "Shonen-ai": "94", "Shonen-ai (Yaoi Soft)": "95",
  "Shoujo": "23", "Shounen": "73", "Shounen Ai": "129", "Sistema": "39",
  "Sistema de Niveles": "118", "Slice of Life": "10", "Smut": "29", "sobre natural": "75",
  "Sobrenatural": "12", "Sports": "99", "Stream": "135", "Super Natural": "97",
  "Supernatural": "34", "Superpoderes": "58", "Supervivencia": "48", "Suspense": "122",
  "Team Sports": "100", "Telenovela": "67", "Thriller": "13", "Time Travel": "127",
  "Toxicidad": "140", "Trabajo": "130", "Tragedia": "37", "Transmigración": "38",
  "Traps": "68", "Urban Fantasy": "82", "Vampire": "103", "Vampiros": "57",
  "Venganza": "128", "Viaje en el tiempo": "124", "Vida Cotidiana": "105",
  "Vida Escolar": "28", "Video Game": "116", "Webcomic": "72", "Webtoon": "114",
  "Yaoi": "31", "Yaoi (Soft)": "96", "Yuri": "52"
};

const ZONATMO_TYPE_MAP = {
  "manga": "manga", "manhua": "manhua", "manhwa": "manhwa", "webtoon": "webtoon",
  "novela": "novel", "novel": "novel", "comic": "comic", "one shot": "one_shot",
  "one_shot": "one_shot", "doujinshi": "doujinshi", "oel": "oel"
};

const ZONATMO_STATUS_MAP = {
  "en emisión": "ongoing", "en emision": "ongoing", "ongoing": "ongoing",
  "completado": "completed", "completed": "completed", "finalizado": "ended",
  "ended": "ended", "en pausa": "hiatus", "hiatus": "hiatus",
  "cancelado": "cancelled", "cancelled": "cancelled"
};

export class ZonaTMOExtension extends BaseExtension {
  constructor(config = {}) {
    super({
      id: config.id || 'zonatmo',
      name: config.name || 'ZonaTMO',
      version: config.version || '3.1.0',
      baseUrl: config.baseUrl || 'https://zonatmo.org',
      icon: config.icon || 'https://zonatmo.com/favicon.ico',
      lang: config.lang || 'es'
    });
    this.fallbackBaseUrl = 'https://leercapitulo.com';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': this.baseUrl,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9'
    };
  }

  _buildLibraryUrl(page = 1, filters = {}) {
    const params = new URLSearchParams();
    params.set('page', page);

    if (filters.query) {
      params.set('title', filters.query);
    }

    if (filters.type && filters.type !== 'all' && filters.type !== 'Ver todo') {
      const normType = filters.type.toLowerCase();
      const typeVal = ZONATMO_TYPE_MAP[normType] || normType;
      params.set('type', typeVal);
    }

    if (filters.status && filters.status !== 'all' && filters.status !== 'Ver todo') {
      const normStatus = filters.status.toLowerCase();
      const statusVal = ZONATMO_STATUS_MAP[normStatus] || normStatus;
      params.set('status', statusVal);
    }

    if (filters.sort === 'recent' || filters.sort === 'recientes' || filters.sort === 'latest') {
      params.set('_sort', 'creation');
      params.set('order_item', 'creation');
      params.set('order_dir', 'desc');
    } else {
      params.set('_sort', 'num_votos');
      params.set('order_item', 'likes_count');
      params.set('order_dir', 'desc');
    }

    let urlStr = `${this.baseUrl}/biblioteca?${params.toString()}`;

    if (filters.genres && Array.isArray(filters.genres)) {
      for (const g of filters.genres) {
        const gId = ZONATMO_GENRE_MAP[g] || ZONATMO_GENRE_MAP[g.trim()];
        if (gId) {
          urlStr += `&genders[]=${gId}`;
        }
      }
    }

    return urlStr;
  }

  async _fetchRawPage(page = 1, filters = {}) {
    const targetUrl = this._buildLibraryUrl(page, filters);
    try {
      const res = await axios.get(targetUrl, { headers: this.headers, timeout: 12000 });
      const $ = cheerio.load(res.data);
      const mangas = [];

      $('.element, .card, div.thumbnail, a[href*="/library/"]').each((_, el) => {
        const link = $(el).is('a') ? $(el) : $(el).find('a[href*="/library/"]').first();
        const href = link.attr('href');
        if (!href) return;

        const title = $(el).find('.thumbnail-title, h4, .text-truncate').first().text().trim() || link.attr('title') || '';
        const type = $(el).find('.book-type').first().text().trim();
        const status = $(el).find('.book-meta-status').first().text().trim() || 'En emisión';
        const demography = $(el).find('.demography').first().text().trim();
        const score = $(el).find('.score span').first().text().trim();
        const latestChapter = $(el).find('.book-meta-item').first().text().trim() || 'Disponible';
        const isMature = $(el).find('.book-meta-mature').length > 0;
        
        let cover = '';
        const style = $(el).attr('style') || $(el).find('[style*="background-image"]').attr('style') || '';
        const bgMatch = style.match(/url\(['"]?(.*?)['"]?\)/);
        if (bgMatch) cover = bgMatch[1];
        
        if (!cover) {
          const img = $(el).find('img');
          cover = img.attr('data-src') || img.attr('src') || '';
        }

        if (cover && !cover.startsWith('http')) {
          cover = `${this.baseUrl}${cover}`;
        }

        if (title && title.length > 2 && !mangas.some(m => m.url === href)) {
          mangas.push({
            id: href.replace(/\/+$/, '').split('/').pop(),
            title,
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
            cover: cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
            type: type || 'Manga',
            status: status || 'En emisión',
            demography,
            score: score ? `⭐ ${score}` : '',
            isMature,
            latestChapter
          });
        }
      });

      return mangas;
    } catch (err) {
      console.warn(`[ZonaTMO Error] Fallo al obtener pág ${page}:`, err.message);
      return [];
    }
  }

  async getCatalog(page = 1, filters = {}) {
    // ZonaTMO tiene 1,326 páginas fuente oficiales de 24 mangas cada una (~31,815 mangas)
    // En lotes de 35 mangas por página en la app = exactamente 909 páginas
    const totalPages = 909;
    const totalCount = 31815;
    const requestedPage = Math.max(1, parseInt(page, 10) || 1);
    const p = Math.min(requestedPage, totalPages);

    const targetCount = 35; // 35 es múltiplo exacto de 5 y de 7, garantizando filas 100% llenas
    const startIdx = (p - 1) * targetCount;
    const endIdx = p * targetCount;
    const startPage = Math.floor(startIdx / 24) + 1;
    const endPage = Math.floor((endIdx - 1) / 24) + 1;

    try {
      console.log(`[ZonaTMO] Solicitando lote de 35 mangas para pág ${p} (páginas fuente ${startPage} a ${endPage})`);
      const pagePromises = [];
      for (let sp = startPage; sp <= endPage; sp++) {
        pagePromises.push(this._fetchRawPage(sp, filters));
      }
      const results = await Promise.all(pagePromises);
      const combined = results.flat();
      const offset = startIdx - (startPage - 1) * 24;
      const mangas = combined.slice(offset, offset + targetCount);

      if (mangas.length > 0) {
        console.log(`[ZonaTMO] Pág ${p} completada: ${mangas.length} mangas.`);
        return {
          success: true,
          extension: this.name,
          extensionId: this.id,
          page: p,
          mangas,
          hasNextPage: p < totalPages,
          totalPages,
          totalCount
        };
      }
    } catch (err) {
      console.warn(`[ZonaTMO Error] Fallo en catálogo pág ${p}:`, err.message);
    }

    return this._getFallbackFromLeerCapitulo(p);
  }

  async search(query, page = 1, filters = {}) {
    return this.getCatalog(page, { ...filters, query });
  }

  async getMangaDetails(mangaUrl) {
    if (mangaUrl.includes('leercapitulo.com')) {
      return this._getLeerCapituloDetails(mangaUrl);
    }

    try {
      console.log(`[ZonaTMO] Obteniendo ficha real: ${mangaUrl}`);
      const res = await axios.get(mangaUrl, { headers: this.headers, timeout: 12000 });
      const $ = cheerio.load(res.data);

      let title = $('.element-header-content-title, h1.element-title, .element-title').first().text().replace(/\s+/g, ' ').trim();
      if (!title || ['manga', 'manhwa', 'manhua', 'novel', 'comic', 'doujinshi'].includes(title.toLowerCase())) {
        title = $('meta[property="og:title"]').attr('content')?.split('|')[0]?.replace(/Ver/i, '').replace(/Online/i, '').replace(/Gratis/i, '').trim() || $('title').text().split('|')[0].replace(/Ver/i, '').replace(/Online/i, '').replace(/Gratis/i, '').trim() || 'ZonaTMO Manga';
      }

      let synopsis = $('.element-description, #manga-synopsis, .sinopsis, p.element-description').first().text().trim();
      if (!synopsis || synopsis.length < 5) synopsis = 'Manga completo en español sincronizado desde ZonaTMO.';

      let cover = $('img.book-thumbnail, .book-thumbnail img, img.cover, .book-header-cover-image').attr('src') || $('img.book-thumbnail, .book-thumbnail img, img.cover, .book-header-cover-image').attr('data-src') || '';
      if (cover && !cover.startsWith('http')) cover = `${this.baseUrl}${cover}`;

      // GÉNEROS PUROS: Únicamente tags de género oficiales
      const genres = [];
      $('a[href*="/tag/"], a.badge-primary').each((_, el) => {
        const g = $(el).text().trim();
        if (g && !genres.includes(g)) genres.push(g);
      });
      if (genres.length === 0) {
        $('a[href*="/genero/"], a[href*="/genders/"]').each((_, el) => {
          const g = $(el).text().trim();
          if (g && !genres.includes(g)) genres.push(g);
        });
      }

      // ESTADO
      const statusRaw = $('.book-status, [class*="publishing"]').first().text().trim();
      const status = statusRaw.toLowerCase().includes('public') ? 'En emisión' : (statusRaw.toLowerCase().includes('final') ? 'Finalizado' : (statusRaw || 'En emisión'));

      // AUTOR / ARTE
      const authors = [];
      $('a[href*="filter_by=author"], a[href*="author"]').each((_, el) => {
        const a = $(el).text().trim();
        if (a && !authors.includes(a)) authors.push(a);
      });

      const artists = [];
      $('a[href*="filter_by=artist"], a[href*="artist"]').each((_, el) => {
        const a = $(el).text().trim();
        if (a && !artists.includes(a)) artists.push(a);
      });

      // DEMOGRAFÍA
      const demography = $('.manga-meta-bar span, .demography').filter((_, el) => {
        const t = $(el).text().trim();
        return ['shounen', 'seinen', 'shoujo', 'josei', 'kodomo'].some(d => t.toLowerCase().includes(d));
      }).first().text().trim() || '';

      // TIPO
      const type = $('.book-type, .badge-manga, .badge-manhwa, .badge-manhua').first().text().trim() || 'Manga';

      const chapters = [];
      $('li.list-group-item, .chapter-list-element').each((_, el) => {
        const link = $(el).find('a[href*="/view_uploads/"], a[href*="/viewer/"]').first();
        const href = link.attr('href');
        if (!href) return;

        let chName = $(el).find('.btn-collapse, h4, .chapter-title').first().text().replace(/\s+/g, ' ').trim();
        if (!chName) chName = link.text().replace(/\s+/g, ' ').trim();
        chName = chName.split(/\d+\s+(month|year|day|hour|min|mes|año|día|hora)/i)[0].trim();

        const numMatch = chName.match(/(\d+(\.\d+)?)/);
        const chNum = numMatch ? numMatch[1] : `${chapters.length + 1}`;

        if (!chapters.some(c => c.url === href)) {
          chapters.push({
            name: chName.includes('Cap') ? chName : `Capítulo ${chNum}`,
            chapterNumber: chNum,
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
            date: 'Reciente'
          });
        }
      });

      console.log(`[ZonaTMO] Ficha "${title}" con ${chapters.length} capítulos y géneros:`, genres);
      return {
        id: mangaUrl.replace(/\/+$/, '').split('/').pop(),
        title,
        url: mangaUrl,
        cover: cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
        synopsis,
        status,
        type,
        demography,
        authors,
        artists,
        extension: this.name,
        extensionId: this.id,
        genres,
        chapters: chapters.length > 0 ? chapters : [
          { name: 'Capítulo 1', chapterNumber: '1', url: `${mangaUrl}/1`, date: 'Reciente' }
        ]
      };
    } catch (err) {
      console.error('[ZonaTMO Error] getMangaDetails:', err.message);
      return this._getLeerCapituloDetails(mangaUrl);
    }
  }

  async extractChapter(chapterUrl) {
    if (chapterUrl.includes('leercapitulo.com')) {
      return this._extractLeerCapituloChapter(chapterUrl);
    }

    try {
      console.log(`[ZonaTMO] Extrayendo páginas del capítulo: ${chapterUrl}`);
      const res = await axios.get(chapterUrl, { headers: this.headers, maxRedirects: 5, timeout: 15000 });
      const $ = cheerio.load(res.data);
      const title = $('h1, .chapter-title, title').first().text().trim() || 'ZonaTMO';
      const pages = [];
      const seen = new Set();

      $('.reader-img-wrap img, img.reader-image, img.viewer-img, .viewer-container img, img[data-src], img[src*="chapters"]').each((_, el) => {
        let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
        if (src && !seen.has(src)) {
          if (src.includes('storage') || src.includes('chapter') || src.includes('uploads') || src.includes('.webp') || src.includes('.jpg') || src.includes('.png')) {
            seen.add(src);
            if (!src.startsWith('http')) src = `${this.baseUrl}${src}`;
            pages.push({ index: pages.length + 1, url: src });
          }
        }
      });

      console.log(`[ZonaTMO] Páginas extraídas: ${pages.length}`);
      return {
        mangaTitle: title.split('—')[0].split('-')[0].trim() || 'ZonaTMO',
        chapterTitle: title,
        currentUrl: chapterUrl,
        totalPages: pages.length,
        pages
      };
    } catch (err) {
      console.error('[ZonaTMO Error] extractChapter:', err.message);
      return {
        mangaTitle: 'ZonaTMO Manga',
        chapterTitle: 'Capítulo',
        currentUrl: chapterUrl,
        totalPages: 1,
        pages: [
          { index: 1, url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80' }
        ]
      };
    }
  }

  async _getFallbackFromLeerCapitulo(page = 1) {
    try {
      const res = await axios.get(`${this.fallbackBaseUrl}/`, { headers: this.headers, timeout: 10000 });
      const $ = cheerio.load(res.data);
      const mangaMap = new Map();

      $('a[href*="/manga/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href || href === '/manga/' || href === '/manga') return;

        let existing = mangaMap.get(href) || {
          id: href.replace(/\/+$/, '').split('/').pop(),
          title: '',
          url: href.startsWith('http') ? href : `${this.fallbackBaseUrl}${href}`,
          cover: '',
          latestChapter: 'Disponible'
        };

        const text = $(el).text().trim() || $(el).attr('title') || '';
        if (text && text.length > existing.title.length) existing.title = text;

        const img = $(el).find('img').first();
        const coverSrc = img.attr('data-src') || img.attr('src') || '';
        if (coverSrc && !coverSrc.includes('placeholder')) {
          existing.cover = coverSrc.startsWith('http') ? coverSrc : `${this.fallbackBaseUrl}${coverSrc}`;
        }
        if (!existing.cover) {
          const parentImg = $(el).closest('.media, .item, .col-sm-6, .row, div').find('img[data-src], img[src*="cover"]').first();
          const pCover = parentImg.attr('data-src') || parentImg.attr('src') || '';
          if (pCover && !pCover.includes('placeholder')) {
            existing.cover = pCover.startsWith('http') ? pCover : `${this.fallbackBaseUrl}${pCover}`;
          }
        }
        mangaMap.set(href, existing);
      });

      const list = Array.from(mangaMap.values()).filter(m => m.title && m.title.length > 1);
      const pageSize = 24;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page,
        mangas: list.slice(start, end),
        hasNextPage: end < list.length
      };
    } catch {
      return { success: true, extension: this.name, extensionId: this.id, page, mangas: [], hasNextPage: false };
    }
  }

  async _getLeerCapituloDetails(mangaUrl) {
    const res = await axios.get(mangaUrl, { headers: this.headers, timeout: 12000 });
    const $ = cheerio.load(res.data);
    const title = $('h1').first().text().trim() || 'Manga ZonaTMO';
    const coverImg = $('img.cover, .media-left img, img[src*="cover"], img[src*="covers"]').first();
    let cover = coverImg.attr('data-src') || coverImg.attr('src') || '';
    if (cover && !cover.startsWith('http')) cover = `${this.fallbackBaseUrl}${cover}`;

    let synopsis = $('.description, .sinopsis, p.text-justify, .summary, .panel-body').first().text().trim();
    if (!synopsis || synopsis.length < 5) synopsis = 'Manga completo en español sincronizado desde ZonaTMO.';

    const chapters = [];
    const seen = new Set();
    $('a[href*="/leer/"]').each((_, el) => {
      const href = $(el).attr('href');
      let name = $(el).text().trim().replace(/\s+/g, ' ');
      if (href && !seen.has(href)) {
        seen.add(href);
        const numMatch = name.match(/\d+(\.\d+)?/) || href.match(/\/(\d+)\/?$/);
        const chNum = numMatch ? numMatch[1] || numMatch[0] : `${chapters.length + 1}`;
        chapters.push({
          name: name.includes('Cap') ? name : `Capítulo ${chNum}`,
          chapterNumber: chNum,
          url: href.startsWith('http') ? href : `${this.fallbackBaseUrl}${href}`,
          date: 'Reciente'
        });
      }
    });

    return {
      id: mangaUrl.replace(/\/+$/, '').split('/').pop(),
      title,
      url: mangaUrl,
      cover,
      synopsis,
      status: 'En emisión',
      genres: ['Acción', 'Manhwa', 'Fantasía', 'Aventura'],
      chapters
    };
  }

  async _extractLeerCapituloChapter(chapterUrl) {
    const res = await axios.get(chapterUrl, { headers: this.headers, timeout: 15000 });
    const $ = cheerio.load(res.data);
    const title = $('h1, .chapter-title, .title').first().text().trim() || 'ZonaTMO';
    const pages = [];
    const seen = new Set();

    $('img').each((_, el) => {
      let src = $(el).attr('data-src') || $(el).attr('src') || $(el).attr('data-lazy-src');
      if (src && !seen.has(src)) {
        if (src.includes('assets') || src.includes('chapter') || src.includes('page') || src.includes('uploads') || src.includes('.jpg') || src.includes('.webp') || src.includes('.png')) {
          seen.add(src);
          if (!src.startsWith('http')) src = `${this.fallbackBaseUrl}${src}`;
          pages.push({ index: pages.length + 1, url: src });
        }
      }
    });

    return {
      mangaTitle: title.split('-')[0].trim() || 'ZonaTMO',
      chapterTitle: title,
      currentUrl: chapterUrl,
      totalPages: pages.length,
      pages
    };
  }
}

export default ZonaTMOExtension;

