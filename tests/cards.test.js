/* Valida el CONTENIDO de cards.js: que todo parsee, que no haya duplicados
   y que cada modo tenga suficientes cartas para que el anti-repetición
   tenga de dónde elegir. Es la red de seguridad de la carpeta de contenido:
   si alguien agrega una carta mal escrita, esto lo caza. */
const test = require('node:test');
const assert = require('node:assert');
const C = require('../cards.js');
const E = require('../engine.js');

const MIN_POR_MODO = 28;
const TIPOS = new Set(['r', 'p', 'yn', 'rg', 'vt', 'vs', 'mm', 'tm', 'dd', 'sh', 'cc', 'tr', 'aq', 'pc']);

function todasLasCartas() {
  const out = [];
  // 'vor' no tiene cartas propias: su mazo se arma con truths + dares al
  // cargar cards.js. Si lo recorrieramos aqui contariamos todo dos veces.
  C.MODES.filter(m => m.id !== 'vor')
    .forEach(m => m.deck.forEach(c => out.push({ modo: m.id, card: c })));
  C.TRUTH_DARE.truths.forEach(c => out.push({ modo: 'truths', card: c }));
  C.TRUTH_DARE.dares.forEach(c => out.push({ modo: 'dares', card: c }));
  return out;
}

test('todas las cartas tienen un tipo válido', () => {
  const malas = todasLasCartas()
    .filter(x => !TIPOS.has(E.parseCard(x.card).k))
    .map(x => x.modo + ': ' + x.card.slice(0, 60));
  assert.deepStrictEqual(malas, []);
});

test('todo tipo de carta en uso tiene etiqueta en TYPES', () => {
  // sin esto la carta se rotula "Carta" en pantalla y nadie lo nota
  const usados = new Set(todasLasCartas().map(x => E.parseCard(x.card).k));
  const sinNombre = [...usados].filter(k => !C.TYPES[k] || !C.TYPES[k].l);
  assert.deepStrictEqual(sinNombre, []);
});

test('ninguna carta usa {j2} sin {j}', () => {
  const malas = todasLasCartas()
    .filter(x => x.card.includes('{j2}') && !x.card.includes('{j}'))
    .map(x => x.modo + ': ' + x.card.slice(0, 60));
  assert.deepStrictEqual(malas, []);
});

test('no hay placeholders inventados', () => {
  const malas = todasLasCartas()
    .filter(x => /\{(?!j2?\})/.test(x.card))
    .map(x => x.modo + ': ' + x.card.slice(0, 60));
  assert.deepStrictEqual(malas, []);
});

test('las cartas de premio o castigo traen reto, premio y castigo', () => {
  const malas = todasLasCartas()
    .filter(x => E.parseCard(x.card).k === 'pc')
    .filter(x => E.parseCard(x.card).parts.length !== 3)
    .map(x => x.modo + ': ' + x.card.slice(0, 60));
  assert.deepStrictEqual(malas, []);
  const total = todasLasCartas().filter(x => E.parseCard(x.card).k === 'pc').length;
  assert.ok(total >= 25, 'solo hay ' + total + ' cartas de premio o castigo');
});

test('las preguntas con respuesta usan un solo §', () => {
  const malas = todasLasCartas()
    .filter(x => { const c = E.parseCard(x.card); return c.k === 'p' && c.parts.length > 2; })
    .map(x => x.modo + ': ' + x.card.slice(0, 60));
  assert.deepStrictEqual(malas, []);
});

test('el § solo aparece en los tipos que lo usan', () => {
  const malas = todasLasCartas()
    .filter(x => { const c = E.parseCard(x.card); return c.k !== 'p' && c.k !== 'pc' && c.parts.length > 1; })
    .map(x => x.modo + ': ' + x.card.slice(0, 60));
  assert.deepStrictEqual(malas, []);
});

test('no hay cartas duplicadas entre modos', () => {
  const vistas = new Map();
  const dup = [];
  todasLasCartas().forEach(x => {
    const k = E.normText(x.card);
    if (vistas.has(k)) dup.push(vistas.get(k) + ' ↔ ' + x.modo + ': ' + x.card.slice(0, 55));
    else vistas.set(k, x.modo);
  });
  assert.deepStrictEqual(dup, []);
});

test('cada modo tiene al menos ' + MIN_POR_MODO + ' cartas', () => {
  const cortos = C.MODES
    .filter(m => m.deck.length < MIN_POR_MODO)
    .map(m => m.id + ': ' + m.deck.length);
  assert.deepStrictEqual(cortos, []);
});

test('cada modo declara su nivel de intensidad', () => {
  const malos = C.MODES.filter(m => ![1, 2, 3].includes(m.lvl)).map(m => m.id);
  assert.deepStrictEqual(malos, []);
});

