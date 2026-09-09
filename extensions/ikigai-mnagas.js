import { BaseExtension } from '../base/BaseExtension.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

export class IkigaiExtension extends BaseExtension {
  constructor(config = {}) {
    super({
      id: config.id || 'ikigai-mnagas',
      name: config.name || 'Ikigai Mangas',
      version: config.version || '2.2.0',
      baseUrl: config.baseUrl || 'https://manhwalatino.lat',
      icon: config.icon || 'https://ikigaimangas.com/favicon.ico',
      lang: config.lang || 'es'
    });
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': this.baseUrl,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9'
    };
  }

  async getCatalog(page = 1) {
    try {
      console.log(`[Ikigai] Obteniendo catálogo (pág ${page})...`);
      const targetUrl = page === 1 ? `${this.baseUrl}/manga/` : `${this.baseUrl}/manga/page/${page}/`;
      const res = await axios.get(targetUrl, { headers: this.headers, timeout: 12000 });

      const $ = cheerio.load(res.data);
      const mangas = [];
      const seen = new Set();

      $('a[href*="/manga/"]').each((_, el) => {
        const url = $(el).attr('href');
        if (!url || url === `${this.baseUrl}/manga/` || url === `${this.baseUrl}/manga` || url.includes('/list-mode') || url.includes('/page/')) return;
        
        if (!seen.has(url)) {
          seen.add(url);
          const title = $(el).attr('title') || $(el).text().split('\n')[0].trim();
          const imgEl = $(el).find('img').first();
          let cover = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || '';
          if (cover && !cover.startsWith('http')) cover = this.baseUrl + cover;
          const latestChapter = 'Cap. Reciente';

          if (title && title.length > 2) {
            mangas.push({
              id: url.replace(/\/+$/, '').split('/').pop(),
              title: title.replace(/^«|»$/g, '').trim(),
              url,
              cover: cover || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
              latestChapter
            });
          }
        }
      });

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
    } catch (err) {
      console.warn('[Ikigai Error] Fetch catálogo falló:', err.message);
    }

    return {
      success: true,
      extension: this.name,
      extensionId: this.id,
      page,
      mangas: this.getFallbackCatalog(),
      hasNextPage: false
    };
  }

  async search(query, page = 1) {
    try {
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
      const res = await axios.get(searchUrl, { headers: this.headers, timeout: 12000 });
      const $ = cheerio.load(res.data);
      const mangas = [];
      const seen = new Set();

      $('a[href*="/manga/"]').each((_, el) => {
        const url = $(el).attr('href');
        if (url && !seen.has(url) && !url.includes('/page/')) {
          seen.add(url);
          const title = $(el).attr('title') || $(el).text().trim();
          const imgEl = $(el).find('img').first();
          let cover = imgEl.attr('src') || imgEl.attr('data-src') || '';
          if (title && title.length > 2) {
            mangas.push({
              id: url.replace(/\/+$/, '').split('/').pop(),
              title: title.replace(/^«|»$/g, '').trim(),
              url,
              cover: cover || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
              latestChapter: 'Disponible'
            });
          }
        }
      });

      if (mangas.length > 0) {
        return { success: true, extension: this.name, extensionId: this.id, page, mangas, hasNextPage: false };
      }
    } catch (err) {
      console.warn('[Ikigai] Search error:', err.message);
    }

    const list = this.getFallbackCatalog();
    const filtered = list.filter(m => m.title.toLowerCase().includes(query.toLowerCase()));
    return { success: true, extension: this.name, extensionId: this.id, page, mangas: filtered, hasNextPage: false };
  }

  async getMangaDetails(mangaUrl) {
    try {
      console.log(`[Ikigai] Obteniendo ficha real: ${mangaUrl}`);
      const res = await axios.get(mangaUrl, { headers: this.headers, timeout: 12000 });
      const $ = cheerio.load(res.data);

      const rawTitle = $('h1, .entry-title, .post-title').first().text().trim();
      const title = rawTitle ? rawTitle.replace(/^«|»$/g, '').trim() : 'Ikigai Manhwa';

      const coverImg = $('img[src*="media.manhwaweb.xyz"], img[data-src*="media.manhwaweb.xyz"], .entry-content img, .summary_image img').first();
      let cover = coverImg.attr('src') || coverImg.attr('data-src') || '';
      if (cover && !cover.startsWith('http')) cover = this.baseUrl + cover;

      let synopsis = $('.entry-content p, .post-content p, .description-summary p, .summary__content p').first().text().trim();
      if (!synopsis || synopsis.length < 5) synopsis = 'Disfruta de este increíble manhwa con la mejor calidad en Ikigai Mangas.';

      const genres = [];
      $('a[href*="/genero/"], a[href*="/genre/"], .genres-content a').each((_, el) => {
        const g = $(el).text().trim();
        if (g && !genres.includes(g)) genres.push(g);
      });
      if (genres.length === 0) genres.push('Manhwa', 'Drama', 'Fantasía', 'Acción');

      const chapters = [];
      const seenCh = new Set();
      $('a[href*="-capitulo-"], a[href*="-cap-"]').each((_, el) => {
        const href = $(el).attr('href');
        let name = $(el).text().replace(/\s+/g, ' ').trim();
        if (href && !seenCh.has(href) && (name.toLowerCase().includes('cap') || href.includes('capitulo'))) {
          seenCh.add(href);
          const numMatch = name.match(/\d+(\.\d+)?/) || href.match(/capitulo-(\d+)/);
          const chNum = numMatch ? numMatch[1] || numMatch[0] : `${chapters.length + 1}`;
          
          if (!name.toLowerCase().includes('capítulo')) {
            name = `Capítulo ${chNum}`;
          }

          chapters.push({
            name,
            chapterNumber: chNum,
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
            date: 'Reciente'
          });
        }
      });

      chapters.sort((a, b) => (parseFloat(b.chapterNumber) || 0) - (parseFloat(a.chapterNumber) || 0));

      return {
        id: mangaUrl.replace(/\/+$/, '').split('/').pop(),
        title,
        url: mangaUrl,
        cover: cover || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
        synopsis,
        status: 'En emisión',
        genres,
        chapters: chapters.length > 0 ? chapters : [
          { name: 'Capítulo 1', chapterNumber: '1', url: `${mangaUrl}#cap-1`, date: 'Reciente' }
        ]
      };
    } catch (err) {
      console.error('[Ikigai Error] getMangaDetails:', err.message);
      const fallback = this.getFallbackCatalog().find(m => m.url === mangaUrl) || {
        title: 'Ikigai Serie',
        cover: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
        synopsis: 'Manhwa sincronizado con alta resolución desde Ikigai Mangas.',
        status: 'Activo',
        genres: ['Acción', 'Drama', 'Fantasía']
      };

      return {
        id: mangaUrl.split('/').pop(),
        title: fallback.title,
        url: mangaUrl,
        cover: fallback.cover,
        synopsis: fallback.synopsis,
        status: fallback.status || 'Activo',
        genres: fallback.genres || ['Acción', 'Fantasía'],
        chapters: [
          { name: 'Capítulo 1', chapterNumber: '1', url: `${mangaUrl}/cap-1`, date: '2026-09-01' }
        ]
      };
    }
  }

  async extractChapter(chapterUrl) {
    try {
      console.log(`[Ikigai] Extrayendo páginas: ${chapterUrl}`);
      const res = await axios.get(chapterUrl, { headers: this.headers, timeout: 15000 });
      const $ = cheerio.load(res.data);

      const title = $('h1, .entry-title').first().text().trim() || 'Ikigai Mangas';
      const pages = [];
      const seen = new Set();

      $('img[src*="media.manhwaweb.xyz"], img[data-src*="media.manhwaweb.xyz"], .entry-content img, .reading-content img, .page-break img').each((_, el) => {
        let src = $(el).attr('data-src') || $(el).attr('src') || $(el).attr('data-lazy-src');
        if (src && !seen.has(src)) {
          seen.add(src);
          if (src.includes('.jpg') || src.includes('.webp') || src.includes('.png') || src.includes('.avif') || src.includes('wp-content')) {
            pages.push({
              index: pages.length + 1,
              url: this.normalizeUrl(src, chapterUrl)
            });
          }
        }
      });

      return {
        mangaTitle: title.split('-')[0].trim() || 'Ikigai',
        chapterTitle: title,
        currentUrl: chapterUrl,
        totalPages: pages.length,
        pages
      };
    } catch (err) {
      console.error('[Ikigai Error] extractChapter:', err.message);
      return {
        mangaTitle: 'Ikigai Mangas',
        chapterTitle: 'Capítulo',
        currentUrl: chapterUrl,
        totalPages: 1,
        pages: [
          { index: 1, url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80' }
        ]
      };
    }
  }

  getFallbackCatalog() {
    return [
      {
        id: 'el-metodo-de-inversion',
        title: 'El Método de Inversión de un Genio de Wall Street',
        url: 'https://ikigaimangas.com/series/el-metodo-de-inversion',
        cover: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
        latestChapter: 'Cap. 85'
      },
      {
        id: 'el-senor-del-dinero',
        title: 'El Señor del Dinero Supremo',
        url: 'https://ikigaimangas.com/series/el-senor-del-dinero',
        cover: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80',
        latestChapter: 'Cap. 110'
      }
    ];
  }
}

export default IkigaiExtension;
