import { BaseExtension } from '../base/BaseExtension.js';
import { BrowserManager } from '../base/BrowserManager.js';

export class OlympusExtension extends BaseExtension {
  constructor(config = {}) {
    super({
      id: config.id || 'olympus-scanlation',
      name: config.name || 'Olympus Scanlation',
      version: config.version || '2.3.0',
      baseUrl: config.baseUrl || 'https://olympusxyz.com',
      icon: config.icon || 'https://olympusxyz.com/olympus-logo-96.webp',
      lang: config.lang || 'es'
    });
    this.libraryUrl = 'https://olympusxyz.com/series';
    this._cachedCatalog = null;
    this._lastCatalogFetch = 0;
  }

  /**
   * Obtiene la biblioteca completa de Olympus (867+ mangas)
   * Utiliza la API directa en paralelo con fallback a SSR y caché en memoria de 5 min.
   */
  async _fetchFullLibrary() {
    if (this._cachedCatalog && (Date.now() - this._lastCatalogFetch < 300000)) {
      return this._cachedCatalog;
    }

    try {
      console.log(`[OlympusExtension] Obteniendo biblioteca completa desde API de Olympus...`);
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `${this.baseUrl}/series`
      };

      const p1Res = await fetch(`${this.baseUrl}/api/series?page=1`, { headers });
      if (p1Res.ok) {
        const p1Json = await p1Res.json();
        const lastPage = p1Json.data?.series?.last_page || 1;
        const allRaw = [...(p1Json.data?.series?.data || [])];

        if (lastPage > 1) {
          const promises = [];
          for (let p = 2; p <= lastPage; p++) {
            promises.push(
              fetch(`${this.baseUrl}/api/series?page=${p}`, { headers })
                .then(r => r.json())
                .then(j => j.data?.series?.data || [])
                .catch(() => [])
            );
          }
          const batchResults = await Promise.all(promises);
          for (const batch of batchResults) {
            allRaw.push(...batch);
          }
        }

        const mangas = [];
        const seen = new Set();

        for (const item of allRaw) {
          if (item && item.slug && !seen.has(item.slug)) {
            seen.add(item.slug);
            const title = (item.name || '').trim().replace(/\s+/g, ' ');
            const slug = item.slug;
            const cover = item.cover || '';
            const chapterCount = item.chapter_count || 0;
            const type = item.type === 'comic' ? 'Manhwa' : (item.type || 'Manhwa');
            const views = item.total_views || item.monthly_views || 0;

            const status = item.status?.name || 'Activo';

            mangas.push({
              id: `comic-${slug}`,
              slug,
              title,
              url: `${this.baseUrl}/series/comic-${slug}`,
              cover,
              type,
              status,
              latestChapter: chapterCount ? `Cap. ${chapterCount}` : '',
              chapterCount: parseInt(chapterCount, 10) || 0,
              views: parseInt(views, 10) || 0,
              genres: (item.genres || []).map(g => typeof g === 'string' ? g : g.name).filter(Boolean)
            });
          }
        }

        if (mangas.length > 0) {
          this._cachedCatalog = mangas;
          this._lastCatalogFetch = Date.now();
          console.log(`[OlympusExtension] ✅ ${mangas.length} mangas procesados desde API exitosamente.`);
          return mangas;
        }
      }
    } catch (apiErr) {
      console.warn(`[OlympusExtension] Error en API directa, usando navegador SSR:`, apiErr.message);
    }

