/* =========================================================
   CARRETEO · live.js
   Compartir la partida en vivo: el celular que hostea publica una foto
   del juego (carta en pantalla, reglas activas, marcador) en Firebase
   Realtime Database, y los demás la miran con un link o un QR.

   Sin SDK ni build: se habla con Firebase por REST. El host escribe con
   fetch y los que miran escuchan con EventSource, que se reconecta solo.
   El juego no depende de esto: si no hay internet, se sigue jugando igual
   y solo se pierde la transmisión.

   La parte pura (códigos, links, aplicar eventos) se exporta para
   probarla con node, igual que engine.js.
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Live = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* No son secretos: en una app web viajan a la vista. Lo que protege la
     base son las reglas de database.rules.json. */
  var CFG = {
    apiKey: 'AIzaSyD50F381y5KF_O01aOQjyQczLcZjKgnx2Q',
    db: 'https://carreteo-a9da1-default-rtdb.firebaseio.com',
    site: 'https://juanmanuelalessandrini.github.io/carreteo/'
  };
  var LKEY = 'carreteo.live';
  // sin 0/O ni 1/I: el código también se dicta en voz alta
  var ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
  var STALE_MS = 2 * 60 * 1000;
  // Una sala vive una noche: pasado esto no se retoma y se abre otra.
  // Las reglas de Firebase, además, dejan de servir salas sin novedades
  // en 12 h, así un QR viejo no entra aunque la sala no se haya borrado.
  var ROOM_TTL = 8 * 3600 * 1000;
  var HKEY = 'carreteo.host';

  /* ---------- parte pura ---------- */
  function newCode(rng) {
    rng = rng || Math.random;
    var s = '';
    for (var i = 0; i < 6; i++) s += ALFA[Math.floor(rng() * ALFA.length)];
    return s;
  }
  /* el QR del jefe trae &soy=<asiento>: ese celular se sienta solo */
  function soyFromHash(hash) {
    var m = /&soy=([^&]+)$/.exec(String(hash || ''));
    if (!m) return null;
    try { return decodeURIComponent(m[1]) } catch (e) { return null }
  }
  function validCode(c) { return CODE_RE.test(String(c || '')) }
  function codeFromHash(hash) {
    var m = /^#ver=([A-Za-z0-9]{6})(?:&soy=[^&]*)?$/.exec(String(hash || ''));
    if (!m) return null;
    var c = m[1].toUpperCase();
    return validCode(c) ? c : null;
  }
  /* El link apunta a donde se está jugando si es https; si no (file:// o
     localhost), a la versión publicada, que es la que otros pueden abrir. */
  function viewUrl(loc, code) {
    var base = loc && loc.protocol === 'https:' ? loc.origin + loc.pathname : CFG.site;
    return base + '#ver=' + code;
  }
  /* Aplica un evento del stream de Firebase ("put" reemplaza, "patch"
     mezcla) sobre la copia local. Devuelve un objeto nuevo. */
  function applyEvent(state, kind, msg) {
    var parts = String(msg.path || '/').split('/').filter(Boolean);
    var data = msg.data;
    function setIn(obj, keys, val) {
      if (!keys.length) return val;
      var copy = Array.isArray(obj) ? obj.slice() : Object.assign({}, obj && typeof obj === 'object' ? obj : {});
      var k = keys[0];
      var next = setIn(copy[k], keys.slice(1), val);
      if (next === null || next === undefined) delete copy[k]; else copy[k] = next;
      return copy;
    }
    function getIn(obj, keys) {
      return keys.reduce(function (o, k) { return o && typeof o === 'object' ? o[k] : undefined }, obj);
    }
    if (kind === 'patch' && data && typeof data === 'object') {
      var base = getIn(state, parts);
      var merged = Object.assign({}, base && typeof base === 'object' ? base : {});
      Object.keys(data).forEach(function (k) {
        if (data[k] === null) delete merged[k]; else merged[k] = data[k];
      });
      return setIn(state, parts, merged);
    }
    return setIn(state, parts, data);
  }
  /* Firebase guarda los arreglos como objetos si les faltan índices. */
  function asList(x) {
    if (Array.isArray(x)) return x.filter(Boolean);
    if (x && typeof x === 'object') return Object.keys(x).sort(function (a, b) { return a - b }).map(function (k) { return x[k] }).filter(Boolean);
    return [];
  }
  function ago(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return 'recién';
    var m = Math.round(s / 60);
    return m < 60 ? 'hace ' + m + ' min' : 'hace ' + Math.round(m / 60) + ' h';
  }

  /* Clave de Firebase para un jugador: los nombres pueden traer . $ # [ ] /
     que Firebase no acepta en una ruta. */
  function pidOf(n) { return encodeURIComponent(String(n)).replace(/\./g, '%2E') }
  /* {asiento: votado} → [{n, v}] de más a menos votos */
  function tally(votes) {
    var c = {};
    Object.keys(votes || {}).forEach(function (k) { var t = votes[k]; if (typeof t === 'string') c[t] = (c[t] || 0) + 1 });
    return Object.keys(c).map(function (n) { return { n: n, v: c[n] } })
      .sort(function (a, b) { return b.v - a.v || (a.n < b.n ? -1 : 1) });
  }
  /* Con qué nombres de la mesa hay un celular sentado */
  function seatedNames(seats, players) {
    return (players || []).filter(function (p) { return seats && seats[pidOf(p.n)] }).map(function (p) { return p.n });
  }

  var api = {
    pidOf: pidOf, tally: tally, seatedNames: seatedNames,
    ROOM_TTL: ROOM_TTL, CFG: CFG, soyFromHash: soyFromHash, newCode: newCode, validCode: validCode, codeFromHash: codeFromHash,
    viewUrl: viewUrl, applyEvent: applyEvent, asList: asList, ago: ago, STALE_MS: STALE_MS
  };
  if (typeof document === 'undefined') return api;

  /* ---------- navegador ---------- */
  var $ = function (id) { return document.getElementById(id) };
  function escH(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function mem() { try { return JSON.parse(localStorage.getItem(LKEY)) || {} } catch (e) { return {} } }
  function remember(d) { try { localStorage.setItem(LKEY, JSON.stringify(d)) } catch (e) {} }

  /* ---------- sesión anónima ----------
     Firebase le da al celular un id anónimo; las reglas dejan escribir una
     sala solo al id que la creó. El id sobrevive en localStorage, así que
     recargar la página no le quita la sala al host. */
  var H = { code: null, uid: null, refresh: null, token: null, exp: 0, status: 'off', last: '', busy: false, dirty: false, retryT: null, debT: null, obs: null };

  function postJSON(url, body, form) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
      body: form ? body : JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || ('HTTP ' + r.status));
        return j;
      });
    });
  }
  // el que mira también necesita sesión: para sentarse, ver lo suyo y votar
  function loadSession() {
    if (H.uid) return;
    var d = mem();
    H.uid = d.uid || null; H.refresh = d.refresh || null;
  }
  function token() {
    loadSession();
    if (H.token && Date.now() < H.exp - 60000) return Promise.resolve(H.token);
    var p = H.refresh
      ? postJSON('https://securetoken.googleapis.com/v1/token?key=' + CFG.apiKey,
          'grant_type=refresh_token&refresh_token=' + encodeURIComponent(H.refresh), true)
          .then(function (j) { return { idToken: j.id_token, refreshToken: j.refresh_token, localId: j.user_id, expiresIn: j.expires_in } })
      : postJSON('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + CFG.apiKey, { returnSecureToken: true });
    return p.then(function (j) {
      H.token = j.idToken; H.refresh = j.refreshToken; H.uid = j.localId;
      H.exp = Date.now() + (+j.expiresIn || 3600) * 1000;
      var d = mem(); d.uid = H.uid; d.refresh = H.refresh; remember(d);
      return H.token;
    });
  }
  function roomUrl(code, tok) { return dbUrl('/salas/' + code, tok) }
  function dbUrl(path, tok) {
    return CFG.db + path + '.json' + (tok ? '?auth=' + encodeURIComponent(tok) : '');
  }
  function dbWrite(method, path, body) {
    return token().then(function (tok) {
      return fetch(dbUrl(path, tok), { method: method, body: body === undefined ? undefined : JSON.stringify(body) });
    }).then(function (r) {
      if (r.status === 401) H.token = null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    });
  }
  /* Escucha una ruta. Con auth, el token dura una hora: cuando Firebase
     avisa que venció (auth_revoked) se pide otro y se reconecta. Si las
     reglas niegan la lectura (cancel) se entrega null y se deja de insistir. */
  function stream(path, withAuth, onData) {
    var st = { es: null, data: undefined, closed: false, t: null };
    function reopen(ms) {
      if (st.es) { try { st.es.close() } catch (e) {} }
      clearTimeout(st.t); st.t = setTimeout(open, ms);
    }
    function open() {
      if (st.closed) return;
      (withAuth ? token() : Promise.resolve(null)).then(function (tok) {
        if (st.closed) return;
        var es = new EventSource(dbUrl(path, tok));
        st.es = es;
        var on = function (kind) {
          return function (e) {
            var m; try { m = JSON.parse(e.data) } catch (x) { return }
            if (!m) return;
            st.data = applyEvent(st.data === undefined ? null : st.data, kind, m);
            onData(st.data);
          };
        };
        es.addEventListener('put', on('put'));
        es.addEventListener('patch', on('patch'));
        es.addEventListener('auth_revoked', function () { H.token = null; reopen(500) });
        es.addEventListener('cancel', function () { st.data = null; onData(null); st.closed = true; try { es.close() } catch (e) {} });
        es.onerror = function () { if (es.readyState === 2) reopen(5000) };
      }, function () { reopen(10000) });
    }
    open();
    return { close: function () { st.closed = true; clearTimeout(st.t); if (st.es) { try { st.es.close() } catch (e) {} } } };
  }

  /* ---------- foto del juego ----------
     Se arma leyendo lo que el host tiene en pantalla, así lo que ven los
     demás es exactamente lo mismo, con nombres y "sorbos"/"puntos". */
  var VIEWS = { home: '🏠 En el inicio', players: '👥 Armando la mesa', modes: '🃏 Eligiendo modo', board: '🏆 Mirando el marcador', summary: '🌙 Terminando la noche', ruleta: '🎡 Ruleta', impostor: '🕵️ Impostor', rey: '👑 Cuarto rey', mixpick: '🎛️ Armando un mix', bomba: '💣 La bomba', agente: '🕶️ Doble agente' };
  function txt(el, sel) { var n = el && el.querySelector(sel); return n ? n.textContent.trim() : null }
  function snapshot() {
    // S es el estado de app.js: los const de nivel superior se comparten
    // entre scripts clásicos
    var St = typeof S !== 'undefined' ? S : null;
    var on = document.querySelector('.screen.on');
    var view = on ? on.id : 'home';
    var card = null;
    var cardEl = view === 'game' ? $('gcard') : view === 'rey' ? $('reycard') : null;
    if (cardEl) {
      card = { label: txt(cardEl, '.ctype'), text: txt(cardEl, '.ctext'), ans: txt(cardEl, '.answer'), sub: txt(cardEl, '.csub') };
      if (!card.text) card = null;
    }
    var mode = null;
    if (view === 'game' && St && St.mode) mode = { em: St.mode.em, nm: St.mode.nm, c: St.mode.c };
    if (!mode && VIEWS[view] && view !== 'home') mode = { em: '', nm: VIEWS[view], c: '' };
    return {
      v: 1,
      view: view,
      mode: mode,
      card: card,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || null,
      rules: St ? St.rules.map(function (r) { return { txt: r.txt, left: r.left } }) : [],
      players: St ? St.players.slice(0, 30).map(function (p) { return { n: p.n, sips: p.sips || 0, out: !!p.out, c: p.c, done: p.done || 0, skip: p.skip || 0 } }) : [],
      // a quién nombra la carta, para el aviso de "te toca"
      named: view === 'game' && card ? [typeof curP1 !== 'undefined' && curP1, typeof curP2 !== 'undefined' && curP2]
        .filter(Boolean).map(function (p) { return p.n }).filter(function (n, i, a) { return a.indexOf(n) === i }) : [],
      vote: H.vote ? { id: H.vote.id, q: H.vote.q } : null,
      ag: view === 'agente' ? agSnap() : null,
      unit: St && St.noAlcohol ? 'puntos' : 'sorbos',
      charts: chartsSnap(St)
    };
  }

  /* Doble agente: las palabras y lo ya descubierto, nunca la clave */
  function agSnap() {
    var G = typeof AG !== 'undefined' ? AG : null;
    if (!G || !G.teams) return null;
    var base = { mode: G.mode, teams: { r: G.teams.r, a: G.teams.a }, jefe: G.teams.jefe };
    if (G.phase !== 'play' || !G.g || !window.Agente) return Object.assign(base, { setup: true });
    // el reloj viaja como hora de término: cada celular cuenta solo, sin
    // publicar cada segundo
    return Object.assign(base, Agente.publicView(G.g), { secs: G.secs || 0, end: G.deadline || null, pausa: G.paused != null });
  }

  /* Los gráficos viajan ya calculados y compactos: los tramos de la carrera
     son parejos, así que basta mandar los valores. La hora se redondea al
     minuto; si no, la foto cambiaría a cada rato y se publicaría de más. */
  function chartsSnap(St) {
    if (!St || !window.Charts || !St.players.some(function (p) { return p.sips > 0 })) return null;
    var now = Math.floor(Date.now() / 60000) * 60000;
    var r = Charts.race(St.log, St.players, St.startedAt, now, 30);
    return {
      t0: r.t0, t1: r.t1,
      race: r.series.map(function (x) { return { n: x.n, v: x.pts.map(function (q) { return q[1] }) } }),
      rate: Charts.rate(St.log, St.players, now).map(function (x) { return { n: x.n, v: x.v } })
    };
  }
  function viewerCharts(st, ps) {
    var ch = st.charts;
    V.race = null;
    if (!ch || !window.Charts) return '';
    var byName = {};
    ps.forEach(function (p, i) { byName[p.n] = { c: Charts.chartColor(p.c, i), out: !!p.out } });
    var race = asList(ch.race), n = race.length ? asList(race[0].v).length : 0;
    var r = { t0: ch.t0, t1: ch.t1, series: race.map(function (x) {
      var v = asList(x.v), m = byName[x.n] || { c: Charts.CHART[0], out: false };
      return { n: x.n, c: m.c, out: m.out, pts: v.map(function (val, i) { return [ch.t0 + (ch.t1 - ch.t0) * i / Math.max(1, n - 1), +val || 0] }) };
    }) };
    V.race = r;
    return Charts.panel({
      players: ps, unit: st.unit, race: r,
      rate: asList(ch.rate).map(function (x) { var m = byName[x.n] || { c: Charts.CHART[0], out: false }; return { n: x.n, v: +x.v || 0, c: m.c, out: m.out } })
    });
  }

  function setStatus(s) {
    H.status = s;
    document.querySelectorAll('[data-live]').forEach(function (b) {
      b.classList.toggle('live-on', s === 'ok');
      b.classList.toggle('live-err', s === 'err');
      b.classList.toggle('live-wait', s === 'wait');
    });
    var st = $('livestatus');
    if (st) st.textContent = { ok: '🟢 Transmitiendo en vivo', wait: '🟡 Conectando…', err: '🔴 Sin conexión: se reintenta sola', off: '' }[s] || '';
  }

  function publish() {
    if (!H.code) return;
    if (H.busy) { H.dirty = true; return }
    var snap = snapshot();
    var key = JSON.stringify(snap);
    if (key === H.last && H.status === 'ok') return;
    H.busy = true; H.dirty = false;
    token().then(function (tok) {
      snap.host = H.uid;
      snap.t = { '.sv': 'timestamp' };
      return fetch(roomUrl(H.code, tok), { method: 'PUT', body: JSON.stringify(snap) }).then(function (r) {
        if (r.status === 401) { H.token = null; throw new Error('auth') }
        if (!r.ok) throw new Error('HTTP ' + r.status);
      });
    }).then(function () {
      H.last = key; setStatus('ok');
    }, function () {
      clearTimeout(H.retryT);
      H.retryT = setTimeout(function () { H.retryT = null; publish() }, 10000);
      setStatus('err');
    }).then(function () {
      H.busy = false;
      if (H.dirty) touch();
    });
  }
  /* Espera fija desde el primer cambio, sin reiniciarla con cada cambio
     nuevo: la bomba y los cronómetros tocan la pantalla seguido y con un
     debounce clásico la foto no saldría nunca. */
  function touch() {
    // Con un reintento pendiente no se publica antes: el mismo aviso de
    // error cambia la pantalla, y sin esto cada falla dispararía otra al
    // instante, en bucle. El reintento manda la foto más reciente.
    if (!H.code || H.debT || H.retryT) return;
    H.debT = setTimeout(function () { H.debT = null; publish() }, 400);
  }
  /* Todo lo que cambia en pantalla dispara una publicación. Las repetidas
     (el cronómetro de la trivia cambia cada segundo) se descartan porque
     la foto sale idéntica. */
  function observe() {
    if (H.obs || !window.MutationObserver) return;
    H.obs = new MutationObserver(touch);
    H.obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  }
  function retryNow() {
    clearTimeout(H.retryT); H.retryT = null;
    H.last = ''; touch();
  }
  /* ---------- clave de host ----------
     Solo quien tiene la clave puede crear salas: las reglas de Firebase
     aceptan escribir hosts/<id> únicamente con la clave correcta, y crear
     una sala exige estar en esa lista. La clave vive solo en las reglas
     de la consola de Firebase; ni la app ni el repo la conocen. */
  function isHost() { try { var h = JSON.parse(localStorage.getItem(HKEY)); return !!(h && h.ok) } catch (e) { return false } }
  function unlockHost(clave) {
    clave = String(clave || '').trim();
    if (!clave) return Promise.reject(new Error('vacía'));
    return token().then(function () {
      return fetch(dbUrl('/hosts/' + H.uid, H.token), { method: 'PUT', body: JSON.stringify(clave) });
    }).then(function (r) {
      if (r.status === 401) throw new Error('clave');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      try { localStorage.setItem(HKEY, JSON.stringify({ ok: true, uid: H.uid, at: Date.now() })) } catch (e) {}
      return true;
    });
  }

  /* ---------- asientos, impostor y votos (host) ---------- */
  function seatOf(n) { return !!(H.code && H.seats && H.seats[pidOf(n)]) }
  function renderSeats() {
    var el = $('liveseats');
    if (!el) return;
    var St = typeof S !== 'undefined' ? S : null;
    var names = seatedNames(H.seats, St ? St.players : []);
    if (!names.length) { el.textContent = 'Cuando alguien elija quién es, aparece aquí.'; return }
    // ✕ libera el asiento: sirve si alguien eligió el nombre equivocado
    el.innerHTML = '<span>📱 Conectados:</span> ' + names.map(function (n) {
      return '<span class="seatchip">' + escH(n) + '<button class="seatx" data-n="' + escH(n) + '" aria-label="Liberar a ' + escH(n) + '">✕</button></span>';
    }).join(' ');
    el.querySelectorAll('.seatx').forEach(function (b) { b.onclick = function () { releaseSeat(b.dataset.n) } });
  }
  /* El host saca a alguien de un asiento. Su celular vuelve a la lista
     para elegir jugador; el asiento queda libre para otro. */
  function releaseSeat(n, sinPreguntar) {
    if (!H.code || !seatOf(n)) return Promise.resolve(false);
    if (!sinPreguntar && typeof confirm === 'function' && !confirm('¿Liberar a ' + n + '? Su celular vuelve a elegir jugador.')) return Promise.resolve(false);
    var pid = pidOf(n);
    return dbWrite('DELETE', '/asientos/' + H.code + '/' + pid).then(function () {
      if (H.seats) delete H.seats[pid];
      renderSeats();
      if (window.toast) window.toast(n + ' quedó libre');
      return true;
    }, function () {
      if (window.toast) window.toast('No se pudo liberar a ' + n + ': revisa la conexión');
      return false;
    });
  }
  function watchSeats() {
    if (H.seatsS) H.seatsS.close();
    H.seats = {};
    H.seatsS = stream('/asientos/' + H.code, false, function (d) {
      H.seats = d && typeof d === 'object' ? d : {};
      renderSeats();
      if (H.imp) sendImpostor(H.imp);   // el que llega tarde también recibe su rol
      if (H.ag && H.ag.g && !H.ag.g.winner) sendKey(H.ag);
      // la pantalla de Doble agente muestra qué jefe ya tiene la clave
      if (typeof AG !== 'undefined' && document.querySelector('#agente.on') && window.renderAgente && (AG.phase === 'setup' || (AG.g && AG.g.winner))) window.renderAgente();
      if (H.voteBox) renderTally();
    });
  }
  /* Manda a cada celular sentado su rol, en su espacio privado. La palabra
     nunca pasa por la sala pública. Devuelve los nombres que lo recibieron. */
  function sendImpostor(IMP) {
    if (!H.code || !IMP || !IMP.ps) return Promise.resolve([]);
    H.imp = IMP;
    var priv = {}, names = [];
    // PATCH con rutas: así el rol del impostor no pisa la clave de Doble
    // agente, y los sentados que no juegan esta ronda quedan sin rol
    Object.keys(H.seats || {}).forEach(function (pid) { priv[pid + '/imp'] = null });
    IMP.ps.forEach(function (p, i) {
      if (!seatOf(p.n)) return;
      names.push(p.n);
      priv[pidOf(p.n) + '/imp'] = { r: IMP.r, cat: IMP.cat, word: i === IMP.imp ? null : IMP.word, impostor: i === IMP.imp };
    });
    if (!names.length) return Promise.resolve([]);
    return dbWrite('PATCH', '/privado/' + H.code, priv).then(function () { return names }, function () { return [] });
  }
  /* La clave de Doble agente va solo a los jefes. Al resto de los
     sentados se le borra, por si en la partida anterior fue jefe. */
  function sendKey(G) {
    if (!H.code || !G || !G.g) return Promise.resolve([]);
    H.ag = G;
    var jefes = [G.teams.jefe.r, G.teams.jefe.a].filter(Boolean), names = [], priv = {};
    Object.keys(H.seats || {}).forEach(function (pid) { priv[pid + '/ag'] = null });
    jefes.forEach(function (n) {
      if (!seatOf(n)) return;
      names.push(n);
      priv[pidOf(n) + '/ag'] = { g: G.g.id, key: G.g.key.join(',') };
    });
    if (!Object.keys(priv).length) return Promise.resolve([]);
    return dbWrite('PATCH', '/privado/' + H.code, priv).then(function () { return names }, function () { return [] });
  }
  function jefeQR(n) {
    var m = $('agqrmodal');
    if (!m) return;
    if (!isHost()) { if (window.toast) window.toast('Compartir es solo para el host 🔒'); return }
    if (!H.code) startHost(newCode());
    var url = viewUrl(location, H.code) + '&soy=' + encodeURIComponent(n);
    $('agqrtxt').textContent = n + ': escanea esto con tu celular. Quedas como ' + n + ' y ves la clave solo tú.';
    var box = $('agqr');
    if (typeof qrcode === 'function') {
      var q = qrcode(0, 'M'); q.addData(url); q.make();
      box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true, alt: 'Código QR para el jefe ' + n });
    }
    m.classList.add('show');
  }
  function clearImpostor() {
    if (!H.imp) return;
    H.imp = null;
    if (H.code) dbWrite('DELETE', '/privado/' + H.code).catch(function () {});
  }
  function renderTally() {
    var w = H.voteBox;
    if (!w || !H.vote || !w.isConnected) return;
    var St = typeof S !== 'undefined' ? S : null;
    var ps = St ? St.players.filter(function (p) { return !p.out }) : [];
    var sentados = seatedNames(H.seats, ps).length;
    var t = tally(H.votes);
    var total = t.reduce(function (s, x) { return s + x.v }, 0);
    var box = w.querySelector('.vtally');
    if (!box) { box = document.createElement('div'); box.className = 'vtally'; w.appendChild(box) }
    if (!sentados) { box.innerHTML = '<div class="qlabel">🗳️ Nadie eligió jugador en su celular: voten en voz alta</div>'; return }
    var items = t.map(function (x) {
      var i = St.players.findIndex(function (p) { return p.n === x.n });
      return { n: x.n, v: x.v, c: window.Charts ? Charts.chartColor(i >= 0 ? St.players[i].c : '', i) : '#8b6cff' };
    });
    box.innerHTML = '<div class="qlabel">🗳️ ' + total + ' de ' + sentados + ' votaron desde su celular</div>' +
      (items.length && window.Charts ? Charts.bars(items, { unit: 'votos' }) : '');
  }
  /* Una carta de votación abre una urna nueva; la carta siguiente la cierra.
     Las reglas solo aceptan votos para la urna que está en la sala. */
  function openVote(w, q) {
    closeVote();
    if (!H.code) return;
    H.vote = { id: newCode() + newCode().slice(0, 2), q: q };
    H.votes = {};
    H.voteBox = w;
    renderTally();
    H.votesS = stream('/votos/' + H.code + '/' + H.vote.id, true, function (d) { H.votes = d || {}; renderTally() });
    touch();
  }
  function closeVote() {
    if (H.votesS) { H.votesS.close(); H.votesS = null }
    if (H.vote) { H.vote = null; H.voteBox = null; touch() }
  }

  function startHost(code) {
    var d = mem();
    H.uid = d.uid || null; H.refresh = d.refresh || null;
    // la hora de creación viaja con el código: al recargar se conserva
    if (d.code !== code || !d.codeAt) d.codeAt = Date.now();
    H.code = code; d.code = code; remember(d);
    setStatus('wait'); observe(); publish(); watchSeats();
    if (H.wired) return;
    H.wired = true;
    // si el celular estuvo bloqueado, al volver se manda la foto al tiro
    document.addEventListener('visibilitychange', function () { if (!document.hidden) retryNow() });
    window.addEventListener('online', retryNow);
  }
  function stopHost() {
    var code = H.code;
    H.code = null; H.last = '';
    clearTimeout(H.retryT); clearTimeout(H.debT); H.retryT = null; H.debT = null;
    if (H.obs) { H.obs.disconnect(); H.obs = null }
    closeVote();
    if (H.seatsS) { H.seatsS.close(); H.seatsS = null }
    H.seats = {}; H.imp = null;
    var d = mem(); delete d.code; delete d.codeAt; remember(d);
    setStatus('off');
    // la sala va al final: las otras reglas preguntan quién es su host
    if (code) Promise.all(['/asientos/', '/privado/', '/votos/'].map(function (p) {
      return dbWrite('DELETE', p + code).catch(function () {});
    })).then(function () { return dbWrite('DELETE', '/salas/' + code) }).catch(function () {});
  }

  /* ---------- ventana de compartir ---------- */
  function drawQR(url) {
    var box = $('liveqr');
    if (!box) return;
    if (typeof qrcode !== 'function') { box.textContent = ''; return }
    var q = qrcode(0, 'M'); q.addData(url); q.make();
    box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true, alt: 'Código QR para mirar la partida' });
  }
  function openShare() {
    var m = $('livemodal');
    if (!m) return;
    if (!isHost()) { if (window.toast) window.toast('Compartir es solo para el host 🔒'); return }
    if (!H.code) startHost(newCode());
    var url = viewUrl(location, H.code);
    $('livecode').textContent = H.code;
    $('livelink').value = url;
    drawQR(url);
    renderSeats();
    setStatus(H.status);
    m.classList.add('show');
  }
  function closeShare() { var m = $('livemodal'); if (m) m.classList.remove('show') }
  function copyLink() {
    var url = $('livelink').value;
    var done = function () { if (window.toast) window.toast('Link copiado 📋') };
    if (navigator.share) { navigator.share({ title: 'Carreteo en vivo', text: 'Mira la partida en vivo', url: url }).catch(function () {}); return }
    if (navigator.clipboard) { navigator.clipboard.writeText(url).then(done, function () { $('livelink').select() }); return }
    $('livelink').select();
  }
  function stopShare() { stopHost(); closeShare(); if (window.toast) window.toast('Dejaste de compartir') }

  /* ---------- modo espectador ---------- */
  var V = { code: null, state: undefined, es: null, tick: null, retryT: null, seats: {}, me: null, watch: false, priv: null, voted: {}, buzz: '' };

  function myUid() { loadSession(); return H.uid }
  function sitAs(n) {
    var pid = pidOf(n);
    token().then(function () {
      return dbWrite('PUT', '/asientos/' + V.code + '/' + pid, H.uid);
    }).then(function () {
      V.me = { n: n, pid: pid }; V.watch = false;
      var d = mem(); d.seat = { code: V.code, n: n }; remember(d);
      watchPriv();
      renderViewer();
    }, function () {
      if (window.toast) window.toast(n + ' ya está tomado en otro celular');
    });
  }
  function standUp() {
    var me = V.me;
    V.me = null; V.priv = null;
    if (V.privS) { V.privS.close(); V.privS = null }
    var d = mem(); delete d.seat; remember(d);
    if (me) dbWrite('DELETE', '/asientos/' + V.code + '/' + me.pid).catch(function () {});
    renderViewer();
  }
  function justWatch() { V.watch = true; renderViewer() }
  function watchPriv() {
    if (V.privS) V.privS.close();
    V.priv = null;
    if (!V.me) return;
    V.privS = stream('/privado/' + V.code + '/' + V.me.pid, true, function (d) { V.priv = d; renderViewer() });
  }
  function vote(target) {
    var st = V.state, id = st && st.vote && st.vote.id;
    if (!id || !V.me) return;
    V.voted[id] = target;
    renderViewer();
    dbWrite('PUT', '/votos/' + V.code + '/' + id + '/' + V.me.pid, target).catch(function () {
      delete V.voted[id]; renderViewer();
      if (window.toast) window.toast('No se pudo votar: la votación ya cerró');
    });
  }
  function avatar(p) {
    var c = /^#[0-9a-f]{6}$/i.test(p.c || '') ? p.c : '#8b6cff';
    return '<div class="pav" style="background:' + c + '">' + escH((Array.from(String(p.n || '?'))[0] || '?').toUpperCase()) + '</div>';
  }
  /* Lo que depende de quién es este celular: elegir jugador, "te toca",
     su marcador, su rol en el impostor y su voto. */
  function personal(st, ps) {
    var html = '', after = '', uid = myUid();
    var enMesa = ps.filter(function (p) { return !p.out });
    if (V.me && !ps.some(function (p) { return p.n === V.me.n })) standUpLocal();
    if (!V.me) {
      if (V.watch || !enMesa.length) {
        return { top: enMesa.length ? '<button class="vlink" onclick="Live._pick()">🙋 ¿Juegas? Elige quién eres</button>' : '', after: '' };
      }
      return { after: '', top: '<div class="vpick"><div class="qlabel">¿Quién eres? Así ves tu rol en el impostor, votas y te avisa cuando te toca.</div>' +
        '<div class="plist">' + enMesa.map(function (p) {
          var owner = V.seats[pidOf(p.n)];
          var tomado = owner && owner !== uid;
          return '<button class="prow vseat"' + (tomado ? ' disabled' : '') + ' data-n="' + escH(p.n) + '">' + avatar(p) +
            '<div class="nm">' + escH(p.n) + '</div>' + (tomado ? '<span class="sleeptag">📱 tomado</span>' : '') + '</button>';
        }).join('') + '</div><button class="vlink" onclick="Live._watch()">Solo mirar</button></div>' };
    }
    var me = ps.filter(function (p) { return p.n === V.me.n })[0];
    var orden = ps.slice().sort(function (a, b) { return (b.sips || 0) - (a.sips || 0) });
    var puesto = orden.findIndex(function (p) { return p.n === V.me.n }) + 1;
    var named = asList(st.named);
    var toca = named.indexOf(V.me.n) >= 0 && st.card && st.card.text;
    if (toca && V.buzz !== st.card.text) {
      V.buzz = st.card.text;
      try { if (navigator.vibrate) navigator.vibrate([80, 60, 80]) } catch (e) {}
    }
    if (!toca) V.buzz = '';
    html += '<div class="vme">' + avatar(me) + '<div class="nm">Eres <b>' + escH(me.n) + '</b></div>' +
      '<button class="vlink" onclick="Live._standUp()">cambiar</button></div>';
    if (toca) html += '<div class="vtoca" role="alert">👉 ¡Te toca!</div>';
    // el rol del impostor: solo mientras el host está en esa pantalla
    var imp = V.priv && V.priv.imp;
    if (imp && st.view === 'impostor') {
      html += imp.impostor
        ? '<div class="impcard"><h3>Shhh…</h3><div class="impimp">ERES EL IMPOSTOR 🤫</div><p class="csub">Categoría: <b>' + escH(imp.cat) + '</b>. Disimula.</p></div>'
        : '<div class="impcard"><h3>Palabra secreta</h3><div class="impword">' + escH(imp.word) + '</div><p class="csub">Categoría: ' + escH(imp.cat) + '</p></div>';
    }
    // votar
    if (st.vote && st.vote.id) {
      var ya = V.voted[st.vote.id];
      after += '<div class="vvote"><div class="qlabel">🗳️ Tu voto es secreto: solo el host ve el resultado</div>' + (ya
        ? '<div class="answer">Votaste por <b>' + escH(ya) + '</b> ✓</div>'
        : '<div class="qrow">' + enMesa.map(function (p) {
            return '<button class="qbtn vvbtn" data-n="' + escH(p.n) + '"><b>' + escH(p.n) + '</b></button>';
          }).join('') + '</div>') + '</div>';
    }
    after += '<div class="vmine"><div class="sumstat"><div class="sn">' + (me.sips || 0) + '</div><div class="sl">' + escH(st.unit || 'sorbos') + '</div></div>' +
      '<div class="sumstat"><div class="sn">' + puesto + '°</div><div class="sl">de ' + ps.length + '</div></div>' +
      '<div class="sumstat"><div class="sn">' + (me.done || 0) + ' / ' + (me.skip || 0) + '</div><div class="sl">hechos / saltados</div></div></div>';
    return { top: html, after: after };
  }
  /* Doble agente en el celular: el tablero para todos, y la clave encima
     solo si este celular es de un jefe de esta partida. */
  function agenteView(st) {
    var ag = st.ag;
    if (!ag) return '';
    var nm = { r: 'Rojo', a: 'Azul' }, em = { r: '🔴', a: '🔵', n: '🙂', x: '💀' };
    var teams = ag.teams || { r: [], a: [] }, jefe = ag.jefe || {};
    var eq = function (k) { return '<div class="agteam" style="--tc:' + (k === 'r' ? '#ff3d7f' : '#59c2ff') + '"><div class="agth">' + (ag.mode === 'coop' ? '🕶️ Equipo' : em[k] + ' ' + nm[k]) + '</div>' +
      asList(teams[k]).map(function (n) { return '<div class="agmem"><span class="agname">' + escH(n) + '</span>' + (n === jefe[k] ? '<span class="agstar on">🔑 jefe</span>' : '') + '</div>' }).join('') + '</div>' };
    var equipos = '<div class="agteams" style="margin:12px 0">' + eq('r') + (ag.mode === 'coop' ? '' : eq('a')) + '</div>';
    if (ag.setup) return '<div class="csub">Armando los equipos…</div>' + equipos;
    var html = '';
    var key = null;
    var mine = V.priv && V.priv.ag;
    if (mine && mine.g === ag.id && mine.key) key = String(mine.key).split(',');
    var shown = String(ag.shown || '').split(',');
    var words = asList(ag.words);
    if (ag.winner) {
      html += '<div class="impcard"><h3>' + (ag.mode === 'coop' ? (ag.winner === 'r' ? '¡Ganaron!' : 'Ganó el rival') : 'Ganó el ' + em[ag.winner] + ' ' + nm[ag.winner]) + '</h3>' +
        '<p class="csub">' + (ag.how === 'assassin' ? 'El asesino 💀 decidió la partida.' : ag.how === 'rival' ? 'El rival encontró todas sus palabras.' : 'Encontraron todas sus palabras.') + '</p></div>';
    } else {
      html += '<div class="agturn" style="--tc:' + (ag.turn === 'r' ? '#ff3d7f' : '#59c2ff') + '">' + (ag.mode === 'coop' ? '🕶️ Turno del equipo' : 'Turno ' + em[ag.turn] + ' ' + nm[ag.turn]) + '</div>';
      if (ag.clue) html += '<div class="agclue on"><div class="agcw">"' + escH(ag.clue.w) + '" · ' + (ag.clue.n === -1 ? '∞' : escH(ag.clue.n)) + '</div><div class="csub">' + (ag.left === -1 ? 'sin tope' : 'quedan ' + escH(ag.left)) + '</div></div>';
      else html += '<div class="csub" style="margin-bottom:8px">Esperando la pista del jefe…</div>';
    }
    if (key) html += '<div class="vtoca" style="animation:none">🔑 Eres jefe: esta es la clave. Que nadie mire tu celular.</div>';
    var rest = ag.rest || {};
    var reloj = !ag.winner && ag.end ? '<span class="agtimer" data-end="' + (+ag.end) + '"></span>' : !ag.winner && ag.pausa ? '<span class="agtimer paused">⏸ en pausa</span>' : '';
    html += '<div class="agcount">' + reloj + (ag.mode === 'coop' ? '<span>🕶️ faltan ' + escH(rest.r) + '</span><span>🤖 rival: ' + escH(rest.a) + '</span>'
      : '<span style="color:#ff3d7f">🔴 ' + escH(rest.r) + '</span><span style="color:#59c2ff">🔵 ' + escH(rest.a) + '</span>') + '</div>';
    html += '<div class="aggrid">' + words.map(function (w, i) {
      var k = /^[ranx]$/.test(shown[i]) ? shown[i] : '';
      var kk = key && /^[ranx]$/.test(key[i]) ? key[i] : '';
      var largo = String(w).length > 8 ? ' largo' : '';
      return '<div class="agcell' + largo + (k ? ' rev k' + k : '') + (!k && kk ? ' key' + kk : '') + '"><span class="agw">' + escH(w) + '</span>' +
        (k ? '<span class="agi">' + em[k] + '</span>' : kk ? '<span class="agi">' + em[kk] + '</span>' : '') + '</div>';
    }).join('') + '</div>';
    return html + equipos;
  }
  function standUpLocal() {
    V.me = null; V.priv = null;
    if (V.privS) { V.privS.close(); V.privS = null }
    var d = mem(); delete d.seat; remember(d);
  }
  function wireViewer(box) {
    box.querySelectorAll('.vseat').forEach(function (b) { b.onclick = function () { sitAs(b.dataset.n) } });
    box.querySelectorAll('.vvbtn').forEach(function (b) { b.onclick = function () { vote(b.dataset.n) } });
  }
  function renderViewer() {
    var box = $('viewbox');
    if (!box) return;
    var st = V.state;
    if (st === undefined) { box.innerHTML = '<div class="emptyhint" style="display:block">Conectando con la partida…</div>'; return }
    if (st === null || typeof st !== 'object') {
      box.innerHTML = '<div class="emptyhint" style="display:block">Esta partida terminó o el código no existe.<br>Pídele al host un QR nuevo.</div>';
      return;
    }
    var edad = st.t ? Date.now() - st.t : 0;
    var lento = edad > STALE_MS;
    var accent = [st.accent, st.mode && st.mode.c].filter(function (c) { return /^#[0-9a-f]{3,8}$/i.test(String(c || '').trim()) })[0];
    document.documentElement.style.setProperty('--accent', accent ? accent.trim() : 'var(--violet)');
    var mine = personal(st, asList(st.players));
    var html = mine.top;
    if (st.view === 'agente' && st.ag) html += agenteView(st);
    if (st.mode && st.mode.nm) html += '<div class="mname vmode">' + escH((st.mode.em ? st.mode.em + ' ' : '') + st.mode.nm) + '</div>';
    var rules = asList(st.rules);
    if (rules.length) html += '<div class="rulesbar">' + rules.map(function (r) { return '<span class="rulechip">📌 ' + escH(r.txt) + ' (' + escH(r.left) + ')</span>' }).join('') + '</div>';
    if (st.card && st.card.text) {
      html += '<div class="gcard vcard">' +
        (st.card.label ? '<span class="ctype">' + escH(st.card.label) + '</span>' : '') +
        '<div class="ctext">' + escH(st.card.text) + '</div>' +
        (st.card.sub ? '<div class="csub">' + escH(st.card.sub) + '</div>' : '') +
        (st.card.ans ? '<div class="answer">' + escH(st.card.ans) + '</div>' : '') +
        '</div>';
    }
    html += mine.after;
    var ps = asList(st.players).slice().sort(function (a, b) { return (b.sips || 0) - (a.sips || 0) });
    // con gráficos, las barras ya son el marcador; la lista queda para cuando no hay
    if (ps.length && !(st.charts && window.Charts)) {
      html += '<div class="vboard"><div class="qlabel">marcador · ' + escH(st.unit || 'sorbos') + '</div><div class="plist">' +
        ps.map(function (p) {
          var c = /^#[0-9a-f]{6}$/i.test(p.c || '') ? p.c : '#8b6cff';
          return '<div class="prow' + (p.out ? ' sleeping' : '') + '"><div class="pav" style="background:' + c + '">' + escH((Array.from(String(p.n || '?'))[0] || '?').toUpperCase()) + '</div>' +
            '<div class="nm">' + escH(p.n) + (p.out ? ' 🛌' : '') + '</div><div class="sipnum">' + (+p.sips || 0) + '</div></div>';
        }).join('') + '</div></div>';
    }
    html += viewerCharts(st, asList(st.players));
    box.innerHTML = html;
    wireViewer(box);
    if (V.race && window.Charts) Charts.attachRace(box, V.race, st.unit);
    var s = $('viewstatus');
    if (s) {
      var conn = V.es && V.es.readyState === 1;
      s.textContent = !conn ? '🟡 Reconectando…' : lento ? '🟠 El host no actualiza ' + ago(edad) + ' (¿bloqueó el celular?)' : '🟢 En vivo';
    }
  }
  function listen() {
    if (V.es) { try { V.es.close() } catch (e) {} }
    var es = new EventSource(roomUrl(V.code));
    V.es = es;
    var on = function (kind) {
      return function (e) {
        var msg; try { msg = JSON.parse(e.data) } catch (x) { return }
        if (!msg) return;
        V.state = applyEvent(V.state === undefined ? null : V.state, kind, msg);
        renderViewer();
      };
    };
    es.addEventListener('put', on('put'));
    es.addEventListener('patch', on('patch'));
    es.addEventListener('cancel', function () { V.state = null; renderViewer() });
    es.onopen = renderViewer;
    es.onerror = function () {
      renderViewer();
      // EventSource reintenta solo, salvo que el servidor la cierre. Si la
      // cerró porque las reglas niegan la sala (vieja o borrada), se avisa
      // que terminó en vez de quedar reintentando para siempre.
      if (es.readyState !== 2) return;
      fetch(roomUrl(V.code)).then(function (r) {
        if (r.status === 401 || r.status === 403) { V.state = null; renderViewer(); return }
        clearTimeout(V.retryT); V.retryT = setTimeout(listen, 5000);
      }, function () { clearTimeout(V.retryT); V.retryT = setTimeout(listen, 5000) });
    };
  }
  function startViewer(code) {
    V.code = code;
    document.body.classList.add('viewing');
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('on') });
    var sc = $('viewer'); if (sc) sc.classList.add('on');
    var c = $('viewcode'); if (c) c.textContent = code;
    // si este celular ya estaba sentado en esta sala, sigue siendo el mismo
    var d = mem();
    if (d.seat && d.seat.code === code) { V.me = { n: d.seat.n, pid: pidOf(d.seat.n) }; watchPriv() }
    var soy = soyFromHash(location.hash);
    V.seatsS = stream('/asientos/' + code, false, function (s) {
      V.seats = s && typeof s === 'object' ? s : {};
      // vino por el QR del jefe: se sienta solo, si el asiento está libre
      if (soy && !V.me) {
        var pid = pidOf(soy), owner = V.seats[pid];
        if (!owner || owner === myUid()) { var n = soy; soy = null; sitAs(n) } else soy = null;
      }
      // el host lo liberó, o lo tomó otro celular
      if (V.me && V.seats[V.me.pid] !== myUid()) standUpLocal();
      renderViewer();
    });
    renderViewer();
    listen();
    V.tick = setInterval(renderViewer, 15000);
    // cuenta regresiva de Doble agente, local en cada celular
    V.clock = setInterval(function () {
      document.querySelectorAll('#viewbox .agtimer[data-end]').forEach(function (el) {
        var s = Math.max(0, Math.ceil((+el.dataset.end - Date.now()) / 1000));
        el.textContent = '⏱ ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        el.classList.toggle('urgent', s <= 10);
      });
    }, 500);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && V.code && (!V.es || V.es.readyState === 2)) listen() });
  }
  function leaveViewer() {
    if (V.es) { try { V.es.close() } catch (e) {} V.es = null }
    if (V.seatsS) { V.seatsS.close(); V.seatsS = null }
    if (V.privS) { V.privS.close(); V.privS = null }
    V.me = null; V.priv = null; V.watch = false;
    clearInterval(V.tick); clearInterval(V.clock); clearTimeout(V.retryT); V.code = null;
    document.body.classList.remove('viewing');
    try { history.replaceState(null, '', location.pathname + location.search) } catch (e) { location.hash = '' }
    if (window.go) window.go('home');
    if (!isHost() && window.showLock) window.showLock();
  }

  /* Arranque: con #ver=CODIGO se abre como espectador; si no, y el host
     venía compartiendo antes de recargar, retoma la misma sala. */
  function boot() {
    var code = codeFromHash(location.hash);
    if (code) { startViewer(code); return }
    var d = mem();
    if (!validCode(d.code)) return;
    // la sala de otra noche no se retoma: se borra y la próxima vez que
    // se comparta sale un código nuevo
    if (!d.codeAt || Date.now() - d.codeAt > ROOM_TTL) { H.code = d.code; stopHost(); return }
    if (isHost()) startHost(d.code);
  }

  api.boot = boot;
  api.touch = touch;
  api.openShare = openShare;
  api.closeShare = closeShare;
  api.copyLink = copyLink;
  api.stopShare = stopShare;
  api.leaveViewer = leaveViewer;
  api.isSharing = function () { return !!H.code };
  api.seatOf = seatOf;
  api.sendImpostor = sendImpostor;
  api.clearImpostor = clearImpostor;
  api.sendKey = sendKey;
  api.releaseSeat = releaseSeat;
  api.isHost = isHost;
  api.unlockHost = unlockHost;
  api.isViewing = function () { return !!V.code };
  api.jefeQR = jefeQR;
  api.pidOf = pidOf;
  api.openVote = openVote;
  api.closeVote = closeVote;
  api._pick = function () { V.watch = false; renderViewer() };
  api._watch = justWatch;
  api._standUp = standUp;
  api._snapshot = snapshot;
  api._viewer = V;
  return api;
});
