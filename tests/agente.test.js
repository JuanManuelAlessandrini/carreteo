const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../agente.js');
const C = require('../cards.js');

function seeded(s) { return () => (s = (s * 9301 + 49297) % 233280) / 233280; }
const WORDS = C.AGENTE_WORDS.BASE;
const idx = (g, k) => g.key.map((x, i) => x === k ? i : -1).filter(i => i >= 0);

test('el tablero tiene 25 palabras: 9 del que parte, 8 del otro, 7 transeúntes y 1 asesino', () => {
  for (let s = 1; s < 30; s++) {
    const g = G.newGame(WORDS, { rng: seeded(s) });
    assert.equal(g.words.length, 25);
    assert.equal(new Set(g.words).size, 25);
    const c = k => g.key.filter(x => x === k).length;
    assert.equal(c(g.turn), 9);
    assert.equal(c(G.other(g.turn)), 8);
    assert.equal(c('n'), 7);
    assert.equal(c('x'), 1);
  }
});

test('en la cooperativa parte siempre el equipo', () => {
  for (let s = 1; s < 10; s++) assert.equal(G.newGame(WORDS, { mode: 'coop', rng: seeded(s) }).turn, 'r');
});

test('la pista da número + 1 intentos; 0 e ilimitada no tienen tope', () => {
  const g = G.newGame(WORDS, { rng: seeded(3) });
  assert.equal(G.giveClue(g, 'playa', 2).left, 3);
  assert.equal(G.giveClue(g, 'playa', 0).left, Infinity);
  assert.equal(G.giveClue(g, 'playa', -1).left, Infinity);
  assert.equal(G.giveClue(g, 'playa', 2).clue.w, 'playa');
});

test('sin pista no se puede tocar, y hay que intentar al menos una antes de pasar', () => {
  let g = G.newGame(WORDS, { rng: seeded(4) });
  assert.equal(G.guess(g, 0).res, null);
  g = G.giveClue(g, 'x', 1);
  assert.equal(G.canPass(g), false);
  g = G.guess(g, idx(g, g.turn)[0]).g;
  assert.equal(G.canPass(g), true);
});

test('acertar sigue el turno; transeúnte cuesta 1 y corta; del rival cuesta 2, corta y cuenta para ellos', () => {
  let g = G.giveClue(G.newGame(WORDS, { rng: seeded(5) }), 'x', 3);
  const t = g.turn;
  let r = G.guess(g, idx(g, t)[0]);
  assert.equal(r.res.kind, 'own'); assert.equal(r.g.turn, t); assert.deepEqual(r.res.sips, []);
  r = G.guess(r.g, idx(g, 'n')[0]);
  assert.equal(r.res.kind, 'neutral'); assert.equal(r.g.turn, G.other(t));
  assert.deepEqual(r.res.sips, [{ team: t, n: 1, why: 'transeúnte' }]);
  const g2 = G.giveClue(G.newGame(WORDS, { rng: seeded(5) }), 'x', 3);
  const antes = G.leftOf(g2, G.other(t));
  r = G.guess(g2, idx(g2, G.other(t))[0]);
  assert.equal(r.res.kind, 'rival'); assert.equal(r.res.sips[0].n, 2);
  assert.equal(G.leftOf(r.g, G.other(t)), antes - 1);
  assert.equal(r.g.turn, G.other(t));
});

test('se acaban los intentos: número + 1 aciertos y el turno pasa', () => {
  let g = G.giveClue(G.newGame(WORDS, { rng: seeded(6) }), 'x', 1);
  const t = g.turn, mias = idx(g, t);
  g = G.guess(g, mias[0]).g;
  assert.equal(g.turn, t);
  const r = G.guess(g, mias[1]);
  assert.equal(r.res.end, true);
  assert.equal(r.g.turn, G.other(t));
});

test('el asesino hace perder al instante, con shot', () => {
  const g = G.giveClue(G.newGame(WORDS, { rng: seeded(7) }), 'x', 2);
  const r = G.guess(g, idx(g, 'x')[0]);
  assert.equal(r.g.winner, G.other(g.turn));
  assert.equal(r.g.how, 'assassin');
  assert.ok(r.res.sips.some(x => x.shot && x.team === g.turn));
  assert.equal(G.guess(r.g, idx(g, g.turn)[0]).res, null, 'terminada no se toca más');
});

