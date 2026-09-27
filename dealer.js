/* =========================================================
   CARRETEO · dealer.js
   Fuck the Dealer: el dealer tiene el mazo y el de su izquierda adivina
   el número de la carta de arriba (el palo no importa, el As vale 1).

   - Acierta a la primera: el dealer toma 5.
   - Si no, el dealer dice "más alto" o "más bajo" y hay un segundo
     intento. Acierta: el dealer toma 2.
   - Falla los dos: toma la diferencia entre su número y la carta
     (con tope, para que un As contra un Rey no sean 12 sorbos).
   - Si el dealer gana tres seguidas, pasa el mazo al siguiente.
   - La carta queda a la vista y el juego sigue hasta que se acaba el mazo.

   Lógica pura, sin DOM, como engine.js.
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Dealer = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RULES = { first: 5, second: 2, maxDiff: 5, streak: 3 };
  var NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var SUITS = ['♠', '♥', '♦', '♣'];

  function shuffle(a, rng) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t }
    return a;
  }
  function newGame(names, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var deck = [];
    for (var v = 1; v <= 13; v++) SUITS.forEach(function (s) { deck.push({ v: v, s: s }) });
    var n = names.length;
    var dealer = opts.dealer != null ? opts.dealer % n : Math.floor(rng() * n);
    return {
      names: names.slice(), deck: shuffle(deck, rng), pos: 0,
      seen: new Array(14).fill(0),          // cuántas de cada número ya salieron
      dealer: dealer, guesser: (dealer + 1) % n,
      stage: 'first', first: null, hint: null, streak: 0,
      last: null, over: false
    };
  }
  function clone(g) { var c = Object.assign({}, g); c.seen = g.seen.slice(); return c }
  function top(g) { return g.deck[g.pos] }
  function left(g) { return g.deck.length - g.pos }
  function nextAfter(g, i, skip) {
    var n = g.names.length, j = i;
    do { j = (j + 1) % n } while (j === skip && n > 1);
    return j;
  }
  /* un número del que ya salieron las cuatro no se puede pedir */
  function available(g, v) { return g.seen[v] < 4 }

  /* Devuelve {g, res}. res: {kind, card, drinks:[{who, n, why}], passed} */
  function guess(g, v) {
    if (g.over || v < 1 || v > 13) return { g: g, res: null };
    var c = clone(g), card = top(c), res = { card: card, guess: v, drinks: [], passed: null };
    var dealerN = c.names[c.dealer], guesserN = c.names[c.guesser];
    if (c.stage === 'first') {
      if (v === card.v) {
        res.kind = 'first';
        res.drinks.push({ who: dealerN, n: RULES.first, why: 'le achuntaron a la primera' });
        c.streak = 0;
        return { g: advance(c, res), res: res };
      }
      c.stage = 'second'; c.first = v; c.hint = card.v > v ? 'up' : 'down';
      res.kind = 'hint'; res.hint = c.hint;
      return { g: c, res: res };
    }
    if (v === card.v) {
      res.kind = 'second';
      res.drinks.push({ who: dealerN, n: RULES.second, why: 'le achuntaron a la segunda' });
      c.streak = 0;
    } else {
      res.kind = 'miss';
      res.drinks.push({ who: guesserN, n: Math.min(RULES.maxDiff, Math.abs(v - card.v)), why: 'falló por ' + Math.abs(v - card.v) });
      c.streak++;
      if (c.streak >= RULES.streak) {
        res.passed = { from: dealerN, to: c.names[nextAfter(c, c.dealer, -1)] };
        c.dealer = nextAfter(c, c.dealer, -1);
        c.guesser = c.dealer;              // advance lo corre al de su izquierda
        c.streak = 0;
      }
    }
    return { g: advance(c, res), res: res };
  }
  /* la carta queda a la vista y le toca al siguiente */
  function advance(c, res) {
    var card = top(c);
    c.seen[card.v]++;
    c.last = card; c.pos++;
    c.stage = 'first'; c.first = null; c.hint = null;
    c.guesser = nextAfter(c, c.guesser, c.dealer);
    if (c.pos >= c.deck.length) c.over = true;
    return c;
  }
  function label(card) { return card ? NAMES[card.v] + card.s : '' }

  return { RULES: RULES, NAMES: NAMES, newGame: newGame, guess: guess, top: top, left: left, available: available, label: label };
});
