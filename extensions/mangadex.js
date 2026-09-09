import { BaseExtension } from '../base/BaseExtension.js';
import axios from 'axios';

const GENRE_TAG_MAP = {
  "acción": "391b0423-d847-456f-aff0-8b0cfc03066b",
  "action": "391b0423-d847-456f-aff0-8b0cfc03066b",
  "romance": "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
  "comedia": "4d32cc48-9f00-4cca-9b5a-a839f0764984",
  "comedy": "4d32cc48-9f00-4cca-9b5a-a839f0764984",
  "fantasía": "cdc58593-87dd-415e-bbc0-2ec27bf404cc",
  "fantasy": "cdc58593-87dd-415e-bbc0-2ec27bf404cc",
  "aventura": "87cc87cd-a395-47af-b27a-93258283bbc6",
  "adventure": "87cc87cd-a395-47af-b27a-93258283bbc6",
  "drama": "b9af3a63-f058-46de-a9a0-e0c13906197a",
  "isekai": "ace04997-f6bd-436e-b261-779182193d3d",
  "reencarnación": "0bc90acb-ccc1-44ca-a34a-b9f3a73259d0",
  "reincarnation": "0bc90acb-ccc1-44ca-a34a-b9f3a73259d0",
  "sobrenatural": "eabc5b4c-6aff-42f3-b657-3e90cbd00b75",
  "supernatural": "eabc5b4c-6aff-42f3-b657-3e90cbd00b75",
  "artes marciales": "799c202e-7daa-44eb-9cf7-8a3c0441531e",
  "martial arts": "799c202e-7daa-44eb-9cf7-8a3c0441531e",
  "magia": "a1f53773-c69a-4ce5-8cab-fffcd90b1565",
  "magic": "a1f53773-c69a-4ce5-8cab-fffcd90b1565",
  "misterio": "ee968100-4191-4968-93d3-f82d72be7e46",
  "mystery": "ee968100-4191-4968-93d3-f82d72be7e46",
  "psicológico": "3b60b75c-a2d7-4860-ab56-05f391bb889c",
  "psychological": "3b60b75c-a2d7-4860-ab56-05f391bb889c",
  "ciencia ficción": "256c8bd9-4904-4360-bf4f-508a76d67183",
  "sci-fi": "256c8bd9-4904-4360-bf4f-508a76d67183",
  "thriller": "07251805-a27e-4d59-b488-f0bfbec15168",
  "supervivencia": "5fff9cde-849c-4d78-aab0-0d52b2ee1d25",
  "survival": "5fff9cde-849c-4d78-aab0-0d52b2ee1d25",
  "recuentos de la vida": "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
  "slice of life": "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
  "escolar": "caaa44eb-cd40-4177-b930-79d3ef2afe87",
  "vida escolar": "caaa44eb-cd40-4177-b930-79d3ef2afe87",
  "school life": "caaa44eb-cd40-4177-b930-79d3ef2afe87",
  "horror": "cdad7e68-1419-41dd-bdce-27753074a640",
  "harem": "aafb99c1-7f60-43fa-b75f-fc9502ce29c7",
  "deportes": "69964a64-2f90-4d33-beeb-f3ed2875eb4c",
  "sports": "69964a64-2f90-4d33-beeb-f3ed2875eb4c",
  "histórico": "33771934-028e-4cb3-8744-691e866a923e",
  "historical": "33771934-028e-4cb3-8744-691e866a923e",
  "militar": "ac72833b-c4e9-4878-b9db-6c8a4a99444a",
  "military": "ac72833b-c4e9-4878-b9db-6c8a4a99444a",
  "mecha": "50880a9d-5440-4732-9afb-8f457127e836",
  "zombies": "631ef465-9aba-4afb-b0fc-ea10efe274a8",
  "vampiros": "d7d1730f-6eb0-4ba6-9437-602cac38664c",
  "vampires": "d7d1730f-6eb0-4ba6-9437-602cac38664c",
  "gore": "b29d6a3d-1569-4e7a-8caf-7557bc92cd5d",
  "monstruos": "36fd93ea-e8b8-445e-b836-358f02b3d33d",
  "monsters": "36fd93ea-e8b8-445e-b836-358f02b3d33d",
  "demonios": "39730448-9a5f-48a2-85b0-a70db87b1233",
  "demons": "39730448-9a5f-48a2-85b0-a70db87b1233",
  "bl (boys love)": "5920b825-4181-4a17-beeb-9918b0ff7a30",
  "boys' love": "5920b825-4181-4a17-beeb-9918b0ff7a30",
  "yaoi": "5920b825-4181-4a17-beeb-9918b0ff7a30",
  "girls' love": "a3c67850-4684-404e-9b7f-c69850ee5da6",
  "yuri": "a3c67850-4684-404e-9b7f-c69850ee5da6",
  "doujinshi": "b13b2a48-c720-44a9-9c77-39c9979373fb",
  "cocina": "ea2bc92d-1c26-4930-9b7c-d5c0dc1b6869",
  "cooking": "ea2bc92d-1c26-4930-9b7c-d5c0dc1b6869",
  "crimen": "5ca48985-9a9d-4bd8-be29-80dc0303db72",
  "crime": "5ca48985-9a9d-4bd8-be29-80dc0303db72",
  "villana": "d14322ac-4d6f-4e9b-afd9-629d5f4d8a41",
  "villainess": "d14322ac-4d6f-4e9b-afd9-629d5f4d8a41",
  "wuxia": "acc803a4-c95a-4c22-86fc-eb6b582d82a2",
  "cultivo": "acc803a4-c95a-4c22-86fc-eb6b582d82a2",
  "murim": "acc803a4-c95a-4c22-86fc-eb6b582d82a2",
  "policial": "df33b754-73a3-4c54-80e6-1a74a8058539",
  "police": "df33b754-73a3-4c54-80e6-1a74a8058539",
  "música": "f42fbf9e-188a-447b-9fdc-f19dc1e4d685",
  "music": "f42fbf9e-188a-447b-9fdc-f19dc1e4d685"
};

