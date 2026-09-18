# Carreteo 🎉

Juego de fiesta para adultos: **653 cartas originales** repartidas en **21 modos** más **4 juegos especiales**. Funciona sin internet, sin anuncios y sin cuentas. Se instala en el celular como una app.

Pensado para que una persona lo abra en su teléfono y hostee la mesa: se agregan los jugadores una vez, se elige un modo y la app va nombrando a quién le toca.

## Jugarlo

**En el celular (recomendado):** abre la URL publicada, toca *Compartir → Agregar a pantalla de inicio*. Queda como una app y funciona después sin señal.

**En el computador:** abre `index.html` con doble clic. Funciona igual; lo único que se pierde es el modo offline instalado.

Una vez dentro: *Jugar* → agrega jugadores (mínimo 2) → elige intensidad 🌶️ → elige modo. El 🏆 abre el marcador de sorbos y *Terminar la noche* muestra el resumen con podio, el valiente y el gallina.

### Los modos

| | | |
|---|---|---|
| 🥤 Previa · 32 | 🍸 Bar · 30 | 🧠 Trivia · 30 |
| 🎭 Mímica · 30 | 📼 90's · 29 | 🎓 Universidad · 29 |
| 💪 Fit · 28 | 🤪 Locura · 31 | ⚡ Conflicto · 30 |
| 💀 Muerte súbita · 28 | ⚔️ Versus · 29 | 🙊 Nunca nunca · 31 |
| 🥃 Shot · 29 | 😏 Coqueto · 30 | 💘 Parejas · 30 |
| 🎁 Premio o castigo · 30 | 🎲 Verdad o reto · 60 | 🌙 After · 31 |
| 🔥 Hot · 30 | ❄️ Invierno · 28 | 🎄 Navidad · 28 |

Invierno y Navidad solo aparecen en su temporada. **Mix** deja elegir varios modos y los mezcla en un solo mazo.

Especiales: 👑 Cuarto rey · 🕵️ Impostor · 🎡 Ruleta · 💣 La bomba.

### Intensidad

Cada carta tiene un nivel y el selector 🌶️ filtra por él:

- **Suave** — nada que incomode a nadie.
- **Medio** — confesiones y duelos.
- **Picante** — todo, incluido Hot y After.

El nivel queda guardado entre sesiones, igual que los jugadores y el marcador.

### Sin alcohol

El switch 🚫🍺 traduce todos los "sorbos" a "puntos" en tiempo real, también en el resumen. Los shots se convierten en retos.

## Agregar cartas

**Todo el contenido vive en `cards.js` y es el único archivo que necesitas editar.** No hay build: guardas y recargas.

### Formato

```
"[I]tipoN|texto"
```

| Parte | Qué es |
|---|---|
| `[I]` | Opcional. Intensidad `1`, `2` o `3`. Si no la pones, la carta hereda la del modo. |
| `tipo` | Código de tipo (tabla abajo). |
| `N` | Opcional. Rondas que dura la regla (`rg`) o segundos del cronómetro (`tm`). |
| `texto` | El contenido. `{j}` es un jugador al azar, `{j2}` otro distinto. `§` separa partes. |

### Tipos

| Código | Etiqueta | Notas |
|---|---|---|
| `r` | Reto | |
| `p` | Pregunta | Con `§` se vuelve trivia: `pregunta§respuesta`. |
| `yn` | Yo nunca | |
| `rg` | Regla nueva | `rg3` dura 3 rondas y se muestra en la barra de reglas activas. |
| `vt` | Votación | |
| `vs` | Duelo | Usa `{j}` y `{j2}`. |
| `mm` | Mímica | |
| `tm` | Contrarreloj | `tm20` da 20 segundos con cuenta regresiva y pitido. |
| `dd` | Dado | |
| `sh` | Shot | En modo sin alcohol se convierte en reto. |
| `cc` | Cultura chupística | |
| `tr` | Reparte | |
| `aq` | Hidrátate 💧 | |
| `pc` | Premio o castigo | Tres partes: `reto§premio§castigo`. |

### Ejemplos

