const CONFIG = { ANTHROPIC_KEY: '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' };

// ─── Helpers ─────────────────────────────────────────────
function formatNum(n) {
  const val = parseFloat(n) || 0;
  return val % 1 === 0 ? val.toString() : val.toFixed(1).replace('.', ',');
}

function actualizarContadorCache() {
  const el = document.getElementById('cache-count');
  if (!el) return;
  const n = cargarCache().length;
  el.textContent = n > 0 ? `${n} producto${n > 1 ? 's' : ''} guardado${n > 1 ? 's' : ''}` : '';
}

// ─── Caché de productos escaneados ───────────────────────
function cargarCache() {
  return JSON.parse(localStorage.getItem('comiapp-cache-productos') || '[]');
}

function guardarEnCache(producto) {
  const cache = cargarCache();
  const nombre = (producto.nombre || '').toLowerCase().trim();
  if (!nombre) return;

  // Evitar duplicados por nombre similar
  const existe = cache.findIndex(p => p.nombre.toLowerCase() === nombre);
  if (existe >= 0) {
    cache[existe] = producto; // Actualizar si ya existe
  } else {
    cache.unshift(producto); // Agregar al inicio
    if (cache.length > 100) cache.pop(); // Máximo 100 productos
  }

  localStorage.setItem('comiapp-cache-productos', JSON.stringify(cache));
  renderCacheProductos();
}

function eliminarDeCache(idx) {
  const cache = cargarCache();
  cache.splice(idx, 1);
  localStorage.setItem('comiapp-cache-productos', JSON.stringify(cache));
  renderCacheProductos();
}

function renderCacheProductos() {
  const div   = document.getElementById('cache-productos-lista');
  if (!div) return;
  const cache = cargarCache();

  if (cache.length === 0) {
    div.innerHTML = '<p class="receta-vacia">Aún no has escaneado productos. Los productos escaneados aparecerán aquí para reutilizarlos rápidamente.</p>';
    return;
  }

  div.innerHTML = cache.map((p, i) => `
    <div class="receta-card">
      <div class="receta-card-info" onclick="usarProductoCache(${i})" style="cursor:pointer">
        <span class="receta-card-nombre">${p.nombre}</span>
        <span class="receta-card-macros">P:${formatNum(p.proteinas)}g · C:${formatNum(p.carbos)}g · G:${formatNum(p.grasas)}g</span>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem">
        <div class="receta-card-kcal" onclick="usarProductoCache(${i})" style="cursor:pointer">
          ${formatNum(p.calorias)}
          <span>kcal/100g</span>
        </div>
        <button class="btn-eliminar" onclick="eliminarDeCache(${i})">✕</button>
      </div>
    </div>
  `).join('');
}

function usarProductoCache(idx) {
  const cache   = cargarCache();
  const producto = cache[idx];
  mostrarConfirmacion({
    nombre:    producto.nombre,
    calorias:  producto.calorias,
    proteinas: producto.proteinas,
    carbos:    producto.carbos,
    grasas:    producto.grasas,
    por100g:   true
  });
}

function buscarEnCache(q) {
  if (q.length < 2) { renderCacheProductos(); return; }
  const cache     = cargarCache();
  const resultado = cache.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase()));
  const div       = document.getElementById('cache-productos-lista');
  if (!div) return;

  if (resultado.length === 0) {
    div.innerHTML = '<p class="receta-vacia">Sin resultados en productos guardados.</p>';
    return;
  }

  div.innerHTML = resultado.map((p, i) => {
    const idx = cache.indexOf(p);
    return `
      <div class="receta-card">
        <div class="receta-card-info" onclick="usarProductoCache(${idx})" style="cursor:pointer">
          <span class="receta-card-nombre">${p.nombre}</span>
          <span class="receta-card-macros">P:${formatNum(p.proteinas)}g · C:${formatNum(p.carbos)}g · G:${formatNum(p.grasas)}g</span>
        </div>
        <div class="receta-card-kcal" onclick="usarProductoCache(${idx})" style="cursor:pointer">
          ${formatNum(p.calorias)}
          <span>kcal/100g</span>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Estado global ────────────────────────────────────────
const hoy       = new Date();
const claveHoy  = `comiapp-${hoy.toISOString().slice(0, 10)}`;
let alimentos   = JSON.parse(localStorage.getItem(claveHoy) || '[]');
let alimentoPendiente   = null;
let busquedaTimeout     = null;
let comidaSeleccionada  = 'desayuno';
let streamActivo        = null;
let bienestarHoy        = { energia: 0, animo: 0 };
let sexoSeleccionado    = 'h';
let objetivoSeleccionado = 'bajar';
let resultadoCalc       = null;
let graficoPeso = null, graficoCalorias = null, graficoMacros = null;

// ─── Navegación ───────────────────────────────────────────
function mostrarSeccion(seccion) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.add('oculto'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('activo'));

  const el  = document.getElementById(`sec-${seccion}`);
  const nav = document.getElementById(`nav-${seccion}`);
  if (el)  el.classList.remove('oculto');
  if (nav) nav.classList.add('activo');

  if (seccion === 'metas')    actualizarBarrasMetas();
  if (seccion === 'progreso') renderProgreso();
  if (seccion === 'historial') renderHistorial();
  if (seccion === 'bienestar') { renderBienestarHistorial(); cargarBienestarHoy(); }
  if (seccion === 'inicio')   renderComidas();
  if (seccion === 'ejercicio') renderEjercicio();
  if (seccion === 'recetas') renderRecetas();
  if (seccion === 'registro') {
  renderCacheProductos();
  actualizarContadorCache();
}
}

function abrirMenuMas() {
  const menu = document.getElementById('menu-mas');
  menu.classList.remove('oculto');
  menu.style.display = 'flex';
}

function cerrarMenuMas() {
  const menu = document.getElementById('menu-mas');
  menu.classList.add('oculto');
  menu.style.display = 'none';
}

function irSeccion(seccion) {
  cerrarMenuMas();
  mostrarSeccion(seccion);
}

function irA(tab) {
  mostrarSeccion('registro');
  setTimeout(() => {
    const btn = document.querySelector(`.sub-tab[onclick="mostrarTab('${tab}', this)"]`);
    mostrarTab(tab, btn);
  }, 50);
}

function mostrarTab(tab, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('oculto'));
  document.querySelectorAll('.sub-tab').forEach(el => el.classList.remove('activo'));
  const el = document.getElementById(`tab-${tab}`);
  if (el) el.classList.remove('oculto');
  if (btn) btn.classList.add('activo');
  if (tab !== 'barras' && streamActivo) cerrarVisor();
}

// ─── Fecha ────────────────────────────────────────────────
document.getElementById('fecha-hoy').textContent =
  hoy.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

// ─── Guardar / Renderizar ─────────────────────────────────
function guardar() {
  localStorage.setItem(claveHoy, JSON.stringify(alimentos));
}

function actualizarResumen() {
  const sumar = key => alimentos.reduce((s, a) => s + (parseFloat(a[key]) || 0), 0);
  document.getElementById('total-calorias').textContent  = formatNum(sumar('calorias'));
  document.getElementById('total-proteinas').textContent = formatNum(sumar('proteinas')) + 'g';
  document.getElementById('total-carbos').textContent    = formatNum(sumar('carbos')) + 'g';
  document.getElementById('total-grasas').textContent    = formatNum(sumar('grasas')) + 'g';
}

function renderLista() {
  actualizarResumen();
  actualizarBarrasMetas();
  renderComidas();
}

function eliminar(i) {
  alimentos.splice(i, 1);
  guardar();
  renderLista();
}

// ─── Comidas ──────────────────────────────────────────────
function seleccionarComida(comida) {
  comidaSeleccionada = comida;
  ['desayuno','almuerzo','cena','snack'].forEach(c => {
    document.getElementById(`comida-btn-${c}`).classList.toggle('activo', c === comida);
  });
}

function toggleComida(comida) {
  document.getElementById(`body-${comida}`).classList.toggle('visible');
  document.getElementById(`flecha-${comida}`).classList.toggle('abierto');
}

function renderComidas() {
  ['desayuno','almuerzo','cena','snack'].forEach(comida => {
    const items  = alimentos.filter(a => (a.comida || 'desayuno') === comida);
    const lista  = document.getElementById(`lista-${comida}`);
    const kcalEl = document.getElementById(`kcal-${comida}`);
    if (!lista || !kcalEl) return;

    kcalEl.textContent = formatNum(items.reduce((s, a) => s + (parseFloat(a.calorias) || 0), 0)) + ' kcal';

    if (items.length === 0) {
      lista.innerHTML = '<li class="comida-vacia">Sin alimentos</li>';
      return;
    }

    lista.innerHTML = alimentos
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => (a.comida || 'desayuno') === comida)
      .map(({ a, i }) => `
        <li>
          <div class="li-info">
            <span class="li-nombre">${a.nombre}</span>
            <span class="li-macros">P:${formatNum(a.proteinas)}g C:${formatNum(a.carbos)}g G:${formatNum(a.grasas)}g</span>
          </div>
          <span class="li-kcal">${formatNum(a.calorias)} kcal</span>
          <button class="btn-eliminar" onclick="eliminar(${i})">✕</button>
        </li>
      `).join('');
  });
}

// ─── Confirmación ─────────────────────────────────────────
function mostrarConfirmacion(alimento) {
  alimentoPendiente = alimento;
  const esPor100g = alimento.por100g !== false;

  document.getElementById('confirmar-info').innerHTML = `
    <strong>${alimento.nombre}</strong><br>
    ${esPor100g
      ? `📊 Por 100g · ${formatNum(alimento.calorias)} kcal · P:${formatNum(alimento.proteinas)}g C:${formatNum(alimento.carbos)}g G:${formatNum(alimento.grasas)}g`
      : `🔥 ${formatNum(alimento.calorias)} kcal · P:${formatNum(alimento.proteinas)}g C:${formatNum(alimento.carbos)}g G:${formatNum(alimento.grasas)}g`
    }
  `;

  const gc = document.getElementById('gramos-container');
  gc.style.display = esPor100g ? 'block' : 'none';
  if (esPor100g) {
    document.getElementById('input-gramos').value = '';
    document.getElementById('calculo-resultado').innerHTML = '';
  }

  mostrarSeccion('registro');
  document.getElementById('confirmar-panel').classList.remove('oculto');
  document.getElementById('confirmar-panel').scrollIntoView({ behavior: 'smooth' });
}

function actualizarCalculo() {
  const gramos = parseFloat(document.getElementById('input-gramos').value);
  const div    = document.getElementById('calculo-resultado');
  if (!gramos || gramos <= 0 || !alimentoPendiente) { div.innerHTML = ''; return; }

  const f = gramos / 100;
  div.innerHTML = `Para <strong>${gramos}g</strong>: 🔥 ${(alimentoPendiente.calorias*f).toFixed(1).replace('.',',')} kcal · P:${(alimentoPendiente.proteinas*f).toFixed(1).replace('.',',')}g C:${(alimentoPendiente.carbos*f).toFixed(1).replace('.',',')}g G:${(alimentoPendiente.grasas*f).toFixed(1).replace('.',',')}g`;
}

function confirmarAlimento() {
  if (!alimentoPendiente) return;
  let a = { ...alimentoPendiente };
  const esPor100g = a.por100g !== false;

  if (esPor100g) {
    const gramos = parseFloat(document.getElementById('input-gramos').value);
    if (!gramos || gramos <= 0) { alert('Ingresa los gramos que vas a comer'); return; }
    const f = gramos / 100;
    a = {
      nombre:    `${a.nombre} (${gramos}g)`,
      calorias:  parseFloat((a.calorias  * f).toFixed(1)),
      proteinas: parseFloat((a.proteinas * f).toFixed(1)),
      carbos:    parseFloat((a.carbos    * f).toFixed(1)),
      grasas:    parseFloat((a.grasas    * f).toFixed(1))
    };
  }

  a.comida = comidaSeleccionada;
  alimentos.push(a);
  guardar();
  renderLista();

  alimentoPendiente = null;
  document.getElementById('confirmar-panel').classList.add('oculto');

  // Limpiar todos los campos
  document.getElementById('buscador').value = '';
  document.getElementById('resultados-busqueda').innerHTML = '';
  document.getElementById('input-barras').value = '';
  document.getElementById('estado-escaner').textContent = '';
  document.getElementById('nombre').value = '';
  document.getElementById('calorias').value = '';
  document.getElementById('proteinas').value = '';
  document.getElementById('carbos').value = '';
  document.getElementById('grasas').value = '';
  document.getElementById('input-gramos').value = '';
  document.getElementById('calculo-resultado').innerHTML = '';
}

function cancelarConfirmacion() {
  alimentoPendiente = null;
  document.getElementById('confirmar-panel').classList.add('oculto');
}

// ─── Búsqueda Open Food Facts ─────────────────────────────
function buscarAlimento() {
  clearTimeout(busquedaTimeout);
  const q   = document.getElementById('buscador').value.trim();
  const div = document.getElementById('resultados-busqueda');
  if (q.length < 3) { div.innerHTML = ''; return; }
  div.innerHTML = '<p class="cargando">Buscando...</p>';

  busquedaTimeout = setTimeout(async () => {
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=5&lc=es`;
      const res  = await fetch(url);
      const data = await res.json();
      mostrarResultados(data.products || []);
    } catch {
      div.innerHTML = '<p class="cargando">Error al buscar. Verifica tu conexión.</p>';
    }
  }, 600);
}

