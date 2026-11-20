# 🏁 Kart Fiesta

Juego de carreras estilo kart para jugar con compañeros y familia: hasta **10 corredores**,
**3 carreras** de 3 vueltas por Gran Premio, puntos acumulados, podio con campeón e historial guardado.
Se juega en el navegador (computadora, tablet o celular). No hay que instalar nada para jugar.

## Cómo se juega

1. Cada quien abre la página, escribe su **nombre** y elige **personaje** (12 para escoger).
2. Una persona toca **🎉 Crear sala** y dice el **código de 4 letras** (o comparte el enlace).
3. Los demás escriben el código y tocan **🚪 Entrar**.
4. El anfitrión (👑) puede agregar **bots 🤖** para completar la parrilla y toca **🏁 ¡Empezar!**
5. Después de cada carrera se ven los puntos; tras la 3ª aparece el **podio** con el campeón.

Controles: **flechas / WASD** para manejar y **ESPACIO** para usar el poder. En celular el kart
acelera solo: botones ◀ ▶, ⏬ para frenar y 🎁 para el poder. Si te quedas atorado, te rescatamos 🎈.

**Puntos:** 15, 12, 10, 8, 7, 6, 5, 4, 3, 2. Empate: gana quien tenga más victorias y luego quien
quedó mejor en la última carrera. Desde la carrera 2, quien va abajo en la tabla sale adelante.

**Esferas ❓** (quien va atrás recibe poderes más fuertes):

| Poder | Qué hace |
|---|---|
| 🍌 Plátano | Se deja atrás; quien lo pisa da vueltas |
| 🔥 Bola de fuego | Sale disparada derecho |
| 🚀 Cohete buscador | Persigue al de adelante |
| 🍄 Hongo turbo | Acelerón |
| ⭐ Súper estrella | Invencible y rápido 7 s; arrolla a quien toque |
| ⚡ Rayo encogedor | Encoge y frena a todos los demás |
| 🥧 Pastelazo | Mancha la pantalla de todos los que van adelante |

**En la pista** (en los mismos lugares para todos):

| Pista | Obstáculo que cruza (te hace girar) | Charco (te frena) |
|---|---|---|
| Pradera Feliz 🌻 | 🐄 vacas | lodo |
| Playa Pirata 🏝️ | 🦀 cangrejos gigantes | agua |
| Reino Dulce 🍭 | 🍩 donas que ruedan | chocolate |

Además hay tres **flechas turbo** por vuelta que dan un acelerón. La estrella ⭐ te hace inmune a obstáculos y charcos.

## Tres formas de conectarse

El juego detecta solo cuál usar (se ve abajo en la portada).

### A. Servidor en la oficina (recomendado: sin internet ni cuentas)

Una computadora con [Node.js](https://nodejs.org) 20 o más:

```bash
npm run kart          # o: node kart/servidor.js
```

La consola muestra direcciones como `http://192.168.1.23:8080/kart/`. Todos, conectados al **mismo
Wi-Fi**, abren esa dirección. Las carreras se guardan en `kart/datos/carreras.json`. Si Windows
pregunta por el firewall, permite el acceso en redes privadas.

### B. Por internet (GitHub Pages + Supabase)

El flujo de GitHub Pages publica el juego en `https://<usuario>.github.io/<repositorio>/kart/`, junto
al reto, cada vez que cambia la rama principal. Usa el proyecto de Supabase de `config.js`.

**Conexión directa entre jugadores (WebRTC).** Supabase solo sirve para que los jugadores se encuentren
al entrar a la sala; las carreras viajan directo entre los equipos (`kart/js/p2p.js`). En la sala, junto a
cada compañero aparece ⚡ (conexión directa), ⏳ (conectando) o 🌐 (sin conexión directa).

Cuentas con el plan gratuito de Supabase (cada mensaje cuenta 1 vez al enviarse y 1 vez por cada
jugador que lo recibe; el límite es 100 por segundo y 2 millones al mes):

| Situación (10 jugadores) | Mensajes de Supabase |
|---|---|
| Todos con conexión directa | ~5 por segundo; unos 6,000 por sesión → cientos de sesiones al mes |
| 1 jugador sin conexión directa | ~50 por segundo durante la carrera |
| Sin conexión directa (versión anterior) | ~750 por segundo (no cabía en el plan) |

Si alguien no logra conexión directa (Wi-Fi de invitados con aislamiento, algunos datos móviles), juega
por respaldo: el compañero con más conexiones hace de **puente** y le manda las posiciones de todos en
un solo paquete, 2 veces por segundo. Si varios quedan en 🌐, conviene que se cambien a otra red.

Notas:

1. Un proyecto gratuito de Supabase se **pausa tras 7 días sin uso**. Si el juego dice “Supabase no
   respondió”, reactívalo en el panel de Supabase.
2. El historial compartido vive en la tabla `kart_carreras` (ya creada en el proyecto «reto-transcripcion»
   con [`docs/kart-supabase.sql`](../docs/kart-supabase.sql)). Solo permite leer e insertar. Si Supabase no
   responde, cada equipo guarda su propio historial y lo avisa en pantalla.
3. Parámetros de prueba: `?p2p=0` apaga la conexión directa; `?p2p=1` la activa en otros modos.

### C. Solo este navegador

**🤖 Practicar contra bots** funciona siempre, sin red. Para probar el multijugador abre varias
pestañas con `?red=local`.

## Archivos

```
kart/index.html, estilos.css   pantallas (portada, sala, carrera, resultados, podio, historial)
kart/js/main.js                flujo de sala y Gran Premio; el anfitrión decide resultados
kart/js/juego.js               motor: física, vista 3D tipo “modo 7”, poderes, bots, HUD
kart/js/pistas.js              3 pistas: Pradera Feliz 🌻, Playa Pirata 🏝️, Reino Dulce 🍭
kart/js/personajes.js          personajes y nombres de bots
kart/js/puntos.js              puntos, desempates y sorteo de poderes (con pruebas)
kart/js/red.js                 transporte: servidor, Supabase o pestañas locales
kart/js/p2p.js                 conexión directa entre jugadores (WebRTC) con puente de respaldo
kart/js/guardado.js            historial (servidor, Supabase y copia local)
kart/js/audio.js               música alegre y efectos, todo sintetizado
kart/servidor.js               servidor de la oficina sin dependencias
```

Las pruebas están en `test/kart.test.js` (`npm test`).

Para agregar una pista copia una entrada de `PISTAS` en `pistas.js`, cambia los puntos de control
(mundo de 2048×2048, sin cruzarse) y los colores. Para un personaje nuevo agrega una línea a `PERSONAJES`.
