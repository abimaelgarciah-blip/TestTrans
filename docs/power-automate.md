# Backend SharePoint + Power Automate

Dos flujos con disparador HTTP («Cuando se recibe una solicitud HTTP») sobre una lista de SharePoint.
**Requisito:** el disparador HTTP es un conector **Premium**. Confirma la licencia antes de empezar;
si no está disponible, usa Supabase (`docs/supabase.sql`).

## 1. Lista de SharePoint `RetoTranscripcion`

| Columna    | Tipo                        | Notas |
|------------|-----------------------------|-------|
| Title      | Una línea de texto          | Se usa para el **nombre** visible |
| edicion    | Una línea de texto          | `2026-11` |
| slug       | Una línea de texto          | `abimael-perez` |
| total      | Número (0 decimales)        | 0–500 |
| segundos   | Número (0 decimales)        | |
| r1 … r5    | Número (0 decimales)        | Cinco columnas, 0–100 cada una |
| fecha      | Una línea de texto          | ISO 8601 tal como lo manda el navegador |
| clave      | Una línea de texto          | `edicion:slug`. En configuración de la columna: **Exigir valores únicos = Sí** |

La columna `clave` con valores únicos es la segunda línea de defensa contra el doble intento:
aunque dos envíos lleguen al mismo tiempo, SharePoint rechaza el segundo.

Permisos: los flujos escriben con la cuenta de servicio que los creó. Los participantes **no**
necesitan acceso a la lista. El organizador puede exportar la lista a Excel desde SharePoint.

## 2. Flujo «Reto – Guardar resultado» (POST)

1. **Disparador:** Cuando se recibe una solicitud HTTP. Método `POST`. «Quién puede activar el flujo»: **Cualquiera**.
   Esquema JSON del cuerpo:
   ```json
   {
     "type": "object",
     "required": ["edicion", "slug", "nombre", "total", "segundos", "rondas", "fecha"],
     "properties": {
       "edicion": { "type": "string" }, "slug": { "type": "string" }, "nombre": { "type": "string" },
       "total": { "type": "integer" }, "segundos": { "type": "integer" }, "fecha": { "type": "string" },
       "rondas": { "type": "object", "properties": {
         "r1": { "type": "integer" }, "r2": { "type": "integer" }, "r3": { "type": "integer" },
         "r4": { "type": "integer" }, "r5": { "type": "integer" } } }
     }
   }
   ```
2. **Condición «resultado válido»** (todas deben cumplirse; si no → rama *No*):
   - `length(trim(triggerBody()?['nombre']))` mayor que 0 y menor o igual a 80
   - `triggerBody()?['total']` menor o igual a 500 y mayor o igual a 0
   - cada `triggerBody()?['rondas']?['rX']` entre 0 y 100
   - `triggerBody()?['total']` igual a
     `add(add(add(add(triggerBody()?['rondas']?['r1'], triggerBody()?['rondas']?['r2']), triggerBody()?['rondas']?['r3']), triggerBody()?['rondas']?['r4']), triggerBody()?['rondas']?['r5'])`
   - Rama *No*: **Respuesta** con código `400`.
3. **Obtener elementos** de la lista con consulta de filtro
   `clave eq '@{triggerBody()?['edicion']}:@{triggerBody()?['slug']}'` y recuento superior `1`.
4. **Condición** `length(body('Obtener_elementos')?['value'])` mayor que 0 → **Respuesta** `409`.
5. Si no existe: **Crear elemento** con Title = nombre, edicion, slug, total, segundos, r1…r5, fecha,
   clave = `edicion:slug`. Configura «Ejecutar después» de una **Respuesta 409** para el caso en que
   «Crear elemento» falle por la columna única.
6. **Respuesta** `201` con encabezado `Access-Control-Allow-Origin: *`.

## 3. Flujo «Reto – Listar resultados» (GET)

1. **Disparador:** Cuando se recibe una solicitud HTTP. Método `GET`. Quién puede activar: **Cualquiera**.
2. **Obtener elementos** de la lista. Si `triggerOutputs()?['queries']?['edicion']` no está vacío,
   filtro `edicion eq '@{triggerOutputs()?['queries']?['edicion']}'`. Recuento superior: 5000.
3. **Seleccionar** (Select) con este mapeo:
   `nombre`=Title, `edicion`, `slug`, `total`, `segundos`, `r1`…`r5`, `fecha`.
   (El sitio acepta las rondas en columnas sueltas o anidadas en `rondas`.)
4. **Respuesta** `200`, encabezados `Content-Type: application/json` y `Access-Control-Allow-Origin: *`,
   cuerpo = salida de *Seleccionar*.

## 4. Conectar el sitio

Copia la URL de cada disparador en `config.js`:

```js
adaptador: 'sharepoint',
sharepoint: { urlGuardar: 'https://…/invoke?…&sig=…', urlListar: 'https://…/invoke?…&sig=…' },
```

Las URLs llevan una firma (`sig`) que da acceso al flujo: cualquiera que abra el sitio puede verlas.
Por eso las validaciones del paso 2 viven en el flujo y no solo en el navegador. Si una URL se filtra
fuera del equipo, regenera la firma en el disparador y actualiza `config.js`.

**CORS:** si el navegador reporta un error de CORS en el POST (petición previa `OPTIONS`), verifica que
la respuesta incluya `Access-Control-Allow-Origin`. Mientras no se resuelva, el sitio guarda en local
y avisa al participante; no se pierde nada.