function mostrarResultados(productos) {
  const div    = document.getElementById('resultados-busqueda');
  const validos = productos.filter(p => p.product_name && p.nutriments && p.nutriments['energy-kcal_100g']);

  if (validos.length === 0) {
    div.innerHTML = '<p class="cargando">Sin resultados. Prueba otro nombre o ingresa manualmente.</p>';
    return;
  }

  div.innerHTML = validos.map((p, i) => {
    const n    = p.nutriments;
    const kcal = formatNum(n['energy-kcal_100g'] || 0);
    const prot = formatNum(n['proteins_100g']     || 0);
    const carb = formatNum(n['carbohydrates_100g']|| 0);
    const gras = formatNum(n['fat_100g']           || 0);
    return `
      <div class="resultado-item" onclick="seleccionarResultado(${i})">
        <div class="resultado-nombre">${p.product_name}</div>
        <div class="resultado-macros">Por 100g · ${kcal} kcal · P:${prot}g C:${carb}g G:${gras}g</div>
      </div>
    `;
  }).join('');

  window._resultadosActuales = validos;
}

function seleccionarResultado(i) {
  const p = window._resultadosActuales[i];
  const n = p.nutriments;
  mostrarConfirmacion({
    nombre:    p.product_name,
    calorias:  n['energy-kcal_100g']  || 0,
    proteinas: n['proteins_100g']      || 0,
    carbos:    n['carbohydrates_100g'] || 0,
    grasas:    n['fat_100g']           || 0,
    por100g: true
  });
}

// ─── Código de barras manual ──────────────────────────────
async function buscarManualBarras() {
  const codigo = document.getElementById('input-barras').value.trim();
  if (!codigo) { alert('Ingresa el código de barras'); return; }
  document.getElementById('estado-escaner').textContent = 'Buscando producto...';
  await buscarPorBarras(codigo);
  document.getElementById('input-barras').value = '';
}

