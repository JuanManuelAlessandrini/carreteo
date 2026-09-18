const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');

/* RNG determinístico para que los tests no dependan del azar */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* ---------------- parseCard ---------------- */
test('parseCard: carta simple', () => {
  assert.deepStrictEqual(E.parseCard('r|Baila 10 segundos'),
    { lvl: null, k: 'r', n: 0, x: 'Baila 10 segundos', parts: ['Baila 10 segundos'] });
});

test('parseCard: intensidad explícita', () => {
  const c = E.parseCard('[3]r|Algo picante');
  assert.strictEqual(c.lvl, 3);
  assert.strictEqual(c.k, 'r');
  assert.strictEqual(c.x, 'Algo picante');
});

test('parseCard: regla con rondas', () => {
  const c = E.parseCard('rg3|Prohibido decir sí');
  assert.strictEqual(c.k, 'rg');
  assert.strictEqual(c.n, 3);
});

test('parseCard: timer con segundos y tipo de dos letras', () => {
  const c = E.parseCard('tm20|Nombra 5 países');
  assert.strictEqual(c.k, 'tm');
  assert.strictEqual(c.n, 20);
});

test('parseCard: intensidad y rondas juntas', () => {
  const c = E.parseCard('[2]rg4|Regla picante');
  assert.strictEqual(c.lvl, 2);
  assert.strictEqual(c.k, 'rg');
  assert.strictEqual(c.n, 4);
  assert.strictEqual(c.x, 'Regla picante');
});

test('parseCard: pregunta con respuesta', () => {
  const c = E.parseCard('p|¿Capital de Australia?§Canberra');
  assert.deepStrictEqual(c.parts, ['¿Capital de Australia?', 'Canberra']);
});

test('parseCard: premio o castigo tiene tres partes', () => {
  const c = E.parseCard('pc|Haz 10 sentadillas§Reparte 3 sorbos§Toma 3 sorbos');
  assert.strictEqual(c.k, 'pc');
  assert.strictEqual(c.parts.length, 3);
  assert.strictEqual(c.parts[2], 'Toma 3 sorbos');
});

test('parseCard: carta inválida no explota', () => {
  const c = E.parseCard('texto sin tipo');
  assert.strictEqual(c.k, 'r');
  assert.strictEqual(c.x, 'texto sin tipo');
});

/* ---------------- adapt ---------------- */
test('adapt: sin cambios cuando hay alcohol', () => {
  assert.strictEqual(E.adapt('Toma 2 sorbos', false), 'Toma 2 sorbos');
});

test('adapt: sorbos a puntos', () => {
  assert.strictEqual(E.adapt('toma 2 sorbos', true), 'suma 2 puntos');
});

test('adapt: respeta la mayúscula inicial', () => {
  assert.strictEqual(E.adapt('Toma 2 sorbos', true), 'Suma 2 puntos');
});

test('adapt: singular y plural no se pisan', () => {
  assert.strictEqual(E.adapt('1 sorbo y 3 sorbos', true), '1 punto y 3 puntos');
});

test('adapt: shot a prenda', () => {
  assert.strictEqual(E.adapt('Un shot o dos shots', true), 'Un prenda o dos prendas');
});

test('adapt: conjugaciones de tomar', () => {
  assert.strictEqual(E.adapt('todos toman 1', true), 'todos suman 1');
  assert.strictEqual(E.adapt('tomas 3', true), 'sumas 3');
});

test('adapt: no toca palabras que contienen "toma"', () => {
  assert.strictEqual(E.adapt('La automatización', true), 'La automatización');
  assert.strictEqual(E.adapt('tomate', true), 'tomate');
});

/* ---------------- filterByIntensity ---------------- */
test('filterByIntensity: usa el nivel del modo cuando la carta no lo trae', () => {
  const deck = ['r|suave', '[3]r|fuerte'];
  assert.deepStrictEqual(E.filterByIntensity(deck, 1, 1), ['r|suave']);
  assert.deepStrictEqual(E.filterByIntensity(deck, 1, 3), deck);
});