    // Fallback: Browser SSR
    let pageInstance = null;
    try {
      console.log(`[OlympusExtension] Fallback: cargando vía BrowserManager...`);
      const warm = await BrowserManager.createWarmPage({ headers: { 'Referer': this.baseUrl } });
      pageInstance = warm.page;

      await pageInstance.goto(this.libraryUrl, { waitUntil: ['domcontentloaded', 'networkidle2'], timeout: 30000 });
      await BrowserManager.autoScroll(pageInstance, 6, 120);

      const mangas = await pageInstance.evaluate((baseUrl) => {
        const result = [];
        const seen = new Set();

        const script = document.getElementById('__NUXT_DATA__');
        if (script) {
          try {
            const raw = JSON.parse(script.textContent);
            for (const item of raw) {
              if (item && typeof item === 'object' && typeof item.slug === 'number' && typeof item.name === 'number') {
                const name = raw[item.name];
                const slug = raw[item.slug];
                const cover = typeof item.cover === 'number' ? raw[item.cover] : item.cover;
                const chapterCount = typeof item.chapter_count === 'number' ? raw[item.chapter_count] : (item.chapter_count || 0);
                const type = typeof item.type === 'number' ? raw[item.type] : item.type;
                const views = typeof item.total_views === 'number' ? raw[item.total_views] : (item.total_views || 0);
                
                if (typeof name === 'string' && typeof slug === 'string' && !seen.has(slug)) {
                  seen.add(slug);
                  const cleanName = name.trim().replace(/\s+/g, ' ');
                  const url = `${baseUrl}/series/comic-${slug}`;
                  result.push({
                    id: `comic-${slug}`,
                    slug,
                    title: cleanName,
                    url,
                    cover: cover || '',
                    type: type ? (type === 'comic' ? 'Manhwa' : type) : 'Manhwa',
                    status: 'Activo',
                    latestChapter: chapterCount ? `Cap. ${chapterCount}` : '',
                    chapterCount: parseInt(chapterCount, 10) || 0,
                    views: parseInt(views, 10) || 0,
                    genres: []
                  });
                }
              }
            }
          } catch (e) {}
        }

        const links = Array.from(document.querySelectorAll('a[href*="/series/comic-"], a[href*="/series/"]'));
        for (const a of links) {
          const url = a.href;
          if (url && !url.endsWith('/series') && !url.endsWith('/series/')) {
            const id = url.split('/series/').pop().split('?')[0];
            const cleanSlug = id.replace(/^comic-/, '');

            if (!seen.has(id) && !seen.has(cleanSlug)) {
              seen.add(id);
              seen.add(cleanSlug);
              const img = a.querySelector('img');
              const titleElem = a.querySelector('h2, h3, h4, p, span, .title');
              
              let title = (titleElem ? titleElem.textContent : '') || (img ? img.alt : '') || a.textContent || '';
              title = title.trim().replace(/\s+/g, ' ');

              let cover = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';
              if (cover && !cover.startsWith('http')) cover = baseUrl + cover;

              const badgeElem = a.querySelector('.badge, .chapter, span[class*="chapter"]');
              const latestChapter = badgeElem ? badgeElem.textContent.trim() : '';

              if (title.length > 0 && !title.toLowerCase().includes('inicio') && !title.toLowerCase().includes('series')) {
                result.push({
                  id,
                  slug: cleanSlug,
                  title,
                  url,
                  cover,
                  type: 'Manhwa',
                  status: 'Activo',
                  latestChapter,
                  chapterCount: 1,
                  views: 0,
                  genres: []
                });
              }
            }
          }
        }

        return result;
      }, this.baseUrl);

      this._cachedCatalog = mangas;
      this._lastCatalogFetch = Date.now();
      return mangas;
    } finally {
      await BrowserManager.closePage(pageInstance);
    }
  }

  async getCatalog(page = 1, filters = {}) {
    try {
      const allMangas = await this._fetchFullLibrary();
      let filtered = [...allMangas];

      // Filtro de Estado
      if (filters.status && filters.status !== 'Ver todo') {
        const targetStatus = filters.status.toLowerCase().trim();
        filtered = filtered.filter(m => {
          if (!m.status) return false;
          const mStatus = m.status.toLowerCase().trim();
          if (targetStatus === 'activo' || targetStatus === 'en emisión') {
            return mStatus.includes('activo') || mStatus.includes('emisión');
          }
          if (targetStatus === 'finalizado' || targetStatus === 'completado') {
            return mStatus.includes('finalizado') || mStatus.includes('completado');
          }
          if (targetStatus.includes('pausa') || targetStatus.includes('hiatus')) {
            return mStatus.includes('pausa') || mStatus.includes('hiatus');
          }
          if (targetStatus.includes('cancel')) {
            return mStatus.includes('cancel');
          }
          if (targetStatus.includes('abandon')) {
            return mStatus.includes('abandon');
          }
          return mStatus.includes(targetStatus);
        });
      }

      // Filtro de Géneros
      if (filters.genres && filters.genres.length > 0) {
        const targetGenres = filters.genres.map(g => g.toLowerCase());
        filtered = filtered.filter(m => {
          const titleLower = m.title.toLowerCase();
          const genreMatch = (m.genres || []).some(g => targetGenres.some(tg => g.toLowerCase().includes(tg)));
          return genreMatch || targetGenres.some(g => titleLower.includes(g));
        });
      }

      // Ordenar por Popular o Reciente
      const sortMode = filters.sort || 'popular';
      if (sortMode === 'popular') {
        filtered.sort((a, b) => (b.views || b.chapterCount || 0) - (a.views || a.chapterCount || 0));
      }

      // Paginación simétrica de 35 mangas por página (exactamente 5x7 o 7x5 sin huecos vacíos)
      const pageSize = 35;
      const startIndex = (page - 1) * pageSize;
      const paginatedMangas = filtered.slice(startIndex, startIndex + pageSize);
      const hasNextPage = startIndex + pageSize < filtered.length;
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page,
        mangas: paginatedMangas,
        hasNextPage,
        totalPages,
        totalCount: filtered.length
      };
    } catch (err) {
      console.error('[OlympusExtension] Error en getCatalog:', err);
      return {
        success: false,
        extension: this.name,
        extensionId: this.id,
        page,
        mangas: [],
        hasNextPage: false,
        error: err.message
      };
    }
  }

  async search(query, page = 1) {
    try {
      console.log(`[OlympusExtension] Buscando "${query}" en la biblioteca completa...`);
      const allMangas = await this._fetchFullLibrary();
      const q = query.toLowerCase().trim();

      const matched = allMangas.filter(m => {
        const t = m.title.toLowerCase();
        const slug = (m.slug || m.id || '').toLowerCase();
        return t.includes(q) || slug.includes(q);
      });

      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        query,
        mangas: matched,
        hasNextPage: false
      };
    } catch (err) {
      console.error('[OlympusExtension] Error en búsqueda:', err);
      return {
        success: false,
        extension: this.name,
        extensionId: this.id,
        query,
        mangas: [],
        hasNextPage: false,
        error: err.message
      };
    }
  }

  async getMangaDetails(mangaUrl) {
    const rawSlug = (mangaUrl || '').replace(/\/+$/, '').split('/series/').pop() || '';
    let cleanSlug = rawSlug.replace(/^comic-/, '');
    
    let details = {
      title: cleanSlug.replace(/-/g, ' '),
      cover: '',
      synopsis: '',
      genres: [],
      status: 'En emisión'
    };

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': this.baseUrl
    };

    let targetSlug = cleanSlug;

    // 1. Obtener metadata desde el API directo (con auto-resolución de slug si devuelve 404)
    try {
      let metaRes = await fetch(`${this.baseUrl}/api/series/${cleanSlug}`, { headers });
      
      if (!metaRes.ok) {
        // Buscar en la biblioteca completa de Olympus por slug base o título
        const all = await this._fetchFullLibrary();
        const baseQuery = cleanSlug.split('-202')[0].replace(/-\d{8}.*$/, '').toLowerCase();
        const match = all.find(m => {
          const mSlug = (m.slug || '').toLowerCase();
          const mTitle = (m.title || '').toLowerCase();
          return mSlug.includes(baseQuery) || baseQuery.includes(mSlug.split('-202')[0]) || mTitle.includes(baseQuery.replace(/[-_]/g, ' '));
        });
        if (match && match.slug) {
          targetSlug = match.slug;
          metaRes = await fetch(`${this.baseUrl}/api/series/${targetSlug}`, { headers });
        }
      }

      if (metaRes.ok) {
        const metaJson = await metaRes.json();
        const d = metaJson.data;
        if (d) {
          details.title = d.name || details.title;
          details.cover = d.cover || details.cover;
          details.synopsis = d.summary || '';
          details.genres = (d.genres || []).map(g => typeof g === 'string' ? g : g.name).filter(Boolean);
          if (d.status?.name) {
            details.status = d.status.name === 'Activo' ? 'En emisión' : d.status.name;
          }
        }
      }
    } catch (e) {
      console.warn('[OlympusExtension] Error obteniendo metadata API:', e.message);
    }

    // 2. Obtener capítulos completos desde panel API
    let chapters = [];
    try {
      const apiUrl = `https://panel.olympusxyz.com/api/series/${targetSlug}/chapters`;
      let res = await fetch(`${apiUrl}?page=1`, { headers });
      if (res.status !== 200 && targetSlug !== rawSlug) {
        res = await fetch(`https://panel.olympusxyz.com/api/series/${rawSlug}/chapters?page=1`, { headers });
      }

      if (res.ok) {
        const p1Data = await res.json();
        const totalPages = p1Data.meta?.last_page || 1;
        const allItems = [...(p1Data.data || [])];

        if (totalPages > 1) {
          const promises = [];
          for (let p = 2; p <= Math.min(totalPages, 25); p++) {
            promises.push(
              fetch(`${apiUrl}?page=${p}`, { headers })
                .then(r => r.json())
                .then(d => d.data || [])
                .catch(() => [])
            );
          }
          const batchResults = await Promise.all(promises);
          for (const batch of batchResults) {
            allItems.push(...batch);
          }
        }

        chapters = allItems.map(item => {
          const chNum = item.name || '';
          const dateStr = item.published_at ? new Date(item.published_at).toLocaleDateString('es-ES') : '';
          return {
            id: `${item.id}`,
            name: `Capítulo ${chNum}`,
            chapterNumber: `${chNum}`,
            url: `${this.baseUrl}/capitulo/${item.id}/comic-${targetSlug}`,
            date: dateStr
          };
        });

        // Ordenar descendente (último capítulo primero)
        chapters.sort((a, b) => (parseFloat(b.chapterNumber) || 0) - (parseFloat(a.chapterNumber) || 0));
      }
    } catch (apiErr) {
      console.warn('[OlympusExtension] Panel API fallback:', apiErr.message);
    }

    // 3. Si falta metadata o capítulos, usar navegador como respaldo
    if (!details.synopsis || chapters.length === 0) {
      let pageInstance = null;
      try {
        console.log(`[OlympusExtension] Extrayendo ficha complementaria vía navegador: ${mangaUrl}`);
        const warm = await BrowserManager.createWarmPage({ headers: { 'Referer': this.baseUrl } });
        pageInstance = warm.page;

        await pageInstance.goto(mangaUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await new Promise(r => setTimeout(r, 600));

        const domDetails = await pageInstance.evaluate((baseUrl, currentUrl) => {
          const titleElem = document.querySelector('h1, h2.title, .title');
          let title = titleElem ? titleElem.textContent.trim() : document.title;
          title = title.replace(/\s+/g, ' ').replace(/^comic-/i, '');

          const coverElem = document.querySelector('img[src*="covers"], img[src*="comics"], .cover img, img[alt*="cover"]');
          let cover = coverElem ? (coverElem.src || coverElem.getAttribute('data-src') || '') : '';

          const synopsisElem = document.querySelector('p.sinopsis, div.sinopsis, p.description, div[class*="summary"] p, div[class*="synopsis"] p, article p');
          const synopsis = synopsisElem ? synopsisElem.textContent.trim() : '';

          const genreBadges = Array.from(document.querySelectorAll('a[href*="genero"], span[class*="badge"], div[class*="genre"] span, div[class*="tags"] span'));
          const genres = genreBadges.map(g => g.textContent.trim()).filter(g => g.length > 1 && g.length < 30);

          return { title, cover, synopsis, genres };
        }, this.baseUrl, mangaUrl);

        if (!details.synopsis) details.synopsis = domDetails.synopsis;
        if (details.genres.length === 0) details.genres = domDetails.genres;
        if (!details.cover) details.cover = domDetails.cover;

        if (chapters.length === 0) {
          chapters = await pageInstance.evaluate((baseUrl, currentUrl, rawSlug) => {
            const chapterLinks = Array.from(document.querySelectorAll('a[href*="/capitulo/"]'));
            const domCaps = [];
            const seen = new Set();
            for (const a of chapterLinks) {
              const url = a.href;
              if (url && !seen.has(url)) {
                seen.add(url);
                let name = a.textContent.trim().replace(/\s+/g, ' ');
                const numMatch = url.match(/capitulo\/(\d+)/);
                domCaps.push({
                  id: numMatch ? numMatch[1] : '1',
                  name: name || 'Capítulo 1',
                  chapterNumber: '1',
                  url,
                  date: ''
                });
              }
            }
            return domCaps;
          }, this.baseUrl, mangaUrl, rawSlug);
        }
      } catch (domErr) {
        console.warn('[OlympusExtension] Error en fallback DOM:', domErr.message);
      } finally {
        await BrowserManager.closePage(pageInstance);
      }
    }

    console.log(`[OlympusExtension] Ficha lista: "${details.title}" con ${chapters.length} capítulos.`);

    return {
      success: true,
      extension: this.name,
      extensionId: this.id,
      url: mangaUrl,
      ...details,
      chapters
    };
  }

  async extractChapter(chapterUrl) {
    try {
      console.log(`[OlympusExtension] Extracción rápida HTTP: ${chapterUrl}`);
      const res = await fetch(chapterUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': this.baseUrl
        },
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const html = await res.text();
        const scriptMatch = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
        if (scriptMatch) {
          const raw = JSON.parse(scriptMatch[1]);
          const images = [];
          const seen = new Set();
          for (const item of raw) {
            if (typeof item === 'string' && item.startsWith('http') && (item.includes('media') || item.includes('imagesolymp') || item.includes('comics')) && !item.includes('covers/') && !item.includes('avatar') && !item.includes('logo')) {
              if (!seen.has(item)) {
                seen.add(item);
                images.push(item);
              }
            }
          }

          if (images.length > 0) {
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            const pageTitle = titleMatch ? titleMatch[1].replace(/\s*\|\s*Olympus.*$/i, '').trim() : 'Capítulo';
            const pages = images.map((imgUrl, idx) => ({
              index: idx + 1,
              url: this.normalizeUrl(imgUrl, chapterUrl)
            }));

            console.log(`[OlympusExtension] Extracción HTTP instantánea completada con éxito: ${pages.length} páginas.`);
            return {
              success: true,
              extension: this.name,
              extensionId: this.id,
              mangaTitle: pageTitle,
              chapterTitle: pageTitle,
              currentUrl: chapterUrl,
              totalPages: pages.length,
              pages: pages,
              prevChapterUrl: null,
              nextChapterUrl: null
            };
          }
        }
      }
    } catch (fastErr) {
      console.warn('[OlympusExtension] Fast HTTP extract fallback a browser:', fastErr.message);
    }

    let pageInstance = null;
    try {
      console.log(`[OlympusExtension] Extrayendo páginas vía Navegador: ${chapterUrl}`);
      const warm = await BrowserManager.createWarmPage({ headers: { 'Referer': this.baseUrl } });
      pageInstance = warm.page;

      await pageInstance.goto(chapterUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await pageInstance.waitForSelector('img[src*="media"], img[src*="imagesolymp"], img[src*="comics"], img[src*="capitulo"], main img', { timeout: 6000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 800));
      await BrowserManager.autoScroll(pageInstance, 4, 100);

      const result = await pageInstance.evaluate((baseUrl) => {
        let pageTitle = document.title || 'Capítulo';
        let mangaTitle = '';

        const h1 = document.querySelector('h1, h2.chapter-title, .title');
        if (h1) mangaTitle = h1.textContent.trim();

        const allImgs = Array.from(document.querySelectorAll('img'));
        const images = [];
        const seen = new Set();

        for (const img of allImgs) {
          const src = img.getAttribute('data-src') || 
                      img.getAttribute('data-lazy-src') || 
                      img.getAttribute('src') || 
                      img.currentSrc;

          if (src && !src.startsWith('data:image')) {
            const isMedia = src.includes('media') || 
                            src.includes('imagesolymp') || 
                            src.includes('comics') || 
                            src.includes('capitulo') ||
                            src.includes('.webp') ||
                            src.includes('.jpg') ||
                            src.includes('.png');

            const isExcluded = src.includes('logo') || src.includes('avatar') || src.includes('icon');

            if (isMedia && !isExcluded && !seen.has(src)) {
              seen.add(src);
              images.push(src);
            }
          }
        }

        let prevUrl = null;
        let nextUrl = null;
        const navLinks = Array.from(document.querySelectorAll('a[href*="capitulo"], a.btn-nav, button[data-href]'));
        
        for (const link of navLinks) {
          const text = (link.textContent || '').toLowerCase();
          const href = link.getAttribute('href') || link.getAttribute('data-href');
          if (href && (text.includes('ant') || text.includes('prev') || link.classList.contains('prev'))) prevUrl = href;
          if (href && (text.includes('sig') || text.includes('next') || link.classList.contains('next'))) nextUrl = href;
        }

        return {
          mangaTitle: mangaTitle || pageTitle,
          chapterTitle: pageTitle,
          rawImages: images,
          prevUrl,
          nextUrl
        };
      }, this.baseUrl);

      const pages = (result.rawImages || []).map((imgUrl, index) => ({
        index: index + 1,
        url: this.normalizeUrl(imgUrl, chapterUrl)
      }));

      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        mangaTitle: result.mangaTitle,
        chapterTitle: result.chapterTitle,
        currentUrl: chapterUrl,
        totalPages: pages.length,
        pages: pages,
        prevChapterUrl: result.prevUrl ? this.normalizeUrl(result.prevUrl, chapterUrl) : null,
        nextChapterUrl: result.nextUrl ? this.normalizeUrl(result.nextUrl, chapterUrl) : null
      };
    } finally {
      await BrowserManager.closePage(pageInstance);
    }
  }
}

export default OlympusExtension;

