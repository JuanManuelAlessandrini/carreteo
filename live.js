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

  /* ---------- parte pura ---------- */
  function newCode(rng) {
    rng = rng || Math.random;
    var s = '';
    for (var i = 0; i < 6; i++) s += ALFA[Math.floor(rng() * ALFA.length)];
    return s;
  }
  function validCode(c) { return CODE_RE.test(String(c || '')) }
  function codeFromHash(hash) {
    var m = /^#ver=([A-Za-z0-9]{6})$/.exec(String(hash || ''));
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

  var api = {
    CFG: CFG, newCode: newCode, validCode: validCode, codeFromHash: codeFromHash,
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
  function token() {
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
  function roomUrl(code, tok) {
    return CFG.db + '/salas/' + code + '.json' + (tok ? '?auth=' + encodeURIComponent(tok) : '');
  }

  /* ---------- foto del juego ----------
     Se arma leyendo lo que el host tiene en pantalla, así lo que ven los
     demás es exactamente lo mismo, con nombres y "sorbos"/"puntos". */
  var VIEWS = { home: '🏠 En el inicio', players: '👥 Armando la mesa', modes: '🃏 Eligiendo modo', board: '🏆 Mirando el marcador', summary: '🌙 Terminando la noche', ruleta: '🎡 Ruleta', impostor: '🕵️ Impostor', rey: '👑 Cuarto rey', mixpick: '🎛️ Armando un mix', bomba: '💣 La bomba' };
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
      players: St ? St.players.slice(0, 30).map(function (p) { return { n: p.n, sips: p.sips || 0, out: !!p.out, c: p.c } }) : [],
      unit: St && St.noAlcohol ? 'puntos' : 'sorbos'
    };
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
      setStatus('err');
      clearTimeout(H.retryT);
      H.retryT = setTimeout(publish, 10000);
    }).then(function () {
      H.busy = false;
      if (H.dirty) touch();
    });
  }
  /* Espera fija desde el primer cambio, sin reiniciarla con cada cambio
     nuevo: la bomba y los cronómetros tocan la pantalla seguido y con un
     debounce clásico la foto no saldría nunca. */
  function touch() {
    if (!H.code || H.debT) return;
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
  function startHost(code) {
    var d = mem();
    H.uid = d.uid || null; H.refresh = d.refresh || null;
    H.code = code; d.code = code; remember(d);
    setStatus('wait'); observe(); publish();
    if (H.wired) return;
    H.wired = true;
    // si el celular estuvo bloqueado, al volver se manda la foto al tiro
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { H.last = ''; touch() } });
    window.addEventListener('online', function () { H.last = ''; touch() });
  }
  function stopHost() {
    var code = H.code;
    H.code = null; H.last = '';
    clearTimeout(H.retryT); clearTimeout(H.debT); H.debT = null;
    if (H.obs) { H.obs.disconnect(); H.obs = null }
    var d = mem(); delete d.code; remember(d);
    setStatus('off');
    if (code) token().then(function (tok) { return fetch(roomUrl(code, tok), { method: 'DELETE' }) }).catch(function () {});
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
    if (!H.code) startHost(newCode());
    var url = viewUrl(location, H.code);
    $('livecode').textContent = H.code;
    $('livelink').value = url;
    drawQR(url);
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
  var V = { code: null, state: undefined, es: null, tick: null, retryT: null };
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
    var html = '';
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
    var ps = asList(st.players).slice().sort(function (a, b) { return (b.sips || 0) - (a.sips || 0) });
    if (ps.length) {
      html += '<div class="vboard"><div class="qlabel">marcador · ' + escH(st.unit || 'sorbos') + '</div><div class="plist">' +
        ps.map(function (p) {
          var c = /^#[0-9a-f]{6}$/i.test(p.c || '') ? p.c : '#8b6cff';
          return '<div class="prow' + (p.out ? ' sleeping' : '') + '"><div class="pav" style="background:' + c + '">' + escH((Array.from(String(p.n || '?'))[0] || '?').toUpperCase()) + '</div>' +
            '<div class="nm">' + escH(p.n) + (p.out ? ' 🛌' : '') + '</div><div class="sipnum">' + (+p.sips || 0) + '</div></div>';
        }).join('') + '</div></div>';
    }
    box.innerHTML = html;
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
      // EventSource reintenta solo, salvo que el servidor la cierre
      if (es.readyState === 2) { clearTimeout(V.retryT); V.retryT = setTimeout(listen, 5000) }
    };
  }
  function startViewer(code) {
    V.code = code;
    document.body.classList.add('viewing');
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('on') });
    var sc = $('viewer'); if (sc) sc.classList.add('on');
    var c = $('viewcode'); if (c) c.textContent = code;
    renderViewer();
    listen();
    V.tick = setInterval(renderViewer, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && V.code && (!V.es || V.es.readyState === 2)) listen() });
  }
  function leaveViewer() {
    if (V.es) { try { V.es.close() } catch (e) {} V.es = null }
    clearInterval(V.tick); clearTimeout(V.retryT); V.code = null;
    document.body.classList.remove('viewing');
    try { history.replaceState(null, '', location.pathname + location.search) } catch (e) { location.hash = '' }
    if (window.go) window.go('home');
  }

  /* Arranque: con #ver=CODIGO se abre como espectador; si no, y el host
     venía compartiendo antes de recargar, retoma la misma sala. */
  function boot() {
    var code = codeFromHash(location.hash);
    if (code) { startViewer(code); return }
    var d = mem();
    if (validCode(d.code)) startHost(d.code);
  }

  api.boot = boot;
  api.touch = touch;
  api.openShare = openShare;
  api.closeShare = closeShare;
  api.copyLink = copyLink;
  api.stopShare = stopShare;
  api.leaveViewer = leaveViewer;
  api.isSharing = function () { return !!H.code };
  api._snapshot = snapshot;
  api._viewer = V;
  return api;
});
