/**
 * publicacion.js — Una publicación de adopción (adopciones/publicacion.html?id=…), rol 3, Entrega 5.
 *
 * Se llega desde "Mis postulaciones": el cliente ve el animal al que se postuló, aunque ya no esté
 * disponible (la rescatista eligió adoptante o la adopción terminó), con el estado de su postulación
 * (24/11). Si no se postuló, sigue disponible y quien mira es un cliente, "Quiero adoptarlo" abre el
 * formulario en adopciones.html.
 * Contrato: GET /api/adopciones/publicaciones/{id} (docs/api/contrato-adopciones.md del repo
 * Adopciones). Todo texto de la API va con el() o textContent.
 */
import { api } from './api.js';
import { sesion } from './auth.js';
import { el } from './ui.js';
import { textoEspecieMascota } from './etiquetas.js';
import { bloquePostulacion, edad } from './etiquetas-adopciones.js';

const estado = document.getElementById('estado');
const id = new URLSearchParams(location.search).get('id');
const poner = (campo, texto) => { document.getElementById(campo).textContent = texto; };

// Disponible = la ve cualquiera en "Animales que buscan familia" (la misma regla que Adopciones).
const disponible = (p) => p.estado_moderacion === 'APROBADA' && p.activa
  && ['PUBLICADA', 'CON_POSTULANTES'].includes(p.adopcion?.estado);

async function cargar() {
  if (!id || !/^\d+$/.test(id)) {
    estado.textContent = 'No encontramos esa publicación.';
    return;
  }
  let publicacion;
  try {
    ({ publicacion } = await api('/api/adopciones/publicaciones/' + encodeURIComponent(id)));
  } catch (e) {
    estado.textContent = e?.estado === 404
      ? 'Esta publicación ya no está disponible.'
      : 'No se pudo cargar la publicación. Probá de nuevo en un momento.';
    return;
  }

  const { mascota, rescatista } = publicacion;
  document.title = `${mascota.nombre} | Adopciones | HuellaVet`;
  document.getElementById('foto').replaceChildren(el('img', '', {
    src: `/api/adopciones/publicaciones/${publicacion.id}/foto`, alt: 'Foto de ' + mascota.nombre,
    class: 'foto-publicacion', width: '400', height: '300'
  }));
  poner('titulo', publicacion.titulo);
  poner('nombre', mascota.nombre);
  poner('datos', [
    textoEspecieMascota(mascota.especie), mascota.raza, edad(mascota.edad_meses),
    mascota.peso_kg ? `${Number(mascota.peso_kg).toLocaleString('es-AR')} kg` : null
  ].filter(Boolean).join(' · '));
  poner('descripcion', publicacion.descripcion);
  poner('rescatista', 'Lo cuida: ' + (rescatista.organizacion || rescatista.nombre));

  const usuario = await sesion;
  const acciones = document.getElementById('acciones');
  const esCliente = usuario?.rol === 'CLIENTE';

  // Si el cliente ya se postuló por este animal, ve el estado de su postulación (y no puede volver a postularse).
  let mia = null;
  if (esCliente) {
    try {
      const { postulaciones } = await api('/api/adopciones/mis-postulaciones');
      mia = postulaciones.find((p) => p.publicacion.id === publicacion.id) ?? null;
    } catch {
      mia = null;
    }
  }

  if (mia) {
    document.getElementById('volver').href = '/adopciones/adopciones.html#seccion-mias';
    document.getElementById('volver').textContent = '← Volver a mis postulaciones';
  }
  // Si la canceló y sigue disponible, puede volver a postularse (24/11).
  if (mia && !(mia.estado === 'CANCELADA' && disponible(publicacion))) {
    document.getElementById('disponibilidad').hidden = true;
    acciones.replaceWith(bloquePostulacion(mia, { cancelable: true }));
  } else if (disponible(publicacion)) {
    if (mia) acciones.before(bloquePostulacion(mia));
    poner('disponibilidad', 'Busca familia.');
    if (esCliente) {
      acciones.append(el('a', 'Quiero adoptarlo', {
        class: 'boton', href: '/adopciones/adopciones.html?postular=' + encodeURIComponent(publicacion.id)
      }));
    }
  } else {
    poner('disponibilidad', 'Ya no recibe postulaciones nuevas.');
  }

  estado.textContent = '';
  document.getElementById('publicacion').hidden = false;
}

cargar();
