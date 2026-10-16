// Manga Crab Dynamic Source Script v2.1.0
module.exports = {
  getChapters: async function (manga, ctx) {
    const { client, baseUrl } = ctx;
    try {
      let rawId = '';
      const cleanId = manga.id.replace(new RegExp(`^${manga.sourceId}_`), '');
      const parts = cleanId.split('_');
      if (/^\d+$/.test(parts[0])) {
        rawId = parts[0];
      }

      if (!rawId && manga.url) {
        const idMatch = manga.url.match(/\/series\/(\d+)/);
        if (idMatch) rawId = idMatch[1];
      }

      if (!rawId) {
        const titleOrSlug = manga.title || (manga.url ? manga.url.split('/').pop() : '');
        if (titleOrSlug) {
          const sRes = await client.get(`/api/mv/mangas?search=${encodeURIComponent(titleOrSlug)}&page=1&per_page=10`).catch(() => null);
          const first = sRes?.data?.items?.[0];
          if (first && first.id) rawId = String(first.id);
        }
      }

      if (!rawId) return [];

      const chRes = await client.get(`/api/mv/mangas/${rawId}/chapters?per_page=1000`);
      const items = chRes.data?.items || [];
      const chapters = [];

      items.forEach(ch => {
        const chapterSlug = ch.chapter_slug || `capitulo-${ch.index}`;
        const chapterTitle = (ch.title || ch.label || `Capítulo ${ch.index}`).trim();
        const chNumber = ch.number ? parseFloat(ch.number) : parseFloat(chapterSlug.replace(/[^0-9.]/g, '')) || 0;

        chapters.push({
          id: `${manga.sourceId}_ch_${rawId}_${chapterSlug}`,
          mangaId: manga.id,
          sourceId: manga.sourceId,
          name: chapterTitle,
          url: ch.link || `${baseUrl}/series/${rawId}/${chapterSlug}`,
          chapterNumber: chNumber,
          uploadDate: ch.date ? new Date(ch.date).getTime() : undefined,
        });
      });

      return chapters;
    } catch (e) {
      return [];
    }
  },

  getPages: async function (chapter, ctx) {
    const { client } = ctx;
    try {
      const raw = chapter.id.replace(new RegExp(`^${chapter.sourceId}_ch_`), '');
      const firstUnderscore = raw.indexOf('_');
      let rawId = firstUnderscore !== -1 ? raw.substring(0, firstUnderscore) : raw;
      const chapterSlug = firstUnderscore !== -1 ? raw.substring(firstUnderscore + 1) : '';

      const res = await client.get(`/api/mv/mangas/${rawId}/chapter?chapter_slug=${chapterSlug}`);
      const pagesList = res.data?.content?.pages || [];
      const headerValue = res.data?.security?.enabled && res.data?.security?.header ? res.data.security.header : '';

      const headers = {
        Referer: 'https://es.mangacrab.org/',
      };
      if (headerValue) {
        headers['Fansy'] = headerValue;
      }

      return pagesList.map((imgUrl, index) => ({
        index,
        url: chapter.url,
        imageUrl: imgUrl,
        headers,
      }));
    } catch (e) {
      return [];
    }
  }
};
