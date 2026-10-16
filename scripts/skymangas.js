// SkyMangas Dynamic Source Script v2.1.0
module.exports = {
  getChapters: async function (manga, ctx) {
    const { client, baseUrl } = ctx;
    const slug = manga.url.replace(/\/+$/, '').split('/').pop() || '';
    const res = await client.get(manga.url);
    const data = res.data;
    const ngMatch = typeof data === 'string' ? data.match(/<script[^>]*id=["']ng-state["'][^>]*>([\s\S]*?)<\/script>/i) : null;
    if (!ngMatch) return [];

    const state = JSON.parse(ngMatch[1]);
    let manhuaId = null;
    let firstBatch = [];
    let totalPages = 1;

    for (const k of Object.keys(state)) {
      const val = state[k]?.b || state[k];
      if (val?.data?.id && (val.data.chapterCount || val.data.slug === slug)) {
        manhuaId = val.data.id;
      }
      if (Array.isArray(val?.data) && val.data.length > 0 && val.data[0]?.chapterNumber !== undefined) {
        firstBatch = val.data;
        if (val.meta?.totalPages) {
          totalPages = val.meta.totalPages;
        }
        if (val.data[0]?.manhuaId) {
          manhuaId = val.data[0].manhuaId;
        }
      }
    }

    let allRaw = [...firstBatch];
    if (manhuaId && totalPages > 1) {
      const promises = [];
      for (let p = 2; p <= Math.min(totalPages, 25); p++) {
        promises.push(
          client.get(`https://api.skymangas.com/api/v1/chapters/manhua/${manhuaId}?page=${p}&perPage=50`, {
            headers: { 'Referer': 'https://skymangas.com/' },
          }).then(r => r.data?.data || []).catch(() => [])
        );
      }
      const results = await Promise.all(promises);
      for (const r of results) {
        if (Array.isArray(r)) allRaw.push(...r);
      }
    }

    const seen = new Set();
    const chapters = [];
    for (const it of allRaw) {
      const chNum = it.chapterNumber;
      if (chNum === undefined || seen.has(chNum)) continue;
      seen.add(chNum);
      const fullUrl = `${baseUrl}/leer/${slug}/${chNum}`;
      const name = it.title ? `Cap. ${chNum} - ${it.title}` : `Cap. ${chNum}`;
      chapters.push({
        id: `${manga.sourceId}_ch_${fullUrl.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        mangaId: manga.id,
        sourceId: manga.sourceId,
        name,
        url: fullUrl,
        chapterNumber: chNum,
        uploadDate: it.publishedAt ? new Date(it.publishedAt).getTime() : Date.now(),
      });
    }

    chapters.sort((a, b) => (b.chapterNumber || 0) - (a.chapterNumber || 0));
    return chapters;
  },

  getPages: async function (chapter, ctx) {
    const { client, fetch: fetchFn } = ctx;
    const parts = chapter.url.replace(/\/+$/, '').split('/');
    const chNum = parts.pop();
    const slug = parts.pop();
    if (!slug || !chNum) return [];

    const apiUrl = `https://api.skymangas.com/api/v1/chapters/${slug}/${chNum}`;
    let apiRes = await client.get(apiUrl, {
      headers: { 'Referer': 'https://skymangas.com/' },
    }).catch(() => null);

    if (!apiRes?.data?.data?.pages) {
      const directFetch = await fetchFn(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://skymangas.com/',
        },
      }).catch(() => null);
      if (directFetch && directFetch.ok) {
        apiRes = { data: await directFetch.json() };
      }
    }

    const rawPages = apiRes?.data?.data?.pages || apiRes?.data?.pages;
    if (Array.isArray(rawPages) && rawPages.length > 0) {
      return rawPages.map((p, index) => {
        const raw = p.imageWebp || p.imageUrl || p.thumbUrl || (typeof p === 'string' ? p : '');
        const fullUrl = raw.startsWith('http') ? raw : `https://api.skymangas.com${raw}`;
        return {
          index,
          url: fullUrl,
          imageUrl: fullUrl,
          headers: { 'Referer': 'https://skymangas.com/' },
        };
      });
    }

    return [];
  }
};
