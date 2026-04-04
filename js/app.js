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
  const esPor100g = alimento.por100g !== false;

  document.getElementById('confirmar-info').innerHTML = `
    <strong>${alimento.nombre}</strong><br>
    ${esPor100g
      ? '📊 Valores por 100g · ' + alimento.calorias + ' kcal · P:' + alimento.proteinas + 'g C:' + alimento.carbos + 'g G:' + alimento.grasas + 'g'
      : '🔥 ' + alimento.calorias + ' kcal &nbsp;|&nbsp; P:' + alimento.proteinas + 'g C:' + alimento.carbos + 'g G:' + alimento.grasas + 'g'
    }
  `;

  // Mostrar campo de gramos solo si viene de búsqueda (por 100g)
  const gramosContainer = document.getElementById('gramos-container');
  if (esPor100g) {
    gramosContainer.style.display = 'block';
    document.getElementById('input-gramos').value = '';
    document.getElementById('calculo-resultado').innerHTML = '';
  } else {
    gramosContainer.style.display = 'none';
  }

  document.getElementById('confirmar-panel').classList.remove('oculto');
  document.getElementById('confirmar-panel').scrollIntoView({ behavior: 'smooth' });
}

function actualizarCalculo() {
  const gramos = parseFloat(document.getElementById('input-gramos').value);
  const div = document.getElementById('calculo-resultado');
  if (!gramos || gramos <= 0 || !alimentoPendiente) { div.innerHTML = ''; return; }

  const factor = gramos / 100;
  const kcal  = Math.round(alimentoPendiente.calorias  * factor);
  const prot  = Math.round(alimentoPendiente.proteinas * factor);
  const carb  = Math.round(alimentoPendiente.carbos    * factor);
  const gras  = Math.round(alimentoPendiente.grasas    * factor);

  div.innerHTML = `Para <strong>${gramos}g</strong>: 🔥 ${kcal} kcal · P:${prot}g C:${carb}g G:${gras}g`;
}

function confirmarAlimento() {
  if (!alimentoPendiente) return;

  let alimento = { ...alimentoPendiente };
  const esPor100g = alimento.por100g !== false;

  if (esPor100g) {
    const gramos = parseFloat(document.getElementById('input-gramos').value);
    if (!gramos || gramos <= 0) {
      alert('Ingresa los gramos que vas a comer');
      return;
    }
    const factor = gramos / 100;
    alimento = {
      nombre:    alimento.nombre + ` (${gramos}g)`,
      calorias:  Math.round(alimento.calorias  * factor),
      proteinas: Math.round(alimento.proteinas * factor),
      carbos:    Math.round(alimento.carbos    * factor),
      grasas:    Math.round(alimento.grasas    * factor)
    };
  }

  alimentos.push(alimento);
  guardar();
  renderLista();
  alimentoPendiente = null;
  document.getElementById('confirmar-panel').classList.add('oculto');
  document.getElementById('buscador').value = '';
  document.getElementById('resultados-busqueda').innerHTML = '';
  document.getElementById('input-barras').value = '';
  document.getElementById('estado-escaner').textContent = '';
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
    calorias:  parseFloat((n['energy-kcal_100g']  || 0).toFixed(1)),
    proteinas: parseFloat((n['proteins_100g']      || 0).toFixed(1)),
    carbos:    parseFloat((n['carbohydrates_100g'] || 0).toFixed(1)),
    grasas:    parseFloat((n['fat_100g']           || 0).toFixed(1)),
    por100g: true
  });
}

// ─── Sacar Foto al codigo de barras ─────────────────────────
async function buscarManualBarras() {
  const input = document.getElementById('input-barras');
  const codigo = input.value.trim();
  if (!codigo) { alert('Ingresa el código de barras'); return; }
  document.getElementById('estado-escaner').textContent = 'Buscando producto...';
  await buscarPorBarras(codigo);
  input.value = '';
}

async function buscarPorBarras(codigo) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${codigo}.json`);
    const data = await res.json();

    if (data.status !== 1 || !data.product) {
      document.getElementById('estado-escaner').textContent = 'Producto no encontrado. Intenta con el buscador.';
      return;
    }

    const p = data.product;
    const n = p.nutriments || {};
    document.getElementById('estado-escaner').textContent = '';

    mostrarConfirmacion({
      nombre: p.product_name || 'Producto sin nombre',
      calorias:  parseFloat((n['energy-kcal_100g'] || 0).toFixed(1)),
      proteinas: parseFloat((n['proteins_100g']    || 0).toFixed(1)),
      carbos:    parseFloat((n['carbohydrates_100g']|| 0).toFixed(1)),
      grasas:    parseFloat((n['fat_100g']          || 0).toFixed(1)),
      por100g: true
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
    grasas:    parseInt(document.getElementById('grasas').value)    || 0,
    por100g: false
  });
}

async function escanearFoto(input) {
  const archivo = input.files[0];
  if (!archivo) return;

  document.getElementById('estado-escaner').textContent = 'Leyendo código...';

  try {
    const detector = new BarcodeDetectorPolyfill({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const bitmap = await createImageBitmap(archivo);
    const resultados = await detector.detect(bitmap);

    if (!resultados.length) {
      document.getElementById('estado-escaner').textContent = 'No se detectó código. Intenta con mejor iluminación o ingresa el número manualmente.';
      input.value = '';
      return;
    }

    const codigo = resultados[0].rawValue;
    document.getElementById('estado-escaner').textContent = 'Buscando producto...';
    await buscarPorBarras(codigo);
  } catch {
    document.getElementById('estado-escaner').textContent = 'Error al leer la imagen. Intenta de nuevo.';
  }

  input.value = '';
}

async function escanearTabla(input) {
  const archivo = input.files[0];
  if (!archivo) return;

  const estado = document.getElementById('estado-escaner');
  estado.textContent = '📷 Procesando imagen...';

  try {
    // Cargar imagen en canvas y recortar solo mitad izquierda (columna 100g)
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(archivo);
    });

    const canvas = document.getElementById('canvas-barras');
    // Solo tomar el 60% izquierdo de la imagen (donde está columna 100g)
    canvas.width = Math.floor(img.width * 0.6);
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

    // Convertir canvas a blob para Tesseract
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));

    const { data: { text } } = await Tesseract.recognize(blob, 'spa+eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          estado.textContent = `Procesando... ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    const macros = extraerMacros(text);

    if (!macros.calorias && !macros.proteinas) {
      estado.textContent = 'No se pudieron leer los valores. Intenta con mejor iluminación o ingresa manualmente.';
      input.value = '';
      return;
    }

    estado.textContent = '';
    mostrarConfirmacion({
      nombre: 'Producto escaneado',
      calorias:  macros.calorias,
      proteinas: macros.proteinas,
      carbos:    macros.carbos,
      grasas:    macros.grasas,
      por100g: true
    });

  } catch (e) {
    estado.textContent = 'Error al procesar la imagen. Intenta de nuevo.';
  }

  input.value = '';
}

