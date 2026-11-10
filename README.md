# Reto de transcripción · Grupo Río

Concurso mensual de transcripción médica para el equipo de transcriptores. Cada participante
escribe su nombre, juega cinco rondas cronometradas (unos diez minutos) y obtiene un puntaje sobre
500 que queda en una tabla de posiciones compartida. Cada mes hay una edición nueva; las anteriores
se conservan como historial y en un acumulado.

> **Todo el contenido clínico es ficticio.** Los reportes, dictados y frases se inventaron para el
> juego. No se usan, graban ni reutilizan estudios ni datos de pacientes reales.

Reglas de producto:

1. **La precisión pesa más que la velocidad.** El tiempo solo desempata; nunca suma puntos.
2. **Un intento por persona por edición.** Se bloquea en el navegador y, sobre todo, en el servidor.
3. **Ningún dato real de pacientes.**

## Las cinco rondas

| Ronda | Mecánica | Tiempo | Puntos |
|---|---|---|---|
| Ortografía relámpago | 10 frases con hueco y tres opciones | 12 s por frase | 10 por acierto |
| Dictado | 3 audios, máximo dos reproducciones | Libre | 30 + 30 + 40 por precisión |
| Caza errores | Reporte con 6 errores ocultos | 90 s | 100/6 por acierto, −8 por falso positivo |
| Memoria | 2 frases que se muestran y desaparecen | 8 s y 12 s | 40 + 60 por precisión |
| Racha perfecta | Términos con acentos, Enter para enviar | 45 s | 2 por acierto, ×2 desde 3 seguidos, ×3 desde 6 |

La calificación vive en `src/calificacion.js` (pura, probada). La precisión compara **palabras**, no
caracteres: se pasa a minúsculas NFC, se quita la puntuación, se convierten números en letra con el
diccionario `NUMEROS` y se calcula la distancia de Levenshtein. Los acentos cuentan.

## Estructura

```
index.html              página única
config.js               qué adaptador de almacenamiento usar y sus claves públicas
src/app.js              arranque y navegación entre pantallas
src/rondas/*.js         una ronda por archivo: jugar(contenedor, datosEdicion, terminar)
src/calificacion.js     normalización, distancia, puntajes (sin DOM)
src/validador.js        validación de ediciones y resultados (sin DOM)
src/audio.js            audio grabado o síntesis de voz, con respaldo en texto
src/tabla.js            tabla de posiciones, medallas, acumulado, CSV
src/storage/            adapter.js (interfaz) + sharepoint.js, supabase.js, local.js
src/ui.js               helpers de DOM; nunca innerHTML
ediciones/              un JSON por mes + index.json
audio/<edicion>/        dictados grabados (opcional)
docs/                   supabase.sql y power-automate.md
test/                   pruebas con node:test
```

Sin framework, sin compilación, sin dependencias en tiempo de ejecución. Las únicas dependencias
de desarrollo son ESLint (el runner de pruebas es el de Node).

## Desarrollo local

Requiere Node 20 o superior (solo para pruebas y linter) y cualquier servidor estático.

```bash
npm install
```

```bash
npm run check
```

```bash
npm run serve
```

Luego abre <http://localhost:8080>. (Si no tienes Python: `npx http-server -p 8080`.) Abrir
`index.html` con doble clic **no** funciona: los módulos ES necesitan un servidor.

Parámetros útiles en la URL:

- `?prueba` — modo prueba: juega completo sin guardar el resultado ni bloquear el nombre.
- `?edicion=2026-12` — fuerza una edición de `index.json` (útil para revisar la del mes siguiente).
  Combínalos: `?prueba&edicion=2026-12`.

## Despliegue

`.github/workflows/pages.yml` corre linter y pruebas en cada push y pull request, y publica la rama
`main` en GitHub Pages. Activa Pages en *Settings → Pages → Source: GitHub Actions*. Solo se publican
`index.html`, `config.js`, `src/`, `estilos/`, `ediciones/` y `audio/`.

Si el repositorio es público, el contenido clínico inventado no representa riesgo, pero la clave de
Supabase o las URLs de los flujos quedan visibles: la protección tiene que estar en el servidor
(ver más abajo). Preferible: repositorio privado o interno.

## Configurar el almacenamiento