test('filterByIntensity: modo picante se esconde entero en nivel suave', () => {
  const deck = ['r|a', 'r|b'];
  assert.deepStrictEqual(E.filterByIntensity(deck, 3, 1), []);
});

test('filterByIntensity: carta suave dentro de un modo picante sí aparece', () => {
  const deck = ['r|fuerte', '[1]r|suave'];
  assert.deepStrictEqual(E.filterByIntensity(deck, 3, 1), ['[1]r|suave']);
});

/* ---------------- dedupe ---------------- */
test('dedupe: quita textos iguales aunque cambie mayúscula o espacios', () => {
  const out = E.dedupe(['r|Guerra de pulgares', 'r|guerra  de pulgares ', 'r|Otra']);
  assert.strictEqual(out.length, 2);
});

test('dedupe: la misma carta con distinta intensidad es una sola', () => {
  assert.strictEqual(E.dedupe(['r|Igual', '[3]r|Igual']).length, 1);
});

/* ---------------- windowSize / buildDeck / pushRecent ---------------- */
test('windowSize: 20 para mazos grandes, menos para chicos', () => {
  assert.strictEqual(E.windowSize(30), 20);
  assert.strictEqual(E.windowSize(14), 9);
  assert.strictEqual(E.windowSize(5), 0);
  assert.strictEqual(E.windowSize(3), 0);
});

test('buildDeck: devuelve todas las cartas, sin perder ni duplicar', () => {
  const all = Array.from({ length: 30 }, (_, i) => 'r|c' + i);
  const deck = E.buildDeck(all, [], { rng: lcg(1) });
  assert.strictEqual(deck.length, 30);
  assert.strictEqual(new Set(deck).size, 30);
});

test('buildDeck: las cartas recientes quedan al fondo', () => {
  const all = Array.from({ length: 30 }, (_, i) => 'r|c' + i);
  const recent = all.slice(0, 20);
  const deck = E.buildDeck(all, recent, { rng: lcg(7) });
  const fresh = deck.slice(0, 10);
  assert.ok(fresh.every(c => !recent.includes(c)),
    'las primeras 10 no deben estar entre las recientes');
});

test('buildDeck: con mazo chico usa ventana reducida y no se queda sin cartas', () => {
  const all = Array.from({ length: 14 }, (_, i) => 'r|c' + i);
  const recent = all.slice(0, 14);
  const deck = E.buildDeck(all, recent, { rng: lcg(3) });
  assert.strictEqual(deck.length, 14);
  assert.ok(!deck.slice(0, 5).includes(all[13]),
    'la última vista no debería salir de inmediato');
});

test('buildDeck: mazo de 5 o menos no excluye nada', () => {
  const all = ['r|a', 'r|b', 'r|c'];
  const deck = E.buildDeck(all, all, { rng: lcg(2) });
  assert.strictEqual(deck.length, 3);
});

test('pushRecent: cola FIFO con tope', () => {
  let r = [];
  for (let i = 0; i < 50; i++) r = E.pushRecent(r, 'c' + i, 40);
  assert.strictEqual(r.length, 40);
  assert.strictEqual(r[r.length - 1], 'c49');
  assert.ok(!r.includes('c0'));
});

test('pushRecent: una carta repetida se mueve al final, no se duplica', () => {
  let r = E.pushRecent(E.pushRecent([], 'a', 40), 'b', 40);
  r = E.pushRecent(r, 'a', 40);
  assert.deepStrictEqual(r, ['b', 'a']);
});

