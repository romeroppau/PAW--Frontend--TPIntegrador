/**
 * pestanas.js — Pestañas accesibles (patrón ARIA "tabs"), para cualquier pantalla.
 *
 * Marcado: un contenedor role="tablist" con botones role="tab", cada uno con data-vista y
 * aria-controls apuntando a su panel role="tabpanel". Con el mouse se elige haciendo clic; con el
 * teclado, las flechas, Inicio y Fin mueven entre pestañas.
 * Es el mismo patrón que usa panel/reportes.html (js/reportes.js).
 *
 * @param {HTMLElement} lista      El elemento role="tablist".
 * @param {(vista: string) => void} alCambiar  Se llama con el data-vista de la pestaña elegida.
 * @returns {(vista: string) => void}  Una función para elegir una pestaña por su data-vista.
 */
export function activarPestanas(lista, alCambiar) {
  const tabs = [...lista.querySelectorAll('[role="tab"]')];

  function seleccionar(tab, { foco = false } = {}) {
    for (const t of tabs) {
      const activa = t === tab;
      t.setAttribute('aria-selected', String(activa));
      t.tabIndex = activa ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !activa;
    }
    if (foco) tab.focus();
    alCambiar(tab.dataset.vista);
  }

  lista.addEventListener('click', (ev) => {
    const t = ev.target.closest('[role="tab"]');
    if (t) seleccionar(t);
  });

  lista.addEventListener('keydown', (ev) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let nueva = null;
    if (ev.key === 'ArrowRight') nueva = tabs[(i + 1) % tabs.length];
    else if (ev.key === 'ArrowLeft') nueva = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (ev.key === 'Home') nueva = tabs[0];
    else if (ev.key === 'End') nueva = tabs[tabs.length - 1];
    if (nueva) {
      ev.preventDefault();
      seleccionar(nueva, { foco: true });
    }
  });

  return (vista) => {
    const t = tabs.find((x) => x.dataset.vista === vista);
    if (t) seleccionar(t);
  };
}
