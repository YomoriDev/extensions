import { BaseExtension } from '../base/BaseExtension.js';

export class MangaCrabExtension extends BaseExtension {
  constructor(config = {}) {
    super({
      id: config.id || 'mangacrab',
      name: config.name || 'Manga Crab',
      version: config.version || '1.0.8',
      baseUrl: config.baseUrl || 'https://es.mangacrab.org',
      icon: config.icon || 'https://es.mangacrab.org/brand/mangacrab-icon.png',
      lang: config.lang || 'es'
    });

    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `${this.baseUrl}/`,
      'Origin': this.baseUrl,
    };
  }

  parseManga(item) {
    const rawId = String(item.id);
    const permalink = item.permalink || '';
    let slug = item.slug || '';
    const slugMatch = permalink.match(/\/series\/([^\/]+)\/?/);
    if (slugMatch) slug = slugMatch[1];

    const title = (item.title || slug.replace(/-/g, ' ')).trim();
    const cover = item.cover || item.thumbnail || '';
    const description = (item.description || item.excerpt || '').replace(/<[^>]+>/g, '').trim();

    return {
      id: `mangacrab_${rawId}${slug ? '_' + slug : ''}`,
      sourceId: this.id,
      title,
      url: permalink || `${this.baseUrl}/series/${slug || rawId}`,
      thumbnailUrl: cover,
      description,
      status: item.status?.raw === 'on-going' ? 'ONGOING' : 'COMPLETED',
      genre: Array.isArray(item.genres) ? item.genres.map(g => g.name).filter(Boolean) : undefined,
    };
  }

  async getPopular(page = 1) {
    const res = await fetch(`${this.baseUrl}/api/mv/mangas?page=${page}&per_page=24`, { headers: this.headers });
    const data = await res.json();
    const items = data.items || [];
    return {
      mangas: items.map(item => this.parseManga(item)),
      hasNextPage: data.pagination?.has_next ?? (items.length >= 24)
    };
  }

  async getLatest(page = 1) {
    const res = await fetch(`${this.baseUrl}/api/mv/mangas?feed=updated&page=${page}&per_page=24`, { headers: this.headers });
    const data = await res.json();
    const items = data.items || [];
    return {
      mangas: items.map(item => this.parseManga(item)),
      hasNextPage: data.pagination?.has_next ?? (items.length >= 24)
    };
  }

  async search(query, page = 1) {
    const res = await fetch(`${this.baseUrl}/api/mv/mangas?search=${encodeURIComponent(query)}&page=${page}&per_page=24`, { headers: this.headers });
    const data = await res.json();
    const items = data.items || [];
    return {
      mangas: items.map(item => this.parseManga(item)),
      hasNextPage: data.pagination?.has_next ?? (items.length >= 24)
    };
  }

  async getChapters(manga) {
    let rawId = '';
    let slug = '';
    const cleanId = (manga.id || '').replace(/^mangacrab_/, '');
    const parts = cleanId.split('_');
    if (/^\d+$/.test(parts[0])) {
      rawId = parts[0];
      slug = parts.slice(1).join('_');
    }
    if (!slug && manga.url) {
      const slugMatch = manga.url.match(/\/series\/([^/?#]+)/);
      if (slugMatch) slug = slugMatch[1];
    }
    if (!rawId && slug) {
      const sRes = await fetch(`${this.baseUrl}/api/mv/mangas/by-slug/${slug}`, { headers: this.headers });
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData.id) rawId = String(sData.id);
      }
    }

    if (!rawId) return [];

    const res = await fetch(`${this.baseUrl}/api/mv/mangas/${rawId}/chapters?per_page=1000`, { headers: this.headers });
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.items || [];

    return items.map(ch => ({
      id: `mangacrab_${rawId}_${ch.chapter_slug || `capitulo-${ch.index}`}`,
      mangaId: manga.id,
      sourceId: this.id,
      name: (ch.title || ch.label || `Capítulo ${ch.index}`).trim(),
      url: ch.link || `${this.baseUrl}/series/${slug || rawId}/${ch.chapter_slug}`,
      chapterNumber: ch.number ? parseFloat(ch.number) : parseFloat(String(ch.chapter_slug).replace(/[^0-9.]/g, '')) || 0,
      uploadDate: ch.date ? new Date(ch.date).getTime() : undefined,
    }));
  }

  async getPages(chapter) {
    const raw = (chapter.id || '').replace(/^mangacrab_/, '');
    const firstUnderscore = raw.indexOf('_');
    let rawId = firstUnderscore !== -1 ? raw.substring(0, firstUnderscore) : raw;
    const chapterSlug = firstUnderscore !== -1 ? raw.substring(firstUnderscore + 1) : '';

    const res = await fetch(`${this.baseUrl}/api/mv/mangas/${rawId}/chapter?chapter_slug=${chapterSlug}`, { headers: this.headers });
    if (!res.ok) return [];
    const data = await res.json();
    const pagesList = data.content?.pages || [];
    const headerValue = data.security?.header || '';

    const headers = {
      Referer: `${this.baseUrl}/`,
      ...(headerValue ? { Fansy: headerValue } : {})
    };

    return pagesList.map((imgUrl, index) => ({
      index,
      url: chapter.url,
      imageUrl: imgUrl,
      headers
    }));
  }
}
