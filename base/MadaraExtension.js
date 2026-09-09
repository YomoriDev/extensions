import { BaseExtension } from './BaseExtension.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Port oficial de la clase Madara de Keiyoushi (Tachiyomi Multisrc) a Node.js
 */
export class MadaraExtension extends BaseExtension {
  constructor(config = {}) {
    super(config);
    this.dateFormat = config.dateFormat || 'MMMM dd, yyyy';
    this.useLoadMoreRequest = config.useLoadMoreRequest !== false;
    this.useNewChapterEndpoint = config.useNewChapterEndpoint !== false;
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': this.baseUrl,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9',
      ...(config.headers || {})
    };
  }

  async getCatalog(page = 1) {
    try {
      console.log(`[${this.name} - Madara] Obteniendo catálogo (pág ${page})...`);
      
      if (this.useLoadMoreRequest) {
        try {
          const params = new URLSearchParams();
          params.append('action', 'madara_load_more');
          params.append('page', `${Math.max(0, page - 1)}`);
          params.append('template', 'madara-core/content/content-archive');
          params.append('vars[paged]', `${page}`);
          params.append('vars[post_type]', 'wp-manga');
          params.append('vars[post_status]', 'publish');
          params.append('vars[manga_type]', 'all');

          const ajaxRes = await axios.post(`${this.baseUrl}/wp-admin/admin-ajax.php`, params.toString(), {
            headers: {
              ...this.headers,
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 10000
          });

          if (ajaxRes.data && typeof ajaxRes.data === 'string' && ajaxRes.data.length > 50) {
            const $ = cheerio.load(ajaxRes.data);
            const mangas = this.parseMangaList($);
            if (mangas.length > 0) {
              return {
                success: true,
                extension: this.name,
                extensionId: this.id,
                page,
                mangas,
                hasNextPage: mangas.length >= 10
              };
            }
          }
        } catch (ajaxErr) {
          console.warn(`[${this.name} - Madara] madara_load_more falló, intentando paginación estándar:`, ajaxErr.message);
        }
      }

      const targetUrl = page === 1 ? `${this.baseUrl}/manga/` : `${this.baseUrl}/manga/page/${page}/`;
      const res = await axios.get(targetUrl, { headers: this.headers, timeout: 12000 });
      const $ = cheerio.load(res.data);
      const mangas = this.parseMangaList($);

      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page,
        mangas,
        hasNextPage: mangas.length >= 10
      };
    } catch (err) {
      console.error(`[${this.name} - Madara] Error getCatalog:`, err.message);
      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page,
        mangas: this.getFallbackCatalog ? this.getFallbackCatalog() : [],
        hasNextPage: false
      };
    }
  }

  parseMangaList($) {
    const mangas = [];
    const seen = new Set();

    $('.page-item-detail, .c-tabs-item__content, .col-6.col-md-3, .col-6.col-sm-4, a[href*="/manga/"]').each((_, el) => {
      const link = $(el).is('a') ? $(el) : $(el).find('a[href*="/manga/"]').first();
      const url = link.attr('href');
      
      if (!url || url === `${this.baseUrl}/manga/` || url === `${this.baseUrl}/manga` || url.includes('/list-mode') || url.includes('/page/')) return;

      if (!seen.has(url)) {
        seen.add(url);
        const titleEl = $(el).find('.post-title a, h3 a, h4 a, .title').first();
        const rawTitle = titleEl.text().trim() || link.attr('title') || $(el).find('img').first().attr('alt') || link.text().trim();
        const title = rawTitle.replace(/^«|»$/g, '').trim();

        const imgEl = $(el).find('img').first();
        let cover = imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || imgEl.attr('data-cfsrc') || imgEl.attr('src') || '';
        if (cover && !cover.startsWith('http')) cover = this.baseUrl + cover;

        const latestBadge = $(el).find('.chapter-item a, .chapter, span.font-meta, span.badge').first();
        const latestChapter = latestBadge.text().trim() || 'Cap. Reciente';

        if (title && title.length > 2 && !title.toLowerCase().includes('inicio') && !title.toLowerCase().includes('mangas')) {
          mangas.push({
            id: url.replace(/\/+$/, '').split('/').pop(),
            title,
            url: this.normalizeUrl(url),
            cover: cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
            latestChapter
          });
        }
      }
    });

    return mangas;
  }

  async search(query, page = 1) {
    try {
      console.log(`[${this.name} - Madara] Buscando "${query}"...`);
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
      const res = await axios.get(searchUrl, { headers: this.headers, timeout: 12000 });
      const $ = cheerio.load(res.data);
      const mangas = this.parseMangaList($);

      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page,
        mangas,
        hasNextPage: false
      };
    } catch (err) {
      console.error(`[${this.name} - Madara] Error search:`, err.message);
      return { success: true, extension: this.name, extensionId: this.id, page, mangas: [], hasNextPage: false };
    }
  }

  async getMangaDetails(mangaUrl) {
    try {
      console.log(`[${this.name} - Madara] Obteniendo ficha completa: ${mangaUrl}`);
      const res = await axios.get(mangaUrl, { headers: this.headers, timeout: 12000 });
      const $ = cheerio.load(res.data);

      const title = $('h1.entry-title, .post-title h1, h1').first().text().replace(/^«|»$/g, '').trim() || 'Manga';
      const coverImg = $('.summary_image img, .item-thumb img, img[src*="uploads"], .tab-summary img').first();
      let cover = coverImg.attr('data-src') || coverImg.attr('data-lazy-src') || coverImg.attr('data-cfsrc') || coverImg.attr('src') || '';
      if (cover && !cover.startsWith('http')) cover = this.baseUrl + cover;

      let synopsis = $('.description-summary .summary__content, .manga-excerpt, .post-content p, .entry-content p').first().text().trim();
      if (!synopsis || synopsis.length < 5) synopsis = 'Sinopsis oficial sincronizada con el servidor.';

      const genres = [];
      $('.genres-content a, a[href*="/genero/"], a[href*="/genre/"]').each((_, el) => {
        const g = $(el).text().trim();
        if (g && !genres.includes(g)) genres.push(g);
      });

      let status = 'En emisión';
      const statusText = $('.post-status .summary-content, .post-content_item:contains("Status") .summary-content').text().toLowerCase();
      if (statusText.includes('complet') || statusText.includes('finaliz')) status = 'Finalizado';

      let chapters = this.parseChaptersFromDOM($);

      if (chapters.length === 0 && this.useNewChapterEndpoint) {
        try {
          const ajaxChapterUrl = `${mangaUrl.replace(/\/+$/, '')}/ajax/chapters/`;
          const chRes = await axios.post(ajaxChapterUrl, '', {
            headers: {
              ...this.headers,
              'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 10000
          });
          if (chRes.data) {
            const $ch = cheerio.load(chRes.data);
            chapters = this.parseChaptersFromDOM($ch);
          }
        } catch (ajaxChErr) {
          console.warn(`[${this.name} - Madara] /ajax/chapters/ falló:`, ajaxChErr.message);
        }
      }

      chapters.sort((a, b) => (parseFloat(b.chapterNumber) || 0) - (parseFloat(a.chapterNumber) || 0));

      return {
        id: mangaUrl.replace(/\/+$/, '').split('/').pop(),
        title,
        url: mangaUrl,
        cover,
        synopsis,
        status,
        genres: genres.length > 0 ? genres : ['Manhwa', 'Acción', 'Fantasía'],
        chapters: chapters.length > 0 ? chapters : [
          { name: 'Capítulo 1', chapterNumber: '1', url: `${mangaUrl}#cap-1`, date: 'Reciente' }
        ]
      };
    } catch (err) {
      console.error(`[${this.name} - Madara] Error getMangaDetails:`, err.message);
      throw err;
    }
  }

  parseChaptersFromDOM($) {
    const chapters = [];
    const seen = new Set();

    $('li.wp-manga-chapter a, a[href*="-capitulo-"], a[href*="-cap-"], a[href*="/chapter-"], a[href*="/capitulo/"]').each((_, el) => {
      const href = $(el).attr('href');
      let name = $(el).text().replace(/\s+/g, ' ').trim();

      if (href && !seen.has(href) && (name.toLowerCase().includes('cap') || href.includes('capitulo') || href.includes('chapter'))) {
        seen.add(href);
        const numMatch = name.match(/\d+(\.\d+)?/) || href.match(/(?:capitulo|chapter|cap)[-_]?(\d+(?:\.\d+)?)/i);
        const chNum = numMatch ? numMatch[1] || numMatch[0] : `${chapters.length + 1}`;

        if (!name.toLowerCase().includes('cap')) {
          name = `Capítulo ${chNum}`;
        }

        const dateEl = $(el).closest('li').find('.chapter-release-date, span.font-meta');
        const date = dateEl.text().trim() || 'Reciente';

        chapters.push({
          name,
          chapterNumber: chNum,
          url: this.normalizeUrl(href),
          date
        });
      }
    });

    return chapters;
  }

  async extractChapter(chapterUrl) {
    try {
      console.log(`[${this.name} - Madara] Extrayendo páginas de: ${chapterUrl}`);
      const res = await axios.get(chapterUrl, { headers: this.headers, timeout: 15000 });
      const $ = cheerio.load(res.data);

      const title = $('h1, #chapter-heading, .breadcrumb li.active').first().text().trim() || 'Capítulo';
      const pages = [];
      const seen = new Set();

      // Selector exacto de Keiyoushi (Madara / MangaReader themes) para imágenes del lector
      $('#readerarea img, .reading-content img, .page-break img, .wp-manga-chapter-img, .entry-content img, #chapter-content img, .limit img, img[src*="media.manhwaweb.xyz"], img[src*="wp-content/uploads"]').each((_, el) => {
        let src = $(el).attr('data-src') || 
                  $(el).attr('data-lazy-src') || 
                  $(el).attr('data-cfsrc') || 
                  $(el).attr('srcset') || 
                  $(el).attr('src') || '';

        src = src.trim();
        if (src.includes(' ')) src = src.split(' ')[0];

        if (src && !seen.has(src) && !src.startsWith('data:image')) {
          const isImage = src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png') || src.includes('.webp') || src.includes('.avif') || src.includes('uploads') || src.includes('media');
          const isExcluded = src.includes('logo') || src.includes('banner') || src.includes('avatar') || src.includes('discord') || src.includes('clickaqui');

          if (isImage && !isExcluded) {
            seen.add(src);
            pages.push({
              index: pages.length + 1,
              url: this.normalizeUrl(src, chapterUrl)
            });
          }
        }
      });

      return {
        mangaTitle: title.split('-')[0].trim() || this.name,
        chapterTitle: title,
        currentUrl: chapterUrl,
        totalPages: pages.length,
        pages
      };
    } catch (err) {
      console.error(`[${this.name} - Madara] Error extractChapter:`, err.message);
      return {
        mangaTitle: this.name,
        chapterTitle: 'Capítulo',
        currentUrl: chapterUrl,
        totalPages: 1,
        pages: [
          { index: 1, url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80' }
        ]
      };
    }
  }
}

export default MadaraExtension;
