# Carreteo 🎉

Juego de fiesta para adultos: **653 cartas originales** repartidas en **21 modos** más **4 juegos especiales**. Funciona sin internet, sin anuncios y sin cuentas. Se instala en el celular como una app.

Pensado para que una persona lo abra en su teléfono y hostee la mesa: se agregan los jugadores una vez, se elige un modo y la app va nombrando a quién le toca.

## Jugarlo

**En el celular (recomendado):** abre la URL publicada, toca *Compartir → Agregar a pantalla de inicio*. Queda como una app y funciona después sin señal.

**En el computador:** abre `index.html` con doble clic. Funciona igual; lo único que se pierde es el modo offline instalado.

Una vez dentro: *Jugar* → agrega jugadores (mínimo 2) → elige intensidad 🌶️ → elige modo. El 🏆 abre el marcador de sorbos y *Terminar la noche* muestra el resumen con podio, el valiente y el gallina.

### Anotar quién toma

Debajo de cada carta hay una fila con **todos** los jugadores. Toca al que perdió y le suma los sorbos que dice la carta. El que la carta nombra viene destacado, pero muchas cartas no nombran a nadie ("el último en tocar algo rojo toma 2") y ahí el que pierde lo deciden ustedes.

La misma fila aparece en la ruleta, en el impostor y cuando explota la bomba, porque en esos casos el que pierde lo decide el juego y la app no tiene cómo saberlo sola.

### Gráficos

El marcador 🏆, el resumen de la noche y la vista en vivo muestran tres gráficos: el **total** de cada uno, **la carrera** (cómo fue sumando cada uno durante la noche; toca o arrastra el dedo para ver los valores en un momento) y la **última hora**, para ver quién va muy rápido y ofrecerle agua.

Para la carrera, la app anota la hora de cada sorbo que se suma o resta, venga de donde venga. Ese historial se guarda con el marcador y se borra al reiniciarlo, con *Partida nueva* o cuando pasan 8 horas.

### Cuando alguien se va a dormir

El botón 🛌 de la lista de jugadores lo saca de la rueda: deja de salir nombrado en las cartas, no entra en la vuelta de la bomba y no toma cuando una carta dice "todos". Pero **conserva sus sorbos** y aparece en el resumen de la noche con la hora a la que cayó, incluido quién fue el primero.

Si vuelve, el ↩ lo reincorpora — o simplemente escribe su nombre de nuevo. El ✕ que aparece al lado sí lo borra del todo, para cuando escribiste mal un nombre.

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

### Compartir en vivo

El 📡 (en el inicio y arriba de cada carta) muestra un QR, un código de 6 letras y un link. Los que lo abren ven desde su celular, en tiempo real, la carta que está en pantalla, las reglas activas y el marcador. Solo miran: el que hostea sigue siendo el único que juega.

- Necesita internet en los dos lados. Si se corta, el juego sigue igual en el celular del host y la transmisión se reintenta sola.
- Si el host bloquea el celular, los demás siguen viendo la última carta y un aviso de que no hay novedades. Al desbloquear se pone al día.
- Recargar la página no corta la transmisión: retoma la misma sala. *Dejar de compartir* la borra.

#### Cada uno en su celular

Al abrir el link, cada uno elige **qué jugador es** (o *Solo mirar*). El primero que elige un nombre se queda con él; el host ve quiénes están conectados en la ventana del 📡. Con eso, en su celular:

- **👉 ¡Te toca!** — vibra y avisa cuando la carta lo nombra.
- **Su marcador** — sus sorbos, en qué puesto va y cuántos retos hizo o saltó.
- **🕵️ Impostor** — ve su palabra o "eres el impostor" en su celular. El host ya no le pasa el teléfono: la app se salta a los que lo tienen y solo pide pasarlo a los que no.
- **🗳️ Votaciones** — en las cartas de votación vota desde su celular. El voto es secreto: el host ve el conteo en la carta y la carta siguiente cierra la urna.

La palabra del impostor y los votos no pasan por la sala pública: cada rol va a un espacio que solo puede leer el celular sentado en ese jugador, y los votos solo los lee el host.

