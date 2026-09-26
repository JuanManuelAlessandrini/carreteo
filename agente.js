/* =========================================================
   CARRETEO · agente.js
   Doble agente: dos equipos, un tablero de 25 palabras y una clave que
   solo ven los jefes. El jefe da una pista (palabra + número) y su equipo
   trata de tocar sus palabras sin tocar las del rival ni al asesino.

   Variante cooperativa (para 2 o 3, o para jugar todos juntos): un solo
   equipo contra un rival simulado que, en cada turno suyo, se descubre
   una palabra. Pierden si el rival termina o si tocan al asesino.

   Lógica pura, sin DOM ni red, como engine.js: se prueba con node.
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Agente = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var A = 'r', B = 'a', N = 'n', X = 'x';   // rojo, azul, transeúnte, asesino
  var SIPS = { neutral: 1, rival: 2, assassin: 1, perWordLeft: 1, maxLeft: 5 };

  function shuffle(a, rng) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function other(t) { return t === A ? B : A }

  /* ---------- equipos ----------
     Al azar y parejos; el primero de cada equipo es el jefe. En la
     cooperativa hay un solo equipo (rojo) y un jefe. */
  function makeTeams(names, mode, rng) {
    rng = rng || Math.random;
    var ps = shuffle(names, rng);
    if (mode === 'coop') return { r: ps, a: [], jefe: { r: ps[0] || null, a: null } };
    var r = [], a = [];
    ps.forEach(function (n, i) { (i % 2 ? a : r).push(n) });
    return { r: r, a: a, jefe: { r: r[0] || null, a: a[0] || null } };
  }
  /* mover a alguien de equipo; si era jefe, el equipo que deja elige otro */
  function moveTo(teams, name, team) {
    var t = { r: teams.r.filter(function (n) { return n !== name }), a: teams.a.filter(function (n) { return n !== name }), jefe: Object.assign({}, teams.jefe) };
    t[team].push(name);
    [A, B].forEach(function (k) { if (t.jefe[k] === name && k !== team) t.jefe[k] = t[k][0] || null });
    if (!t.jefe[team]) t.jefe[team] = name;
    return t;
  }
  function setJefe(teams, name) {
    var t = { r: teams.r.slice(), a: teams.a.slice(), jefe: Object.assign({}, teams.jefe) };
    var k = t.r.indexOf(name) >= 0 ? A : t.a.indexOf(name) >= 0 ? B : null;
    if (k) t.jefe[k] = name;
    return t;
  }
  function teamOf(teams, name) { return teams.r.indexOf(name) >= 0 ? A : teams.a.indexOf(name) >= 0 ? B : null }
  /* ¿se puede empezar? devuelve el problema o null */
  function teamsProblem(teams, mode) {
    if (mode === 'coop') return teams.r.length >= 2 ? null : 'La cooperativa necesita al menos 2 jugadores';
    if (teams.r.length < 2 || teams.a.length < 2) return 'Cada equipo necesita al menos 2: un jefe y un agente';
    if (!teams.jefe.r || !teams.jefe.a) return 'Falta elegir un jefe';
    return null;
  }

  /* ---------- partida ---------- */
  function newGame(words, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var mode = opts.mode === 'coop' ? 'coop' : 'equipos';
    var pool = shuffle(uniq(words), rng);
    if (pool.length < 25) throw new Error('faltan palabras: hay ' + pool.length);
    // en la cooperativa el equipo parte siempre; en equipos, al azar
    var start = mode === 'coop' ? A : (rng() < 0.5 ? A : B);
    var key = [];
    for (var i = 0; i < 9; i++) key.push(start);
    for (i = 0; i < 8; i++) key.push(other(start));
    for (i = 0; i < 7; i++) key.push(N);
    key.push(X);
    return {
      id: opts.id || String(Math.floor(rng() * 1e9)),
      mode: mode,
      words: pool.slice(0, 25),
      key: shuffle(key, rng),
      rev: new Array(25).fill(false),
      turn: start,
      clue: null,          // {w, n} n: 0..9 o -1 (ilimitada)
      left: 0,             // intentos que quedan en este turno
      tries: 0,            // intentos hechos en este turno
      winner: null,
      how: null,           // 'words' | 'assassin' | 'rival'
      log: []
    };
  }
  function uniq(ws) {
    var seen = {};
    return ws.filter(function (w) { var k = String(w).toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true });
  }
  function leftOf(g, team) {
    return g.key.reduce(function (s, k, i) { return s + (k === team && !g.rev[i] ? 1 : 0) }, 0);
  }
  function clone(g) {
    var c = Object.assign({}, g);
    c.rev = g.rev.slice(); c.log = g.log.slice();
    return c;
  }
  /* n: 0..9, o -1 para "ilimitada". Con 0 o ilimitada no hay tope, pero
     igual hay que intentar al menos una. */
  function giveClue(g, w, n) {
    if (g.winner) return g;
    var c = clone(g);
    n = n === -1 ? -1 : Math.max(0, Math.min(9, Math.floor(+n || 0)));
    c.clue = { w: String(w || '').trim().slice(0, 30), n: n };
    c.left = n <= 0 ? Infinity : n + 1;
    c.tries = 0;
    c.log.push({ t: 'clue', team: c.turn, w: c.clue.w, n: n });
    return c;
  }
  /* Tocar una palabra. Devuelve {g, res} con lo que pasó y los sorbos
     que corresponden por equipo: [{team, n, why}] */
  function guess(g, i, rng) {
    if (g.winner || !g.clue || g.rev[i] || i < 0 || i > 24) return { g: g, res: null };
    var c = clone(g), team = c.turn, k = c.key[i];
    c.rev[i] = true;
    c.tries++; c.left--;
    var res = { i: i, word: c.words[i], kind: k === team ? 'own' : k === N ? 'neutral' : k === X ? 'assassin' : 'rival', team: team, sips: [], end: false };
    if (res.kind === 'neutral') res.sips.push({ team: team, n: SIPS.neutral, why: 'transeúnte' });
    if (res.kind === 'rival') res.sips.push({ team: team, n: SIPS.rival, why: 'palabra del rival' });
    c.log.push({ t: 'guess', team: team, i: i, kind: res.kind });
    if (res.kind === 'assassin') {
      c.winner = other(team); c.how = 'assassin';
      res.sips.push({ team: team, n: SIPS.assassin, why: 'asesino', shot: true });
    } else if (leftOf(c, A) === 0 || leftOf(c, B) === 0) {
      c.winner = leftOf(c, A) === 0 ? A : B;
      c.how = c.mode === 'coop' && c.winner === B ? 'rival' : 'words';
    }
    if (c.winner) {
      res.end = true;
      res.sips = res.sips.concat(loserSips(c));
      return { g: c, res: res };
    }
    if (res.kind !== 'own' || c.left <= 0) { res.end = true; return { g: endTurn(c, rng), res: res } }
    return { g: c, res: res };
  }
  /* El que pierde toma 1 por cada palabra suya que quedó tapada (tope 5).
     Con el asesino ya tomó su shot: no se le suma más. */
  function loserSips(g) {
    if (!g.winner || g.how === 'assassin') return [];
    var loser = other(g.winner);
    if (g.mode === 'coop' && loser === B) return [];     // el rival simulado no toma
    var n = Math.min(SIPS.maxLeft, Math.max(1, leftOf(g, loser) * SIPS.perWordLeft));
    return [{ team: loser, n: n, why: 'perdieron' }];
  }
  function canPass(g) { return !g.winner && !!g.clue && g.tries >= 1 }
  /* Fin del turno. En la cooperativa juega el rival simulado: se descubre
     una de sus palabras al azar y vuelve el turno al equipo. */
  function endTurn(g, rng) {
    if (g.winner) return g;
    var c = clone(g);
    c.clue = null; c.left = 0; c.tries = 0;
    if (c.mode === 'coop') {
      rng = rng || Math.random;
      var suyas = [];
      c.key.forEach(function (k, i) { if (k === B && !c.rev[i]) suyas.push(i) });
      if (suyas.length) {
        var i = suyas[Math.floor(rng() * suyas.length)];
        c.rev[i] = true;
        c.log.push({ t: 'rival', i: i });
      }
      if (leftOf(c, B) === 0) { c.winner = B; c.how = 'rival' }
      c.turn = A;
      return c;
    }
    c.turn = other(c.turn);
    return c;
  }
  /* Puntaje de la cooperativa: palabras que le quedaban al rival */
  function coopScore(g) { return g.mode === 'coop' && g.winner === A ? leftOf(g, B) : 0 }

  /* Lo que ven todos: las palabras y solo los colores ya descubiertos. */
  function publicView(g) {
    return {
      id: g.id, mode: g.mode, words: g.words, turn: g.turn, clue: g.clue,
      left: g.left === Infinity ? -1 : g.left, winner: g.winner, how: g.how,
      shown: g.key.map(function (k, i) { return g.rev[i] ? k : '' }).join(','),
      rest: { r: leftOf(g, A), a: leftOf(g, B) }
    };
  }

  return {
    RED: A, BLUE: B, NEUTRAL: N, ASSASSIN: X, SIPS: SIPS,
    makeTeams: makeTeams, moveTo: moveTo, setJefe: setJefe, teamOf: teamOf, teamsProblem: teamsProblem,
    newGame: newGame, giveClue: giveClue, guess: guess, endTurn: endTurn, canPass: canPass,
    leftOf: leftOf, coopScore: coopScore, publicView: publicView, other: other
  };
});
