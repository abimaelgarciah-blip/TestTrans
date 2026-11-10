// Utilidades compartidas por los adaptadores remotos.

/** Error de almacenamiento con un código que el adaptador sabe interpretar. */
export class ErrorAlmacen extends Error {
  /**
   * @param {string} mensaje
   * @param {'red'|'duplicado'|'rechazado'|'no-configurado'} codigo
   * @param {number} [estado] código HTTP, si lo hubo
   */
  constructor(mensaje, codigo, estado) {
    super(mensaje);
    this.name = 'ErrorAlmacen';
    this.codigo = codigo;
    this.estado = estado;
  }
}

/** fetch con tiempo límite. Cualquier fallo de red o de tiempo se convierte en ErrorAlmacen('red'). */
export async function pedir(fetchFn, url, opciones = {}, tiempoMs = 10000) {
  if (typeof fetchFn !== 'function') throw new ErrorAlmacen('fetch no está disponible', 'red');
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), tiempoMs);
  try {
    return await fetchFn(url, { ...opciones, signal: control.signal });
  } catch (e) {
    const mensaje = e?.name === 'AbortError' ? 'El servicio no respondió a tiempo' : 'No se pudo conectar con el servicio';
    throw new ErrorAlmacen(mensaje, 'red');
  } finally {
    clearTimeout(temporizador);
  }
}

/** Traduce un estado HTTP de error a ErrorAlmacen. */
export function errorPorEstado(estado) {
  if (estado === 409) return new ErrorAlmacen('Ya existe un registro con ese nombre en esta edición', 'duplicado', estado);
  if (estado === 400 || estado === 403 || estado === 422) {
    return new ErrorAlmacen('El servicio rechazó el resultado', 'rechazado', estado);
  }
  return new ErrorAlmacen(`El servicio respondió con error ${estado}`, 'red', estado);
}
