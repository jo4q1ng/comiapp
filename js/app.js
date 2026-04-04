function formatNum(n) {
  const val = parseFloat(n) || 0;
  return val % 1 === 0 ? val.toString() : val.toFixed(1).replace('.', ',');
}

let streamActivo = null;

async function abrirVisor() {
  document.getElementById('visor-container').classList.remove('oculto');
  document.getElementById('btn-abrir-visor').classList.add('oculto');
  document.getElementById('foto-preview-container').classList.add('oculto');
  document.getElementById('estado-ocr').textContent = '';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width:  { ideal: 1920 },
        height: { ideal: 1080 }
      }
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

  // Coordenadas exactas del recuadro (65% ancho, 380px alto, centrado)
  const scaleX = video.videoWidth  / video.offsetWidth;
  const scaleY = video.videoHeight / video.offsetHeight;

  const recW = video.offsetWidth  * 0.65 * scaleX;
  const recH = 380 * scaleY;
  const recX = (video.videoWidth  - recW) / 2;
  const recY = (video.videoHeight - recH) / 2;

  canvas.width  = recW;
  canvas.height = recH;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, recX, recY, recW, recH, 0, 0, recW, recH);

  cerrarVisor();
  estado.textContent = '🔍 Procesando...';

  // Mostrar preview
  document.getElementById('foto-preview').src = canvas.toDataURL('image/jpeg', 0.95);
  document.getElementById('foto-preview-container').classList.remove('oculto');
  ['foto-calorias','foto-proteinas','foto-carbos','foto-grasas','foto-nombre'].forEach(id => {
    document.getElementById(id).value = '';
  });

  try {
    // Preprocesar: escala de grises + contraste
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const avg = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      const c   = avg > 128 ? Math.min(255, avg * 1.4) : Math.max(0, avg * 0.6);
      d[i] = d[i+1] = d[i+2] = c;
    }
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));

    const worker = await Tesseract.createWorker('spa', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          estado.textContent = `Leyendo... ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    await worker.setParameters({
      tessedit_char_whitelist: 'abcdefghijklmnñopqrstuvwxyzABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789.,() ',
      preserve_interword_spaces: '1'
    });

    const { data: { text } } = await worker.recognize(blob);
    await worker.terminate();

    console.log('Texto OCR:', text);

    const macros = extraerMacros(text);
    console.log('Macros:', macros);

    if (macros.calorias)  document.getElementById('foto-calorias').value  = macros.calorias;
    if (macros.proteinas) document.getElementById('foto-proteinas').value = macros.proteinas;
    if (macros.carbos)    document.getElementById('foto-carbos').value    = macros.carbos;
    if (macros.grasas)    document.getElementById('foto-grasas').value    = macros.grasas;

    const n = [macros.calorias, macros.proteinas, macros.carbos, macros.grasas].filter(v => v > 0).length;
    estado.textContent = n > 0
      ? `✅ ${n} de 4 valores detectados. Verifica antes de agregar.`
      : '⚠️ No se detectaron valores. Ingrésalos manualmente.';

  } catch (e) {
    console.error('Error OCR:', e);
    estado.textContent = '⚠️ Error al leer. Ingresa manualmente.';
  }
}

function cerrarVisor() {
  if (streamActivo) {
    streamActivo.getTracks().forEach(t => t.stop());
    streamActivo = null;
  }
  document.getElementById('visor-container').classList.add('oculto');
  document.getElementById('btn-abrir-visor').classList.remove('oculto');
}

function extraerMacros(texto) {
  const lineas = texto.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

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
      for (const patron of patrones) {
        if (patron.test(l)) {
          let val = primerNumero(lineas[i]);
          if (val !== null) return val;
          if (i + 1 < lineas.length) {
            val = primerNumero(lineas[i + 1]);
            if (val !== null) return val;
          }
        }
      }
    }
    return 0;
  }

  return {
    calorias: buscarLinea([/energ[ií]a\s*\(kcal\)/, /energ[ií]a/, /kcal/]),
    proteinas: buscarLinea([/prote[ií]nas?\s*\(g\)/, /prote[ií]nas?/]),
    carbos: buscarLinea([/h\s*\.?\s*de\s*c\s*disp/, /hde\s*c/, /hdec/, /hidratos\s*de\s*carbono/, /carbohidratos?/]),
    grasas: buscarLinea([/grasa\s*total\s*\(g\)/, /grasa\s*total/, /grasas?\s*totales?/])
  };
}

function confirmarFotoTabla() {
  const parsear = id => parseFloat(document.getElementById(id).value.replace(',', '.')) || 0;

  const calorias  = parsear('foto-calorias');
  const proteinas = parsear('foto-proteinas');
  const carbos    = parsear('foto-carbos');
  const grasas    = parsear('foto-grasas');
  const nombre    = document.getElementById('foto-nombre').value.trim() || 'Producto escaneado';

  if (!calorias && !proteinas && !carbos && !grasas) {
    alert('Ingresa al menos un valor nutricional');
    return;
  }

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
  if (tab !== 'barras' && streamActivo) cerrarVisor();
  if (tab === 'metas')      actualizarBarrasMetas();
  if (tab === 'historial')  renderHistorial();
  if (tab === 'progreso')   renderProgreso();
  if (tab === 'registro')   renderComidas();
  if (tab === 'bienestar')  { renderBienestarHistorial(); cargarBienestarHoy(); }
}
// ─── Guardar y renderizar ────────────────────────────────
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

// ─── Metas diarias ───────────────────────────────────────
function cargarMetas() {
  return {
    calorias:  parseInt(localStorage.getItem('meta-calorias'))  || 0,
    proteinas: parseInt(localStorage.getItem('meta-proteinas')) || 0,
    carbos:    parseInt(localStorage.getItem('meta-carbos'))    || 0,
    grasas:    parseInt(localStorage.getItem('meta-grasas'))    || 0
  };
}

function actualizarBarrasMetas() {
  const metas = cargarMetas();
  const consumo = {
    calorias:  alimentos.reduce((s, a) => s + (parseFloat(a.calorias)  || 0), 0),
    proteinas: alimentos.reduce((s, a) => s + (parseFloat(a.proteinas) || 0), 0),
    carbos:    alimentos.reduce((s, a) => s + (parseFloat(a.carbos)    || 0), 0),
    grasas:    alimentos.reduce((s, a) => s + (parseFloat(a.grasas)    || 0), 0)
  };

  const items = [
    { key: 'cal',  unidad: 'kcal', consumo: consumo.calorias,  meta: metas.calorias  },
    { key: 'prot', unidad: 'g',    consumo: consumo.proteinas, meta: metas.proteinas },
    { key: 'carb', unidad: 'g',    consumo: consumo.carbos,    meta: metas.carbos    },
    { key: 'gras', unidad: 'g',    consumo: consumo.grasas,    meta: metas.grasas    }
  ];

  items.forEach(({ key, unidad, consumo, meta }) => {
    const texto    = document.getElementById(`meta-${key}-texto`);
    const fill     = document.getElementById(`meta-${key}-fill`);
    const pct      = meta > 0 ? Math.min((consumo / meta) * 100, 100) : 0;
    const excedido = meta > 0 && consumo > meta;

    texto.textContent = meta > 0
      ? `${formatNum(consumo)} / ${meta} ${unidad}`
      : `${formatNum(consumo)} ${unidad}`;

    fill.style.width = pct + '%';
    fill.classList.toggle('excedido', excedido);
  });
}

function abrirModalMetas() {
  const metas = cargarMetas();
  document.getElementById('meta-cal-input').value  = metas.calorias  || '';
  document.getElementById('meta-prot-input').value = metas.proteinas || '';
  document.getElementById('meta-carb-input').value = metas.carbos    || '';
  document.getElementById('meta-gras-input').value = metas.grasas    || '';
  const modal = document.getElementById('modal-metas');
  modal.classList.remove('oculto');
  modal.style.display = 'flex';
}

function cerrarModalMetas() {
  const modal = document.getElementById('modal-metas');
  modal.classList.add('oculto');
  modal.style.display = 'none';
}

function guardarMetas() {
  localStorage.setItem('meta-calorias',  document.getElementById('meta-cal-input').value  || 0);
  localStorage.setItem('meta-proteinas', document.getElementById('meta-prot-input').value || 0);
  localStorage.setItem('meta-carbos',    document.getElementById('meta-carb-input').value || 0);
  localStorage.setItem('meta-grasas',    document.getElementById('meta-gras-input').value || 0);
  cerrarModalMetas();
  actualizarBarrasMetas();
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

// ─── Panel de confirmación ───────────────────────────────
function mostrarConfirmacion(alimento) {
  alimentoPendiente = alimento;
  const esPor100g = alimento.por100g !== false;

  document.getElementById('confirmar-info').innerHTML = `
    <strong>${alimento.nombre}</strong><br>
    ${esPor100g
      ? `📊 Valores por 100g · ${formatNum(alimento.calorias)} kcal · P:${formatNum(alimento.proteinas)}g C:${formatNum(alimento.carbos)}g G:${formatNum(alimento.grasas)}g`
      : `🔥 ${formatNum(alimento.calorias)} kcal &nbsp;|&nbsp; P:${formatNum(alimento.proteinas)}g C:${formatNum(alimento.carbos)}g G:${formatNum(alimento.grasas)}g`
    }
  `;

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
  const kcal  = (alimentoPendiente.calorias  * factor).toFixed(1).replace('.', ',');
  const prot  = (alimentoPendiente.proteinas * factor).toFixed(1).replace('.', ',');
  const carb  = (alimentoPendiente.carbos    * factor).toFixed(1).replace('.', ',');
  const gras  = (alimentoPendiente.grasas    * factor).toFixed(1).replace('.', ',');

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
      nombre:    `${alimento.nombre} (${gramos}g)`,
      calorias:  parseFloat((alimento.calorias  * factor).toFixed(1)),
      proteinas: parseFloat((alimento.proteinas * factor).toFixed(1)),
      carbos:    parseFloat((alimento.carbos    * factor).toFixed(1)),
      grasas:    parseFloat((alimento.grasas    * factor).toFixed(1))
    };
  }

  alimento.comida = comidaSeleccionada;
  alimentos.push(alimento);
  guardar();
  renderLista();
  renderComidas();

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
    nombre:    p.product_name,
    calorias:  n['energy-kcal_100g']  || 0,
    proteinas: n['proteins_100g']      || 0,
    carbos:    n['carbohydrates_100g'] || 0,
    grasas:    n['fat_100g']           || 0,
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
      nombre:    p.product_name || 'Producto sin nombre',
      calorias:  n['energy-kcal_100g']   || 0,
      proteinas: n['proteins_100g']       || 0,
      carbos:    n['carbohydrates_100g']  || 0,
      grasas:    n['fat_100g']            || 0,
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

async function escanearTabla(input) {
  const archivo = input.files[0];
  if (!archivo) return;

  const estado = document.getElementById('estado-ocr');
  estado.textContent = '🔍 Procesando imagen...';

  // Mostrar preview inmediatamente
  document.getElementById('foto-preview').src = URL.createObjectURL(archivo);
  document.getElementById('foto-preview-container').classList.remove('oculto');
  ['foto-calorias','foto-proteinas','foto-carbos','foto-grasas','foto-nombre'].forEach(id => {
    document.getElementById(id).value = '';
  });

  try {
    // Preprocesar imagen: escala de grises y aumento contraste
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(archivo);
    });

    const canvas = document.createElement('canvas');
    // Escalar imagen para mejor OCR (máximo 1200px de ancho)
    const maxW = 1200;
    const scale = img.width > maxW ? maxW / img.width : 1;
    canvas.width  = img.width  * scale;
    canvas.height = img.height * scale;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Aumentar contraste para mejorar OCR
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      // Escala de grises
      const avg = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      // Aumentar contraste
      const contraste = avg > 128 ? Math.min(255, avg * 1.3) : Math.max(0, avg * 0.7);
      data[i] = data[i+1] = data[i+2] = contraste;
    }
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));

    const worker = await Tesseract.createWorker('spa', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          estado.textContent = `Leyendo... ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    // Configurar Tesseract para tablas numéricas
    await worker.setParameters({
      tessedit_char_whitelist: 'abcdefghijklmnñopqrstuvwxyzABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789.,()/ ',
      preserve_interword_spaces: '1'
    });

    const { data: { text } } = await worker.recognize(blob);
    await worker.terminate();

    console.log('Texto OCR:', text);

    const macros = extraerMacros(text);
    console.log('Macros extraídos:', macros);

    // Prerellenar campos con lo detectado
    if (macros.calorias)  document.getElementById('foto-calorias').value  = macros.calorias;
    if (macros.proteinas) document.getElementById('foto-proteinas').value = macros.proteinas;
    if (macros.carbos)    document.getElementById('foto-carbos').value    = macros.carbos;
    if (macros.grasas)    document.getElementById('foto-grasas').value    = macros.grasas;

    const detectados = [macros.calorias, macros.proteinas, macros.carbos, macros.grasas].filter(v => v > 0).length;
    estado.textContent = detectados > 0
      ? `✅ ${detectados} de 4 valores detectados. Verifica y corrige si es necesario.`
      : '⚠️ No se detectaron valores. Ingrésalos manualmente.';

  } catch (e) {
    console.error('Error OCR:', e);
    estado.textContent = '⚠️ Error al leer. Ingresa los valores manualmente.';
  }

  input.value = '';
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