function extraerMacros(texto) {
  const lineas = texto.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  function extraerNumero(linea) {
    // Buscar número con decimal (coma o punto)
    const conDecimal = linea.match(/\d+[,.]\d+/);
    if (conDecimal) return parseFloat(conDecimal[0].replace(',', '.'));
    // Si no hay decimal, buscar entero
    const entero = linea.match(/\d+/);
    if (entero) return parseFloat(entero[0]);
    return null;
  }

  function buscarLinea(patrones) {
    for (const linea of lineas) {
      const l = linea.toLowerCase();
      for (const patron of patrones) {
        if (patron.test(l)) {
          const valor = extraerNumero(linea);
          if (valor !== null) return valor;
        }
      }
    }
    return 0;
  }

  return {
    calorias: buscarLinea([
      /energ[ií]a\s*\(kcal\)/,
      /energ[ií]a/,
      /kcal/
    ]),
    proteinas: buscarLinea([
      /prote[ií]nas?\s*\(g\)/,
      /prote[ií]nas?/
    ]),
    carbos: buscarLinea([
      /h\s*\.?\s*de\s*c\s*disp/,
      /h\s*de\s*c/,
      /carbohidratos?\s*disp/,
      /hidratos\s*de\s*carbono/,
      /carbohidratos?/
    ]),
    grasas: buscarLinea([
      /grasa[s]?\s*total[es]?\s*\(g\)/,
      /grasa[s]?\s*total/,
      /grasas?\s*totales?/
    ])
  };
}

// ─── Recordatorio creatina ───────────────────────────────
function abrirConfigCreatina() {
  const horaGuardada = localStorage.getItem('creatina-hora');
  if (horaGuardada) document.getElementById('hora-creatina').value = horaGuardada;
  const modal = document.getElementById('modal-creatina');
  modal.classList.remove('oculto');
  modal.style.display = 'flex';
}

function cerrarModalCreatina() {
  const modal = document.getElementById('modal-creatina');
  modal.classList.add('oculto');
  modal.style.display = 'none';
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
  const hora = localStorage.getItem('creatina-hora');
  const display = document.getElementById('hora-creatina-display');
  if (hora && display) {
    display.textContent = `⏰ ${hora}`;
    display.style.display = 'block';
  }
}

function iniciarVerificadorCreatina() {
  const claveHoyCreatina = `creatina-tomada-${hoy.toISOString().slice(0, 10)}`;
  const tomada = localStorage.getItem(claveHoyCreatina) === 'si';
  const btn = document.getElementById('btn-creatina-header');

  if (tomada) {
    btn.textContent = '✅ Creatina';
    btn.classList.add('tomada');
    return;
  }

  const hora = localStorage.getItem('creatina-hora');
  if (!hora) return;

  // Verificar cada minuto si es hora
  function verificar() {
    const ahora = new Date();
    const [hh, mm] = hora.split(':').map(Number);
    const yaEsHora = ahora.getHours() === hh && ahora.getMinutes() === mm;
    const tomadaAhora = localStorage.getItem(claveHoyCreatina) === 'si';

    if (yaEsHora && !tomadaAhora) {
      if (Notification.permission === 'granted') {
        new Notification('💊 ComiAPP', {
          body: '¡Hora de tomar la creatina!',
          icon: 'https://placehold.co/192x192/16a34a/ffffff?text=C'
        });
      }
      // Mostrar alerta en la app también
      const confirma = confirm('💊 ¡Hora de tomar la creatina!\n\n¿Ya la tomaste?');
      if (confirma) {
        localStorage.setItem(claveHoyCreatina, 'si');
        btn.textContent = '✅ Creatina';
        btn.classList.add('tomada');
      }
    }
  }

  verificar();
  setInterval(verificar, 60000);
}

function pedirPermisoNotificaciones() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Iniciar al cargar
mostrarHoraCreatina();
pedirPermisoNotificaciones();
iniciarVerificadorCreatina();

// ─── Init ────────────────────────────────────────────────
renderLista();