test('gana el que encuentra todas las suyas; el que pierde toma 1 por palabra que le quedó, máximo 5', () => {
  let g = G.newGame(WORDS, { rng: seeded(8) });
  const t = g.turn;
  g = G.giveClue(g, 'todo', -1);
  let r;
  for (const i of idx(g, t)) r = G.guess(r ? r.g : g, i);
  assert.equal(r.g.winner, t);
  assert.equal(r.g.how, 'words');
  const perd = r.res.sips.find(x => x.why === 'perdieron');
  assert.equal(perd.team, G.other(t));
  assert.equal(perd.n, 5, 'le quedaban 8: tope 5');
});

test('se puede ganar en el turno del rival si toca tu última palabra', () => {
  let g = G.newGame(WORDS, { rng: seeded(9) });
  const t = g.turn, rival = G.other(t);
  // el rival ya encontró 7 de sus 8: le queda una
  idx(g, rival).slice(0, 7).forEach(i => { g.rev[i] = true });
  g = G.giveClue(g, 'x', 3);
  const r = G.guess(g, idx(g, rival)[7]);
  assert.equal(r.g.winner, rival);
});

test('cooperativa: el rival descubre una por turno y gana si termina primero', () => {
  let g = G.newGame(WORDS, { mode: 'coop', rng: seeded(10) });
  assert.equal(G.leftOf(g, 'a'), 8);
  g = G.giveClue(g, 'x', 1);
  g = G.guess(g, idx(g, 'n')[0], seeded(1)).g;
  assert.equal(G.leftOf(g, 'a'), 7, 'al perder el turno, el rival descubre una');
  assert.equal(g.turn, 'r');
  for (let k = 0; k < 7; k++) g = G.endTurn(G.guess(G.giveClue(g, 'x', 0), idx(g, 'r').find(i => !g.rev[i]), seeded(k)).g, seeded(k));
  assert.ok(g.winner);
});

test('cooperativa: si ganan, el puntaje son las palabras que le quedaban al rival', () => {
  let g = G.newGame(WORDS, { mode: 'coop', rng: seeded(11) });
  g = G.giveClue(g, 'todo', -1);
  let r;
  for (const i of idx(g, 'r')) r = G.guess(r ? r.g : g, i);
  assert.equal(r.g.winner, 'r');
  assert.equal(G.coopScore(r.g), 8);
  assert.deepEqual(r.res.sips.filter(x => x.why === 'perdieron'), [], 'el rival simulado no toma');
});

test('lo público nunca trae la clave de lo que no se ha descubierto', () => {
  let g = G.giveClue(G.newGame(WORDS, { rng: seeded(12) }), 'x', 2);
  g = G.guess(g, idx(g, 'n')[0]).g;
  const v = G.publicView(g);
  assert.equal(v.key, undefined);
  const shown = v.shown.split(',');
  assert.equal(shown.filter(Boolean).length, 1);
  assert.equal(shown[idx(g, 'n')[0]], 'n');
  assert.doesNotMatch(JSON.stringify(v), /"key"/);
});

test('equipos al azar, parejos, con jefe; se pueden mover y el jefe se reasigna', () => {
  const ns = ['Ana', 'Beto', 'Cata', 'Dani', 'Eli'];
  const t = G.makeTeams(ns, 'equipos', seeded(2));
  assert.equal(t.r.length + t.a.length, 5);
  assert.ok(Math.abs(t.r.length - t.a.length) <= 1);
  assert.ok(t.r.includes(t.jefe.r) && t.a.includes(t.jefe.a));
  const jr = t.jefe.r;
  const m = G.moveTo(t, jr, 'a');
  assert.ok(m.a.includes(jr) && !m.r.includes(jr));
  assert.notEqual(m.jefe.r, jr, 'el equipo que perdió al jefe elige otro');
  assert.ok(m.r.includes(m.jefe.r));
  assert.equal(G.setJefe(m, jr).jefe.a, jr);
  assert.equal(G.teamsProblem({ r: ['A'], a: ['B', 'C'], jefe: { r: 'A', a: 'B' } }, 'equipos') !== null, true);
  assert.equal(G.teamsProblem(G.makeTeams(['A', 'B'], 'coop'), 'coop'), null);
});

test('las palabras: suficientes, sin repetir (sin tildes ni mayúsculas) y de una sola palabra', () => {
  const norm = w => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const todas = C.AGENTE_WORDS.BASE.concat(C.AGENTE_WORDS.PICANTE);
  assert.ok(C.AGENTE_WORDS.BASE.length >= 400, 'hay ' + C.AGENTE_WORDS.BASE.length);
  const vistas = new Map();
  todas.forEach(w => {
    assert.match(w, /^[a-záéíóúñü]+$/i, 'una sola palabra: ' + w);
    assert.ok(!vistas.has(norm(w)), 'repetida: ' + w);
    vistas.set(norm(w), 1);
  });
});
