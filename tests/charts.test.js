const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../charts.js');

const T0 = Date.UTC(2026, 8, 26, 23, 0);
const MIN = 60000;
const ana = { n: 'Ana', sips: 5, c: '#ff3d7f' }, beto = { n: 'Beto', sips: 2, c: '#ffb24d' };

test('los colores de los avatares son los mismos que usa app.js', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const m = /const AVCOLORS=\[([^\]]+)\]/.exec(app);
  assert.deepEqual(m[1].split(',').map(s => s.trim().replace(/'/g, '')), C.AV);
  assert.equal(C.CHART.length, C.AV.length);
});

test('el color sigue al jugador, no a su posición', () => {
  assert.equal(C.chartColor('#FFB24D', 0), C.CHART[1]);
  assert.equal(C.chartColor('#123456', 3), C.CHART[3]);
});

test('race: el último punto es el total real de cada uno', () => {
  const log = [[T0 + 5 * MIN, 'Ana', 3], [T0 + 20 * MIN, 'Beto', 2], [T0 + 30 * MIN, 'Ana', 2]];
  const r = C.race(log, [ana, beto], T0, T0 + 60 * MIN, 12);
  const a = r.series.find(s => s.n === 'Ana'), b = r.series.find(s => s.n === 'Beto');
  assert.equal(a.pts.at(-1)[1], 5);
  assert.equal(b.pts.at(-1)[1], 2);
  assert.equal(a.pts[0][1], 0);
  assert.equal(a.pts.length, 13);
  // a las 23:05 Ana ya tenía 3 y Beto nada
  assert.equal(a.pts[1][1], 3);
  assert.equal(b.pts[1][1], 0);
});

test('race: lo que el log no explica queda como punto de partida', () => {
  const r = C.race([[T0 + 10 * MIN, 'Ana', 1]], [ana], T0, T0 + 20 * MIN, 4);
  assert.equal(r.series[0].pts[0][1], 4);
  assert.equal(r.series[0].pts.at(-1)[1], 5);
});

test('race: los que no han tomado no aparecen', () => {
  const r = C.race([], [{ n: 'Cata', sips: 0 }], T0, T0 + MIN);
  assert.equal(r.series.length, 0);
});

test('rate: solo cuenta la última hora y las correcciones restan', () => {
  const now = T0 + 90 * MIN;
  const log = [[T0, 'Ana', 4], [T0 + 40 * MIN, 'Ana', 3], [T0 + 50 * MIN, 'Ana', -1], [T0 + 80 * MIN, 'Beto', 2]];
  const r = C.rate(log, [ana, beto], now);
  assert.equal(r.find(x => x.n === 'Ana').v, 2);
  assert.equal(r.find(x => x.n === 'Beto').v, 2);
});

test('bars ordena de más a menos, escribe los valores y escapa los nombres', () => {
  const h = C.bars([{ n: 'Ana', v: 2, c: '#000' }, { n: '<b>Beto</b>', v: 7, c: '#000' }, { n: 'Cero', v: 0, c: '#000' }]);
  assert.ok(h.indexOf('&lt;b&gt;Beto') < h.indexOf('Ana'));
  assert.doesNotMatch(h, /<b>Beto/);
  assert.doesNotMatch(h, /Cero/);
  assert.match(h, /chval">7</);
  assert.match(C.bars([]), /chempty/);
});

test('raceSVG dibuja una línea por jugador, sus nombres y la leyenda', () => {
  const r = C.race([[T0 + MIN, 'Ana', 5], [T0 + 2 * MIN, 'Beto', 2]], [ana, beto], T0, T0 + 10 * MIN);
  const svg = C.raceSVG(r);
  assert.equal((svg.match(/class="chline"/g) || []).length, 2);
  assert.match(svg, /Ana 5/);
  assert.match(svg, /chlegend/);
  assert.doesNotMatch(C.raceSVG(C.race([[T0 + MIN, 'Ana', 5]], [ana], T0, T0 + 10 * MIN)), /chlegend/, 'con una sola línea no hace falta leyenda');
});

test('panel arma los tres gráficos', () => {
  const h = C.panel({ log: [[T0 + MIN, 'Ana', 5]], players: [ana, { n: 'Beto', sips: 0 }], t0: T0, now: T0 + 10 * MIN });
  ['Total de la noche', 'La carrera', 'Última hora'].forEach(t => assert.ok(h.includes(t), t));
});