test('no repetición: 20 cartas seguidas de un mazo de 30 son todas distintas', () => {
  const all = Array.from({ length: 30 }, (_, i) => 'r|c' + i);
  const rng = lcg(99);
  let recent = [], deck = E.buildDeck(all, recent, { rng }), i = 0;
  const seen = [];
  for (let n = 0; n < 20; n++) {
    if (i >= deck.length) { deck = E.buildDeck(all, recent, { rng }); i = 0; }
    const card = deck[i++];
    seen.push(card);
    recent = E.pushRecent(recent, card, 40);
  }
  assert.strictEqual(new Set(seen).size, 20, 'no debe repetirse ninguna en 20 turnos');
});

/* ---------------- bolsa de jugadores ---------------- */
test('nextPlayers: todos salen una vez antes de que alguien repita', () => {
  const rng = lcg(5);
  let st = {};
  const firsts = [];
  for (let i = 0; i < 4; i++) { const r = E.nextPlayers(st, 4, rng); st = r.state; firsts.push(r.i1); }
  assert.deepStrictEqual([...firsts].sort(), [0, 1, 2, 3]);
});

test('nextPlayers: el segundo jugador nunca es el primero', () => {
  const rng = lcg(11);
  let st = {};
  for (let i = 0; i < 40; i++) {
    const r = E.nextPlayers(st, 5, rng); st = r.state;
    assert.notStrictEqual(r.i1, r.i2);
  }
});

test('nextPlayers: no repite el mismo jugador en cartas consecutivas al rebarajar', () => {
  const rng = lcg(13);
  let st = {}, prev = null;
  for (let i = 0; i < 60; i++) {
    const r = E.nextPlayers(st, 3, rng); st = r.state;
    assert.notStrictEqual(r.i1, prev, 'turno ' + i + ' repitió jugador');
    prev = r.i1;
  }
});

test('nextPlayers: con un solo jugador no explota', () => {
  const r = E.nextPlayers({}, 1, lcg(1));
  assert.strictEqual(r.i1, 0);
  assert.strictEqual(r.i2, 0);
});

test('nextPlayers: sin jugadores devuelve nulos', () => {
  const r = E.nextPlayers({}, 0, lcg(1));
  assert.strictEqual(r.i1, null);
});

/* ---------------- buildMixDeck ---------------- */
test('buildMixDeck: une modos, etiqueta origen y quita duplicados', () => {
  const modes = [
    { id: 'a', nm: 'A', c: '#111', lvl: 1, deck: ['r|uno', 'r|comun'] },
    { id: 'b', nm: 'B', c: '#222', lvl: 1, deck: ['r|comun', 'r|dos'] },
    { id: 'c', nm: 'C', c: '#333', lvl: 1, deck: ['r|tres'] }
  ];
  const mix = E.buildMixDeck(modes, ['a', 'b'], 3);
  assert.strictEqual(mix.length, 3);
  assert.deepStrictEqual(mix.map(m => m.card), ['r|uno', 'r|comun', 'r|dos']);
  assert.strictEqual(mix[0].from, 'a');
  assert.strictEqual(mix[2].from, 'b');
  assert.ok(!mix.some(m => m.from === 'c'));
});

test('buildMixDeck: respeta la intensidad máxima', () => {
  const modes = [{ id: 'a', nm: 'A', c: '#111', lvl: 1, deck: ['r|suave', '[3]r|fuerte'] }];
  assert.strictEqual(E.buildMixDeck(modes, ['a'], 1).length, 1);
});

/* ---------------- sipsInText ---------------- */
test('sipsInText: lee la cantidad del texto', () => {
  assert.strictEqual(E.sipsInText('toma 3 sorbos'), 3);
  assert.strictEqual(E.sipsInText('suma 2 puntos'), 2);
  assert.strictEqual(E.sipsInText('sin números aquí'), 1);
  assert.strictEqual(E.sipsInText('toma 1 sorbo'), 1);
});

