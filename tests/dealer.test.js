const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../dealer.js');

function seeded(s) { return () => (s = (s * 9301 + 49297) % 233280) / 233280; }
const NS = ['Ana', 'Beto', 'Cata'];
const other = v => (v % 13) + 1;   // un número distinto de v

test('el mazo tiene 52 cartas, 4 de cada número; el que adivina es el de la izquierda del dealer', () => {
  const g = D.newGame(NS, { rng: seeded(1), dealer: 0 });
  assert.equal(g.deck.length, 52);
  for (let v = 1; v <= 13; v++) assert.equal(g.deck.filter(c => c.v === v).length, 4);
  assert.equal(g.guesser, 1);
});

test('acierto a la primera: el dealer toma 5', () => {
  const g = D.newGame(NS, { rng: seeded(2), dealer: 0 });
  const r = D.guess(g, D.top(g).v);
  assert.equal(r.res.kind, 'first');
  assert.deepEqual(r.res.drinks.map(d => [d.who, d.n]), [['Ana', 5]]);
  assert.equal(r.g.guesser, 2, 'le toca al siguiente');
  assert.equal(r.g.pos, 1);
});

test('si falla la primera, la app dice más alto o más bajo', () => {
  const g = D.newGame(NS, { rng: seeded(3), dealer: 0 });
  const c = D.top(g).v, v = c === 13 ? 1 : 13;
  const r = D.guess(g, v);
  assert.equal(r.res.kind, 'hint');
  assert.equal(r.res.hint, c > v ? 'up' : 'down');
  assert.equal(r.g.stage, 'second');
  assert.equal(r.g.pos, 0, 'la carta sigue tapada');
});

test('acierto a la segunda: el dealer toma 2', () => {
  let g = D.newGame(NS, { rng: seeded(4), dealer: 0 });
  const c = D.top(g).v;
  g = D.guess(g, other(c)).g;
  const r = D.guess(g, c);
  assert.equal(r.res.kind, 'second');
  assert.deepEqual(r.res.drinks.map(d => [d.who, d.n]), [['Ana', 2]]);
});

test('falla las dos: toma la diferencia, con tope de 5', () => {
  let g = D.newGame(NS, { rng: seeded(5), dealer: 0 });
  const c = D.top(g).v;
  const lejos = c <= 6 ? 13 : 1;
  g = D.guess(g, other(c)).g;
  const r = D.guess(g, lejos);
  assert.equal(r.res.kind, 'miss');
  assert.equal(r.res.drinks[0].who, 'Beto');
  assert.equal(r.res.drinks[0].n, Math.min(5, Math.abs(lejos - c)));
});

test('el dealer que gana tres seguidas pasa el mazo al de su izquierda', () => {
  let g = D.newGame(NS, { rng: seeded(6), dealer: 0 });
  let r;
  for (let k = 0; k < 3; k++) {
    const c = D.top(g).v;
    g = D.guess(g, other(c)).g;
    r = D.guess(g, other(other(c)) === c ? other(c) : other(other(c)));
    if (r.res.kind !== 'miss') { g = r.g; k--; continue }   // si le achuntó por casualidad, sigue
    g = r.g;
  }
  assert.deepEqual(r.res.passed, { from: 'Ana', to: 'Beto' });
  assert.equal(g.dealer, 1);
  assert.equal(g.guesser, 2, 'adivina el de la izquierda del dealer nuevo');
  assert.equal(g.streak, 0);
});

test('un acierto corta la racha del dealer', () => {
  let g = D.newGame(NS, { rng: seeded(7), dealer: 0 });
  const c = D.top(g).v;
  g = D.guess(g, other(c)).g;
  g = D.guess(g, other(other(c)) === c ? other(c) : other(other(c))).g;
  assert.ok(g.streak <= 1);
  g = D.guess(g, D.top(g).v).g;
  assert.equal(g.streak, 0);
});

test('el dealer nunca adivina, y el juego termina cuando se acaba el mazo', () => {
  let g = D.newGame(['Ana', 'Beto'], { rng: seeded(8), dealer: 0 });
  let turnos = 0;
  while (!g.over && turnos++ < 200) {
    assert.notEqual(g.guesser, g.dealer);
    g = D.guess(g, D.top(g).v).g;
  }
  assert.equal(g.over, true);
  assert.equal(D.left(g), 0);
  assert.equal(g.seen.slice(1).reduce((a, b) => a + b, 0), 52);
  assert.equal(D.guess(g, 5).res, null);
});

test('un número del que salieron las cuatro ya no está disponible', () => {
  const g = D.newGame(NS, { rng: seeded(9) });
  g.seen[7] = 4;
  assert.equal(D.available(g, 7), false);
  assert.equal(D.available(g, 8), true);
});