Por dentro usa Firebase Realtime Database (plan gratis Spark) hablándole por REST, sin SDK. La configuración está al inicio de `live.js` y las reglas de seguridad en `database.rules.json`: cualquiera con el código puede leer su sala, pero solo el celular que la creó puede escribirla, y no se pueden listar las salas. Cada celular solo puede sentarse en un asiento libre, leer su propio rol y votar por su asiento en la votación abierta.

**Si cambias `database.rules.json`, hay que pegarlo a mano** en la consola de Firebase → *Realtime Database* → *Reglas* → *Publicar*. El archivo del repo no se aplica solo.

## Agregar cartas

**Todo el contenido vive en `cards.js` y es el único archivo que necesitas editar.** No hay build: guardas y recargas.

> **Ojo con `npm run serve`.** "Guardas y recargas" vale si abriste `index.html` con doble clic: ahí no corre el service worker. Servida por `http://localhost`, la app instala el service worker en la primera carga y desde entonces recargar muestra la copia guardada, no tus cambios. Para verlos ahí, en Chrome abre DevTools → *Application* → *Service workers* y marca *Update on reload* (o *Bypass for network*), o sube la versión en `sw.js` y toca el aviso de versión nueva.

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
| `p` | Pregunta | Con `§` se vuelve trivia: `pregunta§respuesta`. Arranca un cronómetro de 20s y al acabarse revela la respuesta sola; `p30` le da 30 segundos. |
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

// trivia: 20 segundos y la respuesta se revela sola
`p|¿Cuál es el río más largo del mundo?§El Amazonas. Fallo = 2 sorbos.`,

// la misma, pero con 40 segundos porque es más difícil
`p40|Nombra los países que limitan con Chile§Perú, Bolivia y Argentina. Fallo = 3 sorbos.`,

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

- **`npm test`** — 86 tests del motor, del contenido, de los gráficos y de compartir en vivo. Verifica que la garantía de no-repetición aguante, que el reparto de turnos sea parejo, y que todas las cartas parseen, no estén duplicadas, tengan tipo conocido y no sugieran manejar.
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

**Cada vez que publiques, sube la versión en `sw.js`, aunque solo hayas cambiado `cards.js`:**

```javascript
const CACHE = 'carreteo-v2.1.1';   // ← 2.1.0 → 2.1.1
```

Después:

```bash
npm run check                      # que esté todo verde
git add -A
git commit -m "Agrega cartas de X"
git push
```

GitHub Pages publica solo, en un par de minutos.

El service worker guarda todos los archivos de la app en caché, `cards.js` incluido, y los sirve desde ahí sin preguntarle a la red. Sin cambiar ese número, quien ya la tenga instalada seguiría viendo la versión vieja, cartas incluidas. Al subirlo, la app muestra un aviso de "hay una versión nueva" que no corta la partida en curso.

## Los archivos

```
index.html      la página y todo el CSS
cards.js        ⭐ solo contenido: los mazos, las categorías, las reglas del rey
engine.js       lógica pura: barajar, parsear cartas, no-repetición, turnos
app.js          pantallas, sonidos, vibración, marcador, resumen
charts.js       gráficos del marcador: barras, la carrera y la última hora
live.js         compartir en vivo: publica la partida en Firebase y la vista del que mira
database.rules.json  reglas de seguridad de Firebase (se pegan a mano en la consola)
vendor/qrcode.js     generador de QR (qrcode-generator de Kazuhiko Arase, MIT)
sw.js           caché offline (⚠️ sube la versión al publicar)
manifest.json   para que se instale como app
icons/          generados con tools/make_icons.py
tests/          engine.test.js (motor) · cards.test.js (contenido) · charts.test.js (gráficos) · live.test.js (compartir)
tools/smoke.js  prueba de integración: juega la app completa
carreteo.html   la versión 1 de un solo archivo, guardada de respaldo
```

`cards.js` no tiene lógica y `engine.js` no toca el DOM. Por eso el contenido se puede editar sin miedo a romper nada.

---

Tómalo con calma y con agua a mano. Cualquier carta se puede saltar: nadie está obligado a nada.
