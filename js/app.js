// Fecha de hoy
const hoy = new Date();
document.getElementById('fecha-hoy').textContent =
  hoy.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

const claveHoy = `comiapp-${hoy.toISOString().slice(0, 10)}`;
let alimentos = JSON.parse(localStorage.getItem(claveHoy) || '[]');
let alimentoPendiente = null;
let escaner = null;
let escanerActivo = false;
let busquedaTimeout = null;

// ─── Tabs ────────────────────────────────────────────────
function mostrarTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('oculto'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('activo'));
  document.getElementById('tab-' + tab).classList.remove('oculto');
  event.target.classList.add('activo');
  if (tab !== 'barras' && escanerActivo) detenerEscaner();
}

// ─── Guardar y renderizar ────────────────────────────────
function guardar() {
  localStorage.setItem(claveHoy, JSON.stringify(alimentos));
}

function actualizarResumen() {
  document.getElementById('total-calorias').textContent  = alimentos.reduce((s, a) => s + a.calorias, 0);
  document.getElementById('total-proteinas').textContent = alimentos.reduce((s, a) => s + a.proteinas, 0) + 'g';
  document.getElementById('total-carbos').textContent    = alimentos.reduce((s, a) => s + a.carbos, 0) + 'g';
  document.getElementById('total-grasas').textContent    = alimentos.reduce((s, a) => s + a.grasas, 0) + 'g';
}

function renderLista() {
  const ul = document.getElementById('lista-alimentos');
  ul.innerHTML = alimentos.length === 0
    ? '<p class="cargando">Sin registros hoy</p>'
    : '';
  alimentos.forEach((a, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="li-info">
        <span class="li-nombre">${a.nombre}</span>
        <span class="li-macros">P: ${a.proteinas}g · C: ${a.carbos}g · G: ${a.grasas}g</span>
      </div>
      <span class="li-kcal">${a.calorias} kcal</span>
      <button class="btn-eliminar" onclick="eliminar(${i})">✕</button>
    `;
    ul.appendChild(li);
  });
  actualizarResumen();
}

function eliminar(i) {
  alimentos.splice(i, 1);
  guardar();
  renderLista();
}

// ─── Panel de confirmación ───────────────────────────────
function mostrarConfirmacion(alimento) {
  alimentoPendiente = alimento;
  document.getElementById('confirmar-info').innerHTML = `
    <strong>${alimento.nombre}</strong><br>
    🔥 ${alimento.calorias} kcal &nbsp;|&nbsp;
    Proteínas: ${alimento.proteinas}g<br>
    Carbos: ${alimento.carbos}g &nbsp;|&nbsp;
    Grasas: ${alimento.grasas}g
  `;
  document.getElementById('confirmar-panel').classList.remove('oculto');
  document.getElementById('confirmar-panel').scrollIntoView({ behavior: 'smooth' });
}

function confirmarAlimento() {
  if (!alimentoPendiente) return;
  alimentos.push(alimentoPendiente);
  guardar();
  renderLista();
  alimentoPendiente = null;
  document.getElementById('confirmar-panel').classList.add('oculto');
  document.getElementById('buscador').value = '';
  document.getElementById('resultados-busqueda').innerHTML = '';
}

function cancelarConfirmacion() {
  alimentoPendiente = null;
  document.getElementById('confirmar-panel').classList.add('oculto');
}

// ─── Búsqueda por nombre (Open Food Facts) ───────────────
function buscarAlimento() {
  clearTimeout(busquedaTimeout);
  const q = document.getElementById('buscador').value.trim();
  const div = document.getElementById('resultados-busqueda');

  if (q.length < 3) { div.innerHTML = ''; return; }

  div.innerHTML = '<p class="cargando">Buscando...</p>';

  busquedaTimeout = setTimeout(async () => {
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=5&lc=es`;
      const res = await fetch(url);
      const data = await res.json();
      mostrarResultados(data.products || []);
    } catch {
      div.innerHTML = '<p class="cargando">Error al buscar. Verifica tu conexión.</p>';
    }
  }, 600);
}

function mostrarResultados(productos) {
  const div = document.getElementById('resultados-busqueda');
  const validos = productos.filter(p =>
    p.product_name && p.nutriments && p.nutriments['energy-kcal_100g']
  );

  if (validos.length === 0) {
    div.innerHTML = '<p class="cargando">Sin resultados. Prueba otro nombre o ingresa manualmente.</p>';
    return;
  }

  div.innerHTML = validos.map((p, i) => {
    const n = p.nutriments;
    const kcal = Math.round(n['energy-kcal_100g'] || 0);
    const prot = Math.round(n['proteins_100g'] || 0);
    const carb = Math.round(n['carbohydrates_100g'] || 0);
    const gras = Math.round(n['fat_100g'] || 0);
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
    nombre: p.product_name,
    calorias: Math.round(n['energy-kcal_100g'] || 0),
    proteinas: Math.round(n['proteins_100g'] || 0),
    carbos: Math.round(n['carbohydrates_100g'] || 0),
    grasas: Math.round(n['fat_100g'] || 0)
  });
}

// ─── Escáner de código de barras ─────────────────────────
function toggleEscaner() {
  if (escanerActivo) { detenerEscaner(); return; }

  document.getElementById('escaner-container').classList.remove('oculto');
  document.getElementById('estado-escaner').textContent = 'Apunta al código de barras...';

  escaner = new Html5Qrcode('escaner');
  escaner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 150 } },
    async (codigo) => {
      detenerEscaner();
      document.getElementById('estado-escaner').textContent = 'Buscando producto...';
      await buscarPorBarras(codigo);
    },
    () => {}
  ).catch(() => {
    document.getElementById('estado-escaner').textContent = 'No se pudo acceder a la cámara.';
  });

  escanerActivo = true;
}

function detenerEscaner() {
  if (escaner && escanerActivo) {
    escaner.stop().catch(() => {});
    escanerActivo = false;
  }
  document.getElementById('escaner-container').classList.add('oculto');
}

async function buscarPorBarras(codigo) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${codigo}.json`);
    const data = await res.json();

    if (data.status !== 1 || !data.product) {
      document.getElementById('estado-escaner').textContent = 'Producto no encontrado en la base de datos.';
      return;
    }

    const p = data.product;
    const n = p.nutriments || {};
    document.getElementById('estado-escaner').textContent = '';

    mostrarConfirmacion({
      nombre: p.product_name || 'Producto sin nombre',
      calorias: Math.round(n['energy-kcal_100g'] || 0),
      proteinas: Math.round(n['proteins_100g'] || 0),
      carbos: Math.round(n['carbohydrates_100g'] || 0),
      grasas: Math.round(n['fat_100g'] || 0)
    });
  } catch {
    document.getElementById('estado-escaner').textContent = 'Error al buscar el producto.';
  }
}

// ─── Ingreso manual ──────────────────────────────────────
function agregarManual() {
  const nombre = document.getElementById('nombre').value.trim();
  if (!nombre) { alert('Escribe el nombre del alimento'); return; }

  mostrarConfirmacion({
    nombre,
    calorias:  parseInt(document.getElementById('calorias').value)  || 0,
    proteinas: parseInt(document.getElementById('proteinas').value) || 0,
    carbos:    parseInt(document.getElementById('carbos').value)    || 0,
    grasas:    parseInt(document.getElementById('grasas').value)    || 0
  });
}

// ─── Init ────────────────────────────────────────────────
renderLista();