/* ---------------- summary ---------------- */
test('summary: ranking, valiente y gallina', () => {
  const players = [
    { n: 'Ana', sips: 3, done: 5, skip: 0 },
    { n: 'Beto', sips: 9, done: 1, skip: 7 },
    { n: 'Cata', sips: 5, done: 2, skip: 1 }
  ];
  const s = E.summary(players, { drawn: 30, startedAt: 0 }, 3600000);
  assert.deepStrictEqual(s.ranking.map(p => p.n), ['Beto', 'Cata', 'Ana']);
  assert.strictEqual(s.brave.n, 'Ana');
  assert.strictEqual(s.chicken.n, 'Beto');
  assert.strictEqual(s.cards, 30);
  assert.strictEqual(s.minutes, 60);
});

test('summary: sin jugadores no explota', () => {
  const s = E.summary([], { drawn: 0, startedAt: 0 }, 0);
  assert.deepStrictEqual(s.ranking, []);
  assert.strictEqual(s.brave, null);
});

/* ---------------- shuffle ---------------- */
test('shuffle: no muta el original y conserva los elementos', () => {
  const orig = [1, 2, 3, 4, 5];
  const out = E.shuffle(orig, lcg(42));
  assert.deepStrictEqual(orig, [1, 2, 3, 4, 5]);
  assert.deepStrictEqual([...out].sort((a, b) => a - b), orig);
});

test('shuffle: con la misma semilla da el mismo resultado', () => {
  const a = E.shuffle([1, 2, 3, 4, 5, 6, 7, 8], lcg(1));
  const b = E.shuffle([1, 2, 3, 4, 5, 6, 7, 8], lcg(1));
  assert.deepStrictEqual(a, b);
});

/* ---------------- garantía dura de no repetición ---------------- */
function jugarTurnos(all, turnos, seed) {
  const rng = lcg(seed);
  let recent = [], deck = E.buildDeck(all, recent, { rng }), i = 0;
  const vistas = [];
  for (let n = 0; n < turnos; n++) {
    if (i >= deck.length) { deck = E.buildDeck(all, recent, { rng }); i = 0; }
    const card = deck[i++];
    vistas.push(card);
    recent = E.pushRecent(recent, card, E.RECENT_CAP);
  }
  return vistas;
}

function violaciones(vistas, ventana) {
  let v = 0;
  for (let i = 0; i < vistas.length; i++) {
    if (vistas.slice(Math.max(0, i - ventana), i).includes(vistas[i])) v++;
  }
  return v;
}

test('buildDeck: 300 turnos sobre un mazo de 30 sin repetir dentro de la ventana', () => {
  const all = Array.from({ length: 30 }, (_, i) => 'r|c' + i);
  const vistas = jugarTurnos(all, 300, 4);
  assert.strictEqual(violaciones(vistas, E.windowSize(30)), 0);
});

test('buildDeck: mazo chico de 12 también respeta su ventana', () => {
  const all = Array.from({ length: 12 }, (_, i) => 'r|c' + i);
  const vistas = jugarTurnos(all, 200, 8);
  assert.strictEqual(violaciones(vistas, E.windowSize(12)), 0);
});

test('buildDeck: la garantía aguanta con varias semillas', () => {
  for (const seed of [1, 17, 123, 9999]) {
    for (const n of [12, 14, 16, 30, 45]) {
      const all = Array.from({ length: n }, (_, i) => 'r|c' + i);
      const v = violaciones(jugarTurnos(all, 200, seed), E.windowSize(n));
      assert.strictEqual(v, 0, `mazo ${n}, semilla ${seed}: ${v} repeticiones`);
    }
  }
});

test('buildDeck: sigue barajando (dos ciclos no salen idénticos)', () => {
  const all = Array.from({ length: 30 }, (_, i) => 'r|c' + i);
  const vistas = jugarTurnos(all, 90, 21);
  const c1 = vistas.slice(0, 30).join(), c2 = vistas.slice(30, 60).join(), c3 = vistas.slice(60, 90).join();
  assert.ok(c1 !== c2 || c2 !== c3, 'los ciclos no deberían ser siempre iguales');
});
