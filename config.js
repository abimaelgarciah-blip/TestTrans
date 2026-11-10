// Configuración del sitio. Todo lo que hay aquí es PÚBLICO: viaja al navegador de cada participante.
// No pongas aquí contraseñas ni claves de servicio; solo URLs de flujos y la clave anónima de Supabase.
//
// adaptador:
//   'sharepoint' → lista de SharePoint vía Power Automate (ver docs/power-automate.md)
//   'supabase'   → tabla de Supabase (ver docs/supabase.sql)
//   'local'      → solo localStorage; no hay tabla compartida (útil para probar)
//
// Si el adaptador elegido no tiene sus URLs/claves completas, el sitio funciona en modo local
// y lo avisa en pantalla.
export default {
  adaptador: 'supabase',

  sharepoint: {
    // URL del flujo "Reto - Guardar resultado" (disparador HTTP, método POST).
    urlGuardar: '',
    // URL del flujo "Reto - Listar resultados" (disparador HTTP, método GET).
    urlListar: '',
  },

  supabase: {
    // Por ejemplo: 'https://abcdefghijkl.supabase.co'
    url: 'https://anqppbbzgfcdfjfzdeau.supabase.co',
    // Clave anónima / publishable. Es pública por diseño: la seguridad la dan las políticas de fila.
    claveAnonima: 'sb_publishable_9WZrtM6kjVmZGlKcCRW0cA_uZgLBYdi',
    tabla: 'resultados',
  },

  // Tiempo máximo de espera de cada petición al servicio remoto, en milisegundos.
  tiempoEsperaMs: 15000,
};
