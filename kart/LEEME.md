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

El flujo de GitHub Pages publica el juego en `https://<tu-sitio>/kart/`, junto al reto. Usa el mismo
proyecto de Supabase de `config.js`:

1. Si el proyecto está pausado, reactívalo en el panel de Supabase.
2. En *SQL Editor* ejecuta [`docs/kart-supabase.sql`](../docs/kart-supabase.sql) (crea `kart_carreras`).
3. Listo: las salas viajan por Supabase Realtime y el historial queda en la tabla.

El plan gratuito permite unos 100 mensajes por segundo; el juego manda 7 actualizaciones por segundo por
equipo, suficiente para una sala de 10. Si notas karts “brincando”, usa la opción A.

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
kart/js/guardado.js            historial (servidor, Supabase y copia local)
kart/js/audio.js               música alegre y efectos, todo sintetizado
kart/servidor.js               servidor de la oficina sin dependencias
```

Las pruebas están en `test/kart.test.js` (`npm test`).

Para agregar una pista copia una entrada de `PISTAS` en `pistas.js`, cambia los puntos de control
(mundo de 2048×2048, sin cruzarse) y los colores. Para un personaje nuevo agrega una línea a `PERSONAJES`.
