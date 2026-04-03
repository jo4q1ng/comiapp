// Mostrar fecha de hoy
const hoy = new Date();
document.getElementById('fecha-hoy').textContent =
  hoy.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

// Clave de almacenamiento por día
const claveHoy = `comiapp-${hoy.toISOString().slice(0, 10)}`;

// Cargar alimentos del día desde localStorage
let alimentos = JSON.parse(localStorage.getItem(claveHoy) || '[]');

function guardar() {
  localStorage.setItem(claveHoy, JSON.stringify(alimentos));
}

function actualizarResumen() {
  const cals  = alimentos.reduce((s, a) => s + a.calorias, 0);
  const prots = alimentos.reduce((s, a) => s + a.proteinas, 0);
  const carbs = alimentos.reduce((s, a) => s + a.carbos, 0);
  const grasas = alimentos.reduce((s, a) => s + a.grasas, 0);

  document.getElementById('total-calorias').textContent  = cals;
  document.getElementById('total-proteinas').textContent = prots + 'g';
  document.getElementById('total-carbos').textContent    = carbs + 'g';
  document.getElementById('total-grasas').textContent    = grasas + 'g';
}

function renderLista() {
  const ul = document.getElementById('lista-alimentos');
  ul.innerHTML = '';
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

function agregarAlimento() {
  const nombre   = document.getElementById('nombre').value.trim();
  const calorias = parseInt(document.getElementById('calorias').value) || 0;
  const proteinas = parseInt(document.getElementById('proteinas').value) || 0;
  const carbos   = parseInt(document.getElementById('carbos').value) || 0;
  const grasas   = parseInt(document.getElementById('grasas').value) || 0;

  if (!nombre) { alert('Escribe el nombre del alimento'); return; }

  alimentos.push({ nombre, calorias, proteinas, carbos, grasas });
  guardar();
  renderLista();

  // Limpiar formulario
  ['nombre','calorias','proteinas','carbos','grasas'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

function eliminar(i) {
  alimentos.splice(i, 1);
  guardar();
  renderLista();
}

// Render inicial
renderLista();