GitHub Pages solo sirve archivos; los resultados se guardan en un servicio aparte. Toda la persistencia
pasa por `src/storage/adapter.js`, que expone tres métodos (`listarResultados`, `guardarResultado`,
`listarTodos`). Se elige el backend en `config.js` con `adaptador`:

### Opción A — SharePoint + Power Automate (recomendada)

Mantiene los datos dentro de Microsoft 365. **Requiere licencia Premium** de Power Automate para el
disparador HTTP: confírmala primero. Pasos completos en [`docs/power-automate.md`](docs/power-automate.md).
Después, en `config.js`:

```js
adaptador: 'sharepoint',
sharepoint: { urlGuardar: '<URL del flujo Guardar>', urlListar: '<URL del flujo Listar>' },
```

### Opción B — Supabase (si no hay licencia Premium)

1. Crea un proyecto gratuito en Supabase.
2. En *SQL Editor* ejecuta [`docs/supabase.sql`](docs/supabase.sql). Crea la tabla con restricciones
   (total ≤ 500, nombre no vacío, rondas 0–100, total = suma, **un registro por nombre y edición**) y
   políticas de fila que permiten leer e insertar pero no modificar ni borrar.
3. En *Project Settings → API* copia la URL y la clave anónima (o *publishable*) a `config.js`:

```js
adaptador: 'supabase',
supabase: { url: 'https://xxxx.supabase.co', claveAnonima: '…', tabla: 'resultados' },
```

Nunca pongas la clave `service_role` en `config.js`.

### Respaldo local

Si el adaptador elegido no tiene sus URLs o claves, el sitio funciona en modo local (solo
`localStorage`) y lo avisa. Con un backend configurado, si la escritura remota falla el resultado se
guarda en el equipo del participante, la pantalla final dice explícitamente que **no llegó a la tabla
compartida** y que avise al organizador, y la tabla lo muestra marcado «solo en este equipo» con un
botón «Reintentar envío».

### Sobre la seguridad

Cualquier backend con escritura pública permite que alguien mande un puntaje falso con `fetch` desde
la consola. Para un concurso interno se acepta, pero el servidor rechaza puntajes mayores a 500,
nombres vacíos, totales que no cuadran y más de un registro por nombre y edición. Además el contenido
de la edición viaja al navegador: alguien con conocimientos técnicos puede leer las respuestas en las
herramientas de desarrollo. Se asume y no se intenta ofuscar.

Medidas en el navegador: pegado y arrastre bloqueados, sin corrector ni autocompletado, preguntas y
opciones barajadas en cada partida, la frase de memoria se elimina del DOM, y un intento marcado en
el equipo (recargar a mitad de partida pierde el intento). Los nombres se insertan siempre como texto,
nunca como HTML; ESLint prohíbe `innerHTML`.

## Agregar la edición del mes siguiente

1. Copia `ediciones/2026-12.json` como `ediciones/AAAA-MM.json` y cambia `id` y `titulo`.
2. Escribe contenido nuevo e **inventado** siguiendo el formato:
   - `r1`: exactamente 10 frases. `q` con un solo hueco `___`; `o` con tres opciones distintas y
     **la correcta primero** (en pantalla se barajan).
   - `r2`: dictados con `di` (lo que se dicta), `es` (lo esperado), `pts` (deben sumar 100), `audio`
     opcional y `nota` opcional. El último dictado debe incluir una autocorrección del médico
     («no, perdón, …»): `di` la contiene y `es` solo trae la versión final.
   - `r3`: `seg` y `texto` con **exactamente seis** errores escritos `palabraMal{corrección}`, pegados a
     la palabra. Cubre categorías distintas: ortografía, unidad (cm por mm), lateralidad contradictoria
     entre hallazgo y conclusión, y parónimos (vaso/bazo, perineal/peritoneal, íleon/ilion…).
   - `r4`: frases con `t`, `seg` y `pts` (deben sumar 100).
   - `r5`: al menos 10 términos distintos, preferentemente con acentos.
3. Agrega el id a `ediciones/index.json`.
4. Corre `npm test`. El validador revisa cada edición listada: si un dictado o una frase de memoria usa
   un número en letra que no está en `NUMEROS` (`src/calificacion.js`), la prueba falla. Agrégalo al
   diccionario o escríbelo con cifra.
