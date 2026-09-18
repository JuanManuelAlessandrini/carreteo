# Carreteo · Juego de fiesta

**Carreteo** es un juego social para adultos con más de 380 cartas originales. Funcionan 22 modos diferentes—desde retos y preguntas hasta duelos y juegos especiales—todos listos para animar cualquier previa, asado o noche de amigos.

## Cómo jugarlo

### Opción 1: Localmente
Abre `index.html` directamente en tu navegador. El juego funciona completamente sin internet.

### Opción 2: Publicado en web
Si está desplegado en un servidor (ej: GitHub Pages), abre la URL. La app se comporta como una app nativa instalable en cualquier dispositivo.

### En el juego
1. Toca **"Jugar 🎉"** desde la pantalla de inicio
2. Agrega jugadores (mín. 2)
3. Elige la intensidad (Suave/Medio/Picante)
4. Selecciona un modo de juego
5. Lee cada carta y cumple el reto/pregunta
6. Usa 🏆 para anotar sorbos en el marcador
7. Salta cartas cuando quieras

## Cómo agregar cartas

Todas las cartas viven en `cards.js`. No requiere build ni compilación: edita el archivo y recarga.

### Formato de una carta

```
"[I]tipoN|texto"
```

Donde:
- **[I]** (opcional): Intensidad → `1` (suave), `2` (medio), `3` (picante). Si se omite, usa la del modo.
- **tipo**: Tipo de carta:
  - `r` = Reto
  - `p` = Pregunta
  - `yn` = Yo nunca
  - `rg` = Regla nueva (dura N rondas)
  - `vt` = Votación
  - `vs` = Duelo
  - `mm` = Mímica
  - `tm` = Contrarreloj (N segundos)
  - `dd` = Dado
  - `sh` = Shot
  - `cc` = Cultura chupística
  - `tr` = Reparte sorbos
  - `aq` = Hidrátate 💧
- **N**: Número de rondas (rg) o segundos (tm)
- **texto**: El contenido. `{j}` = jugador al azar, `{j2}` = otro jugador. `§` separa pregunta/respuesta.

### Ejemplos

```javascript
// Reto simple
`r|{j}, imita el saludo característico de alguien del grupo. Si adivinan a quién, todos toman 1; si no, tomas 2.`

// Pregunta con opción
`p|{j}, ¿playa o montaña? Los que opinen distinto a ti toman 1.`

// Yo nunca
`yn|Yo nunca he stalkeado a un ex. Quien sí, toma 2.`

// Trivia (pregunta § respuesta)
`p|¿Cuál es el río más largo del mundo?§El Amazonas. Fallo = 2 sorbos.`

// Regla que dura 3 rondas
`rg3|Prohibido decir "sí". Quien lo diga toma 1.`

// Timer de 20 segundos
`tm20|{j}, nombra 5 países que empiecen con la misma letra antes del pitido o toma 3.`
```

**Solo edita `cards.js`.** Otros archivos maneja la lógica y no deberías tocarlos.

## Cómo probar cambios

```bash
npm run check
```

Esto ejecuta:
- `npm test` — valida que el JS sea sintácticamente correcto
- `npm run smoke` — verifica que index.html carga y todas las cartas son válidas

Si ves ✓, todo está bien. Si hay ✗, hay un error de sintaxis o una carta malformada.

## Cómo publicar una actualización

1. **Edita `cards.js`** con tus nuevas cartas
2. **Prueba localmente** con `npm run check`
3. **Git:**
   ```bash
   git add cards.js
   git commit -m "Agrega X cartas nuevas"
   git push
   ```
4. **IMPORTANTE:** Si actualizaste contenido o archivos, sube el número de versión en `sw.js`:
   ```javascript
   const CACHE = 'carreteo-v2.0.1';  // ← Cambia aquí
   ```
   **¿Por qué?** Los celulares cachean la app. Sin cambiar la versión, los usuarios siguen viendo la versión vieja. Incrementa: `2.0.0` → `2.0.1` → `2.1.0`, etc.

## Estructura de archivos

```
Juego Carrete/
├── index.html              App principal (no tocar)
├── app.js                  Lógica de navegación (no tocar)
├── engine.js               Motor del juego (no tocar)
├── cards.js                ⭐ AQUÍ VAS TUS CARTAS (el único que editas)
├── manifest.json           PWA metadata (no tocar)
├── sw.js                   Service Worker, caché offline (⚠️ actualiza versión aquí al publicar)
├── package.json            Scripts de test
├── README.md               Este archivo
├── icons/                  Íconos de app
│   ├── icon-192.png
│   ├── icon-512.png
│   └── maskable-512.png
├── docs/                   Documentación adicional
├── tests/                  Tests automáticos (no tocar)
└── tools/
    ├── make_icons.py       Genera los íconos (solo si necesitas recrearlos)
    └── smoke.js            Valida cartas (no tocar)
```

---

**Tips finales:**
- Bebe con responsabilidad
- Cualquier reto se puede saltar—nadie está obligado a nada
- Cuantos más amigos caóticos, más divertido
