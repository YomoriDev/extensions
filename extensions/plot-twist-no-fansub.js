import { BaseExtension } from '../base/BaseExtension.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import os from 'os';

puppeteer.use(StealthPlugin());

export class PlotTwistExtension extends BaseExtension {
  constructor(config = {}) {
    super({
      id: config.id || 'plot-twist-no-fansub',
      name: config.name || 'Plot Twist No Fansub',
      version: config.version || '3.0.0',
      baseUrl: config.baseUrl || 'https://plotnofansub.com',
      icon: config.icon || 'https://plotnofansub.com/wp-content/uploads/2021/04/cropped-logo-192x192.png',
      lang: config.lang || 'es'
    });
    this.plotBrowser = null;
    this.plotPage = null;
    this.isLaunching = false;
    this.sitePageCache = new Map();
    global.plotTwistExtensionInstance = this;
  }

  async getPage() {
    if (!this.plotBrowser || !this.plotBrowser.connected) {
      if (this.isLaunching) {
        while (this.isLaunching) {
          await new Promise(r => setTimeout(r, 100));
        }
        if (this.plotBrowser && this.plotBrowser.connected) {
          return this.plotPage;
        }
      }

      this.isLaunching = true;
      try {
        const profileDir = path.join(os.tmpdir(), `plot_twist_${process.pid}`);
        this.plotBrowser = await puppeteer.launch({
          executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          headless: false,
          userDataDir: profileDir,
          defaultViewport: null,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=-2400,-2400',
            '--window-size=1280,800'
          ]
        });
        const pages = await this.plotBrowser.pages();
        this.plotPage = pages.length > 0 ? pages[0] : await this.plotBrowser.newPage();
      } finally {
        this.isLaunching = false;
      }
    }
    return this.plotPage;
  }

  async ensureCookies() {
    try {
      const page = await this.getPage();
      const cookies = await page.cookies();
      if (cookies && cookies.length > 0) {
        global.plotTwistCookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        global.plotTwistUserAgent = await page.evaluate(() => navigator.userAgent);
      }
    } catch (e) {}
  }

  async fetchHtml(url) {
    try {
      const page = await this.getPage();
      console.log(`[PlotTwist] Navegando a: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });

      for (let i = 0; i < 8; i++) {
        const title = await page.title();
        if (!title.includes('Just a moment') && !title.includes('Cloudflare') && title.length > 0) {
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      await page.waitForSelector('.page-content-listing, .page-item-detail, .c-tabs-item__content, article, img', { timeout: 8000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1000));

      const cookies = await page.cookies();
      if (cookies && cookies.length > 0) {
        global.plotTwistCookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        global.plotTwistUserAgent = await page.evaluate(() => navigator.userAgent);
      }

      return await page.content();
    } catch (err) {
      console.warn(`[PlotTwist] Fetch error en ${url}:`, err.message);
      return null;
    }
  }

  cleanChapterText(rawText) {
    if (!rawText) return 'Disponible';
    const match = rawText.match(/(\d+(\.\d+)?\s*cap[íi]tulos?|\d+\s*oneshot|oneshot)/i);
    if (match) return match[0];
    return 'Disponible';
  }

  async fetchSitePage(pageNumber) {
    if (this.sitePageCache && this.sitePageCache.has(pageNumber)) {
      const cached = this.sitePageCache.get(pageNumber);
      if (Date.now() - cached.time < 300000) {
        return cached.mangas;
      }
    }

    const targetUrl = Number(pageNumber) === 1 
      ? `${this.baseUrl}/biblioteca3/` 
      : `${this.baseUrl}/biblioteca3/page/${pageNumber}/`;

    console.log(`[PlotTwist] Descargando página del sitio ${pageNumber}: ${targetUrl}`);
    const html = await this.fetchHtml(targetUrl);
    if (!html) return [];

    const $ = cheerio.load(html);
    const mangas = [];
    const seen = new Set();

    $('.page-content-listing .page-item-detail, .page-content-listing figure, .page-item-detail, article, .c-tabs-item__content, .page-listing-item, .page-content-listing > div').each((_, el) => {
      const a = $(el).find('a').first();
      const href = a.attr('href');
      if (!href || href === '#' || href.includes('javascript') || seen.has(href)) return;
      seen.add(href);

      const img = $(el).find('img').first();
      const title = a.attr('title') || img.attr('alt') || $(el).find('h3, h4, h5, .title, .post-title').first().text().trim();
      let cover = img.attr('data-src') || img.attr('src') || '';
      if (cover && !cover.startsWith('http')) cover = `${this.baseUrl}${cover.startsWith('/') ? '' : '/'}${cover}`;

      const rawChapter = $(el).find('.chapter, [class*="chapter"], span:contains("capítulo"), span:contains("capítulos"), span:contains("oneshot")').first().text().trim();
      const latestChapter = this.cleanChapterText(rawChapter);

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

    if (!this.sitePageCache) this.sitePageCache = new Map();
    if (mangas.length > 0) {
      this.sitePageCache.set(pageNumber, { time: Date.now(), mangas });
    }
    return mangas;
  }

  async getCatalog(appPage = 1, filters = {}) {
    try {
      const page = Math.max(1, Number(appPage) || 1);
      const PAGE_SIZE = 15; // Exactamente 15 mangas para llenar 3 filas completas de 5 columnas (sin huecos vacíos)
      const SITE_PAGE_SIZE = 12;
      const TOTAL_SITE_PAGES = 21;
      const TOTAL_APP_PAGES = Math.ceil((TOTAL_SITE_PAGES * SITE_PAGE_SIZE) / PAGE_SIZE); // 17

      const startIndex = (page - 1) * PAGE_SIZE;
      const endIndex = page * PAGE_SIZE;

      const startSitePage = Math.floor(startIndex / SITE_PAGE_SIZE) + 1;
      const endSitePage = Math.min(TOTAL_SITE_PAGES, Math.floor((endIndex - 1) / SITE_PAGE_SIZE) + 1);

      console.log(`[PlotTwist] Obteniendo catálogo App pág ${page} (15 mangas) -> Páginas sitio ${startSitePage} a ${endSitePage}...`);

      const allAccumulatedMangas = [];
      for (let sp = startSitePage; sp <= endSitePage; sp++) {
        const pageMangas = await this.fetchSitePage(sp);
        if (pageMangas && pageMangas.length > 0) {
          allAccumulatedMangas.push(...pageMangas);
        }
      }

      const offsetInFirstSitePage = startIndex - ((startSitePage - 1) * SITE_PAGE_SIZE);
      const slicedMangas = allAccumulatedMangas.slice(offsetInFirstSitePage, offsetInFirstSitePage + PAGE_SIZE);

      console.log(`[PlotTwist] Mangas calculados para pág ${page}: ${slicedMangas.length}`);

      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page,
        totalPages: TOTAL_APP_PAGES,
        mangas: slicedMangas.length > 0 ? slicedMangas : this.getFallbackCatalog(),
        hasNextPage: page < TOTAL_APP_PAGES && slicedMangas.length > 0
      };
    } catch (err) {
      console.warn('[PlotTwist Error] getCatalog:', err.message);
      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page: Number(appPage),
        totalPages: 17,
        mangas: this.getFallbackCatalog(),
        hasNextPage: false
      };
    }
  }

  async search(query, page = 1) {
    try {
      console.log(`[PlotTwist] Buscando: "${query}"...`);
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
      const html = await this.fetchHtml(searchUrl);

      if (html) {
        const $ = cheerio.load(html);
        const mangas = [];
        const seen = new Set();

        $('.c-tabs-item__content, .page-item-detail, .search-wrap .row > div, .page-content-listing > div').each((_, el) => {
          const a = $(el).find('a').first();
          const href = a.attr('href');
          if (!href || seen.has(href)) return;
          seen.add(href);

          const img = $(el).find('img').first();
          const title = $(el).find('.post-title, h3, h4, .title').first().text().trim() || a.attr('title') || img.attr('alt') || '';
          let cover = img.attr('data-src') || img.attr('src') || '';
          if (cover && !cover.startsWith('http')) cover = `${this.baseUrl}${cover.startsWith('/') ? '' : '/'}${cover}`;

          const rawChapter = $(el).find('.chapter, [class*="chapter"]').first().text().trim();
          const latestChapter = this.cleanChapterText(rawChapter);

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

        if (mangas.length > 0) {
          return {
            success: true,
            extension: this.name,
            extensionId: this.id,
            page: Number(page),
            totalPages: 1,
            mangas,
            hasNextPage: false
          };
        }
      }
    } catch (err) {
      console.warn('[PlotTwist Error] search:', err.message);
    }

    const list = this.getFallbackCatalog();
    const filtered = list.filter(m => m.title.toLowerCase().includes(query.toLowerCase()));
    return { success: true, extension: this.name, extensionId: this.id, page: 1, mangas: filtered, hasNextPage: false };
  }

  async getMangaDetails(mangaUrl) {
    try {
      console.log(`[PlotTwist] Obteniendo ficha completa: ${mangaUrl}`);
      const page = await this.getPage();
      await page.goto(mangaUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

      for (let i = 0; i < 8; i++) {
        const title = await page.title();
        if (!title.includes('Just a moment') && !title.includes('Cloudflare') && title.length > 0) {
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      await page.waitForSelector('#mn-detail-chapter-list, .mn-detail-chapter-item, h1', { timeout: 8000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1000));

      // Cargar todas las páginas de capítulos vía AJAX si existe el botón "Cargar más"
      const fullHtml = await page.evaluate(async () => {
        const loadMoreBtn = document.getElementById('mn-detail-load-more');
        if (!loadMoreBtn) return document.body.innerHTML;

        const mangaId = loadMoreBtn.dataset.manga || (window.manga && window.manga.manga_id);
        if (!mangaId) return document.body.innerHTML;

        const chapterList = document.getElementById('mn-detail-chapter-list');
        let pageNum = 1;
        let hasMore = true;

        while (hasMore && pageNum <= 50) {
          const formData = new FormData();
          formData.append('action', 'plot_load_chapters');
          formData.append('manga_id', mangaId);
          formData.append('page', pageNum);

          try {
            const res = await fetch('https://plotnofansub.com/wp-admin/admin-ajax.php', {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            if (data.success && data.data.html) {
              chapterList.insertAdjacentHTML('beforeend', data.data.html);
              hasMore = !!data.data.has_more;
              pageNum++;
            } else {
              hasMore = false;
            }
          } catch (e) {
            hasMore = false;
          }
        }

        return document.body.innerHTML;
      });

      const $ = cheerio.load(fullHtml);
      const title = $('h1.mn-detail-title, h1').first().text().trim() || 'Manga Plot Twist';
      
      let cover = $('.mn-detail-cover img, .mn-detail-cover-frame img, .summary_image img, .tab-summary img').first().attr('src') ||
                  $('.mn-detail-cover img, .mn-detail-cover-frame img, .summary_image img, .tab-summary img').first().attr('data-src') || '';
      if (cover && !cover.startsWith('http')) cover = `${this.baseUrl}${cover.startsWith('/') ? '' : '/'}${cover}`;

      let synopsis = $('#mn-detail-synopsis, .mn-detail-synopsis, .description-summary, .summary__content').first().text().trim();
      if (!synopsis || synopsis.length < 5) synopsis = 'Disfruta de este manga traducido al español por Plot Twist No Fansub.';

      const genres = [];
      $('.mn-detail-genres a, .genres-content a, a[href*="/genero/"]').each((_, el) => {
        const g = $(el).text().trim();
        if (g && !genres.includes(g) && !['Manga', 'Capítulo', 'Admin', 'Inicio'].includes(g)) {
          genres.push(g);
        }
      });
      if (genres.length === 0) genres.push('Manga', 'Romance', 'Comedia', 'Shounen');

      const status = $('.mn-detail-inner:contains("Estado") span, .post-status .summary-content, .status').first().text().trim() || 'En emisión';

      const chapters = [];
      const seen = new Set();
      
      // Parsear capítulos con selectores estructurados
      $('.mn-detail-chapter-item, a[href*="/manga/"]').each((_, a) => {
        const href = $(a).attr('href');
        if (!href || href === mangaUrl || href === `${mangaUrl}/` || seen.has(href)) return;
        
        if (href.startsWith(mangaUrl) || href.includes(mangaUrl.replace(this.baseUrl, ''))) {
          seen.add(href);

          const num = $(a).find('.mn-detail-chapter-name').text().trim() || href.replace(/\/+$/, '').split('/').pop() || '';
          const sub = $(a).find('.mn-detail-chapter-extend').text().trim();
          const date = $(a).find('.mn-detail-chapter-date').text().trim() || 'Reciente';

          let name = $(a).text().trim().replace(/\s+/g, ' ');
          if (num) {
            name = sub ? `Capítulo ${num}: ${sub}` : `Capítulo ${num}`;
          }

          if (num && num !== 'manga' && !['Primer capítulo', 'Último capítulo'].includes(name)) {
            chapters.push({
              name: name,
              chapterNumber: String(num),
              url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
              date: date,
              isLocked: false
            });
          }
        }
      });

      console.log(`[PlotTwist] Total de capítulos extraídos para "${title}": ${chapters.length}`);

      return {
        id: mangaUrl.replace(/\/+$/, '').split('/').pop(),
        title,
        url: mangaUrl,
        cover: cover || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
        synopsis,
        status,
        genres,
        chapters: chapters.length > 0 ? chapters : [
          { name: 'Capítulo 1', chapterNumber: '1', url: `${mangaUrl}1/`, date: 'Reciente', isLocked: false }
        ]
      };
    } catch (err) {
      console.error('[PlotTwist Error] getMangaDetails:', err.message);
      return {
        id: mangaUrl.split('/').pop(),
        title: 'Plot Twist Manga',
        url: mangaUrl,
        cover: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
        synopsis: 'Manga en español de alta calidad traducido por Plot Twist No Fansub.',
        status: 'En emisión',
        genres: ['Manga', 'Romance', 'Comedia'],
        chapters: [
          { name: 'Capítulo 1', chapterNumber: '1', url: `${mangaUrl}1/`, date: '2026-09-01', isLocked: false }
        ]
      };
    }
  }

  async extractChapter(chapterUrl) {
    try {
      console.log(`[PlotTwist] Extrayendo páginas: ${chapterUrl}`);
      const html = await this.fetchHtml(chapterUrl);
      if (!html) {
        throw new Error('No se pudo cargar el capítulo en el lector');
      }

      const $ = cheerio.load(html);
      const title = $('title').text().trim() || 'Plot Twist Reader';
      const pages = [];
      const seen = new Set();

      $('img.rd-pic, .reading-content img, .entry-content img, .page-break img, #readerarea img').each((_, el) => {
        let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
        if (src) {
          src = src.trim();
          if (!src.startsWith('data:image') && !src.includes('avatar') && !src.includes('logo') && !src.includes('banner') && !seen.has(src)) {
            if (!src.startsWith('http')) src = `${this.baseUrl}${src.startsWith('/') ? '' : '/'}${src}`;
            seen.add(src);
            pages.push({
              index: pages.length + 1,
              url: this.normalizeUrl(src, chapterUrl)
            });
          }
        }
      });

      return {
        mangaTitle: title.split('-')[0].trim() || 'Plot Twist',
        chapterTitle: title,
        currentUrl: chapterUrl,
        totalPages: pages.length,
        pages,
        isLocked: false
      };
    } catch (err) {
      console.error('[PlotTwist Error] extractChapter:', err.message);
      return {
        mangaTitle: 'Plot Twist',
        chapterTitle: 'Capítulo',
        currentUrl: chapterUrl,
        totalPages: 0,
        pages: [],
        error: 'No se pudo conectar con el servidor de Plot Twist.',
        isLocked: false
      };
    }
  }

  getFallbackCatalog() {
    return [
      {
        id: 'misterios-doncellas-y-desapariciones',
        title: 'Misterios, Doncellas y Desapariciones',
        url: 'https://plotnofansub.com/manga/misterios-doncellas-y-desapariciones/',
        cover: 'https://uploads.mangadex.org/covers/16a16845-90d1-4895-b2b8-4895624588c7/57840582-4d5b-4787-96e1-24411b82d195.jpg.512.jpg',
        latestChapter: '86 capítulos'
      },
      {
        id: 'gokurakugai',
        title: 'Gokurakugai',
        url: 'https://plotnofansub.com/manga/gokurakugai/',
        cover: 'https://uploads.mangadex.org/covers/40c058a2-430e-4ced-b663-369dcf38583f/2824eeb9-042d-4c1c-bb1f-584d1c5a047a.jpg.512.jpg',
        latestChapter: '41 capítulos'
      },
      {
        id: 'las-100-novias-que-te-quieren-mucho-mucho-mucho-mucho-mucho',
        title: 'Las 100 novias que te quieren mucho mucho mucho mucho mucho',
        url: 'https://plotnofansub.com/manga/las-100-novias-que-te-quieren-mucho-mucho-mucho-mucho-mucho/',
        cover: 'https://uploads.mangadex.org/covers/efb4278c-a761-406b-9d69-19603c5e4c8b/fd2c6a48-810e-4cb4-bd35-e90cef71e337.jpg.512.jpg',
        latestChapter: '296 capítulos'
      },
      {
        id: 'seitokai-ni-mo-ana-wa-aru',
        title: 'Seitokai ni mo Ana wa Aru!',
        url: 'https://plotnofansub.com/manga/seitokai-ni-mo-ana-wa-aru/',
        cover: 'https://uploads.mangadex.org/covers/822c9883-385c-4fd0-9523-16e7789cbeae/413e7df9-e4cc-4fcd-887f-a7bbafc1846e.jpg.512.jpg',
        latestChapter: '184 capítulos'
      },
      {
        id: 'boku-no-kokoro-no-yabai-yatsu',
        title: 'Boku no Kokoro no Yabai Yatsu',
        url: 'https://plotnofansub.com/manga/boku-no-kokoro-no-yabai-yatsu/',
        cover: 'https://uploads.mangadex.org/covers/4911120a-723f-4c36-af98-00dc2b7b2f76/6f2b8615-e93d-4352-866b-04ed7dd831c1.jpg.512.jpg',
        latestChapter: '302 capítulos'
      }
    ];
  }
}

export default PlotTwistExtension;
