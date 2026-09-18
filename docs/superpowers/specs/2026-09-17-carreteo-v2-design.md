# Carreteo v2 — diseño

Fecha: 2026-09-17

## Problema

`carreteo.html` v1 es un archivo único de 963 líneas: 20 modos de cartas (~280 cartas,
~14 por modo), 3 especiales (Cuarto rey, Impostor, Ruleta), marcador de sorbos y modo
sin alcohol. Se juega con un celular que hostea y el resto mira la pantalla.

Limitaciones que motivan la v2:

1. **Repetición.** Cada modo tiene ~14 cartas y al agotarse se rebaraja el mazo entero,
   así que a los 15 turnos ya se repite contenido.
2. **Duplicados entre modos.** "Guerra de pulgares" está en Fit y en Versus; hay varias
   más.
3. **Sin memoria.** Al cerrar la pestaña se pierden jugadores y marcador.
4. **Contenido y código mezclados.** Agregar una carta obliga a navegar entre CSS y
   lógica.
5. **Distribución frágil.** Mandar un `.html` por WhatsApp falla seguido en iOS.

## Objetivo

Duplicar el contenido, evitar repeticiones dentro de una sesión, sumar cuatro modos,
darle memoria y publicarlo como PWA instalable.

## Decisiones

| Tema | Decisión | Alternativa descartada |
|---|---|---|
| Arquitectura | Sitio estático plano, sin build: `index.html` + `cards.js` + `engine.js` + `app.js` | Framework con build (Vite) — desproporcionado para un juego de cartas |
| Anti-repetición | Ventana de las últimas 20 cartas, **solo en memoria** | Historial persistido entre sesiones — el dueño prefiere que cada fiesta parta limpia |
| Volumen | ~30 cartas por modo (~600 en total) | ~45 por modo — riesgo de relleno |
| Premio o castigo | Reto con doble resultado explícito en la carta | Apuesta a ciegas entre dos cartas tapadas |
| Distribución | GitHub Pages + PWA, sin romper el uso como archivo local | Seguir solo con el `.html` suelto |

El código debe seguir funcionando abierto con `file://`; lo único que se pierde en ese
modo es el service worker.

## Componentes

### `cards.js` — solo contenido

Ninguna lógica. Exporta `TYPES`, `MODES`, `SPECIALS`, `TRUTH_DARE`, `BOMB_CATS`,
`IMP_WORDS`, `WHEEL_DARES`, `KING_RULES`, `KING_LAST`. Es el único archivo que hay que
tocar para agregar cartas.

Formato de carta (string):

```
"[I]tipoN|texto"
  [I]   intensidad opcional 1|2|3; si falta, hereda MODE.lvl
  tipo  r p yn rg vt vs mm tm dd sh cc tr aq pc
  N     opcional: rondas (rg) o segundos (tm)
  texto {j} y {j2} son jugadores. p: "pregunta§respuesta". pc: "reto§premio§castigo"
```

Modo: `{id, nm, em, c, ds, lvl, min?, season?, deck}`.

### `engine.js` — lógica pura, sin DOM

Es lo único que se prueba automáticamente. No toca `document`, `window` ni
`localStorage`, y acepta un RNG inyectable para que los tests sean determinísticos.

| función | responsabilidad |
|---|---|
| `parseCard(s)` | string → `{lvl, k, n, x}` |
| `adapt(text, noAlcohol)` | traduce sorbos → puntos, shots → prendas |
| `filterByIntensity(deck, modeLvl, maxLvl)` | filtra por picante |
| `dedupe(cards)` | por texto normalizado |
| `buildDeck(all, recent)` | baraja evitando las últimas vistas |
| `pushRecent(recent, card, cap)` | cola FIFO de vistas |
| `makeBag` / `nextFromBag` | reparto justo de `{j}`: nadie repite hasta que pasen todos |
| `buildMixDeck(modes, ids, maxLvl)` | unión de mazos con etiqueta de origen |
| `sipsInText(text)` | cuántos sorbos anota el botón rápido |
| `summary(players, session)` | ranking y premios de fin de noche |

`buildDeck` es el corazón del anti-repetición: devuelve
`shuffle(todas − recientes) ++ shuffle(recientes)`, con ventana
`min(20, largo − 5)` para que mazos chicos no se queden sin cartas.

### `app.js` — UI y estado

Pantallas, render, sonidos sintetizados con WebAudio, vibración, persistencia en
`localStorage` y registro del service worker. Es el único que conoce el DOM.

Estado persistido bajo `carreteo.v2`: jugadores (con sorbos, retos hechos y saltados),
modo sin alcohol, intensidad, sonido, selección de Mix y hora de inicio. El historial de
cartas **no** se persiste, por diseño.

## Modos nuevos

- **Premio o castigo** 🎁 — la carta muestra un reto; dos botones (*Lo logró* / *Falló*)
  revelan el premio o el castigo y anotan los sorbos al marcador.
- **Verdad o reto** 🎲 — pantalla previa con el nombre del jugador y dos botones; mazos
  separados de verdades y retos, diez por nivel de intensidad.
- **La bomba** 💣 — categoría al azar y temporizador oculto de 15 a 40 segundos. Pasan el
  celular diciendo ejemplos; a quien le explota, toma.
- **Mix** 🎰 — el jugador elige qué modos entran y se arma un mazo único sin duplicados;
  cada carta muestra de qué modo viene.

## Mejoras transversales

- **Intensidad global** (suave / medio / picante) que filtra todos los modos.
- **Memoria** de jugadores y marcador, con "Nueva partida" para limpiar.
- **Sonido y vibración** sintetizados, sin archivos de audio, con interruptor.
- **Resumen de la noche**: ranking, cartas jugadas, "el valiente" y "el gallina",
  exportable como imagen para compartir.

## Seguridad y responsabilidad

Se mantiene el gate de +18 y el modo sin alcohol. Ninguna carta puede sugerir manejar,
consumir cosas no comestibles, retos físicos riesgosos ni interacciones con
desconocidos. Toda carta tiene salida: saltar siempre es opción.

## Verificación

`node --test tests/` cubre `engine.js` y valida el contenido de `cards.js` (que todas
las cartas parseen, que no haya duplicados exactos, mínimos por modo). La UI se prueba a
mano en el celular contra la URL publicada.
