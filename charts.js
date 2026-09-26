/* =========================================================
   CARRETEO · charts.js
   Gráficos del marcador: barras por jugador, la carrera de la noche
   (sorbos acumulados en el tiempo) y el ritmo de la última hora.

   Los cálculos y el SVG son texto puro, sin DOM, para probarlos con node
   y para que el celular que mira dibuje lo mismo que el host. Lo único
   que toca el DOM es el tooltip de la carrera (attachRace).

   Colores: los de los avatares son muy claros para marcas sobre el fondo
   oscuro, así que cada uno tiene su versión para gráficos, del mismo
   tono, validada como paleta (banda de luminosidad, daltonismo y
   contraste sobre #17131f y #221c30).
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Charts = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var AV = ['#ff3d7f', '#ffb24d', '#8b6cff', '#59c2ff', '#34d399', '#f472b6', '#facc15', '#7dd3fc'];
  var CHART = ['#ed2671', '#ca8203', '#7653e4', '#2396d1', '#09976a', '#dd5da2', '#b29005', '#0b7398'];
  var HOUR = 3600 * 1000;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  /* el color sigue al jugador, nunca a su posición en el ranking */
  function chartColor(c, i) {
    var k = AV.indexOf(String(c || '').toLowerCase());
    return CHART[k >= 0 ? k : (i || 0) % CHART.length];
  }
  function hhmm(t) {
    var d = new Date(t);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* log: [[t, nombre, delta], ...]. Los sorbos actuales del jugador mandan:
     lo que el log no explica (partidas de antes del log, o un log recortado)
     queda como punto de partida. */
  function race(log, players, t0, now, maxPts) {
    maxPts = maxPts || 40;
    log = (log || []).filter(function (e) { return e && e[0] <= now });
    var first = log.length ? log[0][0] : now;
    t0 = Math.min(t0 || first, first);
    var span = Math.max(now - t0, 60000);
    var series = players.map(function (p, i) {
      var ev = log.filter(function (e) { return e[1] === p.n });
      var sum = ev.reduce(function (s, e) { return s + e[2] }, 0);
      var base = (p.sips || 0) - sum;
      // el valor al final de cada tramo; así el último punto es el total real
      var pts = [], k = 0, acc = base;
      for (var b = 0; b <= maxPts; b++) {
        var tb = t0 + span * b / maxPts;
        while (k < ev.length && ev[k][0] <= tb) acc += ev[k++][2];
        pts.push([Math.round(tb), Math.max(0, acc)]);
      }
      return { n: p.n, c: chartColor(p.c, i), out: !!p.out, pts: pts };
    }).filter(function (s) { return s.pts[s.pts.length - 1][1] > 0 || s.pts.some(function (q) { return q[1] > 0 }) });
    return { t0: t0, t1: t0 + span, series: series };
  }

  /* sorbos netos de cada uno en la última hora (las correcciones con − restan) */
  function rate(log, players, now) {
    return players.map(function (p, i) {
      var v = (log || []).reduce(function (s, e) { return e[1] === p.n && e[0] > now - HOUR && e[0] <= now ? s + e[2] : s }, 0);
      return { n: p.n, c: chartColor(p.c, i), v: Math.max(0, v), out: !!p.out };
    });
  }

  /* ---------- barras horizontales ----------
     HTML y no SVG: los nombres largos se cortan con elipsis y el valor va
     escrito al lado de cada barra, así no hace falta leyenda. */
  function bars(items, opts) {
    opts = opts || {};
    var rows = items.filter(function (x) { return (x.v || 0) > 0 }).sort(function (a, b) { return b.v - a.v });
    if (!rows.length) return '<div class="chempty">' + esc(opts.empty || 'Todavía nadie suma nada.') + '</div>';
    var max = rows[0].v;
    return '<div class="chbars" role="list">' + rows.map(function (x) {
      var w = Math.max(2, Math.round(x.v / max * 100));
      var lab = x.n + ': ' + x.v + ' ' + (opts.unit || 'sorbos');
      return '<div class="chrow' + (x.out ? ' chout' : '') + '" role="listitem" title="' + esc(lab) + '" aria-label="' + esc(lab) + '">' +
        '<span class="chname">' + esc(x.n) + '</span>' +
        '<span class="chtrack"><span class="chbar" style="width:' + w + '%;background:' + x.c + '"></span></span>' +
        '<span class="chval">' + x.v + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---------- la carrera ---------- */
  var W = 340, H = 200, PAD = { l: 30, r: 64, t: 10, b: 24 };
  function niceMax(v) {
    if (v <= 5) return 5;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var m = [1, 2, 2.5, 5, 10].map(function (k) { return k * p }).filter(function (x) { return x >= v })[0];
    return m;
  }
  function raceSVG(r, opts) {
    opts = opts || {};
    if (!r.series.length) return '<div class="chempty">' + esc(opts.empty || 'La carrera parte con el primer sorbo.') + '</div>';
    var top = niceMax(Math.max.apply(null, r.series.map(function (s) { return s.pts[s.pts.length - 1][1] })));
    var iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    var x = function (t) { return PAD.l + (t - r.t0) / (r.t1 - r.t0) * iw };
    var y = function (v) { return PAD.t + ih - v / top * ih };
    var out = '<svg class="chrace" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc('Sorbos acumulados en el tiempo: ' + r.series.map(function (s) { return s.n + ' ' + s.pts[s.pts.length - 1][1] }).join(', ')) + '">';
    // grilla y ejes, recesivos
    [0, 0.5, 1].forEach(function (f) {
      var v = Math.round(top * f), yy = y(v).toFixed(1);
      out += '<line class="chgrid" x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + yy + '" y2="' + yy + '"/>' +
        '<text class="chaxis" x="' + (PAD.l - 6) + '" y="' + yy + '" dy="0.32em" text-anchor="end">' + v + '</text>';
    });
    out += '<text class="chaxis" x="' + PAD.l + '" y="' + (H - 6) + '">' + hhmm(r.t0) + '</text>' +
      '<text class="chaxis" x="' + (W - PAD.r) + '" y="' + (H - 6) + '" text-anchor="end">' + hhmm(r.t1) + '</text>';
    // líneas en escalera: los sorbos llegan de golpe, no de a poco
    r.series.forEach(function (s) {
      var d = s.pts.map(function (q, i) {
        var px = x(q[0]).toFixed(1), py = y(q[1]).toFixed(1);
        return i ? 'H' + px + 'V' + py : 'M' + px + ' ' + py;
      }).join('');
      out += '<path class="chline" d="' + d + '" stroke="' + s.c + '"' + (s.out ? ' stroke-dasharray="4 3"' : '') + '/>';
    });
    // nombre al final de cada línea, separados para que no se pisen
    var labs = r.series.map(function (s) { var v = s.pts[s.pts.length - 1][1]; return { s: s, v: v, y: y(v) } })
      .sort(function (a, b) { return a.y - b.y });
    for (var i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 12) labs[i].y = labs[i - 1].y + 12;
    var over = labs.length ? labs[labs.length - 1].y - (H - PAD.b) : 0;
    if (over > 0) labs.forEach(function (l) { l.y -= over });
    labs.forEach(function (l) {
      out += '<circle cx="' + x(r.t1).toFixed(1) + '" cy="' + y(l.v).toFixed(1) + '" r="4" fill="' + l.s.c + '" class="chdot"/>' +
        '<text class="chlab" x="' + (x(r.t1) + 8).toFixed(1) + '" y="' + l.y.toFixed(1) + '" dy="0.32em">' +
        esc(l.s.n.length > 8 ? l.s.n.slice(0, 7) + '…' : l.s.n) + ' ' + l.v + '</text>';
    });
    out += '<line class="chcross" x1="0" x2="0" y1="' + PAD.t + '" y2="' + (H - PAD.b) + '" style="display:none"/>';
    out += '</svg>';
    if (r.series.length >= 2) {
      out += '<div class="chlegend">' + r.series.map(function (s) {
        return '<span><i style="background:' + s.c + '"></i>' + esc(s.n) + (s.out ? ' 🛌' : '') + '</span>';
      }).join('') + '</div>';
    }
    return '<div class="chracewrap">' + out + '<div class="chtip" role="status" aria-live="polite" hidden></div></div>';
  }

  /* Los tres juntos, como aparecen en el marcador, el resumen y la vista
     en vivo. data = {log, players, t0, now, unit} */
  function panel(data) {
    var unit = data.unit || 'sorbos';
    var ps = data.players || [];
    var total = ps.map(function (p, i) { return { n: p.n, c: chartColor(p.c, i), v: p.sips || 0, out: !!p.out } });
    var r = data.race || race(data.log, ps, data.t0, data.now);
    var rt = data.rate || rate(data.log, ps, data.now);
    return '<div class="charts">' +
      '<section class="chsec"><h3>Total de la noche</h3>' + bars(total, { unit: unit }) + '</section>' +
      '<section class="chsec"><h3>La carrera</h3>' + raceSVG(r) + '</section>' +
      '<section class="chsec"><h3>Última hora</h3>' + bars(rt, { unit: unit, empty: 'Nadie ha tomado en la última hora.' }) +
      '<p class="chnote">Si alguien va muy arriba, ofrécele agua 💧</p></section>' +
      '</div>';
  }

  /* Tooltip de la carrera: tocar o pasar el dedo muestra una línea y los
     valores de cada uno en ese momento. */
  function attachRace(root, r, unit) {
    if (!root || !r || !r.series.length) return;
    var svg = root.querySelector('.chrace'), tip = root.querySelector('.chtip'), cross = root.querySelector('.chcross');
    if (!svg || !tip) return;
    var iw = W - PAD.l - PAD.r;
    function show(ev) {
      var box = svg.getBoundingClientRect();
      if (!box.width) return;
      var cx = (ev.clientX - box.left) / box.width * W;
      var f = Math.min(1, Math.max(0, (cx - PAD.l) / iw));
      var t = r.t0 + f * (r.t1 - r.t0);
      var idx = Math.round(f * (r.series[0].pts.length - 1));
      cross.setAttribute('x1', PAD.l + f * iw); cross.setAttribute('x2', PAD.l + f * iw);
      cross.style.display = '';
      var rows = r.series.map(function (s) { return { s: s, v: s.pts[idx][1] } }).sort(function (a, b) { return b.v - a.v });
      tip.innerHTML = '<b>' + hhmm(t) + '</b>' + rows.map(function (q) {
        return '<span><i style="background:' + q.s.c + '"></i>' + esc(q.s.n) + ' ' + q.v + '</span>';
      }).join('');
      // el cuadro va al lado contrario del dedo para no tapar lo que se mira
      tip.style.left = f < 0.5 ? 'auto' : '0';
      tip.style.right = f < 0.5 ? '0' : 'auto';
      tip.hidden = false;
    }
    function hide() { tip.hidden = true; cross.style.display = 'none' }
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' || e.buttons) show(e) });
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') setTimeout(hide, 1800) });
  }

  return { AV: AV, CHART: CHART, chartColor: chartColor, race: race, rate: rate, bars: bars, raceSVG: raceSVG, panel: panel, attachRace: attachRace, hhmm: hhmm };
});
