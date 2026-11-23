/**
 * mascota-ficha.js — Ficha de una mascota (cliente/mascota.html?id=101).
 *
 * API (repo Pacientes):
 *   GET /api/pacientes/mascotas/{id}                       → la mascota, con su dueño
 *   GET /api/pacientes/mascotas/{id}/calendario-sanitario  → { vacunas_al_dia, eventos } (cliente y veterinaria)
 *   GET /api/pacientes/mascotas/{id}/foto                  → la foto (si tiene)
 * La veterinaria ve cualquiera; el dueño, solo las suyas (si no, 404). El rescatista no tiene
 * calendario ni historial: a él no se le muestran.
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { textoEspecieMascota } from './etiquetas.js';
import { edad } from './mascota-datos.js';
import { enlaceDuenio } from './personas.js';

const $estado = document.getElementById('estado');
const id = Number(new URLSearchParams(location.search).get('id'));
const poner = (idElemento, texto) => { document.getElementById(idElemento).textContent = texto; };
// "2026-11-24" -> "24/11/2026" (sin pasar por Date, para no correr el día por la zona horaria).
const fecha = (texto) => (texto ? texto.slice(0, 10).split('-').reverse().join('/') : '—');

const usuario = await exigirRol(['CLIENTE', 'RESCATISTA', 'VETERINARIO']);
const esVeterinaria = usuario.rol === 'VETERINARIO';
const tieneCalendario = ['CLIENTE', 'VETERINARIO'].includes(usuario.rol);

if (esVeterinaria) poner('volver', '← Ficha de mascotas');

if (!Number.isInteger(id) || id <= 0) {
  $estado.textContent = 'Falta indicar la mascota.';
} else {
  try {
    const respuesta = await api('/api/pacientes/mascotas/' + id);
    mostrar(respuesta.mascota ?? respuesta);
    $estado.textContent = '';
    if (tieneCalendario) cargarVacunas();
  } catch (error) {
    $estado.textContent = error?.estado === 404 ? 'No encontramos esa mascota.' : 'No se pudo cargar la mascota.';
  }
}

function mostrar(mascota) {
  document.title = `${mascota.nombre} | HuellaVet`;
  poner('nombre', mascota.nombre);
  poner('especie-raza', [textoEspecieMascota(mascota.especie), mascota.raza].filter(Boolean).join(' · '));

  // La foto, o la huellita si no tiene.
  const $foto = document.getElementById('foto');
  $foto.replaceChildren(mascota.tiene_foto
    ? el('img', '', { src: `/api/pacientes/mascotas/${mascota.id}/foto?v=${Date.now()}`, alt: 'Foto de ' + mascota.nombre, width: '160', height: '160' })
    : el('span', '🐾', { class: 'ficha-sin-foto', role: 'img', 'aria-label': 'Sin foto' }));

  poner('nacimiento', fecha(mascota.fecha_nacimiento));
  poner('edad', edad(mascota.edad_meses));
  poner('peso', mascota.peso_kg ? `${Number(mascota.peso_kg).toLocaleString('es-AR')} kg` : '—');

  // El dueño: a la veterinaria, con enlace a su ficha. El dueño no necesita verse a sí mismo.
  document.getElementById('dato-duenio').hidden = !esVeterinaria;
  if (esVeterinaria && mascota.duenio) document.getElementById('duenio').replaceChildren(enlaceDuenio(mascota.duenio));

  const enlaces = { 'ir-historial': '/cliente/historial.html', 'ir-calendario': '/cliente/calendario.html', 'ver-calendario': '/cliente/calendario.html' };
  for (const [idEnlace, destino] of Object.entries(enlaces)) {
    document.getElementById(idEnlace).href = `${destino}?mascota=${mascota.id}`;
  }
  document.getElementById('ir-historial').hidden = !tieneCalendario;
  document.getElementById('ir-calendario').hidden = !tieneCalendario;
  // Editar: solo el dueño (la veterinaria no modifica mascotas).
  document.getElementById('ir-editar').hidden = esVeterinaria;

  document.getElementById('ficha').hidden = false;
}

// Un vistazo a las vacunas: si está al día (o cuáles tiene vencidas) y la próxima que le toca.
async function cargarVacunas() {
  const $bloque = document.getElementById('bloque-vacunas');
  try {
    const { vacunas_al_dia: alDia, eventos = [] } = await api(`/api/pacientes/mascotas/${id}/calendario-sanitario`);
    const vacunas = eventos.filter((e) => e.tipo === 'VACUNA');
    const vencidas = vacunas.filter((e) => e.estado === 'VENCIDO');
    const proxima = vacunas
      .filter((e) => e.estado === 'PROXIMO' || e.estado === 'PENDIENTE')
      .sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada))[0];

    const $estadoVacunas = document.getElementById('estado-vacunas');
    if (vacunas.length === 0) {
      $estadoVacunas.className = 'mensaje';
      $estadoVacunas.textContent = 'No tiene vacunas en el calendario.';
    } else if (alDia && vencidas.length === 0) {
      $estadoVacunas.className = 'mensaje mensaje-ok';
      $estadoVacunas.textContent = 'Tiene las vacunas al día.';
    } else {
      $estadoVacunas.className = 'mensaje mensaje-error';
      $estadoVacunas.textContent = vencidas.length === 1
        ? `Tiene 1 vacuna vencida: ${vencidas[0].nombre}, desde el ${fecha(vencidas[0].fecha_programada)}.`
        : `Tiene ${vencidas.length} vacunas vencidas: ${vencidas.map((v) => v.nombre).join(', ')}.`;
    }
    document.getElementById('proxima-vacuna').textContent = proxima
      ? `Próxima: ${proxima.nombre}, el ${fecha(proxima.fecha_programada)}.`
      : '';
    $bloque.hidden = false;
  } catch {
    $bloque.hidden = true;   // sin el vistazo, igual queda el acceso al calendario
  }
}
