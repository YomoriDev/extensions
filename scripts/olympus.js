// Olympus Scanlation Dynamic Source Script v2.1.0
module.exports = {
  getPopular: async function (page, ctx) {
    const { client, baseUrl } = ctx;
    try {
      const res = await client.get(`/api/rankings?page=${page}&period=total_ranking`);
      const items = res.data?.data;
      if (Array.isArray(items) && items.length > 0) {
        const comics = items.filter(item => !item.type || item.type === 'comic');
        const mangas = (comics.length > 0 ? comics : items).map(item => {
          const typePrefix = item.type || 'comic';
          const fullUrl = `${baseUrl}/series/${typePrefix}-${item.slug}`;
          return {
            id: `olympus_${fullUrl.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
            sourceId: 'olympus',
            title: item.name ? item.name.trim() : 'Manga',
            url: fullUrl,
            thumbnailUrl: item.cover || '',
          };
        });
        const hasNextPage = page < (res.data.last_page || 1);
        return { mangas, hasNextPage };
      }
    } catch (e) {}
    return { mangas: [], hasNextPage: false };
  },

  getLatest: async function (page, ctx) {
    const { client, baseUrl } = ctx;
    try {
      const res = await client.get(`/api/new-chapters?page=${page}`);
      const items = res.data?.data;
      if (Array.isArray(items) && items.length > 0) {
        const comics = items.filter(item => !item.type || item.type === 'comic');
        const mangas = (comics.length > 0 ? comics : items).map(item => {
          const typePrefix = item.type || 'comic';
          const fullUrl = `${baseUrl}/series/${typePrefix}-${item.slug}`;
          return {
            id: `olympus_${fullUrl.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
            sourceId: 'olympus',
            title: item.name ? item.name.trim() : 'Manga',
            url: fullUrl,
            thumbnailUrl: item.cover || '',
          };
        });
        const hasNextPage = page < (res.data.last_page || 1);
        return { mangas, hasNextPage };
      }
    } catch (e) {}
    return { mangas: [], hasNextPage: false };
  },

  search: async function (query, page, ctx) {
    const { client, baseUrl } = ctx;
    const cleanQ = query.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    try {
      const res = await client.get('/api/series/list');
      const list = res.data?.data;
      if (Array.isArray(list) && list.length > 0) {
        const filtered = list.filter(item => {
          const name = (item.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return name.includes(cleanQ);
        });
        const PAGE_SIZE = 24;
        const start = (page - 1) * PAGE_SIZE;
        const pageItems = filtered.slice(start, start + PAGE_SIZE);
        const mangas = pageItems.map(item => {
          const typePrefix = item.type || 'comic';
          const fullUrl = `${baseUrl}/series/${typePrefix}-${item.slug}`;
          return {
            id: `olympus_${fullUrl.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
            sourceId: 'olympus',
            title: item.name ? item.name.trim() : 'Manga',
            url: fullUrl,
            thumbnailUrl: item.cover || '',
          };
        });
        return { mangas, hasNextPage: start + PAGE_SIZE < filtered.length };
      }
    } catch (e) {}
    return { mangas: [], hasNextPage: false };
  },

  getChapters: async function (manga, ctx) {
    const { client, baseUrl } = ctx;
    const rawSlug = manga.url.replace(/\/+$/, '').split('/').pop() || '';
    const cleanSlugWithTs = rawSlug.replace(/^(comic|novel|manga)-/, '');
    const cleanSlugNoTs = cleanSlugWithTs.replace(/-\d+$/, '');
    const candidateSlugs = [rawSlug, cleanSlugWithTs, cleanSlugNoTs].filter(Boolean);

    for (const slugToTry of candidateSlugs) {
      try {
        const p1Url = `/api/series/${slugToTry}/chapters?page=1&direction=desc&type=comic`;
        let res1 = await client.get(p1Url, {
          headers: {
            'Origin': 'https://olympusxyz.com',
            'Referer': 'https://olympusxyz.com/',
            'Accept': 'application/json, text/plain, */*',
          },
        }).catch(() => null);
        const items1 = res1?.data?.data;
        if (!Array.isArray(items1) || items1.length === 0) continue;

        const allRawItems = [...items1];
        const lastPage = Math.min(typeof res1?.data?.meta?.last_page === 'number' ? res1.data.meta.last_page : 1, 25);

        if (lastPage > 1) {
          const BATCH_SIZE = 5;
          for (let p = 2; p <= lastPage; p += BATCH_SIZE) {
            const promises = [];
            for (let b = 0; b < BATCH_SIZE && (p + b) <= lastPage; b++) {
              const pageNum = p + b;
              promises.push(
                client.get(`/api/series/${slugToTry}/chapters?page=${pageNum}&direction=desc&type=comic`, {
                  headers: {
                    'Origin': 'https://olympusxyz.com',
                    'Referer': 'https://olympusxyz.com/',
                    'Accept': 'application/json, text/plain, */*',
                  },
                }).then(r => r.data?.data).catch(() => null)
              );
            }
            const batchResults = await Promise.all(promises);
            for (const list of batchResults) {
              if (Array.isArray(list)) allRawItems.push(...list);
            }
          }
        }

        const chapters = [];
        const seenIds = new Set();
        for (const item of allRawItems) {
          if (!item.id || seenIds.has(item.id)) continue;
          seenIds.add(item.id);
          const num = item.name ? parseFloat(String(item.name).replace(',', '.')) : undefined;
          chapters.push({
            id: `olympus_ch_${item.id}`,
            mangaId: manga.id,
            sourceId: manga.sourceId,
            name: `Capítulo ${item.name}`,
            chapterNumber: !isNaN(num) ? num : undefined,
            url: `${baseUrl}/capitulo/${item.id}/${rawSlug}`,
            uploadDate: item.published_at ? new Date(item.published_at).getTime() : Date.now(),
          });
        }

        if (chapters.length > 0) {
          chapters.sort((a, b) => (b.chapterNumber || 0) - (a.chapterNumber || 0));
          return chapters;
        }
      } catch (e) {}
    }
    return [];
  },

  getPages: async function (chapter, ctx) {
    const { client } = ctx;
    const match = chapter.url.match(/\/capitulo\/(\d+)/);
    if (!match) return [];
    const chapterId = match[1];

    try {
      const res = await client.get(`/api/series/chapter/${chapterId}`, {
        headers: {
          'Origin': 'https://olympusxyz.com',
          'Referer': 'https://olympusxyz.com/',
          'Accept': 'application/json, text/plain, */*',
        },
      });
      const chapterData = res.data?.data?.chapter || res.data?.chapter || res.data?.data;
      const rawPages = chapterData?.pages;
      if (Array.isArray(rawPages) && rawPages.length > 0) {
        return rawPages.map((p, index) => {
          const rawUrl = typeof p === 'string' ? p : (p.page || p.url || p.image || '');
          return {
            index,
            url: rawUrl,
            imageUrl: rawUrl,
            headers: {
              'Referer': 'https://olympusxyz.com/',
              'Origin': 'https://olympusxyz.com',
            },
          };
        });
      }
    } catch (e) {}
    return [];
  }
};
