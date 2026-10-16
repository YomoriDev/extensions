// TMOHentai Dynamic Source Script v2.1.0
module.exports = {
  getChapters: async function (manga, ctx) {
    const idMatch = manga.url.match(/\/library\/[^/]+\/(\d+)/);
    const targetUrl = idMatch ? `https://tmohentai.app/view_uploads/${idMatch[1]}` : manga.url;
    return [{
      id: `${manga.sourceId}_ch_${manga.id}`,
      mangaId: manga.id,
      sourceId: manga.sourceId,
      name: 'Capítulo Completo',
      chapterNumber: 1,
      url: targetUrl,
      uploadDate: Date.now(),
    }];
  },

  getPages: async function (chapter, ctx) {
    const { client, parse, baseUrl } = ctx;
    let url = chapter.url;
    if (url.includes('/view_uploads/')) {
      const parts = url.split('/view_uploads/');
      url = `https://tmohentai.app/reader/${parts[1]}/cascade`;
    }
    const res = await client.get(url).catch(() => null);
    if (!res || !res.data) return [];
    const data = typeof res.data === 'string' ? res.data : '';
    const root = parse(data);
    const imgElements = root.querySelectorAll(
      '.reader-img-wrap img, .reader-area img, .reader-container img, #reader-container img, img[src*="/i/"], img[data-src*="/i/"], img[src*="storage"], img[data-src*="storage"]'
    );
    const pages = [];
    const seenUrls = new Set();

    for (const el of imgElements) {
      const rawSrc = el.getAttribute('data-src') || el.getAttribute('src') || el.getAttribute('data-original') || '';
      if (!rawSrc || rawSrc.includes('avatar') || rawSrc.includes('logo') || rawSrc.includes('icon') || rawSrc.includes('banner')) continue;
      const fullSrc = rawSrc.startsWith('http') ? rawSrc : `${baseUrl}${rawSrc.startsWith('/') ? '' : '/'}${rawSrc}`;
      if (!seenUrls.has(fullSrc)) {
        seenUrls.add(fullSrc);
        pages.push({
          index: pages.length,
          url: fullSrc,
          imageUrl: fullSrc,
          headers: { 'Referer': 'https://tmohentai.app/' },
        });
      }
    }
    if (pages.length > 0) return pages;

    const regex = /https?:\/\/(?:storage\d?\.tmohentai\.app|tmohentai\.app)\/(?:mangas\/[^\s"'<>\\]+\/\d+\.(?:webp|jpg|jpeg|png|gif)|i\/[^\s"'<>\\]+)/gi;
    let match;
    while ((match = regex.exec(data)) !== null) {
      const fullSrc = match[0];
      if (!seenUrls.has(fullSrc)) {
        seenUrls.add(fullSrc);
        pages.push({
          index: pages.length,
          url: fullSrc,
          imageUrl: fullSrc,
          headers: { 'Referer': 'https://tmohentai.app/' },
        });
      }
    }
    return pages;
  }
};