5. Juega la edición completa con `?prueba&edicion=AAAA-MM`.
6. Haz merge a `main`. La edición se vuelve la vigente automáticamente el primer día de su mes
   (la fecha del equipo del participante decide). Puedes subirla con anticipación.

## Grabar los audios del dictado

El audio grabado es el modo preferido: suena igual en todos los equipos y permite un ritmo real con
muletillas. Si un dictado no trae `audio`, se usa síntesis de voz (`es-MX`, velocidad 0.9), que varía
entre sistemas y falta en algunos navegadores.

1. Graba a un médico del equipo leyendo el texto de `di` **inventado**, con la autocorrección incluida.
   Nunca uses grabaciones de estudios reales.
2. Exporta en MP3 mono, 64–96 kbps, 44.1 kHz, sin silencio largo al inicio (el reproductor espera
   3 segundos a que empiece a sonar antes de recurrir al texto).
3. Guarda como `audio/AAAA-MM/01.mp3`, `02.mp3`, `03.mp3` y referencia cada uno en su dictado:
   `"audio": "audio/2026-12/01.mp3"`.
4. Si `es` cambia respecto a lo grabado (una palabra distinta), corrige el JSON: el texto esperado
   debe corresponder exactamente a la versión final que se oye.

Si en un equipo no suena nada, el participante ve el texto unos segundos con un aviso, para no quedar
con cero puntos. Pídele que te avise para revisar ese equipo.

## Cerrar el mes

En la tabla de posiciones elige la edición y pulsa **Descargar CSV** (UTF-8 con BOM, separado por
comas; abre directamente en Excel y en LibreOffice Calc). La vista «Acumulado» exporta suma, ediciones
jugadas y promedio por persona. Las medallas de cada ronda aparecen bajo la tabla.

## Cuando alguien reporta que su puntaje no se guardó

1. **Pide la captura** de su pantalla final (total, desglose y tiempo) y el nombre exacto que usó.
2. **En su mismo equipo y navegador**, que abra el sitio: si el resultado quedó en el respaldo local,
   aparece en la tabla marcado «solo en este equipo» con el botón **Reintentar envío**. Si el envío
   funciona, listo.
3. Si sigue fallando, revisa el servicio: en Power Automate, el historial de ejecuciones del flujo
   *Guardar*; en Supabase, *Logs → API*. Causas típicas: licencia vencida, firma de URL regenerada sin
   actualizar `config.js`, CORS, o el proyecto de Supabase en pausa por inactividad.
4. Si el servicio respondió **409**, ya existe un registro con ese nombre en la edición (otro intento
   o alguien con el mismo nombre). Revisa la lista o tabla y decide.
5. Como último recurso, captura el resultado a mano en la lista de SharePoint o en la tabla de
   Supabase con los datos de la captura, usando el mismo `slug` (nombre sin acentos, en minúsculas,
   con guiones: `Abimael Pérez` → `abimael-perez`).
6. Si alguien perdió su intento por recargar la página, el bloqueo local está en `localStorage`
   (clave `reto-transcripcion:intentos`); se borra desde las herramientas de desarrollo de ese
   navegador. Es decisión del organizador permitir un nuevo intento.

## Pruebas

`npm test` cubre, sin DOM: precisión (idéntica = 1, vacía = 0, mayúsculas y puntuación no cuentan,
acentos sí, «doce» = «12»), caza errores (6/0 = 100, 6/8 = 36), racha (×2 desde 3, ×3 desde 6,
reinicio con error), límites 0–100 de cada ronda, validador de ediciones (seis marcas, opciones
repetidas, números fuera del diccionario, todas las ediciones publicadas), y el adaptador
(respaldo local cuando falla la red, duplicados, combinación remoto + local), tabla, medallas,
acumulado y CSV.

Revisión manual antes de publicar cada edición:

- [ ] Partida completa en Chrome y en Edge, con audio.
- [ ] Una partida con el audio desactivado, para comprobar el respaldo en texto.
- [ ] Un segundo intento con el mismo nombre queda bloqueado.
- [ ] Los puntajes aparecen en la tabla desde otra computadora.
- [ ] La exportación a CSV abre correctamente en LibreOffice Calc.