function mostrarFotoTabla(input) {
  const archivo = input.files[0];
  if (!archivo) return;

  const url = URL.createObjectURL(archivo);
  document.getElementById('foto-preview').src = url;
  document.getElementById('foto-preview-container').classList.remove('oculto');

  // Limpiar campos
  ['foto-calorias','foto-proteinas','foto-carbos','foto-grasas','foto-nombre'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

function cancelarFotoTabla() {
  document.getElementById('foto-preview-container').classList.add('oculto');
  document.getElementById('foto-preview').src = '';
  document.getElementById('estado-ocr').textContent = '';
  document.getElementById('input-tabla').value = '';
}

function cancelarFotoTabla() {
  document.getElementById('foto-preview-container').classList.add('oculto');
  document.getElementById('input-tabla').value = '';
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

// ─── OCR Tabla nutricional ───────────────────────────────
function extraerMacros(texto) {
  const lineas = texto.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  console.log('Líneas:', lineas);

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
      for (const patron of patrones) {
        if (patron.test(l)) {
          let val = primerNumero(lineas[i]);
          if (val !== null) return val;
          if (i + 1 < lineas.length) {
            val = primerNumero(lineas[i + 1]);
            if (val !== null) return val;
          }
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
      /hde\s*c/,
      /hdec/,
      /hidratos\s*de\s*carbono/,
      /carbohidratos?\s*disp/,
      /carbohidratos?/
    ]),
    grasas: buscarLinea([
      /grasa\s*total\s*\(g\)/,
      /grasa\s*total/,
      /grasas?\s*totales?/
    ])
  };
}

async function escanearTabla(input) {
  const archivo = input.files[0];
  if (!archivo) return;

  const estado = document.getElementById('estado-ocr');
  estado.textContent = '🔍 Procesando imagen...';

  document.getElementById('foto-preview').src = URL.createObjectURL(archivo);
  document.getElementById('foto-preview-container').classList.remove('oculto');
  ['foto-calorias','foto-proteinas','foto-carbos','foto-grasas','foto-nombre'].forEach(id => {
    document.getElementById(id).value = '';
  });

  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(archivo);
    });

    const canvas = document.createElement('canvas');
    const maxW = 1200;
    const scale = img.width > maxW ? maxW / img.width : 1;
    canvas.width  = img.width  * scale;
    canvas.height = img.height * scale;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Preprocesar: escala de grises + contraste
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const avg = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      const c   = avg > 128 ? Math.min(255, avg * 1.3) : Math.max(0, avg * 0.7);
      d[i] = d[i+1] = d[i+2] = c;
    }
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));

    const worker = await Tesseract.createWorker('spa', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          estado.textContent = `Leyendo... ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    await worker.setParameters({
      tessedit_char_whitelist: 'abcdefghijklmnñopqrstuvwxyzABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789.,() ',
      preserve_interword_spaces: '1'
    });

    const { data: { text } } = await worker.recognize(blob);
    await worker.terminate();

    console.log('Texto OCR:', text);

    const macros = extraerMacros(text);
    console.log('Macros:', macros);

    if (macros.calorias)  document.getElementById('foto-calorias').value  = macros.calorias;
    if (macros.proteinas) document.getElementById('foto-proteinas').value = macros.proteinas;
    if (macros.carbos)    document.getElementById('foto-carbos').value    = macros.carbos;
    if (macros.grasas)    document.getElementById('foto-grasas').value    = macros.grasas;

    const n = [macros.calorias, macros.proteinas, macros.carbos, macros.grasas].filter(v => v > 0).length;
    estado.textContent = n > 0
      ? `✅ ${n} de 4 valores detectados. Verifica antes de agregar.`
      : '⚠️ No se detectaron valores. Ingrésalos manualmente.';

  } catch (e) {
    console.error('Error OCR:', e);
    estado.textContent = '⚠️ Error al leer. Ingresa los valores manualmente.';
  }

  input.value = '';
}

function cancelarFotoTabla() {
  document.getElementById('foto-preview-container').classList.add('oculto');
  document.getElementById('foto-preview').src = '';
  document.getElementById('estado-ocr').textContent = '';
  document.getElementById('input-tabla').value = '';
}

// ─── Historial ───────────────────────────────────────────
function cargarHistorial() {
  const dias = [];
  const hoyStr = hoy.toISOString().slice(0, 10);

  for (let i = 1; i <= 30; i++) {
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() - i);
    const clave = `comiapp-${fecha.toISOString().slice(0, 10)}`;
    const data  = localStorage.getItem(clave);
    if (data) {
      const items = JSON.parse(data);
      if (items.length > 0) {
        dias.push({ fecha, clave, items });
      }
    }
  }
  return dias;
}

function renderHistorial() {
  const lista = document.getElementById('historial-lista');
  const dias  = cargarHistorial();

  if (dias.length === 0) {
    lista.innerHTML = '<p class="historial-vacio">Sin registros anteriores</p>';
    return;
  }

  lista.innerHTML = dias.map((dia, idx) => {
    const fechaStr = dia.fecha.toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long'
    });
    const totalKcal  = dia.items.reduce((s, a) => s + (parseFloat(a.calorias)  || 0), 0);
    const totalProt  = dia.items.reduce((s, a) => s + (parseFloat(a.proteinas) || 0), 0);
    const totalCarb  = dia.items.reduce((s, a) => s + (parseFloat(a.carbos)    || 0), 0);
    const totalGras  = dia.items.reduce((s, a) => s + (parseFloat(a.grasas)    || 0), 0);

    const alimentos = dia.items.map(a => `
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
            <span class="historial-dia-flecha" id="flecha-${idx}">▼</span>
          </div>
        </div>
        <div class="historial-dia-body" id="body-${idx}">
          <div class="historial-macros">
            <span>💪 P: ${formatNum(totalProt)}g</span>
            <span>🌾 C: ${formatNum(totalCarb)}g</span>
            <span>🥑 G: ${formatNum(totalGras)}g</span>
          </div>
          ${alimentos}
        </div>
      </div>
    `;
  }).join('');
}

function toggleHistorialDia(idx) {
  const body   = document.getElementById(`body-${idx}`);
  const flecha = document.getElementById(`flecha-${idx}`);
  body.classList.toggle('visible');
  flecha.classList.toggle('abierto');
}

// ─── Peso corporal ───────────────────────────────────────
function registrarPeso() {
  const val = parseFloat(document.getElementById('input-peso').value.replace(',', '.'));
  if (!val || val <= 0) { alert('Ingresa un peso válido'); return; }

  const pesos = JSON.parse(localStorage.getItem('comiapp-pesos') || '[]');
  const fecha = hoy.toISOString().slice(0, 10);

  // Reemplazar si ya hay registro hoy
  const idx = pesos.findIndex(p => p.fecha === fecha);
  if (idx >= 0) pesos[idx].peso = val;
  else pesos.push({ fecha, peso: val });

  // Mantener solo últimos 30 días
  pesos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (pesos.length > 30) pesos.splice(0, pesos.length - 30);

  localStorage.setItem('comiapp-pesos', JSON.stringify(pesos));
  document.getElementById('input-peso').value = '';
  renderProgreso();
}

// ─── Datos semanales ─────────────────────────────────────
function obtenerDatosSemana() {
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() - i);
    const clave = `comiapp-${fecha.toISOString().slice(0, 10)}`;
    const items = JSON.parse(localStorage.getItem(clave) || '[]');
    const label = fecha.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' });
    dias.push({
      label,
      calorias:  items.reduce((s, a) => s + (parseFloat(a.calorias)  || 0), 0),
      proteinas: items.reduce((s, a) => s + (parseFloat(a.proteinas) || 0), 0),
      carbos:    items.reduce((s, a) => s + (parseFloat(a.carbos)    || 0), 0),
      grasas:    items.reduce((s, a) => s + (parseFloat(a.grasas)    || 0), 0)
    });
  }
  return dias;
}

// ─── Estatura e IMC ──────────────────────────────────────
function guardarEstatura() {
  const val = parseFloat(document.getElementById('input-estatura').value.replace(',', '.'));
  if (!val || val < 0.5 || val > 2.5) {
    alert('Ingresa una estatura válida en metros (ej: 1,75)');
    return;
  }
  localStorage.setItem('comiapp-estatura', val);
  document.getElementById('input-estatura').value = '';
  calcularIMC();
}

function calcularIMC() {
  const estatura = parseFloat(localStorage.getItem('comiapp-estatura'));
  const pesos    = JSON.parse(localStorage.getItem('comiapp-pesos') || '[]');
  const peso     = pesos.length > 0 ? pesos[pesos.length - 1].peso : null;

  const badge     = document.getElementById('imc-display');
  const resultado = document.getElementById('imc-resultado');

  if (estatura) {
    document.getElementById('input-estatura').placeholder = `Actual: ${formatNum(estatura)} m`;
  }

  if (!estatura || !peso) {
    resultado.innerHTML = !estatura && !peso
      ? '<p>Ingresa tu peso y estatura para calcular el IMC</p>'
      : !peso
      ? '<p>Registra tu peso para calcular el IMC</p>'
      : '<p>Ingresa tu estatura para calcular el IMC</p>';
    badge.textContent = '';
    badge.className   = 'imc-badge';
    return;
  }

  const imc = peso / (estatura * estatura);
  let categoria, clase;

  if      (imc < 18.5) { categoria = 'Bajo peso';  clase = 'bajo'; }
  else if (imc < 25)   { categoria = 'Peso normal'; clase = 'normal'; }
  else if (imc < 30)   { categoria = 'Sobrepeso';   clase = 'sobrepeso'; }
  else                 { categoria = 'Obesidad';     clase = 'obesidad'; }

  // Rango de peso saludable (IMC 18.5 - 24.9)
  const pesoMinSano = (18.5 * estatura * estatura).toFixed(1);
  const pesoMaxSano = (24.9 * estatura * estatura).toFixed(1);

  // Peso ideal (IMC 22, punto medio del rango normal)
  const pesoIdeal = (22 * estatura * estatura).toFixed(1);

  // Cuánto subir o bajar
  let recomendacion = '';
  if (imc < 18.5) {
    const diferencia = (pesoMinSano - peso).toFixed(1);
    recomendacion = `
      <div class="imc-recomendacion bajo">
        <span class="rec-titulo">📈 Necesitas ganar peso</span>
        <span class="rec-detalle">Te faltan <strong>${formatNum(diferencia)} kg</strong> para alcanzar el rango saludable</span>
        <span class="rec-detalle">Peso objetivo: <strong>${formatNum(pesoMinSano)} – ${formatNum(pesoMaxSano)} kg</strong></span>
      </div>
    `;
  } else if (imc < 25) {
    recomendacion = `
      <div class="imc-recomendacion normal">
        <span class="rec-titulo">✅ Estás en tu peso ideal</span>
        <span class="rec-detalle">Rango saludable: <strong>${formatNum(pesoMinSano)} – ${formatNum(pesoMaxSano)} kg</strong></span>
        <span class="rec-detalle">Peso ideal estimado: <strong>${formatNum(pesoIdeal)} kg</strong></span>
      </div>
    `;
  } else if (imc < 30) {
    const diferencia = (peso - pesoMaxSano).toFixed(1);
    recomendacion = `
      <div class="imc-recomendacion sobrepeso">
        <span class="rec-titulo">📉 Necesitas bajar peso</span>
        <span class="rec-detalle">Te sobran <strong>${formatNum(diferencia)} kg</strong> para volver al rango saludable</span>
        <span class="rec-detalle">Peso objetivo: <strong>${formatNum(pesoMinSano)} – ${formatNum(pesoMaxSano)} kg</strong></span>
      </div>
    `;
  } else {
    const diferencia = (peso - pesoMaxSano).toFixed(1);
    recomendacion = `
      <div class="imc-recomendacion obesidad">
        <span class="rec-titulo">⚠️ Sobrepeso significativo</span>
        <span class="rec-detalle">Te sobran <strong>${formatNum(diferencia)} kg</strong> para el rango saludable</span>
        <span class="rec-detalle">Peso objetivo: <strong>${formatNum(pesoMinSano)} – ${formatNum(pesoMaxSano)} kg</strong></span>
        <span class="rec-detalle">Consulta con un profesional de salud</span>
      </div>
    `;
  }

  badge.textContent = categoria;
  badge.className   = `imc-badge ${clase}`;

  resultado.innerHTML = `
    <span class="imc-valor">${imc.toFixed(1)}</span>
    <div style="font-size:0.85rem;color:#6b7280;margin-bottom:0.75rem">
      Peso actual: <strong>${formatNum(peso)} kg</strong> · 
      Estatura: <strong>${formatNum(estatura)} m</strong>
    </div>
    ${recomendacion}
  `;
}

// ─── Gráficos ────────────────────────────────────────────
let graficoPeso     = null;
let graficoCalorias = null;
let graficoMacros   = null;

function renderProgreso() {
  const semana = obtenerDatosSemana();
  const labels = semana.map(d => d.label);

  // Peso actual
  const pesos      = JSON.parse(localStorage.getItem('comiapp-pesos') || '[]');
  const ultimoPeso = pesos.length > 0 ? pesos[pesos.length - 1] : null;
  document.getElementById('peso-actual-display').textContent =
    ultimoPeso ? `${formatNum(ultimoPeso.peso)} kg` : '';

  // IMC
  calcularIMC();

  // Registro de hoy en progreso
  const totalCal  = alimentos.reduce((s, a) => s + (parseFloat(a.calorias)  || 0), 0);
  const totalProt = alimentos.reduce((s, a) => s + (parseFloat(a.proteinas) || 0), 0);
  const totalCarb = alimentos.reduce((s, a) => s + (parseFloat(a.carbos)    || 0), 0);
  const totalGras = alimentos.reduce((s, a) => s + (parseFloat(a.grasas)    || 0), 0);

  // Insertar registro del día si no existe el contenedor
  let regContainer = document.getElementById('progreso-registro-hoy');
  if (!regContainer) {
    regContainer = document.createElement('div');
    regContainer.id = 'progreso-registro-hoy';
    regContainer.className = 'progreso-registro';
    document.getElementById('tab-progreso').insertBefore(
      regContainer,
      document.getElementById('tab-progreso').firstChild
    );
  }

  const listaAlimentos = alimentos.length === 0
    ? '<p style="color:#9ca3af;font-size:0.85rem;text-align:center;padding:0.5rem">Sin registros hoy</p>'
    : alimentos.map(a => `
        <div class="progreso-alimento">
          <span class="progreso-alimento-nombre">${a.nombre}</span>
          <span class="progreso-alimento-kcal">${formatNum(a.calorias)} kcal</span>
        </div>
      `).join('');

  regContainer.innerHTML = `
    <h2>📋 Registro de hoy</h2>
    <div class="progreso-dia-resumen">
      <div class="progreso-macro">
        <span class="valor cal">${formatNum(totalCal)}</span>
        <span class="label">kcal</span>
      </div>
      <div class="progreso-macro">
        <span class="valor prot">${formatNum(totalProt)}g</span>
        <span class="label">proteínas</span>
      </div>
      <div class="progreso-macro">
        <span class="valor carb">${formatNum(totalCarb)}g</span>
        <span class="label">carbos</span>
      </div>
      <div class="progreso-macro">
        <span class="valor gras">${formatNum(totalGras)}g</span>
        <span class="label">grasas</span>
      </div>
    </div>
    ${listaAlimentos}
  `;

  // Gráfico peso
  const ctxPeso = document.getElementById('grafico-peso').getContext('2d');
  if (graficoPeso) graficoPeso.destroy();
  if (pesos.length > 0) {
    const ultimos = pesos.slice(-14);
    graficoPeso = new Chart(ctxPeso, {
      type: 'line',
      data: {
        labels: ultimos.map(p => {
          const f = new Date(p.fecha + 'T00:00:00');
          return f.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
        }),
        datasets: [{
          label: 'Peso (kg)',
          data: ultimos.map(p => p.peso),
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22,163,74,0.1)',
          tension: 0.3,
          fill: true,
          pointBackgroundColor: '#16a34a',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: false, ticks: { font: { size: 11 } } },
          x: { ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  // Gráfico calorías
  const ctxCal = document.getElementById('grafico-calorias').getContext('2d');
  if (graficoCalorias) graficoCalorias.destroy();
  graficoCalorias = new Chart(ctxCal, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'kcal',
        data: semana.map(d => d.calorias.toFixed(1)),
        backgroundColor: 'rgba(22,163,74,0.7)',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 11 } } },
        x: { ticks: { font: { size: 10 } } }
      }
    }
  });

  // Gráfico macros
  const ctxMac = document.getElementById('grafico-macros').getContext('2d');
  if (graficoMacros) graficoMacros.destroy();
  graficoMacros = new Chart(ctxMac, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Proteínas', data: semana.map(d => d.proteinas.toFixed(1)), backgroundColor: 'rgba(59,130,246,0.7)',  borderRadius: 4 },
        { label: 'Carbos',    data: semana.map(d => d.carbos.toFixed(1)),    backgroundColor: 'rgba(245,158,11,0.7)', borderRadius: 4 },
        { label: 'Grasas',    data: semana.map(d => d.grasas.toFixed(1)),    backgroundColor: 'rgba(239,68,68,0.7)',  borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 11 } } },
        x: { ticks: { font: { size: 10 } } }
      }
    }
  });
}

// ─── Agua ────────────────────────────────────────────────
function claveAgua() {
  return `comiapp-agua-${hoy.toISOString().slice(0, 10)}`;
}

function cargarAgua() {
  return parseInt(localStorage.getItem(claveAgua()) || '0');
}

function metaAgua() {
  return parseInt(localStorage.getItem('comiapp-meta-agua') || '8');
}

function actualizarHeaderAgua() {
  const vasos = cargarAgua();
  const meta  = metaAgua();
  document.getElementById('agua-header').textContent = `${vasos} / ${meta}`;
}

function abrirAgua() {
  const modal = document.getElementById('modal-agua');
  modal.classList.remove('oculto');
  modal.style.display = 'flex';
  document.getElementById('meta-agua-input').value = metaAgua();
  renderVasos();
}

function cerrarAgua() {
  const modal = document.getElementById('modal-agua');
  modal.classList.add('oculto');
  modal.style.display = 'none';
}

function renderVasos() {
  const vasos   = cargarAgua();
  const meta    = metaAgua();
  const container = document.getElementById('agua-vasos');

  container.innerHTML = Array.from({ length: meta }, (_, i) => `
    <span class="agua-vaso ${i < vasos ? 'lleno' : ''}">💧</span>
  `).join('');

  const ml = vasos * 250;
  document.getElementById('agua-meta-texto').textContent =
    vasos >= meta
      ? `✅ Meta cumplida · ${ml} ml tomados`
      : `${ml} ml · Te faltan ${(meta - vasos) * 250} ml`;

  actualizarHeaderAgua();
}

function agregarVaso() {
  const vasos = cargarAgua();
  const meta  = metaAgua();
  if (vasos >= meta) { alert('¡Ya alcanzaste tu meta de agua! 💧'); return; }
  localStorage.setItem(claveAgua(), vasos + 1);
  renderVasos();
}

function quitarVaso() {
  const vasos = cargarAgua();
  if (vasos <= 0) return;
  localStorage.setItem(claveAgua(), vasos - 1);
  renderVasos();
}

function guardarMetaAgua() {
  const meta = parseInt(document.getElementById('meta-agua-input').value);
  if (!meta || meta < 1 || meta > 20) { alert('Ingresa una meta válida (1-20 vasos)'); return; }
  localStorage.setItem('comiapp-meta-agua', meta);
  renderVasos();
}

// ─── Calculadora ─────────────────────────────────────────
let sexoSeleccionado    = 'h';
let objetivoSeleccionado = 'bajar';
let resultadoCalc       = null;

function seleccionarSexo(sexo) {
  sexoSeleccionado = sexo;
  document.getElementById('sexo-h').classList.toggle('activo', sexo === 'h');
  document.getElementById('sexo-m').classList.toggle('activo', sexo === 'm');
}

function seleccionarObjetivo(obj) {
  objetivoSeleccionado = obj;
  ['bajar', 'mantener', 'subir'].forEach(o => {
    document.getElementById(`obj-${o}`).classList.toggle('activo', o === obj);
  });
}

function calcularCalorias() {
  const edad      = parseInt(document.getElementById('calc-edad').value);
  const peso      = parseFloat(document.getElementById('calc-peso').value);
  const estatura  = parseFloat(document.getElementById('calc-estatura').value);
  const actividad = parseFloat(document.getElementById('calc-actividad').value);

  if (!edad || !peso || !estatura) {
    alert('Completa todos los campos');
    return;
  }

  // Fórmula Mifflin-St Jeor
  let tmb;
  if (sexoSeleccionado === 'h') {
    tmb = 10 * peso + 6.25 * estatura - 5 * edad + 5;
  } else {
    tmb = 10 * peso + 6.25 * estatura - 5 * edad - 161;
  }

  const tdee = Math.round(tmb * actividad);

  let calObjetivo, etiqueta, descripcion;
  if (objetivoSeleccionado === 'bajar') {
    calObjetivo = Math.round(tdee - 500);
    etiqueta    = '📉 Déficit calórico';
    descripcion = 'Aprox. 0,5 kg menos por semana';
  } else if (objetivoSeleccionado === 'mantener') {
    calObjetivo = tdee;
    etiqueta    = '⚖️ Mantenimiento';
    descripcion = 'Mantén tu peso actual';
  } else {
    calObjetivo = Math.round(tdee + 500);
    etiqueta    = '📈 Superávit calórico';
    descripcion = 'Aprox. 0,5 kg más por semana';
  }

  // Distribución de macros recomendada
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
        <div style="font-size:0.75rem;color:#6b7280;margin-top:2px">${descripcion}</div>
      </div>
      <span class="calc-resultado-valor">${calObjetivo} kcal</span>
    </div>
    <p style="font-size:0.82rem;color:#6b7280;margin:0.5rem 0">Distribución de macros recomendada:</p>
    <div class="calc-macros-grid">
      <div class="calc-macro-box prot">
        <span class="valor">${prot}g</span>
        <span class="label">Proteínas</span>
      </div>
      <div class="calc-macro-box carb">
        <span class="valor">${carb}g</span>
        <span class="label">Carbos</span>
      </div>
      <div class="calc-macro-box gras">
        <span class="valor">${gras}g</span>
        <span class="label">Grasas</span>
      </div>
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

// ─── Comidas ─────────────────────────────────────────────
let comidaSeleccionada = 'desayuno';

function seleccionarComida(comida) {
  comidaSeleccionada = comida;
  ['desayuno', 'almuerzo', 'cena', 'snack'].forEach(c => {
    document.getElementById(`comida-btn-${c}`).classList.toggle('activo', c === comida);
  });
}

function toggleComida(comida) {
  const body   = document.getElementById(`body-${comida}`);
  const flecha = document.getElementById(`flecha-${comida}`);
  body.classList.toggle('visible');
  flecha.classList.toggle('abierto');
}

function renderComidas() {
  const comidas = ['desayuno', 'almuerzo', 'cena', 'snack'];

  comidas.forEach(comida => {
    const items = alimentos.filter(a => (a.comida || 'desayuno') === comida);
    const lista = document.getElementById(`lista-${comida}`);
    const kcalEl = document.getElementById(`kcal-${comida}`);

    const totalKcal = items.reduce((s, a) => s + (parseFloat(a.calorias) || 0), 0);
    kcalEl.textContent = `${formatNum(totalKcal)} kcal`;

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
            <span class="li-macros" style="font-size:0.72rem;color:#9ca3af">
              P:${formatNum(a.proteinas)}g C:${formatNum(a.carbos)}g G:${formatNum(a.grasas)}g
            </span>
          </div>
          <span class="li-kcal">${formatNum(a.calorias)} kcal</span>
          <button class="btn-eliminar" onclick="eliminar(${i})">✕</button>
        </li>
      `).join('');
  });
}

