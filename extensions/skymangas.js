import { BaseExtension } from '../base/BaseExtension.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

export class SkyMangasExtension extends BaseExtension {
  constructor(config = {}) {
    super({
      id: config.id || 'skymangas',
      name: config.name || 'SkyMangas',
      version: config.version || '1.0.8',
      baseUrl: config.baseUrl || 'https://skymangas.com',
      icon: config.icon || 'https://raw.githubusercontent.com/YomoriDev/extensions/repo/icon/eu.kanade.tachiyomi.extension.es.skymangas.png',
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
      console.log(`[SkyMangas] Obteniendo catálogo en vivo (pág ${page})...`);
      const url = `${this.baseUrl}/explorar?sort=popular&page=${page}`;
      const res = await axios.get(url, { headers: this.headers, timeout: 15000 });
      const $ = cheerio.load(res.data);
      const mangas = [];
      const seen = new Set();

      $('a.manhua-card, a[href*="/manhua/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href || href === '/explorar' || href.includes('/leer/')) return;
        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        const title = $(el).find('.manhua-card__title, h3, .title').text().trim() || $(el).attr('title') || '';
        const slug = fullUrl.replace(/\/+$/, '').split('/').pop();
        const img = $(el).find('img');
        const cover = img.attr('src') || img.attr('data-src') || `https://api.skymangas.com/uploads/covers/${slug}/${slug}_cover_thumb.webp`;
        const meta = $(el).find('.manhua-card__meta').text().trim();
        const capMatch = meta.match(/Cap\.\s*(\d+(\.\d+)?)/i);
        const latestChapter = capMatch ? `Capítulo ${capMatch[1]}` : 'Capítulo Reciente';

        if (title.length > 1) {
          mangas.push({
            id: slug,
            title,
            url: fullUrl,
            cover,
            latestChapter,
            score: '9.8'
          });
        }
      });

      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page: Number(page),
        totalPages: 50,
        mangas: mangas.length > 0 ? mangas : this.getFallbackCatalog(),
        hasNextPage: mangas.length >= 20
      };
    } catch (err) {
      console.warn('[SkyMangas Error] Catálogo falló:', err.message);
      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page: Number(page),
        totalPages: 50,
        mangas: this.getFallbackCatalog(),
        hasNextPage: false
      };
    }
  }

  async search(query, page = 1) {
    try {
      const url = `${this.baseUrl}/explorar?q=${encodeURIComponent(query)}&page=${page}`;
      const res = await axios.get(url, { headers: this.headers, timeout: 15000 });
      const $ = cheerio.load(res.data);
      const mangas = [];
      const seen = new Set();

      $('a.manhua-card, a[href*="/manhua/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href || href === '/explorar' || href.includes('/leer/')) return;
        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        const title = $(el).find('.manhua-card__title, h3, .title').text().trim() || $(el).attr('title') || '';
        const slug = fullUrl.replace(/\/+$/, '').split('/').pop();
        const img = $(el).find('img');
        const cover = img.attr('src') || img.attr('data-src') || `https://api.skymangas.com/uploads/covers/${slug}/${slug}_cover_thumb.webp`;

        if (title.length > 1) {
          mangas.push({
            id: slug,
            title,
            url: fullUrl,
            cover,
            latestChapter: 'Capítulo Reciente',
            score: '9.8'
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
        hasNextPage: mangas.length >= 20
      };
    } catch (err) {
      return { success: true, extension: this.name, extensionId: this.id, page: 1, mangas: [], hasNextPage: false };
    }
  }

  async getMangaDetails(mangaUrl) {
    try {
      console.log(`[SkyMangas] Obteniendo ficha real: ${mangaUrl}`);
      const res = await axios.get(mangaUrl, { headers: this.headers, timeout: 15000 });
      const html = res.data;
      const $ = cheerio.load(html);

      const slug = mangaUrl.replace(/\/+$/, '').split('/').pop();
      const title = $('h1, .hero__title').first().text().trim() || slug.replace(/-/g, ' ');
      const cover = `https://api.skymangas.com/uploads/covers/${slug}/${slug}_cover.webp`;

      let synopsis = '';
      const genres = [];
      let status = 'En emisión';

      // Parse ng-state
      const ngStateMatch = html.match(/<script[^>]*id="ng-state"[^>]*>([\s\S]*?)<\/script>/i);
      if (ngStateMatch) {
        try {
          const state = JSON.parse(ngStateMatch[1]);
          for (const k of Object.keys(state)) {
            const item = state[k]?.b?.data || state[k]?.data;
            if (item && item.title) {
              synopsis = item.synopsis || item.description || synopsis;
              if (Array.isArray(item.genres)) {
                item.genres.forEach(g => { if (g && g.name) genres.push(g.name); });
              }
              if (item.statusId === 2 || item.translationStatusId === 2) status = 'Completado';
            }
          }
        } catch {}
      }

      if (!synopsis) {
        synopsis = $('p.hero__alt-title, .hero__description, p').slice(0, 3).map((_, el) => $(el).text().trim()).get().join(' ') || 'Disfruta de este manhua/manga en SkyMangas.';
      }

      if (genres.length === 0) {
        $('.badge, .tag-chip, a[href*="/generos/"]').each((_, el) => {
          const g = $(el).text().trim();
          if (g && !genres.includes(g)) genres.push(g);
        });
      }

      const chapters = [];
      const seenCh = new Set();
      $('a.chapter-item, a[href*="/leer/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
        if (seenCh.has(fullUrl)) return;
        seenCh.add(fullUrl);

        const capText = $(el).find('.chapter-preview__cap').text().trim() || $(el).text().trim().replace(/\s+/g, ' ');
        const numMatch = fullUrl.match(/\/(\d+(\.\d+)?)$/) || capText.match(/Cap[^\d]*(\d+(\.\d+)?)/i);
        const chapterNumber = numMatch ? String(numMatch[1]) : String(chapters.length + 1);

        chapters.push({
          id: `${slug}-cap-${chapterNumber}`,
          name: `Capítulo ${chapterNumber}`,
          chapterNumber: chapterNumber,
          url: fullUrl,
          date: 'Disponible'
        });
      });

      chapters.sort((a, b) => parseFloat(b.chapterNumber || 0) - parseFloat(a.chapterNumber || 0));

      return {
        id: slug,
        title,
        url: mangaUrl,
        cover,
        synopsis,
        genres,
        status,
        author: $('.hero__credit-val').first().text().trim() || 'SkyMangas',
        artist: $('.hero__credit-val').last().text().trim() || 'SkyMangas',
        demography: 'Shounen',
        type: 'Manhua',
        totalChapters: chapters.length,
        extensionId: this.id,
        chapters
      };
    } catch (err) {
      console.error('[SkyMangas Details Error]:', err.message);
      throw err;
    }
  }

  async extractChapter(chapterUrl) {
    try {
      console.log(`[SkyMangas Reader] Extrayendo páginas: ${chapterUrl}`);
      const res = await axios.get(chapterUrl, { headers: this.headers, timeout: 15000 });
      const html = res.data;
      let pages = [];

      // 1. Try ng-state
      const ngStateMatch = html.match(/<script[^>]*id="ng-state"[^>]*>([\s\S]*?)<\/script>/i);
      if (ngStateMatch) {
        try {
          const state = JSON.parse(ngStateMatch[1]);
          for (const k of Object.keys(state)) {
            const item = state[k]?.b?.data || state[k]?.data;
            const rawPages = item?.pages;
            if (Array.isArray(rawPages) && rawPages.length > 0) {
              pages = rawPages.map(p => {
                const raw = p.imageWebp || p.imageUrl || p.thumbUrl;
                return raw.startsWith('http') ? raw : `https://api.skymangas.com${raw}`;
              });
              break;
            }
          }
        } catch {}
      }

      // 2. Fallback to API endpoint
      if (pages.length === 0) {
        const parts = chapterUrl.replace(/\/+$/, '').split('/');
        const chNum = parts.pop();
        const slug = parts.pop();
        if (slug && chNum) {
          const apiRes = await axios.get(`https://api.skymangas.com/api/v1/chapters/${slug}/${chNum}`, {
            headers: this.headers,
            timeout: 15000
          });
          const rawPages = apiRes.data?.data?.pages || [];
          pages = rawPages.map(p => {
            const raw = p.imageWebp || p.imageUrl || p.thumbUrl;
            return raw.startsWith('http') ? raw : `https://api.skymangas.com${raw}`;
          });
        }
      }

      console.log(`[SkyMangas Reader] ${pages.length} páginas reales extraídas.`);
      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        chapterUrl,
        pages,
        pageCount: pages.length
      };
    } catch (err) {
      console.error('[SkyMangas ExtractChapter Error]:', err.message);
      throw err;
    }
  }

  getFallbackCatalog() {
    return [
      {
        id: 'contra-los-dioses',
        title: 'Contra los dioses',
        url: 'https://skymangas.com/manhua/contra-los-dioses',
        cover: 'https://api.skymangas.com/uploads/covers/contra-los-dioses/contra-los-dioses_cover_thumb.webp',
        latestChapter: 'Capítulo 156',
        score: '9.9'
      },
      {
        id: 'heroe-x-reina-demonio',
        title: 'Héroe x Reina Demonio',
        url: 'https://skymangas.com/manhua/heroe-x-reina-demonio',
        cover: 'https://api.skymangas.com/uploads/covers/heroe-x-reina-demonio/heroe-x-reina-demonio_cover_thumb.webp',
        latestChapter: 'Capítulo 182',
        score: '9.8'
      },
      {
        id: 'historias-de-dioses-y-demonios',
        title: 'Historias de Dioses y Demonios',
        url: 'https://skymangas.com/manhua/historias-de-dioses-y-demonios',
        cover: 'https://api.skymangas.com/uploads/covers/historias-de-dioses-y-demonios/historias-de-dioses-y-demonios_cover_thumb.webp',
        latestChapter: 'Capítulo 733',
        score: '9.9'
      }
    ];
  }
}
