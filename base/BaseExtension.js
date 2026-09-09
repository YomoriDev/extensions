export class BaseExtension {
  constructor({ id, name, version, baseUrl, icon, lang = 'es' }) {
    if (!id || !name || !baseUrl) {
      throw new Error('Cada extensión debe tener al menos: id, name y baseUrl');
    }
    this.id = id;
    this.name = name;
    this.version = version || '1.0.0';
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.icon = icon || '';
    this.lang = lang;
  }

  canHandle(url) {
    if (!url) return false;
    try {
      const parsedUrl = new URL(url);
      const parsedBase = new URL(this.baseUrl);
      return parsedUrl.hostname.includes(parsedBase.hostname) || parsedBase.hostname.includes(parsedUrl.hostname);
    } catch {
      return false;
    }
  }

  async getCatalog(page = 1) {
    throw new Error(`El método getCatalog() debe ser implementado por ${this.name}`);
  }

  async search(query, page = 1) {
    throw new Error(`El método search() debe ser implementado por ${this.name}`);
  }

  async getMangaDetails(mangaUrl) {
    throw new Error(`El método getMangaDetails() debe ser implementado por ${this.name}`);
  }

  async extractChapter(chapterUrl) {
    throw new Error(`El método extractChapter() debe ser implementado por ${this.name}`);
  }

  normalizeUrl(relativeOrAbsoluteUrl, baseUrl = this.baseUrl) {
    if (!relativeOrAbsoluteUrl) return '';
    const cleanUrl = relativeOrAbsoluteUrl.trim();
    if (cleanUrl.startsWith('//')) return 'https:' + cleanUrl;
    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) return cleanUrl;
    try {
      return new URL(cleanUrl, baseUrl).toString();
    } catch {
      return cleanUrl;
    }
  }
}