// ─── Bienestar ───────────────────────────────────────────
let bienestarHoy = { energia: 0, animo: 0 };

function actualizarSlider(tipo) {
  const val = document.getElementById(`${tipo}-slider`).value;
  document.getElementById(`${tipo}-val`).textContent = `${val}h`;
}

function seleccionarEmoji(tipo, valor, btn) {
  bienestarHoy[tipo] = valor;
  const container = document.getElementById(`${tipo}-opciones`);
  container.querySelectorAll('.emoji-btn').forEach((b, i) => {
    b.classList.toggle('seleccionado', i + 1 === valor);
  });
}

function guardarBienestar() {
  const sueno  = parseFloat(document.getElementById('sueno-slider').value);
  const nota   = document.getElementById('bienestar-nota').value.trim();
  const fecha  = hoy.toISOString().slice(0, 10);

  const registro = {
    fecha,
    sueno,
    energia: bienestarHoy.energia,
    animo:   bienestarHoy.animo,
    nota
  };

  const historial = JSON.parse(localStorage.getItem('comiapp-bienestar') || '[]');
  const idx = historial.findIndex(r => r.fecha === fecha);
  if (idx >= 0) historial[idx] = registro;
  else historial.push(registro);

  historial.sort((a, b) => a.fecha.localeCompare(b.fecha));
  localStorage.setItem('comiapp-bienestar', JSON.stringify(historial));

  alert('✅ Bienestar guardado');
  renderBienestarHistorial();
}

