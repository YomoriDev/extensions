/**
 * Script de Verificación Oficial para Olympus Scanlation (v1.3.1)
 * Yomori Extensions Repo
 */
import fs from 'fs';

async function verifyOlympus() {
  console.log('=====================================================');
  console.log('🧪 VERIFICACIÓN OFICIAL DE FUENTE: Olympus Scanlation (v1.3.1)');
  console.log('=====================================================');

  // 1. Verificar sources.json
  const sources = JSON.parse(fs.readFileSync('sources.json', 'utf8'));
  const olympusConfig = sources.find(s => s.name === 'Olympus Scanlation' || String(s.id) === '4384315126107049412');
  if (!olympusConfig) throw new Error('Olympus Scanlation no encontrada en sources.json');
  console.log(`✓ sources.json configurado con versión: ${olympusConfig.version}`);
  if (olympusConfig.version !== '1.3.1') throw new Error(`Versión incorrecta: ${olympusConfig.version}`);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Origin': 'https://olympusxyz.com',
    'Referer': 'https://olympusxyz.com/',
    'Accept': 'application/json, text/plain, */*'
  };

  // 2. Verificar Catálogo / Lista de Series
  console.log('\n[1/5] Verificando Catálogo / Series...');
  const listRes = await fetch('https://olympusxyz.com/api/series/list', { headers });
  if (!listRes.ok) throw new Error(`Error en API series list: HTTP ${listRes.status}`);
  const listData = await listRes.json();
  const seriesList = listData.data || [];
  console.log(`✓ Catálogo obtenido: ${seriesList.length} series disponibles`);
  if (seriesList.length < 50) throw new Error('Catálogo con muy pocas series.');

  // 3. Verificar Búsqueda
  console.log('\n[2/5] Verificando Búsqueda...');
  const query = 'demonio';
  const matched = seriesList.filter(s => (s.name || '').toLowerCase().includes(query) || (s.slug || '').toLowerCase().includes(query));
  console.log(`✓ Búsqueda ("${query}") exitosa: ${matched.length} series encontradas`);
  if (matched.length === 0) throw new Error('Búsqueda devolvió 0 resultados.');

  // 4. Verificar Capítulos de Múltiples Obras (Confirmar que NO hay "Empezar a leer")
  console.log('\n[3/5] Verificando Extracción de Capítulos en múltiples mangas...');
  const testSeries = [
    seriesList.find(s => (s.name || '').includes('BJ Archimago')) || seriesList[0],
    seriesList.find(s => (s.name || '').includes('Demonio Celestial')) || seriesList[1],
    seriesList.find(s => (s.name || '').includes('matar a Dios')) || seriesList[2],
  ];

  let testedChapterForReader = null;

  for (const s of testSeries) {
    const slug = s.slug;
    const apiUrl = `https://olympusxyz.com/api/series/${slug}/chapters?page=1&direction=desc&type=comic`;
    const res = await fetch(apiUrl, { headers });
    if (!res.ok) throw new Error(`Error obteniendo capítulos de "${s.name}": HTTP ${res.status}`);
    const data = await res.json();
    const rawChapters = data.data || [];

    if (rawChapters.length === 0) {
      throw new Error(`Obra "${s.name}" devolvió 0 capítulos`);
    }

    // Verificar nombres de capítulos
    const dummyChapters = rawChapters.filter(c => String(c.name).toLowerCase().includes('empezar a leer'));
    if (dummyChapters.length > 0) {
      throw new Error(`¡Se detectó capítulo falso "Empezar a leer" en "${s.name}"!`);
    }

    console.log(`✓ "${s.name}": ${rawChapters.length} capítulos en página 1 (Total páginas: ${data.meta?.last_page || 1}). Último: Cap. ${rawChapters[0].name}, Primero: Cap. ${rawChapters[rawChapters.length - 1].name}`);

    if (!testedChapterForReader && rawChapters.length > 0) {
      // Pick a chapter with content
      const chosen = rawChapters.find(c => parseFloat(c.name) >= 1 && !c.name.includes('.')) || rawChapters[0];
      testedChapterForReader = {
        seriesSlug: slug,
        chapterId: chosen.id,
        chapterName: chosen.name
      };
    }
  }

  // 5. Verificar Lector de Capítulos
  console.log(`\n[4/5] Verificando Lector en Cap. ${testedChapterForReader.chapterName} (ID ${testedChapterForReader.chapterId})...`);
  const readerUrl = `https://olympusxyz.com/capitulo/${testedChapterForReader.chapterId}/comic-${testedChapterForReader.seriesSlug}`;
  console.log(`Lector URL: ${readerUrl}`);
  const readerRes = await fetch(readerUrl, { headers });
  if (!readerRes.ok) throw new Error(`Error en lector: HTTP ${readerRes.status}`);
  const readerHtml = await readerRes.text();

  let pages = [];
  const nuxtMatch = readerHtml.match(/<script type="application\/json" [^>]*id="__NUXT_DATA__"[^>]*>([\s\S]+?)<\/script>/);
  if (nuxtMatch && nuxtMatch[1]) {
    try {
      const parsed = JSON.parse(nuxtMatch[1]);
      if (Array.isArray(parsed)) {
        pages = parsed.filter(
          x => typeof x === 'string' &&
          x.startsWith('https://media.imagesolymp.xyz/comics/') &&
          !x.includes('covers')
        );
      }
    } catch {}
  }

  if (pages.length === 0) {
    // Regex scan
    const regex = /https?:\/\/media\.imagesolymp\.xyz\/comics\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|avif)/g;
    const matches = [...readerHtml.matchAll(regex)].map(m => m[0]);
    pages = matches.filter(u => !u.includes('covers'));
  }

  console.log(`✓ Lector de capítulos extrajo exitosamente ${pages.length} páginas de imágenes`);
  if (pages.length === 0) throw new Error('No se extrajeron imágenes del capítulo.');

  // 6. Verificar Descarga Real de Imagen (HTTP 200 y bytes válidos)
  console.log('\n[5/5] Verificando descarga real de imagen del capítulo...');
  const sampleImg = pages[0];
  console.log(`Descargando imagen: ${sampleImg}`);
  const imgRes = await fetch(sampleImg, { headers });
  if (imgRes.status !== 200) throw new Error(`HTTP status de imagen inválido: ${imgRes.status}`);
  const imgBuffer = await imgRes.arrayBuffer();
  console.log(`✓ Imagen descargada correctamente: ${imgBuffer.byteLength} bytes (${imgRes.headers.get('content-type')})`);
  if (imgBuffer.byteLength < 1000) throw new Error('Imagen con tamaño insuficiente.');

  console.log('\n=====================================================');
  console.log('✅ TODAS LAS PRUEBAS PASARON AL 100% - FUENTE 100% OPERATIVA');
  console.log('=====================================================');
}

verifyOlympus().catch(err => {
  console.error('\n❌ ERROR EN VERIFICACIÓN:', err.message);
  process.exit(1);
});
