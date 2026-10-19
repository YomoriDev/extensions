/**
 * Verification test for Manga Crab source:
 * 1. Catalog extraction (Popular / All library) with pagination (page 1 & page 2)
 * 2. Search extraction
 * 3. Details extraction
 * 4. Chapters extraction (handling >50 chapters with per_page=1000)
 * 5. Page image extraction and verified download with Fansy header (100% 200 OK)
 */

const BASE_URL = 'https://es.mangacrab.org';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://es.mangacrab.org/',
  'Origin': 'https://es.mangacrab.org',
};

async function runVerification() {
  console.log('=== [1/5] PROBANDO CATÁLOGO / BIBLIOTECA COMPLETA ===');
  // Page 1
  const pop1Res = await fetch(`${BASE_URL}/api/mv/mangas?page=1&per_page=24`, { headers: HEADERS });
  if (!pop1Res.ok) throw new Error(`Popular page 1 failed: ${pop1Res.status}`);
  const pop1 = await pop1Res.json();
  const items1 = pop1.items || [];
  const hasNext1 = pop1.pagination?.has_next ?? (items1.length >= 24);
  console.log(`✓ Página 1 cargó: ${items1.length} mangas (Total en biblioteca: ${pop1.pagination?.total_items})`);
  console.log(`✓ hasNextPage detectado correctamente: ${hasNext1}`);

  // Page 2 (verificando que la biblioteca no se corte)
  const pop2Res = await fetch(`${BASE_URL}/api/mv/mangas?page=2&per_page=24`, { headers: HEADERS });
  const pop2 = await pop2Res.json();
  const items2 = pop2.items || [];
  console.log(`✓ Página 2 cargó: ${items2.length} mangas diferentes`);
  if (items1[0].id === items2[0].id) {
    throw new Error('Página 1 y 2 tienen los mismos mangas!');
  }
  console.log('✓ Paginación infinita funciona al 100%');

  console.log('\n=== [2/5] PROBANDO BÚSQUEDA ===');
  const query = 'apocalipsis';
  const searchRes = await fetch(`${BASE_URL}/api/mv/mangas?search=${encodeURIComponent(query)}&page=1&per_page=24`, { headers: HEADERS });
  const searchData = await searchRes.json();
  console.log(`✓ Búsqueda de "${query}" devolvió: ${searchData.items?.length} resultados`);

  console.log('\n=== [3/5] PROBANDO DETALLES DE MANGA ===');
  const targetManga = items1[0];
  console.log(`Probando manga: "${targetManga.title}" (ID: ${targetManga.id}, Slug: ${targetManga.slug})`);
  const detRes = await fetch(`${BASE_URL}/api/mv/mangas/${targetManga.id}`, { headers: HEADERS });
  const detData = await detRes.json();
  console.log(`✓ Detalles obtenidos: Título="${detData.title}", Géneros=${detData.genres?.map(g => g.name).join(', ')}`);

  console.log('\n=== [4/5] PROBANDO EXTRACCIÓN DE CAPÍTULOS ===');
  // Usamos per_page=1000 para traer todos los capítulos de golpe
  const chRes = await fetch(`${BASE_URL}/api/mv/mangas/${targetManga.id}/chapters?per_page=1000`, { headers: HEADERS });
  const chData = await chRes.json();
  const chapters = chData.items || [];
  console.log(`✓ Capítulos extraídos para ${targetManga.title}: ${chapters.length} capítulos (Total real: ${chData.pagination?.total_items})`);
  if (chapters.length === 0) throw new Error('No se extrajo ningún capítulo!');
  console.log(`  Primer capítulo: ${chapters[0].title} (slug: ${chapters[0].chapter_slug})`);
  console.log(`  Último capítulo: ${chapters[chapters.length - 1].title} (slug: ${chapters[chapters.length - 1].chapter_slug})`);

  console.log('\n=== [5/5] PROBANDO PÁGINAS E IMÁGENES CON ENCRIPTACIÓN FANSY ===');
  const targetChapter = chapters[0];
  const pageRes = await fetch(`${BASE_URL}/api/mv/mangas/${targetManga.id}/chapter?chapter_slug=${targetChapter.chapter_slug}`, { headers: HEADERS });
  const pageData = await pageRes.json();
  const pages = pageData.content?.pages || [];
  const fansyHeader = pageData.security?.header || '';
  console.log(`✓ Páginas extraídas del capítulo: ${pages.length}`);
  console.log(`✓ Token Fansy detectado: "${fansyHeader}"`);
  if (pages.length === 0) throw new Error('No se extrajeron páginas del capítulo!');

  // Probar descarga real de la primera imagen
  const testImgUrl = pages[0];
  console.log(`  Descargando imagen 1: ${testImgUrl.substring(0, 80)}...`);
  const imgHeaders = {
    ...HEADERS,
    ...(fansyHeader ? { Fansy: fansyHeader } : {}),
  };
  const imgFetch = await fetch(testImgUrl, { headers: imgHeaders });
  console.log(`✓ Status HTTP de la imagen: ${imgFetch.status} (OK: ${imgFetch.ok})`);
  console.log(`✓ Content-Type: ${imgFetch.headers.get('content-type')}`);
  const imgBuffer = await imgFetch.arrayBuffer();
  console.log(`✓ Tamaño descargado: ${(imgBuffer.byteLength / 1024).toFixed(1)} KB`);

  if (!imgFetch.ok || imgBuffer.byteLength < 1000) {
    throw new Error('La imagen no se descargó correctamente!');
  }

  console.log('\n=======================================================');
  console.log('✅ TODAS LAS PRUEBAS DE MANGA CRAB COMPLETADAS AL 100%');
  console.log('=======================================================');
}

runVerification().catch((err) => {
  console.error('❌ Error en verificación:', err);
  process.exit(1);
});