```javascript
// reto simple
`r|{j}, imita el saludo de alguien del grupo. Si adivinan a quién, todos toman 1; si no, tomas 2.`,

// duelo entre dos jugadores
`vs|{j} vs {j2}: guerra de pulgares al mejor de 3. Perdedor toma 2.`,

// trivia: la respuesta se revela al tocar la carta
`p|¿Cuál es el río más largo del mundo?§El Amazonas. Fallo = 2 sorbos.`,

// regla que dura 3 rondas
`rg3|Prohibido decir "sí". Quien lo diga toma 1.`,

// cronómetro de 20 segundos
`tm20|{j}, nombra 5 países con la misma letra antes del pitido o toma 3.`,

// premio o castigo: reto, premio si lo logra, castigo si falla
`pc|{j}, di el abecedario al revés en 20 segundos§Reparte 4 sorbos§Tomas 4`,

// esta carta es picante aunque el modo sea suave
`[3]r|{j}, muestra la última foto de tu galería o toma 4.`,
```

### Reglas al escribir

- **Di siempre cuántos sorbos.** La app lee el número del texto para anotar en el marcador; sin número no suma nada.
- **Nunca `{j2}` sin `{j}`.** El segundo jugador solo existe si hay un primero.
- **Siempre una salida.** Toda carta debe poder saltarse: "...o toma 3".
- **Nada peligroso.** Nada de manejar, escalar, comer cosas raras ni retos con desconocidos. Hay un test que revisa lo de manejar.
- **Sin backticks** dentro del texto: el archivo usa template strings y se rompería.
- **Mezcla tipos** dentro de un modo. Si un modo queda con más de la mitad de cartas del mismo tipo, el test lo reclama (salvo los modos que son de un tipo a propósito, como Mímica o Versus).

## Probar antes de publicar

```bash
npm install     # solo la primera vez
npm run check
```

Son dos cosas:

- **`npm test`** — 63 tests del motor y del contenido. Verifica que la garantía de no-repetición aguante, que el reparto de turnos sea parejo, y que todas las cartas parseen, no estén duplicadas, tengan tipo conocido y no sugieran manejar.
- **`npm run smoke`** — arranca la app entera en un navegador simulado, juega 40 turnos en cada modo de cartas y cuenta las repeticiones. Debe decir `modos limpios: 20/20`.

Si algo falla, el mensaje dice qué carta y por qué. El test más útil cuando agregas cartas es el de duplicados: caza las que ya existían en otro modo escritas parecido.

Para ver la app servida de verdad (con service worker):

```bash
npm run serve     # http://localhost:8080
```

## Cómo no se repiten las cartas

Esto es lo que arregla el problema clásico de este tipo de juegos. `engine.js` recuerda las cartas ya vistas de cada modo durante la sesión. Al armar el mazo pone primero, barajadas, las que no han salido; y al final las vistas hace poco, **ordenadas de más antigua a más reciente**. Ese orden es lo que da la garantía: la última que salió es la última en volver.

La ventana es `min(20, cartas − 5)`, así que en un modo de 30 cartas no verás una repetida antes de 20 turnos. Los mazos chicos siempre conservan algo de sorpresa.

El historial es **solo de la sesión**: si cierras la app, empieza limpio. Los jugadores y el marcador sí se guardan.

También hay una bolsa de turnos: nadie vuelve a ser el `{j}` hasta que todos hayan pasado. Solo avanza en cartas que nombran a alguien, para que las cartas grupales no gasten turnos invisibles.

## Publicar una actualización

```bash
npm run check                      # que esté todo verde
git add -A
git commit -m "Agrega cartas de X"
git push
```

GitHub Pages publica solo, en un par de minutos.

**Si tocaste cualquier archivo que no sea `cards.js`, sube la versión en `sw.js`:**

```javascript
const CACHE='carreteo-v2.0.1';   // ← 2.0.0 → 2.0.1
```

Los celulares guardan la app en caché. Sin cambiar ese número, quien ya la tenga instalada seguiría viendo la versión vieja. Al subirlo, la app muestra un aviso de "hay una versión nueva" que no corta la partida en curso.

## Los archivos

```
index.html      la página y todo el CSS
cards.js        ⭐ solo contenido: los mazos, las categorías, las reglas del rey
engine.js       lógica pura: barajar, parsear cartas, no-repetición, turnos
app.js          pantallas, sonidos, vibración, marcador, resumen
sw.js           caché offline (⚠️ sube la versión al publicar)
manifest.json   para que se instale como app
icons/          generados con tools/make_icons.py
tests/          engine.test.js (motor) · cards.test.js (contenido)
tools/smoke.js  prueba de integración: juega la app completa
carreteo.html   la versión 1 de un solo archivo, guardada de respaldo
```

`cards.js` no tiene lógica y `engine.js` no toca el DOM. Por eso el contenido se puede editar sin miedo a romper nada.

---

Tómalo con calma y con agua a mano. Cualquier carta se puede saltar: nadie está obligado a nada.
