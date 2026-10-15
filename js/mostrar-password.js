// Botón para mostrar u ocultar una contraseña (el "ojito").
// Sirve para cualquier botón con la clase "mostrar-password": el atributo aria-controls dice qué campo controla.
// Se usa en el login y en los registros.

// querySelectorAll busca TODOS los elementos que coinciden ('.mostrar-password' = los que tienen esa clase).
// forEach recorre cada uno.
document.querySelectorAll('.mostrar-password').forEach((boton) => {
  // El campo que controla este botón: el que tiene el id que dice aria-controls.
  const campo = document.getElementById(boton.getAttribute('aria-controls'));

  // addEventListener('click', ...): "cuando hagan clic en el botón, ejecutá esta función".
  boton.addEventListener('click', () => {
    const estaVisible = campo.type === 'text';

    // Si estaba visible, vuelve a puntitos; si estaba oculta, se muestra.
    campo.type = estaVisible ? 'password' : 'text';

    // aria-pressed le avisa a los lectores de pantalla si el botón quedó "apretado" (contraseña visible).
    boton.setAttribute('aria-pressed', String(!estaVisible));
    boton.textContent = estaVisible ? 'Mostrar' : 'Ocultar';
  });
});