async function buscarPorBarras(codigo) {
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8000);

    const res  = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${codigo}.json`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const data = await res.json();
    if (data.status !== 1 || !data.product) {
      document.getElementById('estado-escaner').textContent = 'Producto no encontrado. Intenta con el buscador.';
      return;
    }

    const p = data.product;
    const n = p.nutriments || {};
    document.getElementById('estado-escaner').textContent = '';

    mostrarConfirmacion({
      nombre:    p.product_name || 'Producto sin nombre',
      calorias:  n['energy-kcal_100g']   || 0,
      proteinas: n['proteins_100g']       || 0,
      carbos:    n['carbohydrates_100g']  || 0,
      grasas:    n['fat_100g']            || 0,
      por100g:   true
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      document.getElementById('estado-escaner').textContent = 'Tiempo de espera agotado. Verifica tu conexión.';
    } else {
      document.getElementById('estado-escaner').textContent = 'Error al buscar el producto.';
    }
  }
}

// ─── Ingreso manual ───────────────────────────────────────
function agregarManual() {
  const nombre = document.getElementById('nombre').value.trim();
  if (!nombre) { alert('Escribe el nombre del alimento'); return; }

  const calorias  = parseFloat(document.getElementById('calorias').value)  || 0;
  const proteinas = parseFloat(document.getElementById('proteinas').value) || 0;
  const carbos    = parseFloat(document.getElementById('carbos').value)    || 0;
  const grasas    = parseFloat(document.getElementById('grasas').value)    || 0;

  mostrarConfirmacion({
    nombre, calorias, proteinas, carbos, grasas, por100g: true
  });
}

// ─── Visor cámara + OCR ───────────────────────────────────
async function abrirVisor() {
  document.getElementById('visor-container').classList.remove('oculto');
  document.getElementById('btn-abrir-visor').classList.add('oculto');
  document.getElementById('foto-preview-container').classList.add('oculto');
  document.getElementById('estado-ocr').textContent = '';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    streamActivo = stream;
    document.getElementById('visor-video').srcObject = stream;
  } catch {
    document.getElementById('estado-ocr').textContent = 'No se pudo acceder a la cámara.';
    cerrarVisor();
  }
}

async function capturarVisor() {
  const video  = document.getElementById('visor-video');
  const canvas = document.getElementById('canvas-captura');
  const estado = document.getElementById('estado-ocr');

  const scaleX = video.videoWidth  / video.offsetWidth;
  const scaleY = video.videoHeight / video.offsetHeight;
  const recW   = video.offsetWidth  * 0.65 * scaleX;
  const recH   = 380 * scaleY;
  const recX   = (video.videoWidth  - recW) / 2;
  const recY   = (video.videoHeight - recH) / 2;

  canvas.width  = recW;
  canvas.height = recH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, recX, recY, recW, recH, 0, 0, recW, recH);

  cerrarVisor();
  estado.textContent = '🤖 Analizando con IA...';

  document.getElementById('foto-preview').src = canvas.toDataURL('image/jpeg', 0.95);
  document.getElementById('foto-preview-container').classList.remove('oculto');
  ['foto-calorias','foto-proteinas','foto-carbos','foto-grasas','foto-nombre'].forEach(id => {
    document.getElementById(id).value = '';
  });

  try {
      const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CONFIG.ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
              { type: 'text', text: 'Esta es una tabla nutricional chilena. Extrae los valores de la columna "100g" o "100ml" para: Energía en kcal, Proteínas en g, Grasa total en g, H de C disp o Carbohidratos en g. Si ves el nombre del producto, extráelo también. Responde SOLO con JSON sin texto extra: {"nombre":"","calorias":0,"proteinas":0,"carbos":0,"grasas":0}' }
            ]
          }]
        })
      });

      console.log('Status:', res.status);
      const data = await res.json();
      console.log('Respuesta completa:', JSON.stringify(data));

      if (data.error) {
        estado.textContent = `Error API: ${data.error.message}`;
        return;
      }

      if (!data.content || !data.content[0]) {
        estado.textContent = 'Respuesta vacía de la API';
        return;
      }

      const texto = data.content[0].text.trim();
      console.log('Texto Claude:', texto);

      // Limpiar posibles markdown que Claude agregue
      const jsonLimpio = texto.replace(/```json|```/g, '').trim();
      const macros = JSON.parse(jsonLimpio);

      if (macros.nombre) guardarEnCache(macros);

      estado.textContent = '✅ Tabla leída correctamente. Verifica y corrige si es necesario.';

      if (macros.nombre)    document.getElementById('foto-nombre').value    = macros.nombre;
      if (macros.calorias)  document.getElementById('foto-calorias').value  = String(macros.calorias).replace('.', ',');
      if (macros.proteinas) document.getElementById('foto-proteinas').value = String(macros.proteinas).replace('.', ',');
      if (macros.carbos)    document.getElementById('foto-carbos').value    = String(macros.carbos).replace('.', ',');
      if (macros.grasas)    document.getElementById('foto-grasas').value    = String(macros.grasas).replace('.', ',');

    } catch (e) {
      console.error('Error completo:', e.name, e.message, e);
      estado.textContent = `⚠️ Error: ${e.message}. Revisa la consola.`;
    }
  }

  function cerrarVisor() {
    if (streamActivo) { streamActivo.getTracks().forEach(t => t.stop()); streamActivo = null; }
    document.getElementById('visor-container').classList.add('oculto');
    document.getElementById('btn-abrir-visor').classList.remove('oculto');
  }

  function extraerMacros(texto) {
    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    function primerNumero(linea) {
      const nums = linea.match(/\d+[,.]\d+|\d+/g);
      if (!nums) return null;
      for (const n of nums) {
        const val = parseFloat(n.replace(',', '.'));
        if (val > 0 && val < 5000) return val;
      }
      return null;
    }

  function buscarLinea(patrones) {
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i].toLowerCase().replace(/\s+/g, ' ');
      for (const p of patrones) {
        if (p.test(l)) {
          let val = primerNumero(lineas[i]);
          if (val !== null) return val;
          if (i+1 < lineas.length) { val = primerNumero(lineas[i+1]); if (val !== null) return val; }
        }
      }
    }
    return 0;
  }

  return {
    calorias:  buscarLinea([/energ[ií]a\s*\(kcal\)/, /energ[ií]a/, /kcal/]),
    proteinas: buscarLinea([/prote[ií]nas?\s*\(g\)/, /prote[ií]nas?/]),
    carbos:    buscarLinea([/h\s*\.?\s*de\s*c\s*disp/, /hde\s*c/, /hdec/, /hidratos\s*de\s*carbono/, /carbohidratos?/]),
    grasas:    buscarLinea([/grasa\s*total\s*\(g\)/, /grasa\s*total/, /grasas?\s*totales?/])
  };
}

function confirmarFotoTabla() {
  const parsear = id => parseFloat(document.getElementById(id).value.replace(',', '.')) || 0;
  const calorias  = parsear('foto-calorias');
  const proteinas = parsear('foto-proteinas');
  const carbos    = parsear('foto-carbos');
  const grasas    = parsear('foto-grasas');
  const nombre    = document.getElementById('foto-nombre').value.trim() || 'Producto escaneado';

  if (!calorias && !proteinas && !carbos && !grasas) { alert('Ingresa al menos un valor nutricional'); return; }

  document.getElementById('foto-preview-container').classList.add('oculto');
  document.getElementById('foto-preview').src = '';
  document.getElementById('estado-ocr').textContent = '';

  mostrarConfirmacion({ nombre, calorias, proteinas, carbos, grasas, por100g: true });
}

function cancelarFotoTabla() {
  document.getElementById('foto-preview-container').classList.add('oculto');
  document.getElementById('foto-preview').src = '';
  document.getElementById('estado-ocr').textContent = '';
}

// ─── Metas diarias ────────────────────────────────────────
function cargarMetas() {
  return {
    calorias:  parseInt(localStorage.getItem('meta-calorias'))  || 0,
    proteinas: parseInt(localStorage.getItem('meta-proteinas')) || 0,
    carbos:    parseInt(localStorage.getItem('meta-carbos'))    || 0,
    grasas:    parseInt(localStorage.getItem('meta-grasas'))    || 0
  };
}

function actualizarBarrasMetas() {
  const metas   = cargarMetas();
  const consumo = {
    calorias:  alimentos.reduce((s, a) => s + (parseFloat(a.calorias)  || 0), 0),
    proteinas: alimentos.reduce((s, a) => s + (parseFloat(a.proteinas) || 0), 0),
    carbos:    alimentos.reduce((s, a) => s + (parseFloat(a.carbos)    || 0), 0),
    grasas:    alimentos.reduce((s, a) => s + (parseFloat(a.grasas)    || 0), 0)
  };

  [
    { key: 'cal',  unidad: 'kcal', c: consumo.calorias,  m: metas.calorias  },
    { key: 'prot', unidad: 'g',    c: consumo.proteinas, m: metas.proteinas },
    { key: 'carb', unidad: 'g',    c: consumo.carbos,    m: metas.carbos    },
    { key: 'gras', unidad: 'g',    c: consumo.grasas,    m: metas.grasas    }
  ].forEach(({ key, unidad, c, m }) => {
    const texto = document.getElementById(`meta-${key}-texto`);
    const fill  = document.getElementById(`meta-${key}-fill`);
    if (!texto || !fill) return;
    const pct      = m > 0 ? Math.min((c / m) * 100, 100) : 0;
    const excedido = m > 0 && c > m;
    texto.textContent = m > 0 ? `${formatNum(c)} / ${m} ${unidad}` : `${formatNum(c)} ${unidad}`;
    fill.style.width = pct + '%';
    fill.classList.toggle('excedido', excedido);
  });
}

function abrirModalMetas() {
  const m = cargarMetas();
  document.getElementById('meta-cal-input').value  = m.calorias  || '';
  document.getElementById('meta-prot-input').value = m.proteinas || '';
  document.getElementById('meta-carb-input').value = m.carbos    || '';
  document.getElementById('meta-gras-input').value = m.grasas    || '';
  const modal = document.getElementById('modal-metas');
  modal.classList.remove('oculto'); modal.style.display = 'flex';
}

function cerrarModalMetas() {
  const modal = document.getElementById('modal-metas');
  modal.classList.add('oculto'); modal.style.display = 'none';
}

function guardarMetas() {
  localStorage.setItem('meta-calorias',  document.getElementById('meta-cal-input').value  || 0);
  localStorage.setItem('meta-proteinas', document.getElementById('meta-prot-input').value || 0);
  localStorage.setItem('meta-carbos',    document.getElementById('meta-carb-input').value || 0);
  localStorage.setItem('meta-grasas',    document.getElementById('meta-gras-input').value || 0);
  cerrarModalMetas();
  actualizarBarrasMetas();
}

// ─── Calculadora ──────────────────────────────────────────
function seleccionarSexo(sexo) {
  sexoSeleccionado = sexo;
  document.getElementById('sexo-h').classList.toggle('activo', sexo === 'h');
  document.getElementById('sexo-m').classList.toggle('activo', sexo === 'm');
}

function seleccionarObjetivo(obj) {
  objetivoSeleccionado = obj;
  ['bajar','mantener','subir'].forEach(o =>
    document.getElementById(`obj-${o}`).classList.toggle('activo', o === obj)
  );
}

function calcularCalorias() {
  const edad     = parseInt(document.getElementById('calc-edad').value);
  const peso     = parseFloat(document.getElementById('calc-peso').value);
  const estatura = parseFloat(document.getElementById('calc-estatura').value);
  const actividad= parseFloat(document.getElementById('calc-actividad').value);

  if (!edad || !peso || !estatura) { alert('Completa todos los campos'); return; }

  const tmb = sexoSeleccionado === 'h'
    ? 10*peso + 6.25*estatura - 5*edad + 5
    : 10*peso + 6.25*estatura - 5*edad - 161;

  const tdee = Math.round(tmb * actividad);

  let calObjetivo, etiqueta, descripcion;
  if (objetivoSeleccionado === 'bajar')    { calObjetivo = Math.round(tdee-500); etiqueta = '📉 Déficit calórico';  descripcion = 'Aprox. 0,5 kg menos por semana'; }
  else if (objetivoSeleccionado === 'mantener') { calObjetivo = tdee; etiqueta = '⚖️ Mantenimiento'; descripcion = 'Mantén tu peso actual'; }
  else                                     { calObjetivo = Math.round(tdee+500); etiqueta = '📈 Superávit calórico'; descripcion = 'Aprox. 0,5 kg más por semana'; }

  const prot = Math.round((calObjetivo * 0.30) / 4);
  const carb = Math.round((calObjetivo * 0.40) / 4);
  const gras = Math.round((calObjetivo * 0.30) / 9);
  resultadoCalc = { calorias: calObjetivo, proteinas: prot, carbos: carb, grasas: gras };

  document.getElementById('calc-resultado-contenido').innerHTML = `
    <div class="calc-resultado-item">
      <span class="calc-resultado-label">🔥 Metabolismo basal (TMB)</span>
      <span class="calc-resultado-valor">${Math.round(tmb)} kcal</span>
    </div>
    <div class="calc-resultado-item">
      <span class="calc-resultado-label">⚡ Gasto total diario (TDEE)</span>
      <span class="calc-resultado-valor">${tdee} kcal</span>
    </div>
    <div class="calc-resultado-item destacado">
      <div>
        <div class="calc-resultado-label" style="font-weight:600">${etiqueta}</div>
        <div style="font-size:0.75rem;color:#6b7580;margin-top:2px">${descripcion}</div>
      </div>
      <span class="calc-resultado-valor">${calObjetivo} kcal</span>
    </div>
    <p style="font-size:0.82rem;color:#6b7580;margin:0.5rem 0">Distribución de macros recomendada:</p>
    <div class="calc-macros-grid">
      <div class="calc-macro-box prot"><span class="valor">${prot}g</span><span class="label">Proteínas</span></div>
      <div class="calc-macro-box carb"><span class="valor">${carb}g</span><span class="label">Carbos</span></div>
      <div class="calc-macro-box gras"><span class="valor">${gras}g</span><span class="label">Grasas</span></div>
    </div>
  `;

  document.getElementById('calc-resultado').classList.remove('oculto');
  document.getElementById('calc-resultado').scrollIntoView({ behavior: 'smooth' });
}

function aplicarMetasCalculadora() {
  if (!resultadoCalc) return;
  localStorage.setItem('meta-calorias',  resultadoCalc.calorias);
  localStorage.setItem('meta-proteinas', resultadoCalc.proteinas);
  localStorage.setItem('meta-carbos',    resultadoCalc.carbos);
  localStorage.setItem('meta-grasas',    resultadoCalc.grasas);
  actualizarBarrasMetas();
  alert('✅ Metas aplicadas correctamente');
}

// ─── Progreso / Gráficos ──────────────────────────────────
function registrarPeso() {
  const val = parseFloat(document.getElementById('input-peso').value.replace(',', '.'));
  if (!val || val <= 0) { alert('Ingresa un peso válido'); return; }

  const pesos = JSON.parse(localStorage.getItem('comiapp-pesos') || '[]');
  const fecha = hoy.toISOString().slice(0, 10);
  const idx   = pesos.findIndex(p => p.fecha === fecha);
  if (idx >= 0) pesos[idx].peso = val; else pesos.push({ fecha, peso: val });
  pesos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (pesos.length > 30) pesos.splice(0, pesos.length - 30);
  localStorage.setItem('comiapp-pesos', JSON.stringify(pesos));
  document.getElementById('input-peso').value = '';
  renderProgreso();
}

function guardarEstatura() {
  const val = parseFloat(document.getElementById('input-estatura').value.replace(',', '.'));
  if (!val || val < 0.5 || val > 2.5) { alert('Ingresa una estatura válida en metros (ej: 1,75)'); return; }
  localStorage.setItem('comiapp-estatura', val);
  document.getElementById('input-estatura').value = '';
  calcularIMC();
}

function calcularIMC() {
  const estatura = parseFloat(localStorage.getItem('comiapp-estatura'));
  const pesos    = JSON.parse(localStorage.getItem('comiapp-pesos') || '[]');
  const peso     = pesos.length > 0 ? pesos[pesos.length-1].peso : null;
  const badge    = document.getElementById('imc-display');
  const resultado= document.getElementById('imc-resultado');

  if (estatura) document.getElementById('input-estatura').placeholder = `Actual: ${formatNum(estatura)} m`;

  if (!estatura || !peso) {
    resultado.innerHTML = !estatura && !peso ? '<p>Ingresa tu peso y estatura para calcular el IMC</p>'
      : !peso ? '<p>Registra tu peso para calcular el IMC</p>'
      : '<p>Ingresa tu estatura para calcular el IMC</p>';
    badge.textContent = ''; badge.className = 'imc-badge';
    return;
  }

  const imc = peso / (estatura * estatura);
  let categoria, clase;
  if      (imc < 18.5) { categoria = 'Bajo peso';  clase = 'bajo'; }
  else if (imc < 25)   { categoria = 'Peso normal'; clase = 'normal'; }
  else if (imc < 30)   { categoria = 'Sobrepeso';   clase = 'sobrepeso'; }
  else                 { categoria = 'Obesidad';     clase = 'obesidad'; }

  const pesoMin = (18.5 * estatura * estatura).toFixed(1);
  const pesoMax = (24.9 * estatura * estatura).toFixed(1);
  const dif     = Math.abs(peso - (imc < 25 ? peso : imc < 18.5 ? parseFloat(pesoMin) : parseFloat(pesoMax))).toFixed(1);

  let rec = '';
  if (imc < 18.5)  rec = `<div class="imc-recomendacion bajo"><span class="rec-titulo">📈 Necesitas ganar peso</span><span class="rec-detalle">Te faltan <strong>${formatNum(parseFloat(pesoMin)-peso)} kg</strong> para el rango saludable</span><span class="rec-detalle">Rango: <strong>${formatNum(pesoMin)} – ${formatNum(pesoMax)} kg</strong></span></div>`;
  else if (imc < 25) rec = `<div class="imc-recomendacion normal"><span class="rec-titulo">✅ Estás en tu peso ideal</span><span class="rec-detalle">Rango saludable: <strong>${formatNum(pesoMin)} – ${formatNum(pesoMax)} kg</strong></span></div>`;
  else if (imc < 30) rec = `<div class="imc-recomendacion sobrepeso"><span class="rec-titulo">📉 Necesitas bajar peso</span><span class="rec-detalle">Te sobran <strong>${formatNum(peso-parseFloat(pesoMax))} kg</strong> para el rango saludable</span><span class="rec-detalle">Rango: <strong>${formatNum(pesoMin)} – ${formatNum(pesoMax)} kg</strong></span></div>`;
  else               rec = `<div class="imc-recomendacion obesidad"><span class="rec-titulo">⚠️ Sobrepeso significativo</span><span class="rec-detalle">Te sobran <strong>${formatNum(peso-parseFloat(pesoMax))} kg</strong> para el rango saludable</span><span class="rec-detalle">Consulta con un profesional de salud</span></div>`;

  badge.textContent = categoria;
  badge.className   = `imc-badge ${clase}`;
  resultado.innerHTML = `<span class="imc-valor">${imc.toFixed(1)}</span><div style="font-size:0.85rem;color:#6b7580;margin-bottom:0.75rem">Peso: <strong>${formatNum(peso)} kg</strong> · Estatura: <strong>${formatNum(estatura)} m</strong></div>${rec}`;
}

function obtenerDatosSemana() {
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() - i);
    const clave = `comiapp-${fecha.toISOString().slice(0, 10)}`;
    const items = JSON.parse(localStorage.getItem(clave) || '[]');
    dias.push({
      label:     fecha.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }),
      calorias:  items.reduce((s, a) => s + (parseFloat(a.calorias)  || 0), 0),
      proteinas: items.reduce((s, a) => s + (parseFloat(a.proteinas) || 0), 0),
      carbos:    items.reduce((s, a) => s + (parseFloat(a.carbos)    || 0), 0),
      grasas:    items.reduce((s, a) => s + (parseFloat(a.grasas)    || 0), 0)
    });
  }
  return dias;
}

function renderProgreso() {
  const semana = obtenerDatosSemana();
  const labels = semana.map(d => d.label);
  const pesos  = JSON.parse(localStorage.getItem('comiapp-pesos') || '[]');

  document.getElementById('peso-actual-display').textContent =
    pesos.length > 0 ? `${formatNum(pesos[pesos.length-1].peso)} kg` : '';

  calcularIMC();

  // Gráfico peso
  const ctxP = document.getElementById('grafico-peso').getContext('2d');
  if (graficoPeso) graficoPeso.destroy();
  if (pesos.length > 0) {
    graficoPeso = new Chart(ctxP, {
      type: 'line',
      data: {
        labels: pesos.slice(-14).map(p => new Date(p.fecha+'T00:00:00').toLocaleDateString('es-CL', { day:'numeric', month:'short' })),
        datasets: [{ label:'Peso (kg)', data: pesos.slice(-14).map(p => p.peso), borderColor:'#1e3a5f', backgroundColor:'rgba(30,58,95,0.08)', tension:0.3, fill:true, pointBackgroundColor:'#1e3a5f', pointRadius:4 }]
      },
      options: { responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:false, ticks:{ font:{ size:11 } } }, x:{ ticks:{ font:{ size:10 } } } } }
    });
  }

  // Gráfico calorías
  const ctxC = document.getElementById('grafico-calorias').getContext('2d');
  if (graficoCalorias) graficoCalorias.destroy();
  graficoCalorias = new Chart(ctxC, {
    type: 'bar',
    data: { labels, datasets: [{ label:'kcal', data: semana.map(d => d.calorias.toFixed(1)), backgroundColor:'rgba(30,58,95,0.7)', borderRadius:6 }] },
    options: { responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ font:{ size:11 } } }, x:{ ticks:{ font:{ size:10 } } } } }
  });

  // Gráfico macros
  const ctxM = document.getElementById('grafico-macros').getContext('2d');
  if (graficoMacros) graficoMacros.destroy();
  graficoMacros = new Chart(ctxM, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Proteínas', data: semana.map(d => d.proteinas.toFixed(1)), backgroundColor:'rgba(37,99,235,0.7)',  borderRadius:4 },
        { label:'Carbos',    data: semana.map(d => d.carbos.toFixed(1)),    backgroundColor:'rgba(217,119,6,0.7)',  borderRadius:4 },
        { label:'Grasas',    data: semana.map(d => d.grasas.toFixed(1)),    backgroundColor:'rgba(220,38,38,0.7)',  borderRadius:4 }
      ]
    },
    options: { responsive:true, plugins:{ legend:{ display:true, position:'bottom', labels:{ font:{ size:11 }, boxWidth:12 } } }, scales:{ y:{ beginAtZero:true, ticks:{ font:{ size:11 } } }, x:{ ticks:{ font:{ size:10 } } } } }
  });
}

// ─── Historial ────────────────────────────────────────────
function renderHistorial() {
  const lista = document.getElementById('historial-lista');
  const dias  = [];

  // Incluir hoy si tiene alimentos
  if (alimentos.length > 0) {
    dias.push({ fecha: hoy, items: alimentos, esHoy: true });
  }

  for (let i = 1; i <= 30; i++) {
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() - i);
    const clave = `comiapp-${fecha.toISOString().slice(0, 10)}`;
    const data  = localStorage.getItem(clave);
    if (data) {
      const items = JSON.parse(data);
      if (items.length > 0) dias.push({ fecha, items, esHoy: false });
    }
  }

  if (dias.length === 0) {
    lista.innerHTML = '<p class="historial-vacio">Sin registros aún</p>';
    return;
  }

  lista.innerHTML = dias.map((dia, idx) => {
    const fechaStr   = dia.esHoy
      ? 'Hoy'
      : dia.fecha.toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' });
    const totalKcal  = dia.items.reduce((s, a) => s + (parseFloat(a.calorias)  || 0), 0);
    const totalProt  = dia.items.reduce((s, a) => s + (parseFloat(a.proteinas) || 0), 0);
    const totalCarb  = dia.items.reduce((s, a) => s + (parseFloat(a.carbos)    || 0), 0);
    const totalGras  = dia.items.reduce((s, a) => s + (parseFloat(a.grasas)    || 0), 0);
    const alims      = dia.items.map(a => `
      <div class="historial-alimento">
        <span>${a.nombre}</span>
        <span class="historial-alimento-kcal">${formatNum(a.calorias)} kcal</span>
      </div>
    `).join('');

    return `
      <div class="historial-dia">
        <div class="historial-dia-header" onclick="toggleHistorialDia(${idx})">
          <span class="historial-dia-fecha">${fechaStr}</span>
          <div style="display:flex;align-items:center;gap:0.5rem">
            <span class="historial-dia-kcal">${formatNum(totalKcal)} kcal</span>
            <span class="historial-dia-flecha" id="flecha-h-${idx}">▼</span>
          </div>
        </div>
        <div class="historial-dia-body" id="body-h-${idx}">
          <div class="historial-macros">
            <span>💪 P: ${formatNum(totalProt)}g</span>
            <span>🌾 C: ${formatNum(totalCarb)}g</span>
            <span>🥑 G: ${formatNum(totalGras)}g</span>
          </div>
          ${alims}
        </div>
      </div>
    `;
  }).join('');
}

function toggleHistorialDia(idx) {
  document.getElementById(`body-h-${idx}`).classList.toggle('visible');
  document.getElementById(`flecha-h-${idx}`).classList.toggle('abierto');
}

// ─── Bienestar ────────────────────────────────────────────
function actualizarSlider(tipo) {
  document.getElementById(`${tipo}-val`).textContent = `${document.getElementById(`${tipo}-slider`).value}h`;
}

function seleccionarEmoji(tipo, valor, btn) {
  bienestarHoy[tipo] = valor;
  document.getElementById(`${tipo}-opciones`).querySelectorAll('.emoji-btn').forEach((b, i) =>
    b.classList.toggle('seleccionado', i+1 === valor)
  );
}

function guardarBienestar() {
  const registro = {
    fecha:   hoy.toISOString().slice(0, 10),
    sueno:   parseFloat(document.getElementById('sueno-slider').value),
    energia: bienestarHoy.energia,
    animo:   bienestarHoy.animo,
    nota:    document.getElementById('bienestar-nota').value.trim()
  };

  const historial = JSON.parse(localStorage.getItem('comiapp-bienestar') || '[]');
  const idx = historial.findIndex(r => r.fecha === registro.fecha);
  if (idx >= 0) historial[idx] = registro; else historial.push(registro);
  historial.sort((a, b) => a.fecha.localeCompare(b.fecha));
  localStorage.setItem('comiapp-bienestar', JSON.stringify(historial));
  alert('✅ Bienestar guardado');
  renderBienestarHistorial();
}

function renderBienestarHistorial() {
  const div      = document.getElementById('bienestar-historial');
  const historial= JSON.parse(localStorage.getItem('comiapp-bienestar') || '[]');
  const ultimos  = historial.slice(-7).reverse();

  if (ultimos.length === 0) { div.innerHTML = '<p class="bienestar-vacio">Sin registros aún</p>'; return; }

  const eE = ['','😴','😕','😐','😊','⚡'];
  const eA = ['','😢','😔','😐','😊','😄'];

  div.innerHTML = ultimos.map(r => {
    const fecha = new Date(r.fecha+'T00:00:00').toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' });
    return `
      <div class="bienestar-dia">
        <div class="bienestar-dia-fecha">${fecha}</div>
        <div class="bienestar-dia-datos">
          <span class="bienestar-dato">😴 <strong>${r.sueno}h</strong></span>
          ${r.energia ? `<span class="bienestar-dato">${eE[r.energia]} energía</span>` : ''}
          ${r.animo   ? `<span class="bienestar-dato">${eA[r.animo]} ánimo</span>`    : ''}
        </div>
        ${r.nota ? `<div class="bienestar-nota-texto">"${r.nota}"</div>` : ''}
      </div>
    `;
  }).join('');
}

function cargarBienestarHoy() {
  const fecha    = hoy.toISOString().slice(0, 10);
  const historial= JSON.parse(localStorage.getItem('comiapp-bienestar') || '[]');
  const registro = historial.find(r => r.fecha === fecha);
  if (!registro) return;

  document.getElementById('sueno-slider').value = registro.sueno;
  document.getElementById('sueno-val').textContent = `${registro.sueno}h`;
  document.getElementById('bienestar-nota').value = registro.nota || '';
  if (registro.energia) seleccionarEmoji('energia', registro.energia, null);
  if (registro.animo)   seleccionarEmoji('animo',   registro.animo,   null);
}

// ─── Creatina ─────────────────────────────────────────────
function abrirConfigCreatina() {
  const horaGuardada = localStorage.getItem('creatina-hora');
  if (horaGuardada) document.getElementById('hora-creatina').value = horaGuardada;
  const modal = document.getElementById('modal-creatina');
  modal.classList.remove('oculto'); modal.style.display = 'flex';
}

function cerrarModalCreatina() {
  const modal = document.getElementById('modal-creatina');
  modal.classList.add('oculto'); modal.style.display = 'none';
}

function guardarRecordatorioCreatina() {
  const hora = document.getElementById('hora-creatina').value;
  if (!hora) { alert('Selecciona una hora'); return; }
  localStorage.setItem('creatina-hora', hora);
  cerrarModalCreatina();
  mostrarHoraCreatina();
  iniciarVerificadorCreatina();
  alert(`✅ Te recordaremos tomar la creatina a las ${hora}`);
}

function mostrarHoraCreatina() {
  const hora    = localStorage.getItem('creatina-hora');
  const display = document.getElementById('hora-creatina-display');
  if (hora && display) { display.textContent = `⏰ ${hora}`; display.style.display = 'block'; }
}

function iniciarVerificadorCreatina() {
  const claveHoyCreatina = `creatina-tomada-${hoy.toISOString().slice(0, 10)}`;
  const tomada = localStorage.getItem(claveHoyCreatina) === 'si';
  const btn    = document.getElementById('btn-creatina-header');

  if (tomada) { btn.textContent = '✅ Creatina'; return; }

  const hora = localStorage.getItem('creatina-hora');
  if (!hora) return;

  function verificar() {
    const ahora = new Date();
    const [hh, mm] = hora.split(':').map(Number);
    if (ahora.getHours() === hh && ahora.getMinutes() === mm && localStorage.getItem(claveHoyCreatina) !== 'si') {
      if (Notification.permission === 'granted')
        new Notification('💊 ComiAPP', { body: '¡Hora de tomar la creatina!' });
      if (confirm('💊 ¡Hora de tomar la creatina!\n\n¿Ya la tomaste?')) {
        localStorage.setItem(claveHoyCreatina, 'si');
        btn.textContent = '✅ Creatina';
      }
    }
  }
  verificar();
  setInterval(verificar, 60000);
}

function pedirPermisoNotificaciones() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

// ─── Agua ─────────────────────────────────────────────────
function claveAgua() { return `comiapp-agua-${hoy.toISOString().slice(0, 10)}`; }
function cargarAgua() { return parseInt(localStorage.getItem(claveAgua()) || '0'); }
function metaAgua()   { return parseInt(localStorage.getItem('comiapp-meta-agua') || '8'); }

function actualizarHeaderAgua() {
  document.getElementById('agua-header').textContent = `${cargarAgua()}/${metaAgua()}`;
}

function abrirAgua() {
  document.getElementById('meta-agua-input').value = metaAgua();
  const modal = document.getElementById('modal-agua');
  modal.classList.remove('oculto'); modal.style.display = 'flex';
  renderVasos();
}

function cerrarAgua() {
  const modal = document.getElementById('modal-agua');
  modal.classList.add('oculto'); modal.style.display = 'none';
}

function renderVasos() {
  const vasos = cargarAgua(), meta = metaAgua();
  document.getElementById('agua-vasos').innerHTML =
    Array.from({ length: meta }, (_, i) => `<span class="agua-vaso ${i < vasos ? 'lleno' : ''}">💧</span>`).join('');
  const ml = vasos * 250;
  document.getElementById('agua-meta-texto').textContent = vasos >= meta
    ? `✅ Meta cumplida · ${ml} ml`
    : `${ml} ml · Te faltan ${(meta-vasos)*250} ml`;
  actualizarHeaderAgua();
}

function agregarVaso() {
  if (cargarAgua() >= metaAgua()) { alert('¡Ya alcanzaste tu meta! 💧'); return; }
  localStorage.setItem(claveAgua(), cargarAgua() + 1);
  renderVasos();
}

function quitarVaso() {
  if (cargarAgua() <= 0) return;
  localStorage.setItem(claveAgua(), cargarAgua() - 1);
  renderVasos();
}

function guardarMetaAgua() {
  const meta = parseInt(document.getElementById('meta-agua-input').value);
  if (!meta || meta < 1 || meta > 20) { alert('Ingresa una meta válida (1-20 vasos)'); return; }
  localStorage.setItem('comiapp-meta-agua', meta);
  renderVasos();
}

// ─── Modo oscuro ──────────────────────────────────────────
function toggleModoOscuro() {
  const oscuro = document.body.classList.toggle('oscuro');
  localStorage.setItem('comiapp-modo-oscuro', oscuro ? '1' : '0');
  document.getElementById('btn-modo').textContent = oscuro ? '☀️' : '🌙';
}

function cargarModoOscuro() {
  const oscuro = localStorage.getItem('comiapp-modo-oscuro') === '1';
  if (oscuro) {
    document.body.classList.add('oscuro');
    document.getElementById('btn-modo').textContent = '☀️';
  }
}

// ─── Ejercicio ────────────────────────────────────────────
let ejercicioSeleccionado  = 'correr';
let intensidadSeleccionada = 'baja';

const MET = {
  correr:   { baja: 8,  media: 11, alta: 14 },
  caminar:  { baja: 3,  media: 4,  alta: 5  },
  ciclismo: { baja: 6,  media: 9,  alta: 12 },
  natacion: { baja: 6,  media: 8,  alta: 11 },
  pesas:    { baja: 3,  media: 5,  alta: 7  },
  hiit:     { baja: 8,  media: 10, alta: 14 },
  yoga:     { baja: 2.5,media: 3,  alta: 4  },
  otro:     { baja: 4,  media: 6,  alta: 8  }
};

function seleccionarEjercicio(tipo, btn) {
  ejercicioSeleccionado = tipo;
  document.querySelectorAll('.ejercicio-tipo').forEach(b => b.classList.remove('activo'));
  btn.classList.add('activo');
  document.getElementById('ejercicio-otro-container').classList.toggle('oculto', tipo !== 'otro');
  estimarCalorias();
}

function seleccionarIntensidad(int) {
  intensidadSeleccionada = int;
  ['baja','media','alta'].forEach(i =>
    document.getElementById(`int-${i}`).classList.toggle('activo', i === int)
  );
  estimarCalorias();
}

function estimarCalorias() {
  const duracion = parseFloat(document.getElementById('ejercicio-duracion').value) || 0;
  const peso     = (() => {
    const pesos = JSON.parse(localStorage.getItem('comiapp-pesos') || '[]');
    return pesos.length > 0 ? pesos[pesos.length-1].peso : 70;
  })();

  const met  = MET[ejercicioSeleccionado][intensidadSeleccionada];
  const kcal = duracion > 0 ? Math.round(met * peso * (duracion / 60)) : 0;

  document.getElementById('ejercicio-kcal-est').textContent = duracion > 0 ? `${kcal} kcal` : '—';
}

function registrarEjercicio() {
  const duracion = parseFloat(document.getElementById('ejercicio-duracion').value);
  if (!duracion || duracion <= 0) { alert('Ingresa la duración del ejercicio'); return; }

  const peso = (() => {
    const pesos = JSON.parse(localStorage.getItem('comiapp-pesos') || '[]');
    return pesos.length > 0 ? pesos[pesos.length-1].peso : 70;
  })();

  const met   = MET[ejercicioSeleccionado][intensidadSeleccionada];
  const kcal  = Math.round(met * peso * (duracion / 60));
  const nombre = ejercicioSeleccionado === 'otro'
    ? document.getElementById('ejercicio-nombre-custom').value.trim() || 'Ejercicio'
    : document.getElementById(`ejercicio-tipos`).querySelector('.activo').textContent.trim();

  const fecha    = hoy.toISOString().slice(0, 10);
  const ejercicios = JSON.parse(localStorage.getItem(`comiapp-ejercicio-${fecha}`) || '[]');
  ejercicios.push({ nombre, tipo: ejercicioSeleccionado, duracion, intensidad: intensidadSeleccionada, kcal });
  localStorage.setItem(`comiapp-ejercicio-${fecha}`, JSON.stringify(ejercicios));

  document.getElementById('ejercicio-duracion').value = '';
  document.getElementById('ejercicio-kcal-est').textContent = '—';
  renderEjercicio();
  alert(`✅ ${nombre} registrado — ${kcal} kcal quemadas`);
}

function renderEjercicio() {
  const fecha     = hoy.toISOString().slice(0, 10);
  const ejercicios= JSON.parse(localStorage.getItem(`comiapp-ejercicio-${fecha}`) || '[]');
  const resumen   = document.getElementById('ejercicio-resumen-hoy');

  const totalKcal = ejercicios.reduce((s, e) => s + e.kcal, 0);
  const totalMin  = ejercicios.reduce((s, e) => s + e.duracion, 0);

  if (ejercicios.length === 0) {
    resumen.innerHTML = '<p class="cargando">Sin ejercicios registrados hoy</p>';
  } else {
    resumen.innerHTML = `
      <div class="ejercicio-resumen-card"><span class="erc-valor">${totalKcal}</span><span class="erc-label">kcal quemadas</span></div>
      <div class="ejercicio-resumen-card"><span class="erc-valor">${totalMin}</span><span class="erc-label">minutos</span></div>
      <div class="ejercicio-resumen-card"><span class="erc-valor">${ejercicios.length}</span><span class="erc-label">sesiones</span></div>
    `;
  }

  // Lista del día
  const lista = document.getElementById('ejercicio-resumen-hoy');
  if (ejercicios.length > 0) {
    resumen.innerHTML += ejercicios.map((e, i) => `
      <div class="ejercicio-item" style="width:100%">
        <div class="ejercicio-info">
          <span class="ejercicio-nombre">${e.nombre}</span>
          <span class="ejercicio-detalle">${e.duracion} min · ${e.intensidad}</span>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <span class="ejercicio-kcal">-${e.kcal} kcal</span>
          <button class="btn-eliminar" onclick="eliminarEjercicio(${i})">✕</button>
        </div>
      </div>
    `).join('');
  }

  // Semana
  const semanaDiv = document.getElementById('ejercicio-semana');
  const diasSemana = [];
  for (let i = 6; i >= 0; i--) {
    const f    = new Date(hoy);
    f.setDate(f.getDate() - i);
    const clave = `comiapp-ejercicio-${f.toISOString().slice(0, 10)}`;
    const data  = JSON.parse(localStorage.getItem(clave) || '[]');
    if (data.length > 0) {
      diasSemana.push({
        fecha:  f.toLocaleDateString('es-CL', { weekday:'short', day:'numeric', month:'short' }),
        kcal:   data.reduce((s, e) => s + e.kcal, 0),
        min:    data.reduce((s, e) => s + e.duracion, 0)
      });
    }
  }

  semanaDiv.innerHTML = diasSemana.length === 0
    ? '<p class="cargando">Sin registros esta semana</p>'
    : diasSemana.map(d => `
        <div class="ejercicio-semana-dia">
          <span class="ejercicio-semana-fecha">${d.fecha} · ${d.min} min</span>
          <span class="ejercicio-semana-kcal">-${d.kcal} kcal</span>
        </div>
      `).join('');
}

function eliminarEjercicio(i) {
  const fecha     = hoy.toISOString().slice(0, 10);
  const ejercicios= JSON.parse(localStorage.getItem(`comiapp-ejercicio-${fecha}`) || '[]');
  ejercicios.splice(i, 1);
  localStorage.setItem(`comiapp-ejercicio-${fecha}`, JSON.stringify(ejercicios));
  renderEjercicio();
}

// ─── Recetas ──────────────────────────────────────────────
let recetaEditandoIdx = null;
let recetaDetalleIdx  = null;

function cargarRecetas() {
  return JSON.parse(localStorage.getItem('comiapp-recetas') || '[]');
}

function guardarRecetas(r) {
  localStorage.setItem('comiapp-recetas', JSON.stringify(r));
}

function renderRecetas() {
  const lista   = document.getElementById('recetas-lista');
  const recetas = cargarRecetas();

  if (recetas.length === 0) {
    lista.innerHTML = '<p class="receta-vacia">Sin recetas aún. Toca "+ Nueva receta" para empezar.</p>';
    return;
  }

  lista.innerHTML = recetas.map((r, i) => {
    const p = calcularTotalesReceta(r);
    return `
      <div class="receta-card" onclick="verDetalleReceta(${i})">
        <div class="receta-card-info">
          <span class="receta-card-nombre">${r.nombre}</span>
          <span class="receta-card-sub">${r.ingredientes.length} ingredientes · ${r.porciones} porción${r.porciones > 1 ? 'es' : ''}</span>
          <span class="receta-card-macros">P:${formatNum(p.proteinas)}g · C:${formatNum(p.carbos)}g · G:${formatNum(p.grasas)}g</span>
        </div>
        <div class="receta-card-kcal">
          ${formatNum(p.calorias)}
          <span>kcal/porción</span>
        </div>
      </div>
    `;
  }).join('');
}

function calcularTotalesReceta(receta) {
  const total = receta.ingredientes.reduce((acc, ing) => {
    const cantidad = parseFloat(ing.cantidad) || 0;
    const factor   = cantidad / 100;
    return {
      calorias:  acc.calorias  + (parseFloat(ing.calorias)  || 0) * factor,
      proteinas: acc.proteinas + (parseFloat(ing.proteinas) || 0) * factor,
      carbos:    acc.carbos    + (parseFloat(ing.carbos)    || 0) * factor,
      grasas:    acc.grasas    + (parseFloat(ing.grasas)    || 0) * factor
    };
  }, { calorias: 0, proteinas: 0, carbos: 0, grasas: 0 });

  const porciones = parseFloat(receta.porciones) || 1;
  return {
    calorias:  parseFloat((total.calorias  / porciones).toFixed(1)),
    proteinas: parseFloat((total.proteinas / porciones).toFixed(1)),
    carbos:    parseFloat((total.carbos    / porciones).toFixed(1)),
    grasas:    parseFloat((total.grasas    / porciones).toFixed(1))
  };
}

function mostrarFormReceta(idx = null) {
  recetaEditandoIdx = idx;
  document.getElementById('recetas-lista-container').classList.add('oculto');
  document.getElementById('receta-detalle-container').classList.add('oculto');
  document.getElementById('receta-form-container').classList.remove('oculto');

  const recetas = cargarRecetas();
  const receta  = idx !== null ? recetas[idx] : null;

  document.getElementById('receta-form-titulo').textContent = receta ? 'Editar receta' : 'Nueva receta';
  document.getElementById('receta-nombre').value    = receta ? receta.nombre    : '';
  document.getElementById('receta-porciones').value = receta ? receta.porciones : 1;

  const cont = document.getElementById('receta-ingredientes');
  cont.innerHTML = '';

  if (receta && receta.ingredientes.length > 0) {
    receta.ingredientes.forEach(ing => agregarIngrediente(ing, ing.unidad || 'g'));
  } else {
    agregarIngrediente(null, 'g');
  }

  actualizarTotalesReceta();
}

function cancelarFormReceta() {
  document.getElementById('receta-form-container').classList.add('oculto');
  document.getElementById('recetas-lista-container').classList.remove('oculto');
  recetaEditandoIdx = null;
}

function agregarIngrediente(datos = null, unidad = 'g') {
  const cont  = document.getElementById('receta-ingredientes');
  const esML  = unidad === 'ml';
  const label = esML ? 'ml' : 'g';
  const placeholder = esML ? 'Ej: leche, agua...' : 'Ej: avena, pollo...';

  const div = document.createElement('div');
  div.className = 'ingrediente-card';
  div.dataset.unidad = unidad;

  div.innerHTML = `
    <div class="ingrediente-card-header">
      <span class="ingrediente-tipo-badge ${esML ? 'badge-ml' : 'badge-g'}">${esML ? '💧 Líquido (ml)' : '🧱 Sólido (g)'}</span>
      <button class="btn-ing-eliminar" onclick="this.closest('.ingrediente-card').remove();actualizarTotalesReceta()">✕ Eliminar</button>
    </div>
    <div class="ingrediente-fila">
      <input type="text" class="ing-nombre" placeholder="${placeholder}" value="${datos ? datos.nombre : ''}" oninput="actualizarTotalesReceta()" />
      <input type="number" class="ing-cantidad" placeholder="Cantidad (${label})" value="${datos ? datos.cantidad : ''}" oninput="actualizarTotalesReceta()" />
    </div>
    <p style="font-size:0.7rem;color:var(--texto-muted);margin:0.4rem 0 0.3rem">Valores nutricionales por cada 100${label}:</p>
    <div class="ingrediente-fila-macros">
      <div>
        <input type="number" class="ing-calorias" placeholder="0" value="${datos ? datos.calorias : ''}" oninput="actualizarTotalesReceta()" />
        <p class="ingrediente-macro-label">🔥 kcal</p>
      </div>
      <div>
        <input type="number" class="ing-proteinas" placeholder="0" value="${datos ? datos.proteinas : ''}" oninput="actualizarTotalesReceta()" />
        <p class="ingrediente-macro-label">💪 prot</p>
      </div>
      <div>
        <input type="number" class="ing-carbos" placeholder="0" value="${datos ? datos.carbos : ''}" oninput="actualizarTotalesReceta()" />
        <p class="ingrediente-macro-label">🌾 carb</p>
      </div>
      <div>
        <input type="number" class="ing-grasas" placeholder="0" value="${datos ? datos.grasas : ''}" oninput="actualizarTotalesReceta()" />
        <p class="ingrediente-macro-label">🥑 gras</p>
      </div>
    </div>
  `;

  cont.appendChild(div);
}

function actualizarTotalesReceta() {
  const porciones = parseFloat(document.getElementById('receta-porciones').value) || 1;
  const cards     = document.getElementById('receta-ingredientes').querySelectorAll('.ingrediente-card');
  let total = { calorias: 0, proteinas: 0, carbos: 0, grasas: 0 };

  cards.forEach(card => {
    const cantidad  = parseFloat(card.querySelector('.ing-cantidad')?.value)   || 0;
    const calorias  = parseFloat(card.querySelector('.ing-calorias')?.value)   || 0;
    const proteinas = parseFloat(card.querySelector('.ing-proteinas')?.value)  || 0;
    const carbos    = parseFloat(card.querySelector('.ing-carbos')?.value)     || 0;
    const grasas    = parseFloat(card.querySelector('.ing-grasas')?.value)     || 0;
    const f = cantidad / 100;
    total.calorias  += calorias  * f;
    total.proteinas += proteinas * f;
    total.carbos    += carbos    * f;
    total.grasas    += grasas    * f;
  });

  const p = {
    calorias:  (total.calorias  / porciones).toFixed(1),
    proteinas: (total.proteinas / porciones).toFixed(1),
    carbos:    (total.carbos    / porciones).toFixed(1),
    grasas:    (total.grasas    / porciones).toFixed(1)
  };

  document.getElementById('receta-totales').innerHTML = cards.length === 0
    ? '<p class="estado-texto">Agrega ingredientes para ver el cálculo</p>'
    : `
      <div class="receta-totales-grid">
        <div class="rt-item cal"><span class="rt-valor">${formatNum(p.calorias)}</span><span class="rt-label">kcal</span></div>
        <div class="rt-item prot"><span class="rt-valor">${formatNum(p.proteinas)}g</span><span class="rt-label">prot</span></div>
        <div class="rt-item carb"><span class="rt-valor">${formatNum(p.carbos)}g</span><span class="rt-label">carb</span></div>
        <div class="rt-item gras"><span class="rt-valor">${formatNum(p.grasas)}g</span><span class="rt-label">gras</span></div>
      </div>
      <p style="font-size:0.72rem;color:var(--texto-muted);margin-top:0.5rem;text-align:center">
        Por porción · ${porciones} porción${porciones > 1 ? 'es' : ''} en total
      </p>
    `;
}

function guardarReceta() {
  const nombre    = document.getElementById('receta-nombre').value.trim();
  const porciones = parseFloat(document.getElementById('receta-porciones').value) || 1;
  if (!nombre) { alert('Escribe el nombre de la receta'); return; }

  const cards = document.getElementById('receta-ingredientes').querySelectorAll('.ingrediente-card');
  const ingredientes = Array.from(cards).map(card => ({
    nombre:    card.querySelector('.ing-nombre')?.value.trim()     || '',
    cantidad:  parseFloat(card.querySelector('.ing-cantidad')?.value)   || 0,
    unidad:    card.dataset.unidad || 'g',
    calorias:  parseFloat(card.querySelector('.ing-calorias')?.value)   || 0,
    proteinas: parseFloat(card.querySelector('.ing-proteinas')?.value)  || 0,
    carbos:    parseFloat(card.querySelector('.ing-carbos')?.value)     || 0,
    grasas:    parseFloat(card.querySelector('.ing-grasas')?.value)     || 0
  })).filter(ing => ing.nombre && ing.cantidad > 0);

  if (ingredientes.length === 0) { alert('Agrega al menos un ingrediente con nombre y cantidad'); return; }

  const recetas = cargarRecetas();
  const receta  = { nombre, porciones, ingredientes };

  if (recetaEditandoIdx !== null) recetas[recetaEditandoIdx] = receta;
  else recetas.push(receta);

  guardarRecetas(recetas);
  cancelarFormReceta();
  renderRecetas();
  alert('✅ Receta guardada');
}

function verDetalleReceta(idx) {
  recetaDetalleIdx = idx;
  const recetas = cargarRecetas();
  const receta  = recetas[idx];
  const p       = calcularTotalesReceta(receta);

  document.getElementById('recetas-lista-container').classList.add('oculto');
  document.getElementById('receta-form-container').classList.add('oculto');
  document.getElementById('receta-detalle-container').classList.remove('oculto');
  document.getElementById('receta-detalle-nombre').textContent = receta.nombre;

  const ings = receta.ingredientes.map(ing => {
    const f    = (parseFloat(ing.cantidad) || 0) / 100;
    const kcal = ((parseFloat(ing.calorias) || 0) * f).toFixed(1);
    return `
      <div class="receta-detalle-ing">
        <div>
          <span>${ing.nombre}</span>
          <span style="margin-left:0.5rem;font-size:0.72rem;color:var(--texto-muted)">${ing.cantidad}${ing.unidad || 'g'}</span>
        </div>
        <span class="receta-detalle-kcal">${formatNum(kcal)} kcal</span>
      </div>
    `;
  }).join('');

  document.getElementById('receta-detalle-contenido').innerHTML = `
    <div class="receta-totales-box">
      <p style="font-size:0.72rem;color:var(--texto-muted);margin-bottom:0.75rem">Por porción · ${receta.porciones} porción${receta.porciones > 1 ? 'es' : ''} en total</p>
      <div class="receta-totales-grid">
        <div class="rt-item cal"><span class="rt-valor">${formatNum(p.calorias)}</span><span class="rt-label">kcal</span></div>
        <div class="rt-item prot"><span class="rt-valor">${formatNum(p.proteinas)}g</span><span class="rt-label">prot</span></div>
        <div class="rt-item carb"><span class="rt-valor">${formatNum(p.carbos)}g</span><span class="rt-label">carb</span></div>
        <div class="rt-item gras"><span class="rt-valor">${formatNum(p.grasas)}g</span><span class="rt-label">gras</span></div>
      </div>
    </div>
    <h2 style="margin-bottom:0.5rem">Ingredientes</h2>
    ${ings}
    <button class="btn-cancelar" onclick="eliminarReceta(${idx})" style="margin-top:1rem;color:#ef4444;border-color:#ef4444">🗑️ Eliminar receta</button>
  `;
}

function cerrarDetalleReceta() {
  document.getElementById('receta-detalle-container').classList.add('oculto');
  document.getElementById('recetas-lista-container').classList.remove('oculto');
  recetaDetalleIdx = null;
}

function editarReceta() {
  if (recetaDetalleIdx === null) return;
  mostrarFormReceta(recetaDetalleIdx);
}

function eliminarReceta(idx) {
  if (!confirm('¿Eliminar esta receta?')) return;
  const recetas = cargarRecetas();
  recetas.splice(idx, 1);
  guardarRecetas(recetas);
  cerrarDetalleReceta();
  renderRecetas();
}

function agregarRecetaARegistro() {
  if (recetaDetalleIdx === null) return;
  const recetas = cargarRecetas();
  const receta  = recetas[recetaDetalleIdx];
  const p       = calcularTotalesReceta(receta);
  cerrarDetalleReceta();
  mostrarConfirmacion({
    nombre:    receta.nombre,
    calorias:  p.calorias,
    proteinas: p.proteinas,
    carbos:    p.carbos,
    grasas:    p.grasas,
    por100g:   false
  });
}

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  cargarModoOscuro();
  pedirPermisoNotificaciones();
  iniciarVerificadorCreatina();
  mostrarHoraCreatina();
  actualizarResumen();
  actualizarBarrasMetas();
  actualizarHeaderAgua();
  renderComidas();
  cargarBienestarHoy();
  renderCacheProductos();
  actualizarContadorCache();
});
