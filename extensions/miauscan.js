import { BaseExtension } from '../base/BaseExtension.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

export class MiauScanExtension extends BaseExtension {
  constructor(config = {}) {
    super({
      id: config.id || 'miauscan',
      name: config.name || 'MiauScan',
      version: config.version || '3.0.0',
      baseUrl: config.baseUrl || 'https://leemiau.com',
      icon: config.icon || 'https://leemiau.com/wp-content/uploads/2022/02/cropped-gatita.png',
      lang: config.lang || 'es'
    });
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': `${this.baseUrl}/`,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9'
    };
  }

  async getCatalog(page = 1, filters = {}) {
    try {
      console.log(`[MiauScan] Obteniendo catálogo (pág ${page})...`);
      
      let targetUrl = `${this.baseUrl}/manga/?page=${page}`;
      if (filters?.query) {
        targetUrl = `${this.baseUrl}/?s=${encodeURIComponent(filters.query)}`;
      } else {
        const queryParts = [`page=${page}`];
        if (filters?.genres && filters.genres.length > 0) {
          filters.genres.forEach(g => queryParts.push(`genre%5B%5D=${encodeURIComponent(g)}`));
        }
        if (filters?.status && filters.status !== 'Ver todo') {
          queryParts.push(`status=${encodeURIComponent(filters.status.toLowerCase())}`);
        }
        if (filters?.type && filters.type !== 'Ver todo') {
          queryParts.push(`type=${encodeURIComponent(filters.type.toLowerCase())}`);
        }
        if (filters?.sort) {
          queryParts.push(`order=${encodeURIComponent(filters.sort)}`);
        }
        targetUrl = `${this.baseUrl}/manga/?${queryParts.join('&')}`;
      }

      const res = await axios.get(targetUrl, { headers: this.headers, timeout: 15000 });
      const $ = cheerio.load(res.data);
      const mangas = [];
      const seen = new Set();

      $('.bsx, .bs, article.bs').each((_, el) => {
        const a = $(el).find('a').first();
        const href = a.attr('href');
        if (!href || seen.has(href)) return;
        seen.add(href);

        const title = $(el).find('.tt, .title, .entry-title, h4, h3').first().text().trim() || a.attr('title') || '';
        const img = $(el).find('img').first();
        let cover = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('srcset') || img.attr('src') || '';
        if (cover.startsWith('data:image')) {
          cover = img.attr('data-src') || img.attr('data-lazy-src') || '';
        }
        if (cover && !cover.startsWith('http')) cover = `${this.baseUrl}${cover.startsWith('/') ? '' : '/'}${cover}`;

        const latestChapter = $(el).find('.epxs, .chapter, .adds .ep').first().text().trim() || 'Cap. Reciente';
        const rating = $(el).find('.numscore, .rating').first().text().trim() || '7.5';

        if (title && title.length > 1) {
          mangas.push({
            id: href.replace(/\/+$/, '').split('/').pop(),
            title,
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
            cover: cover || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
            latestChapter,
            score: rating
          });
        }
      });

      console.log(`[MiauScan] Mangas encontrados en vivo (pág ${page}): ${mangas.length}`);
      
      const totalPages = 150;
      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page: Number(page),
        totalPages,
        mangas,
        hasNextPage: Number(page) < totalPages && mangas.length > 0
      };
    } catch (err) {
      console.warn('[MiauScan Error] Fetch catálogo falló:', err.message);
      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page: Number(page),
        totalPages: 150,
        mangas: this.getFallbackCatalog(),
        hasNextPage: false
      };
    }
  }

  async search(query, page = 1) {
    try {
      console.log(`[MiauScan] Buscando: "${query}"...`);
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
      const res = await axios.get(searchUrl, { headers: this.headers, timeout: 15000 });
      const $ = cheerio.load(res.data);
      const mangas = [];
      const seen = new Set();

      $('.bsx, .bs, article.bs').each((_, el) => {
        const a = $(el).find('a').first();
        const href = a.attr('href');
        if (!href || seen.has(href)) return;
        seen.add(href);

        const title = $(el).find('.tt, .title, .entry-title, h4, h3').first().text().trim() || a.attr('title') || '';
        const img = $(el).find('img').first();
        let cover = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('srcset') || img.attr('src') || '';
        if (cover.startsWith('data:image')) {
          cover = img.attr('data-src') || img.attr('data-lazy-src') || '';
        }
        if (cover && !cover.startsWith('http')) cover = `${this.baseUrl}${cover.startsWith('/') ? '' : '/'}${cover}`;

        const latestChapter = $(el).find('.epxs, .chapter, .adds .ep').first().text().trim() || 'Disponible';

        if (title && title.length > 1) {
          mangas.push({
            id: href.replace(/\/+$/, '').split('/').pop(),
            title,
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
            cover: cover || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
            latestChapter
          });
        }
      });

      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page: Number(page),
        totalPages: 1,
        mangas,
        hasNextPage: false
      };
    } catch (err) {
      console.warn('[MiauScan] Search error:', err.message);
      const list = this.getFallbackCatalog();
      const filtered = list.filter(m => m.title.toLowerCase().includes(query.toLowerCase()));
      return { success: true, extension: this.name, extensionId: this.id, page: 1, mangas: filtered, hasNextPage: false };
    }
  }

  async getMangaDetails(mangaUrl) {
    try {
      console.log(`[MiauScan] Obteniendo ficha real: ${mangaUrl}`);
      const res = await axios.get(mangaUrl, { headers: this.headers, timeout: 15000 });
      const $ = cheerio.load(res.data);

      const title = $('h1.entry-title, .lm4-title, h1').first().text().trim() || 'Manga MiauScan';
      
      let cover = $('.lm4-poster-image, .wp-post-image, .thumb img, .infox img').attr('src') ||
                  $('.lm4-poster-image, .wp-post-image, .thumb img, .infox img').attr('data-src') || '';
      if (cover && !cover.startsWith('http')) cover = `${this.baseUrl}${cover.startsWith('/') ? '' : '/'}${cover}`;

      let synopsis = $('.lm4-summary-short, .lm4-synopsis-card, .entry-content, .synopsis, .desc, .wd-full').first().text().trim();
      if (!synopsis || synopsis.length < 5) synopsis = 'Disfruta de esta serie en español en MiauScan.';

      const genres = [];
      $('.mgen a, .genres-content a, .seriestugenre a, a[href*="/genres/"], a[href*="/genero/"]').each((_, el) => {
        const g = $(el).text().trim();
        if (g && !genres.includes(g) && !['Manga', 'Capítulo', 'Admin', 'Inicio'].includes(g)) {
          genres.push(g);
        }
      });
      if (genres.length === 0) genres.push('Manhwa', 'Romance', 'Fantasía', 'Drama');

      const status = $('.lm4-poster-status, .status').first().text().trim() || 'En emisión';

      const chapters = [];
      const seen = new Set();
      $('ul.clstyle li, #chapterlist li, .eplister li, .lm4-chapter-card').each((_, li) => {
        const a = $(li).find('a').first();
        const href = a.attr('href');
        if (!href || seen.has(href)) return;
        seen.add(href);

        let rawTitle = a.attr('data-chapter-label') || a.attr('data-chapter-title') || $(li).find('.lm4-chapter-name, .chapternum').first().text() || a.text() || '';
        rawTitle = rawTitle.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

        // Extraer número limpio
        const numMatch = rawTitle.match(/Cap[^\d]*(\d+(\.\d+)?)/i) || href.match(/capitulo-(\d+(\.\d+)?)/i);
        const cleanNum = numMatch ? numMatch[1] : (num || `${chapters.length + 1}`);
        const cleanTitle = `Capítulo ${cleanNum}`;

        let date = $(li).find('.lm4-chapter-date, .chapterdate').first().text().trim() || '';
        if (!date) {
          const dateMatch = rawTitle.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
          date = dateMatch ? dateMatch[1] : 'Reciente';
        }

        // Detección precisa de capítulos bloqueados / de pago / VIP por parte del scan
        const isLocked = $(li).find('.fa-lock, .icon-lock, svg[data-icon="lock"], .chapter-lock, .lm4-chapter-lock, .is-locked, .vip-only').length > 0 ||
                         $(li).hasClass('is-locked') ||
                         $(li).hasClass('vip-only') ||
                         a.hasClass('is-locked') ||
                         a.attr('data-locked') === 'true' ||
                         href === '#' ||
                         href.includes('/pago-con-crypto/');

        chapters.push({
          id: `${mangaUrl.replace(/\/+$/, '').split('/').pop()}-cap-${cleanNum}`,
          name: cleanTitle,
          chapterNumber: String(cleanNum),
          url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
          date,
          isLocked,
          lockedReason: isLocked ? 'Capítulo bloqueado por el scan original (MiauScan). Requiere acceso VIP o pago en su web oficial.' : undefined
        });
      });

      return {
        id: mangaUrl.replace(/\/+$/, '').split('/').pop(),
        title,
        url: mangaUrl,
        cover: cover || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
        synopsis,
        status,
        genres,
        chapters: chapters.length > 0 ? chapters : [
          { name: 'Capítulo 1', chapterNumber: '1', url: `${mangaUrl}/1`, date: 'Reciente', isLocked: false }
        ]
      };
    } catch (err) {
      console.error('[MiauScan Error] getMangaDetails:', err.message);
      return {
        id: mangaUrl.split('/').pop(),
        title: 'MiauScan Serie',
        url: mangaUrl,
        cover: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
        synopsis: 'Manhua en español con alta calidad visual.',
        status: 'En emisión',
        genres: ['Manhwa', 'Fantasía', 'Romance'],
        chapters: [
          { name: 'Capítulo 1', chapterNumber: '1', url: `${mangaUrl}/1`, date: '2026-09-01', isLocked: false }
        ]
      };
    }
  }

  async extractChapter(chapterUrl) {
    try {
      console.log(`[MiauScan] Extrayendo páginas: ${chapterUrl}`);
      const res = await axios.get(chapterUrl, { headers: this.headers, timeout: 18000 });
      const html = res.data;
      const $ = cheerio.load(html);

      const title = $('h1, .entry-title, .reader-title').first().text().trim() || 'MiauScan';
      const pages = [];
      const seen = new Set();

      // 1. Extracción mediante ts_reader.run (Formato de alta velocidad)
      const tsMatch = html.match(/ts_reader\.run\((.*?)\);/s);
      if (tsMatch) {
        try {
          const json = JSON.parse(tsMatch[1]);
          const rawImages = json.sources?.[0]?.images || [];
          rawImages.forEach((imgUrl) => {
            if (imgUrl && !seen.has(imgUrl)) {
              seen.add(imgUrl);
              pages.push({
                index: pages.length + 1,
                url: this.normalizeUrl(imgUrl, chapterUrl)
              });
            }
          });
        } catch (e) {
          console.warn('[MiauScan] ts_reader parse warning:', e.message);
        }
      }

      // 2. Extracción fallback por etiquetas HTML si ts_reader no estaba presente
      if (pages.length === 0) {
        $('.lmis-reader-gallery img, #readerarea img, .reading-content img, .readerarea img').each((_, el) => {
          let src = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('srcset') || $(el).attr('src');
          if (src && !src.startsWith('data:image') && !seen.has(src)) {
            seen.add(src);
            pages.push({
              index: pages.length + 1,
              url: this.normalizeUrl(src, chapterUrl)
            });
          }
        });
      }

      // 3. Detección de capítulo bloqueado / paywalled
      if (pages.length === 0) {
        const isPaywall = /desbloquear|comprar|monedas|coins|vip|acceso exclusivo|bloqueado|inicia sesión/i.test(html);
        return {
          mangaTitle: title.split('—')[0].split('-')[0].trim() || 'MiauScan',
          chapterTitle: title,
          currentUrl: chapterUrl,
          totalPages: 0,
          pages: [],
          isLocked: true,
          lockedReason: isPaywall 
            ? 'Capítulo bloqueado por el scan original (MiauScan). Este contenido requiere monedas o cuenta VIP en su sitio web oficial.'
            : 'No se encontraron imágenes disponibles para este capítulo en la fuente original.'
        };
      }

      return {
        mangaTitle: title.split('—')[0].split('-')[0].trim() || 'MiauScan',
        chapterTitle: title,
        currentUrl: chapterUrl,
        totalPages: pages.length,
        pages,
        isLocked: false
      };
    } catch (err) {
      console.error('[MiauScan Error] extractChapter:', err.message);
      return {
        mangaTitle: 'MiauScan',
        chapterTitle: 'Capítulo',
        currentUrl: chapterUrl,
        totalPages: 0,
        pages: [],
        error: 'No se pudo conectar con el servidor de MiauScan.',
        isLocked: false
      };
    }
  }

  getFallbackCatalog() {
    return [
      {
        id: 'quiero-comerme-tus-guisantes',
        title: '!Quiero comerme tus guisantes!',
        url: 'https://leemiau.com/manga/quiero-comerme-tus-guisantes/',
        cover: 'https://leemiau.com/wp-content/uploads/2025/09/thumbnail-18-189x300.png',
        latestChapter: 'Capítulo 16'
      },
      {
        id: 'devorando-un-mundo-inmortal',
        title: 'Devorando un Mundo Inmortal',
        url: 'https://leemiau.com/manga/devorando-un-mundo-inmortal/',
        cover: 'https://leemiau.com/wp-content/uploads/2026/08/devorando-un-mundo-inmortal-portada.png',
        latestChapter: 'Capítulo 55'
      }
    ];
  }
}

export default MiauScanExtension;