function renderBienestarHistorial() {
  const div      = document.getElementById('bienestar-historial');
  const historial = JSON.parse(localStorage.getItem('comiapp-bienestar') || '[]');
  const ultimos  = historial.slice(-7).reverse();

  if (ultimos.length === 0) {
    div.innerHTML = '<p class="bienestar-vacio">Sin registros aún</p>';
    return;
  }

  const energiaEmojis = ['', '😴', '😕', '😐', '😊', '⚡'];
  const animoEmojis   = ['', '😢', '😔', '😐', '😊', '😄'];

  div.innerHTML = ultimos.map(r => {
    const fecha = new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long'
    });
    return `
      <div class="bienestar-dia">
        <div class="bienestar-dia-fecha">${fecha}</div>
        <div class="bienestar-dia-datos">
          <span class="bienestar-dato">😴 <strong>${r.sueno}h</strong> sueño</span>
          ${r.energia ? `<span class="bienestar-dato">${energiaEmojis[r.energia]} energía</span>` : ''}
          ${r.animo   ? `<span class="bienestar-dato">${animoEmojis[r.animo]} ánimo</span>`    : ''}
        </div>
        ${r.nota ? `<div class="bienestar-nota-texto">"${r.nota}"</div>` : ''}
      </div>
    `;
  }).join('');
}

function cargarBienestarHoy() {
  const fecha    = hoy.toISOString().slice(0, 10);
  const historial = JSON.parse(localStorage.getItem('comiapp-bienestar') || '[]');
  const registro = historial.find(r => r.fecha === fecha);
  if (!registro) return;

  document.getElementById('sueno-slider').value = registro.sueno;
  document.getElementById('sueno-val').textContent = `${registro.sueno}h`;
  document.getElementById('bienestar-nota').value = registro.nota || '';

  if (registro.energia) seleccionarEmoji('energia', registro.energia,
    document.getElementById('energia-opciones').querySelectorAll('.emoji-btn')[registro.energia - 1]);
  if (registro.animo) seleccionarEmoji('animo', registro.animo,
    document.getElementById('animo-opciones').querySelectorAll('.emoji-btn')[registro.animo - 1]);
}


// ─── Init ───────────────────────────────────────────────
// Init
pedirPermisoNotificaciones();
iniciarVerificadorCreatina();
mostrarHoraCreatina();
renderLista();
actualizarBarrasMetas();
actualizarHeaderAgua();
renderComidas();
cargarBienestarHoy();