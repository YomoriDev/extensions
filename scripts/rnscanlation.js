// RN Scanlation Dynamic Source Script v2.1.1
// 429 (too many requests): repeat the request after the pause the site asks for.
async function getWithRetry(client, url, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.get(url);
    } catch (e) {
      const status = e && e.response && e.response.status;
      if (status !== 429 || attempt >= tries) throw e;
      const asked = parseInt((e.response.headers || {})['retry-after'] || '0', 10) * 1000;
      await new Promise(r => setTimeout(r, Math.min(Math.max(asked, 1500 * attempt), 10000)));
    }
  }
}

module.exports = {
  getPopular: async function (page, ctx) {
    const { client, baseUrl } = ctx;
    const url = `${baseUrl}/library?sort=views&page=${page}`;
    const res = await getWithRetry(client, url);
    const $ = ctx.cheerio.load(res.data);
    const mangas = [];

    $('.lib-grid a.comic-card, a[href*="/comics/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.includes('/random') || href === '/comics/' || href === `${baseUrl}/comics/`) return;

      const img = $(el).find('img').first();
      const title = $(el).find('p.leading-snug, p.line-clamp-2, p[class*="font-semibold"], .title, h2, h3, h4').first().text().trim() || img.attr('alt') || '';
      
      let cover = img.attr('data-src') || img.attr('src') || '';
      if (cover.startsWith('//')) cover = `https:${cover}`;
      else if (cover.startsWith('/')) cover = `${baseUrl}${cover}`;

      if (title && title.length > 1) {
        mangas.push({
          id: `rn_${href.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          sourceId: '1399856434765612500',
          title,
          url: href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`,
          thumbnailUrl: cover,
        });
      }
    });

    const hasNext = $('a.lib-page-btn--nav:last-child, a[rel="next"], .next').length > 0 || mangas.length >= 12;
    return { mangas, hasNextPage: hasNext };
  },

  getLatest: async function (page, ctx) {
    const { client, baseUrl } = ctx;
    const url = `${baseUrl}/library?sort=updated&page=${page}`;
    const res = await getWithRetry(client, url);
    const $ = ctx.cheerio.load(res.data);
    const mangas = [];

    $('.lib-grid a.comic-card, a[href*="/comics/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.includes('/random') || href === '/comics/' || href === `${baseUrl}/comics/`) return;

      const img = $(el).find('img').first();
      const title = $(el).find('p.leading-snug, p.line-clamp-2, p[class*="font-semibold"], .title, h2, h3, h4').first().text().trim() || img.attr('alt') || '';
      
      let cover = img.attr('data-src') || img.attr('src') || '';
      if (cover.startsWith('//')) cover = `https:${cover}`;
      else if (cover.startsWith('/')) cover = `${baseUrl}${cover}`;

      if (title && title.length > 1) {
        mangas.push({
          id: `rn_${href.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          sourceId: '1399856434765612500',
          title,
          url: href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`,
          thumbnailUrl: cover,
        });
      }
    });

    const hasNext = $('a.lib-page-btn--nav:last-child, a[rel="next"], .next').length > 0 || mangas.length >= 12;
    return { mangas, hasNextPage: hasNext };
  },

  search: async function (query, page, ctx) {
    const { client, baseUrl } = ctx;
    const url = `${baseUrl}/library?q=${encodeURIComponent(query)}&page=${page}`;
    const res = await getWithRetry(client, url);
    const $ = ctx.cheerio.load(res.data);
    const mangas = [];

    $('.lib-grid a.comic-card, a[href*="/comics/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.includes('/random') || href === '/comics/' || href === `${baseUrl}/comics/`) return;

      const img = $(el).find('img').first();
      const title = $(el).find('p.leading-snug, p.line-clamp-2, p[class*="font-semibold"], .title, h2, h3, h4').first().text().trim() || img.attr('alt') || '';
      
      let cover = img.attr('data-src') || img.attr('src') || '';
      if (cover.startsWith('//')) cover = `https:${cover}`;
      else if (cover.startsWith('/')) cover = `${baseUrl}${cover}`;

      if (title && title.length > 1) {
        mangas.push({
          id: `rn_${href.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          sourceId: '1399856434765612500',
          title,
          url: href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`,
          thumbnailUrl: cover,
        });
      }
    });

    return { mangas, hasNextPage: false };
  },

  getDetails: async function (manga, ctx) {
    const { client, baseUrl } = ctx;
    const res = await getWithRetry(client, manga.url);
    const $ = ctx.cheerio.load(res.data);

    const title = $('h1, .comic-title, .title').first().text().trim() || manga.title;

    // La portada real vive en /uploads/covers/<slug>/ (el logo, el banner y otras portadas no valen)
    const slug = manga.url.replace(/\/+$/, '').split('/').pop();
    let cover = '';
    $(`img[src*="/uploads/covers/${slug}/"], img[data-src*="/uploads/covers/${slug}/"]`).each((_, el) => {
      const c = $(el).attr('data-src') || $(el).attr('src') || '';
      if (!cover && c && !/\/banner[^/]*$/.test(c)) cover = c;
    });

    if (cover.startsWith('//')) cover = `https:${cover}`;
    else if (cover.startsWith('/')) cover = `${baseUrl}${cover}`;

    const description = $('div.comic-page-wrap p[class*=text-], p.description, .synopsis, .summary, p.leading-relaxed').first().text().trim();
    const genres = [];
    $('span.inline-flex.items-center.rounded, a[href*="genre="], a[href*="/genre/"], .badge').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g) && !['Manga', 'Capítulo', 'Admin', 'Inicio', 'Biblioteca'].includes(g)) {
        genres.push(g);
      }
    });

    let status = 'En emisión';
    const statusText = $('span.inline-flex.items-center.rounded').text().toLowerCase();
    if (statusText.includes('completado') || statusText.includes('finalizado')) status = 'Completado';

    return {
      title,
      thumbnailUrl: cover || manga.thumbnailUrl,
      description,
      genres,
      status,
    };
  },

  getChapters: async function (manga, ctx) {
    const { client, baseUrl } = ctx;
    const slug = manga.url.replace(/\/+$/, '').split('/').pop();
    const chapters = [];
    const seen = new Set();

    // Intentar endpoint directo paginado de capítulos si está disponible
    let page = 1;
    let totalPages = 1;
    do {
      try {
        const pageUrl = `${baseUrl}/comics/${slug}/chapters?page=${page}`;
        const pageResp = await getWithRetry(client, pageUrl);
        totalPages = parseInt(pageResp.headers['x-pages'] || '1', 10);
        const $p = ctx.cheerio.load(pageResp.data);

        $p('a[data-chapter-id], a[href*="/leer/"], a[href*="/read/"], a[href*="/capitulo/"], .chapter-item a').each((_, a) => {
          let href = $p(a).attr('href');
          if (!href || seen.has(href)) return;
          seen.add(href);
          if (href.startsWith('/')) href = `${baseUrl}${href}`;

          const numAttr = $p(a).attr('data-chapter-num') || '';
          const labelAttr = ($p(a).attr('data-chapter-label') || '').trim();
          const text = labelAttr || $p(a).text().trim();
          const numMatch = text.match(/(\d+(\.\d+)?)/);
          const chNum = numAttr || (numMatch ? numMatch[1] : String(chapters.length + 1));
          const name = labelAttr || (text && text !== href ? text : `Capítulo ${chNum}`);

          chapters.push({
            name,
            chapterNumber: parseFloat(chNum) || (chapters.length + 1),
            url: href,
          });
        });
        page++;
      } catch (e) {
        break;
      }
    } while (page <= totalPages && page <= 20);

    // Fallback: extraer desde el HTML de la propia ficha
    if (chapters.length === 0) {
      const res = await getWithRetry(client, manga.url);
      const $ = ctx.cheerio.load(res.data);
      $('a[data-chapter-id], a[href*="/leer/"], a[href*="/read/"], a[href*="/capitulo/"], .chapter-item a').each((_, a) => {
        let href = $(a).attr('href');
        if (!href || seen.has(href)) return;
        seen.add(href);
        if (href.startsWith('/')) href = `${baseUrl}${href}`;

        const numAttr = $(a).attr('data-chapter-num') || '';
        const labelAttr = ($(a).attr('data-chapter-label') || '').trim();
        const text = labelAttr || $(a).text().trim();
        const numMatch = text.match(/(\d+(\.\d+)?)/);
        const chNum = numAttr || (numMatch ? numMatch[1] : String(chapters.length + 1));
        const name = labelAttr || (text && text !== href ? text : `Capítulo ${chNum}`);

        chapters.push({
          name,
          chapterNumber: parseFloat(chNum) || (chapters.length + 1),
          url: href,
        });
      });
    }

    return chapters;
  },

  getPages: async function (chapter, ctx) {
    const { client, baseUrl } = ctx;
    // Delay de 200ms para evitar rate-limit HTTP 429
    const res = await getWithRetry(client, chapter.url);
    const $ = ctx.cheerio.load(res.data);
    const pages = [];
    const seen = new Set();

    $('img[src*="/uploads/pages/"], img[data-src*="/uploads/pages/"]').each((_, el) => {
      let src = $(el).attr('data-src') || $(el).attr('src') || $(el).attr('data-fallback') || '';
      if (src.startsWith('//')) src = `https:${src}`;
      else if (src.startsWith('/')) src = `${baseUrl}${src}`;

      if (src && !src.includes('logo') && !src.includes('banner') && !src.includes('avatar') && !src.includes('icon') && !seen.has(src)) {
        seen.add(src);
        pages.push({
          index: pages.length + 1,
          url: src,
        });
      }
    });

    return pages;
  }
};