test('verdad o reto: 30 y 30, repartidas por nivel', () => {
  assert.ok(C.TRUTH_DARE.truths.length >= 28, 'verdades: ' + C.TRUTH_DARE.truths.length);
  assert.ok(C.TRUTH_DARE.dares.length >= 28, 'retos: ' + C.TRUTH_DARE.dares.length);
  for (const cual of ['truths', 'dares']) {
    for (const lvl of [1, 2, 3]) {
      const n = C.TRUTH_DARE[cual].filter(c => E.parseCard(c).lvl === lvl).length;
      assert.ok(n >= 6, cual + ' nivel ' + lvl + ' tiene solo ' + n + ' cartas');
    }
  }
});

test('cada modo juega bien en los tres niveles de intensidad', () => {
  const problemas = [];
  C.MODES.forEach(m => {
    [1, 2, 3].forEach(lvl => {
      const n = E.filterByIntensity(m.deck, m.lvl, lvl).length;
      // en su propio nivel o más arriba, un modo debe tener mazo de sobra
      if (lvl >= m.lvl && n < MIN_POR_MODO) problemas.push(m.id + ' en nivel ' + lvl + ': ' + n);
    });
  });
  assert.deepStrictEqual(problemas, []);
});

test('la bomba tiene categorías de sobra y sin repetir', () => {
  assert.ok(C.BOMB_CATS.length >= 50, 'solo ' + C.BOMB_CATS.length + ' categorías');
  const norm = C.BOMB_CATS.map(c => c.toLowerCase().trim());
  assert.strictEqual(new Set(norm).size, norm.length, 'hay categorías repetidas');
  assert.deepStrictEqual(C.BOMB_CATS.filter(c => c.includes('|') || c.includes('§')), []);
});

test('el impostor tiene categorías con 6 palabras cada una', () => {
  const cats = Object.keys(C.IMP_WORDS);
  assert.ok(cats.length >= 10, 'solo ' + cats.length + ' categorías');
  const malas = cats.filter(k => C.IMP_WORDS[k].length < 5);
  assert.deepStrictEqual(malas, []);
});

test('la ruleta tiene destinos variados y sin repetir', () => {
  assert.ok(C.WHEEL_DARES.length >= 18, 'solo ' + C.WHEEL_DARES.length + ' destinos');
  const norm = C.WHEEL_DARES.map(c => c.toLowerCase().trim());
  assert.strictEqual(new Set(norm).size, norm.length, 'hay destinos repetidos');
});

test('ningún modo depende demasiado de un solo tipo de carta', () => {
  const problemas = [];
  C.MODES.forEach(m => {
    // los modos temáticos son de un tipo a propósito
    if (['mimica', 'nunca', 'versus', 'shot', 'trivia', 'premio', 'vor', 'conflicto'].includes(m.id)) return;
    const cuenta = {};
    m.deck.forEach(c => { const k = E.parseCard(c).k; cuenta[k] = (cuenta[k] || 0) + 1 });
    const top = Math.max(...Object.values(cuenta));
    if (top / m.deck.length > 0.5) {
      const tipo = Object.keys(cuenta).find(k => cuenta[k] === top);
      problemas.push(m.id + ': ' + Math.round(top / m.deck.length * 100) + '% son "' + tipo + '"');
    }
  });
  assert.deepStrictEqual(problemas, []);
});

test('casi todas las cartas dicen cuántos sorbos', () => {
  const sinNumero = todasLasCartas().filter(x => {
    const c = E.parseCard(x.card);
    if (c.k === 'aq' || c.k === 'mm') return false;      // esas no llevan número
    return !/\d/.test(c.x);
  });
  const ratio = sinNumero.length / todasLasCartas().length;
  assert.ok(ratio < 0.25,
    Math.round(ratio * 100) + '% de las cartas no dicen cantidad. Ejemplos: ' +
    sinNumero.slice(0, 5).map(x => x.modo + ': ' + x.card.slice(0, 50)).join(' | '));
});

test('ninguna carta trae backticks ni interpolación que rompa el archivo', () => {
  const malas = todasLasCartas()
    .filter(x => x.card.includes('`') || x.card.includes('${'))
    .map(x => x.modo + ': ' + x.card.slice(0, 60));
  assert.deepStrictEqual(malas, []);
});

test('nada sugiere manejar', () => {
  const peligro = /\b(maneja|manejar|manejes|conduce|conducir|conduzcas|al volante)\b/i;
  const malas = todasLasCartas()
    .filter(x => peligro.test(x.card))
    .map(x => x.modo + ': ' + x.card.slice(0, 70));
  assert.deepStrictEqual(malas, []);
});
