import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Servir scripts .js estáticos
app.use('/extensions', express.static(path.join(rootDir, 'extensions')));

const getRegistry = () => {
  const registryPath = path.join(rootDir, 'config', 'registry.json');
  if (fs.existsSync(registryPath)) {
    return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  }
  return { repositoryName: 'Repositorio Oficial Yomori', extensions: [] };
};

const saveRegistry = (registry) => {
  const registryPath = path.join(rootDir, 'config', 'registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
};

/**
 * 1. INDEX.JSON OFICIAL (MANIFEST KEIYOUSHI MAPEADO CON scriptUrl)
 */
app.get('/index.json', (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol;
  const baseUrl = `${protocol}://${host}`;

  const registry = getRegistry();
  const manifest = registry.extensions.map(ext => {
    let scriptFile = ext.script || ext.scriptUrl || 'olympus.js';
    if (scriptFile.startsWith('/extensions/')) scriptFile = scriptFile.replace('/extensions/', '');
    if (scriptFile.startsWith('/')) scriptFile = scriptFile.slice(1);

    return {
      id: ext.id,
      name: ext.name,
      version: ext.version || '1.0.0',
      lang: ext.lang || 'es',
      baseUrl: ext.baseUrl,
      icon: ext.icon || `${ext.baseUrl.replace(/\/+$/, '')}/favicon.ico`,
      scriptUrl: `${baseUrl}/extensions/${scriptFile}`,
      description: ext.description || `Extensión oficial para ${ext.name}`,
      status: ext.status || 'online',
      features: ext.features || ['catalog', 'search', 'details', 'chapters']
    };
  });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=10');
  res.json(manifest);
});

/**
 * 2. API DE ADMINISTRADOR: REGISTRAR O ACTUALIZAR SCAN
 */
app.post('/api/admin/register', (req, res) => {
  try {
    let { id, name, baseUrl, version = '1.0.0', scriptName, lang = 'es', description = '', icon = '' } = req.body;

    if (!baseUrl) {
      return res.status(400).json({ success: false, message: 'La URL Base del Scan es obligatoria' });
    }

    // Normalizar URL
    baseUrl = baseUrl.trim().replace(/\/+$/, '');
    if (!name) {
      try {
        name = new URL(baseUrl).hostname.replace(/^www\./, '').split('.')[0];
        name = name.charAt(0).toUpperCase() + name.slice(1);
      } catch {
        name = 'Scanlation Fuente';
      }
    }

    if (!id) {
      id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }

    if (!scriptName) {
      scriptName = `${id}.js`;
    }

    // Verificar o generar el archivo de script .js si no existe
    const extensionsDir = path.join(rootDir, 'extensions');
    const targetScriptPath = path.join(extensionsDir, scriptName);

    if (!fs.existsSync(targetScriptPath)) {
      // Usar plantilla de olympus.js como base funcional
      const templatePath = path.join(extensionsDir, 'olympus.js');
      if (fs.existsSync(templatePath)) {
        let templateContent = fs.readFileSync(templatePath, 'utf-8');
        templateContent = templateContent
          .replace(/id:\s*config\.id\s*\|\|\s*'[^']+'/g, `id: config.id || '${id}'`)
          .replace(/name:\s*config\.name\s*\|\|\s*'[^']+'/g, `name: config.name || '${name}'`)
          .replace(/baseUrl:\s*config\.baseUrl\s*\|\|\s*'[^']+'/g, `baseUrl: config.baseUrl || '${baseUrl}'`);
        fs.writeFileSync(targetScriptPath, templateContent, 'utf-8');
      }
    }

    const registry = getRegistry();
    const existingIndex = registry.extensions.findIndex(e => e.id === id);

    const newExt = {
      id,
      name,
      version,
      lang,
      baseUrl,
      icon: icon || `${baseUrl}/favicon.ico`,
      script: scriptName,
      scriptUrl: `/extensions/${scriptName}`,
      description: description || `Lector y extractor en tiempo real para ${name}.`,
      status: 'online',
      features: ['catalog', 'search', 'details', 'chapters']
    };

    if (existingIndex >= 0) {
      registry.extensions[existingIndex] = newExt;
    } else {
      registry.extensions.push(newExt);
    }

    saveRegistry(registry);

    res.json({
      success: true,
      message: `Extensión "${name}" publicada exitosamente en el repositorio.`,
      extension: newExt
    });
  } catch (err) {
    console.error('[Admin Register Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 3. API DE ADMINISTRADOR: ELIMINAR EXTENSIÓN
 */
app.delete('/api/admin/extensions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const registry = getRegistry();
    registry.extensions = registry.extensions.filter(e => e.id !== id);
    saveRegistry(registry);
    res.json({ success: true, message: `Extensión ${id} eliminada del repositorio.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4. PANEL DE ADMINISTRADOR WEB (HTML + Tailwind Visual UI)
 */
const renderAdminPage = (req, res) => {
  const host = req.get('host');
  const manifestUrl = `http://${host}/index.json`;
  const registry = getRegistry();

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Panel Administrador — Repositorio Yomori</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #080a0f; color: #e2e8f0; }
  </style>
</head>
<body class="min-h-screen p-4 sm:p-8">
  <div class="max-w-5xl mx-auto space-y-8">
    
    <!-- Header -->
    <header class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-[#10141f] border border-gray-800 rounded-3xl shadow-2xl">
      <div class="flex items-center gap-3.5">
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-purple-600/30">
          Y
        </div>
        <div>
          <h1 class="text-xl sm:text-2xl font-black text-white tracking-tight">Panel Administrador Yomori</h1>
          <p class="text-xs text-purple-400 font-medium mt-0.5">Gestor de Extensiones y Scans para Yomori Manga</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <a href="/index.json" target="_blank" class="px-4 py-2 bg-purple-950/80 hover:bg-purple-900/80 border border-purple-800/80 text-purple-300 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition">
          <span>Ver index.json en vivo</span>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
        </a>
      </div>
    </header>

    <!-- Grid: Formulario de Registro + Lista de Extensiones -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
      
      <!-- FORMULARIO: REGISTRAR NUEVA FUENTE -->
      <div class="lg:col-span-5 bg-[#10141f] border border-gray-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div class="border-b border-gray-800 pb-3">
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-purple-500"></span>
            <span>Publicar Nuevo Scanlation / Página</span>
          </h2>
          <p class="text-xs text-gray-400 mt-1">
            Pega la URL de la página. El repositorio generará el script y actualizará <code class="text-purple-300 font-mono">index.json</code> para que aparezca en Yomori.
          </p>
        </div>

        <form id="registerForm" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">URL Base del Scan *</label>
            <input type="url" id="baseUrl" name="baseUrl" required placeholder="https://olympusxyz.com" class="w-full bg-[#090b10] border border-gray-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 font-mono">
          </div>

          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Nombre de la Extensión</label>
            <input type="text" id="name" name="name" placeholder="Olympus Scanlation" class="w-full bg-[#090b10] border border-gray-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500">
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Versión</label>
              <input type="text" id="version" name="version" value="2.1.0" class="w-full bg-[#090b10] border border-gray-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500">
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Idioma</label>
              <input type="text" id="lang" name="lang" value="es" class="w-full bg-[#090b10] border border-gray-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500">
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Descripción Corta</label>
            <textarea id="description" name="description" rows="2" placeholder="Lector oficial de cómics y manhwas en español." class="w-full bg-[#090b10] border border-gray-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"></textarea>
          </div>

          <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30 transition transform active:scale-95">
            + Publicar en el Repositorio
          </button>
        </form>
      </div>

      <!-- LISTA DE EXTENSIONES PUBLICADAS -->
      <div class="lg:col-span-7 bg-[#10141f] border border-gray-800 rounded-3xl p-6 shadow-xl space-y-4 flex flex-col">
        <div class="flex items-center justify-between border-b border-gray-800 pb-3">
          <div>
            <h2 class="text-base font-bold text-white">Extensiones Activas en el Repositorio</h2>
            <p class="text-xs text-gray-400">Estas extensiones se sincronizan automáticamente con Yomori.</p>
          </div>
          <span class="text-xs font-mono font-bold text-purple-400 px-2.5 py-1 rounded-full bg-purple-950/80 border border-purple-800/60">
            ${registry.extensions.length} publicadas
          </span>
        </div>

        <div class="space-y-3 flex-1 overflow-y-auto">
          ${registry.extensions.map(ext => `
            <div class="p-4 bg-[#151926] border border-gray-800/90 rounded-2xl flex items-center justify-between gap-4">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-bold text-white truncate">${ext.name}</h3>
                  <span class="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 font-mono border border-purple-800">v${ext.version}</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 font-semibold border border-emerald-800">${ext.status || 'online'}</span>
                </div>
                <p class="text-xs text-gray-400 font-mono mt-0.5 truncate">${ext.baseUrl}</p>
                <p class="text-[11px] text-purple-400/80 font-mono mt-1 truncate">
                  scriptUrl: /extensions/${ext.script || 'olympus.js'}
                </p>
              </div>

              <button onclick="deleteExtension('${ext.id}')" class="p-2 text-gray-500 hover:text-red-400 hover:bg-red-950/30 rounded-xl transition" title="Eliminar extensión">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          `).join('')}
        </div>
      </div>

    </div>

  </div>

  <script>
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        baseUrl: document.getElementById('baseUrl').value,
        name: document.getElementById('name').value,
        version: document.getElementById('version').value,
        lang: document.getElementById('lang').value,
        description: document.getElementById('description').value
      };

      try {
        const res = await fetch('/api/admin/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          alert('¡Extensión publicada exitosamente!');
          window.location.reload();
        } else {
          alert('Error: ' + data.message);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });

    async function deleteExtension(id) {
      if (!confirm('¿Seguro que deseas eliminar esta extensión del repositorio?')) return;
      try {
        const res = await fetch('/api/admin/extensions/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          window.location.reload();
        }
      } catch (err) {
        alert('Error eliminando: ' + err.message);
      }
    }
  </script>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
};

app.get('/', renderAdminPage);
app.get('/admin', renderAdminPage);

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`📦 Keiyoushi Repo Server activo en: http://localhost:${PORT}`);
  console.log(`🛠️ Panel de Administrador en: http://localhost:${PORT}/admin`);
  console.log(`📋 Manifest de Extensiones en: http://localhost:${PORT}/index.json`);
  console.log(`=================================================`);
});