export class MangaDexExtension extends BaseExtension {
  constructor(config = {}) {
    super({
      id: config.id || 'mangadex',
      name: config.name || 'MangaDex',
      version: config.version || '2.6.0',
      baseUrl: config.baseUrl || 'https://mangadex.org',
      icon: config.icon || 'https://mangadex.org/favicon.ico',
      lang: config.lang || 'es'
    });
    this.apiBase = 'https://api.mangadex.org';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    };
  }

  _getLocalizedTitle(mangaObj) {
    const titles = mangaObj.attributes?.title || {};
    const altTitles = mangaObj.attributes?.altTitles || [];
    
    let esTitle = titles['es-la'] || titles['es'];
    let enTitle = titles['en'];
    
    for (const alt of altTitles) {
      if (!esTitle && (alt['es-la'] || alt['es'])) {
        esTitle = alt['es-la'] || alt['es'];
      }
      if (!enTitle && alt['en']) {
        enTitle = alt['en'];
      }
    }
    
    return esTitle || enTitle || Object.values(titles)[0] || 'Manga';
  }

  _mapStatus(raw) {
    switch (raw) {
      case 'completed': return 'Finalizado';
      case 'ongoing': return 'Activo';
      case 'hiatus': return 'Pausado por el autor (Hiatus)';
      case 'cancelled': return 'Cancelado';
      default: return 'Activo';
    }
  }

  _mapType(origLang) {
    switch (origLang) {
      case 'ko': return 'Manhwa';
      case 'zh':
      case 'zh-hk': return 'Manhua';
      case 'ja': return 'Manga';
      default: return 'Webtoon';
    }
  }

  async _translateToSpanish(text) {
    if (!text || typeof text !== 'string' || !text.trim()) return '';
    const clean = text
      .replace(/\[\/?(b|i|u|s|spoiler|url|quote|code|hr)[^\]]*\]/gi, '')
      .replace(/\r?\n+/g, ' ')
      .trim();
    if (!clean) return '';

    // 1. Google Translate dict-chrome-ex
    try {
      const url = 'https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=es&dt=t&q=' + encodeURIComponent(clean.slice(0, 3000));
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const tr = data[0].map(item => item[0]).join('').trim();
          if (tr) return tr;
        }
      }
    } catch (e) {}

    // 2. Google Translate gtx
    try {
      const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=' + encodeURIComponent(clean.slice(0, 3000));
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const tr = data[0].map(item => item[0]).join('').trim();
          if (tr) return tr;
        }
      }
    } catch (e) {}

    // 3. MyMemory fallback
    try {
      const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(clean.slice(0, 500)) + '&langpair=auto|es';
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        const tr = data?.responseData?.translatedText?.trim();
        if (tr && !tr.includes('MYMEMORY WARNING')) return tr;
      }
    } catch (e) {}

    return clean;
  }

  async getCatalog(page = 1, filters = {}) {
    try {
      console.log(`[MangaDex] Obteniendo catálogo en Español (pág ${page}) con filtros:`, filters);
      const pageSize = 35;
      
      // MangaDex API limita el offset máximo a 10000 (offset <= 10000 - pageSize)
      const maxOffset = 10000 - pageSize;
      const targetOffset = Math.max(0, Math.min((page - 1) * pageSize, maxOffset));

      const params = new URLSearchParams();
      params.append('limit', String(pageSize));
      params.append('offset', String(targetOffset));

      // Filtro estricto de idiomas en Español: España (es) y Latinoamérica (es-la)
      params.append('availableTranslatedLanguage[]', 'es');
      params.append('availableTranslatedLanguage[]', 'es-la');

      // Calificaciones de contenido
      params.append('contentRating[]', 'safe');
      params.append('contentRating[]', 'suggestive');
      params.append('contentRating[]', 'erotica');

      // Metadatos incluidos
      params.append('includes[]', 'cover_art');
      params.append('includes[]', 'author');

      // Filtro de Búsqueda por Texto
      if (filters.query && filters.query.trim()) {
        params.append('title', filters.query.trim());
      }

      // Filtro de Tipo (Manga, Manhwa, Manhua)
      if (filters.type && filters.type !== 'Ver todo') {
        const tLower = filters.type.toLowerCase();
        if (tLower.includes('manhwa')) {
          params.append('originalLanguage[]', 'ko');
        } else if (tLower.includes('manhua')) {
          params.append('originalLanguage[]', 'zh');
          params.append('originalLanguage[]', 'zh-hk');
        } else if (tLower.includes('manga')) {
          params.append('originalLanguage[]', 'ja');
        }
      }

      // Filtro de Estado
      if (filters.status && filters.status !== 'Ver todo') {
        const sLower = filters.status.toLowerCase();
        if (sLower.includes('activo') || sLower.includes('emisión')) {
          params.append('status[]', 'ongoing');
        } else if (sLower.includes('finalizado') || sLower.includes('completado')) {
          params.append('status[]', 'completed');
        } else if (sLower.includes('pausa') || sLower.includes('hiatus')) {
          params.append('status[]', 'hiatus');
        } else if (sLower.includes('cancel')) {
          params.append('status[]', 'cancelled');
        }
      }

      // Filtro de Orden
      const sortMode = filters.sort || 'popular';
      if (sortMode === 'rating' || sortMode === 'valoracion') {
        params.append('order[rating]', 'desc');
      } else if (sortMode === 'reciente' || sortMode === 'recent') {
        params.append('order[latestUploadedChapter]', 'desc');
      } else if (sortMode === 'az' || sortMode === 'alfabetico' || sortMode === 'title') {
        params.append('order[title]', 'asc');
      } else {
        params.append('order[followedCount]', 'desc');
      }

      // Filtro de Géneros
      if (filters.genres && filters.genres.length > 0) {
        for (const g of filters.genres) {
          const gNorm = g.toLowerCase().trim();
          const tagId = GENRE_TAG_MAP[gNorm];
          if (tagId) {
            params.append('includedTags[]', tagId);
          }
        }
      }

      const res = await axios.get(`${this.apiBase}/manga?${params.toString()}`, {
        headers: this.headers,
        timeout: 12000
      });

      const rawTotal = res.data?.total || 0;
      // MangaDex API limita offset a 10,000 mangas (285 páginas de 35)
      const totalCount = Math.min(rawTotal, 10000);
      const totalPages = Math.max(1, Math.min(Math.ceil(rawTotal / pageSize), Math.floor(10000 / pageSize)));

      const mangas = (res.data?.data || []).map(m => {
        const title = this._getLocalizedTitle(m);
        const coverRel = (m.relationships || []).find(r => r.type === 'cover_art');
        const coverFile = coverRel?.attributes?.fileName;
        const cover = coverFile ? `https://uploads.mangadex.org/covers/${m.id}/${coverFile}.512.jpg` : '';
        const origLang = m.attributes?.originalLanguage;

        return {
          id: m.id,
          title,
          url: `https://mangadex.org/title/${m.id}`,
          cover,
          type: this._mapType(origLang),
          status: this._mapStatus(m.attributes?.status),
          latestChapter: m.attributes?.lastChapter ? `Cap. ${m.attributes.lastChapter}` : 'Disponible',
          genres: (m.attributes?.tags || []).map(t => t.attributes?.name?.en).filter(Boolean)
        };
      });

      const hasNextPage = page < totalPages;

      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        page,
        mangas,
        hasNextPage,
        totalPages,
        totalCount
      };
    } catch (err) {
      console.error('[MangaDex Error] getCatalog:', err.message);
      return {
        success: false,
        extension: this.name,
        extensionId: this.id,
        page,
        mangas: [],
        hasNextPage: false,
        totalPages: 1,
        totalCount: 0
      };
    }
  }

  async search(query, page = 1, filters = {}) {
    return this.getCatalog(page, { ...filters, query });
  }

  async getMangaDetails(mangaUrl) {
    try {
      const mangaId = mangaUrl.split('/title/').pop().split('/')[0].split('?')[0];
      console.log(`[MangaDex] Obteniendo ficha completa en Español para ID: ${mangaId}...`);

      const mangaRes = await axios.get(`${this.apiBase}/manga/${mangaId}`, {
        params: { 'includes[]': ['cover_art', 'author', 'artist'] },
        headers: this.headers,
        timeout: 12000
      });

      const m = mangaRes.data?.data;
      const title = this._getLocalizedTitle(m);
      const descObj = m?.attributes?.description || {};
      
      // Priorizar sinopsis en Español (Latino o España); si sólo está en inglés u otro idioma, traducir automáticamente
      let synopsis = descObj['es-la'] || descObj['es'];
      if (!synopsis) {
        const rawOther = descObj['en'] || Object.values(descObj)[0] || '';
        if (rawOther) {
          synopsis = await this._translateToSpanish(rawOther);
        }
      }
      if (!synopsis) {
        synopsis = 'Manga completo disponible en MangaDex en español.';
      }

      const coverRel = (m?.relationships || []).find(r => r.type === 'cover_art');
      const coverFile = coverRel?.attributes?.fileName;
      const cover = coverFile ? `https://uploads.mangadex.org/covers/${mangaId}/${coverFile}.512.jpg` : '';

      const author = (m?.relationships || []).find(r => r.type === 'author')?.attributes?.name || '';
      const genres = (m?.attributes?.tags || []).map(t => t.attributes?.name?.en).filter(Boolean);

      // Cargar capítulos en español (España y Latinoamérica) con soporte de paginación por lotes paralelos
      const baseFeedParams = 'translatedLanguage[]=es-la&translatedLanguage[]=es&order[chapter]=desc&includes[]=scanlation_group&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic';
      
      const firstFeedRes = await axios.get(`${this.apiBase}/manga/${mangaId}/feed?limit=100&offset=0&${baseFeedParams}`, {
        headers: this.headers,
        timeout: 12000
      });

      const totalFeed = firstFeedRes.data?.total || 0;
      let allRawChapters = [...(firstFeedRes.data?.data || [])];

      if (totalFeed > 100) {
        const extraBatches = [];
        for (let off = 100; off < Math.min(totalFeed, 500); off += 100) {
          extraBatches.push(
            axios.get(`${this.apiBase}/manga/${mangaId}/feed?limit=100&offset=${off}&${baseFeedParams}`, {
              headers: this.headers,
              timeout: 12000
            })
              .then(r => r.data?.data || [])
              .catch(() => [])
          );
        }
        const results = await Promise.all(extraBatches);
        for (const batch of results) {
          allRawChapters.push(...batch);
        }
      }

      // Filtrar capítulos con enlace externo (ej. MangaPlus externo no embebible)
      let internalChapters = allRawChapters.filter(c => !c.attributes?.externalUrl);

      // Si no hay capítulos internos en español, respaldo con idiomas disponibles
      if (internalChapters.length === 0) {
        console.log(`[MangaDex] Fallback: Obteniendo capítulos en otros idiomas para ${mangaId}...`);
        const fallbackFeed = await axios.get(`${this.apiBase}/manga/${mangaId}/feed?limit=100&order[chapter]=desc&includes[]=scanlation_group&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`, {
          headers: this.headers,
          timeout: 12000
        });
        internalChapters = (fallbackFeed.data?.data || []).filter(c => !c.attributes?.externalUrl);
      }

      const chapters = internalChapters.map(c => {
        const chNum = c.attributes?.chapter || '1';
        const chTitle = c.attributes?.title ? `: ${c.attributes.title}` : '';
        const langBadge = c.attributes?.translatedLanguage === 'es-la' ? '🇲🇽 Latino' : c.attributes?.translatedLanguage === 'es' ? '🇪🇸 Castellano' : `[${c.attributes?.translatedLanguage?.toUpperCase() || 'ES'}]`;
        const groupName = (c.relationships || []).find(r => r.type === 'scanlation_group')?.attributes?.name;
        const groupStr = groupName ? ` (${groupName})` : '';

        return {
          name: `Capítulo ${chNum}${chTitle} [${langBadge}]${groupStr}`,
          chapterNumber: chNum,
          url: `https://mangadex.org/chapter/${c.id}`,
          date: c.attributes?.publishAt ? new Date(c.attributes.publishAt).toLocaleDateString('es-ES') : ''
        };
      });

      console.log(`[MangaDex] Ficha lista: "${title}" con ${chapters.length} capítulos.`);

      return {
        id: mangaId,
        title,
        url: mangaUrl,
        cover,
        synopsis,
        author,
        type: this._mapType(m?.attributes?.originalLanguage),
        status: this._mapStatus(m?.attributes?.status),
        genres,
        chapters: chapters.length > 0 ? chapters : [
          { name: 'Capítulo 1 [Español]', chapterNumber: '1', url: `${mangaUrl}/1`, date: 'Reciente' }
        ]
      };
    } catch (err) {
      console.error('[MangaDex Error] getMangaDetails:', err.message);
      return {
        id: 'fallback',
        title: 'MangaDex Manga',
        url: mangaUrl,
        cover: '',
        synopsis: 'Manga sincronizado desde el catálogo de MangaDex.',
        status: 'Activo',
        genres: ['Manga', 'Acción'],
        chapters: []
      };
    }
  }

  async extractChapter(chapterUrl) {
    try {
      const chapterId = chapterUrl.split('/chapter/').pop().split('/')[0].split('?')[0];
      console.log(`[MangaDex] Extrayendo viñetas de capítulo ID: ${chapterId}...`);

      const atHomeRes = await axios.get(`${this.apiBase}/at-home/server/${chapterId}`, {
        headers: this.headers,
        timeout: 10000
      });

      const { baseUrl, chapter } = atHomeRes.data;
      const imagesList = (chapter.data && chapter.data.length > 0) ? chapter.data : (chapter.dataSaver || []);
      const pages = imagesList.map((fileName, index) => ({
        index: index + 1,
        url: `${baseUrl}/data/${chapter.hash}/${fileName}`
      }));

      console.log(`[MangaDex] Viñetas listas: ${pages.length} páginas extraídas.`);

      return {
        success: true,
        extension: this.name,
        extensionId: this.id,
        mangaTitle: 'MangaDex',
        chapterTitle: `Capítulo`,
        currentUrl: chapterUrl,
        totalPages: pages.length,
        pages
      };
    } catch (err) {
      console.error('[MangaDex Error] extractChapter:', err.message);
      return {
        success: false,
        extension: this.name,
        extensionId: this.id,
        mangaTitle: 'MangaDex',
        chapterTitle: 'Capítulo',
        currentUrl: chapterUrl,
        totalPages: 0,
        pages: []
      };
    }
  }
}

export default MangaDexExtension;
