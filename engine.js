/* =========================================================
   CARRETEO · engine.js
   Lógica pura del juego: barajar, no repetir, repartir turnos,
   filtrar por intensidad y traducir al modo sin alcohol.

   No toca el DOM ni localStorage, y acepta un RNG inyectable,
   así que todo lo de aquí se prueba con `node --test tests/`.
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- azar ---------- */

  function shuffle(a, rng) {
    var r = rng || Math.random;
    var out = (a || []).slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function rnd(a, rng) {
    if (!a || !a.length) return undefined;
    return a[Math.floor((rng || Math.random)() * a.length)];
  }

  /* ---------- cartas ----------
     Formato: "[I]tipoN|texto"
       [I]   intensidad opcional 1|2|3 (si falta, hereda la del modo)
       tipo  r p yn rg vt vs mm tm dd sh cc tr aq pc
       N     rondas (rg) o segundos (tm)
       texto § separa las partes: pregunta§respuesta, reto§premio§castigo
  --------------------------------*/

  var CARD_RE = /^(?:\[([123])\])?([a-z]+?)(\d*)\|([\s\S]*)$/;

  function parseCard(s) {
    var str = s == null ? '' : String(s);
    var m = str.match(CARD_RE);
    if (!m) return { lvl: null, k: 'r', n: 0, x: str, parts: [str] };
    return {
      lvl: m[1] ? parseInt(m[1], 10) : null,
      k: m[2],
      n: m[3] ? parseInt(m[3], 10) : 0,
      x: m[4],
      parts: m[4].split('§')
    };
  }

  /* ---------- modo sin alcohol ----------
     Sustituciones con límite de palabra, para no tocar "tomate"
     ni "automatización", y conservando mayúsculas.
  ----------------------------------------*/

  var NA_RULES = [
    [/\bsorbos\b/gi, 'puntos'],
    [/\bsorbo\b/gi, 'punto'],
    [/\bshots\b/gi, 'prendas'],
    [/\bshot\b/gi, 'prenda'],
    [/\bal seco\b/gi, 'con prenda doble'],
    [/\btoman\b/gi, 'suman'],
    [/\btomen\b/gi, 'sumen'],
    [/\btomas\b/gi, 'sumas'],
    [/\btómalo\b/gi, 'súmalo'],
    [/\btómala\b/gi, 'súmala'],
    [/\btomarlo\b/gi, 'sumarlo'],
    [/\btomarse\b/gi, 'sumarse'],
    [/\btomar\b/gi, 'sumar'],
    [/\btoma\b/gi, 'suma'],
    [/\btomo\b/gi, 'sumo'],
    [/\bbeben\b/gi, 'suman'],
    [/\bbebes\b/gi, 'sumas'],
    [/\bbeber\b/gi, 'sumar'],
    [/\bbebe\b/gi, 'suma'],
    [/\bbebidas\b/gi, 'bebidas sin alcohol'],
    [/\bbebida\b/gi, 'bebida sin alcohol'],
    [/\btragos\b/gi, 'vasos'],
    [/\btrago\b/gi, 'vaso']
  ];

  function applyCase(match, repl) {
    if (match === match.toUpperCase() && match !== match.toLowerCase()) {
      return repl.toUpperCase();
    }
    var first = match.charAt(0);
    if (first === first.toUpperCase() && first !== first.toLowerCase()) {
      return repl.charAt(0).toUpperCase() + repl.slice(1);
    }
    return repl;
  }

  function adapt(text, noAlcohol) {
    var t = text == null ? '' : String(text);
    if (!noAlcohol) return t;
    for (var i = 0; i < NA_RULES.length; i++) {
      var repl = NA_RULES[i][1];
      t = t.replace(NA_RULES[i][0], (function (r) {
        return function (m) { return applyCase(m, r); };
      })(repl));
    }
    return t;
  }

  /* ---------- intensidad ---------- */

  function cardLevel(card, modeLvl) {
    var l = parseCard(card).lvl;
    return l == null ? (modeLvl || 2) : l;
  }

  function filterByIntensity(deck, modeLvl, maxLvl) {
    var max = maxLvl == null ? 3 : maxLvl;
    return (deck || []).filter(function (c) {
      return cardLevel(c, modeLvl) <= max;
    });
  }

  /* ---------- duplicados ---------- */

  function normText(card) {
    return parseCard(card).x
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.!?¡¿]+$/, '');
  }

  function dedupe(cards) {
    var seen = Object.create(null);
    var out = [];
    (cards || []).forEach(function (c) {
      var k = normText(c);
      if (seen[k]) return;
      seen[k] = true;
      out.push(c);
    });
    return out;
  }

  /* ---------- mazo sin repetición ----------
     La ventana es cuántas de las últimas vistas se empujan al fondo.
     Se recorta a `largo - 5` para que un mazo chico nunca se quede
     sin cartas frescas que mostrar.
  -------------------------------------------*/

  var DEFAULT_WINDOW = 20;
  var RECENT_CAP = 40;

  function windowSize(total, cap) {
    var want = cap == null ? DEFAULT_WINDOW : cap;
    return Math.max(0, Math.min(want, (total || 0) - 5));
  }

  function buildDeck(all, recent, opts) {
    var o = opts || {};
    var cards = (all || []).slice();
    var win = windowSize(cards.length, o.cap);
    var tail = win > 0 ? (recent || []).slice(-win) : [];
    var isRecent = Object.create(null);
    tail.forEach(function (c) { isRecent[c] = true; });

    var fresh = [], stale = [];
    cards.forEach(function (c) { (isRecent[c] ? stale : fresh).push(c); });
    return shuffle(fresh, o.rng).concat(shuffle(stale, o.rng));
  }

  function pushRecent(recent, card, cap) {
    var c = cap == null ? RECENT_CAP : cap;
    if (c <= 0) return [];
    var out = (recent || []).filter(function (x) { return x !== card; });
    out.push(card);
    return out.slice(-c);
  }

  /* ---------- turnos justos ----------
     Bolsa de jugadores barajada: nadie vuelve a salir hasta que
     pasaron todos. Al rellenar la bolsa se rota si el primero es
     el mismo que acaba de jugar.
  -------------------------------------*/

  function makeBag(n, rng) {
    var ix = [];
    for (var i = 0; i < n; i++) ix.push(i);
    return shuffle(ix, rng);
  }

  function nextPlayers(state, n, rng) {
    var st = state || {};
    if (!n || n <= 0) return { i1: null, i2: null, state: { bag: [], last: null } };
    if (n === 1) return { i1: 0, i2: 0, state: { bag: [], last: 0 } };

    var bag = (st.bag && st.bag.length) ? st.bag.slice() : makeBag(n, rng);
    if (bag.length === n && bag[0] === st.last) bag.push(bag.shift());

    var i1 = bag.shift();
    var i2;
    if (bag.length) {
      i2 = bag[0];
    } else {
      var others = [];
      for (var k = 0; k < n; k++) if (k !== i1) others.push(k);
      i2 = rnd(others, rng);
    }
    return { i1: i1, i2: i2, state: { bag: bag, last: i1 } };
  }

  /* ---------- modo Mix ---------- */

  function buildMixDeck(modes, ids, maxLvl) {
    var want = ids || [];
    var seen = Object.create(null);
    var out = [];
    (modes || []).forEach(function (m) {
      if (want.indexOf(m.id) === -1) return;
      filterByIntensity(m.deck, m.lvl, maxLvl).forEach(function (card) {
        var k = normText(card);
        if (seen[k]) return;
        seen[k] = true;
        out.push({ card: card, from: m.id, nm: m.nm, color: m.c });
      });
    });
    return out;
  }

  /* ---------- marcador ---------- */

  function sipsInText(text) {
    var m = String(text == null ? '' : text).match(/(\d+)\s*(sorbo|punto)/i);
    return m ? parseInt(m[1], 10) : 1;
  }

  function summary(players, session, now) {
    var ps = (players || []).slice();
    var se = session || {};

    var ranking = ps.slice().sort(function (a, b) {
      return (b.sips || 0) - (a.sips || 0);
    });

    function maxBy(key) {
      var best = null;
      ps.forEach(function (p) {
        if (!best || (p[key] || 0) > (best[key] || 0)) best = p;
      });
      return best && (best[key] || 0) > 0 ? best : null;
    }

    var started = se.startedAt || 0;
    var minutes = now ? Math.max(0, Math.round((now - started) / 60000)) : 0;

    return {
      ranking: ranking,
      top: ranking.length ? ranking[0] : null,
      brave: maxBy('done'),
      chicken: maxBy('skip'),
      cards: se.drawn || 0,
      total: ps.reduce(function (s, p) { return s + (p.sips || 0); }, 0),
      minutes: minutes
    };
  }

  return {
    shuffle: shuffle,
    rnd: rnd,
    parseCard: parseCard,
    adapt: adapt,
    cardLevel: cardLevel,
    filterByIntensity: filterByIntensity,
    normText: normText,
    dedupe: dedupe,
    windowSize: windowSize,
    buildDeck: buildDeck,
    pushRecent: pushRecent,
    makeBag: makeBag,
    nextPlayers: nextPlayers,
    buildMixDeck: buildMixDeck,
    sipsInText: sipsInText,
    summary: summary,
    RECENT_CAP: RECENT_CAP
  };
});
