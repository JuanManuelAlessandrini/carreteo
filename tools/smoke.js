/* Smoke test de Carreteo con jsdom.
   - Inyecta los <script src> como <script> inline para reproducir la
     semántica real del navegador (los const de nivel superior se
     comparten entre scripts clásicos; window.eval() no hace eso).
   - Acelera los setTimeout para poder simular cientos de turnos:
     nextCard() avanza la carta dentro de un timeout de animación.   */
const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

const ROOT = process.argv[2];
if (!ROOT) { console.error('uso: node smoke.js <ruta del proyecto>'); process.exit(1); }

const errors = [];
const logs = [];
const warns = [];
const stats = [];

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const p = path.join(ROOT, src);
  if (!fs.existsSync(p)) { errors.push('no existe ' + src); return m; }
  logs.push('inyectado ' + src);
  return '<script>\n' + fs.readFileSync(p, 'utf8') + '\n</script>';
});

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.com/',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    win.navigator.vibrate = () => true;
    win.scrollTo = () => {};
    // sin esperas de animación
    const realST = win.setTimeout;
    win.setTimeout = (fn, ms, ...a) => realST(fn, 0, ...a);
    win.HTMLCanvasElement.prototype.getContext = function () {
      return new Proxy({}, { get: (t, k) => (k === 'canvas' ? {} : () => ({ addColorStop() {} })) });
    };
    const audioStub = () => ({
      currentTime: 0, state: 'running', destination: {},
      resume: () => Promise.resolve(),
      createOscillator: () => ({
        connect() {}, start() {}, stop() {}, type: '',
        frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }
      }),
      createGain: () => ({
        connect() {},
        gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }
      })
    });
    win.AudioContext = audioStub;
    win.webkitAudioContext = audioStub;
    win.addEventListener('error', e => errors.push(e.error ? e.error.stack : e.message));
  }
});

const { window: W } = dom;
W.console.error = (...a) => errors.push('console.error: ' + a.join(' '));
const $ = id => W.document.getElementById(id);
/* const/let de nivel superior no son propiedades de window: eval indirecto */
const ev = code => W.eval(code);
const MODES = () => ev('MODES');
const S = () => ev('S');
const tick = () => new Promise(r => setTimeout(r, 0));

async function run(label, fn) {
  try { await fn(); logs.push('OK  ' + label); }
  catch (e) { errors.push(label + ': ' + String(e.stack || e).split('\n').slice(0, 3).join('\n')); }
}

/* avanza una carta esperando la animación */
async function avanzar(saltar) { W.nextCard(!!saltar); await tick(); await tick(); }

(async function () {

  await run('scripts cargados', () => {
    if (!MODES()) throw new Error('cards.js no expuso MODES');
    if (!ev('Engine')) throw new Error('engine.js no expuso Engine');
    if (!W.startMode) throw new Error('app.js no definió startMode');
    logs.push('   modos: ' + MODES().length + ' · cartas: ' + MODES().reduce((a, m) => a + m.deck.length, 0));
  });

  await run('cerrar gate', () => W.closeGate());

  await run('agregar 4 jugadores', () => {
    ['Ana', 'Beto', 'Cata', 'Dani'].forEach(n => { $('pname').value = n; W.addPlayer(); });
    if (S().players.length !== 4) throw new Error('quedaron ' + S().players.length);
  });

  await run('nombre duplicado se rechaza', () => {
    $('pname').value = 'ana'; W.addPlayer();
    if (S().players.length !== 4) throw new Error('aceptó un duplicado');
  });

  await run('pantalla de modos', () => {
    W.go('modes');
    const n = $('mgridCards').children.length + $('mgridSpecial').children.length + $('mgridSeason').children.length;
    if (n < 20) throw new Error('solo ' + n + ' tiles');
    logs.push('   tiles: ' + n);
  });

  await run('pie de página dinámico', () => {
    const t = $('foot').textContent;
    if (/380/.test(t)) throw new Error('el pie quedó con el texto viejo hardcodeado');
    if (!/(\d+) cartas/.test(t)) throw new Error('pie sin conteo: ' + t);
    logs.push('   pie: ' + t.split('·').slice(0, 2).join('·').trim());
  });

  await run('jugar 40 turnos en cada modo', async () => {
    let peor = null;
    for (const m of MODES()) {
      W.startMode(m);
      const vistas = [];
      for (let i = 0; i < 40; i++) {
        const c = S().deck[S().idx];
        if (c == null) throw new Error(m.id + ': carta vacía en el turno ' + i);
        vistas.push(c);
        await avanzar(i % 7 === 0);
      }
      // ¿alguna carta reapareció dentro de la ventana que promete el engine?
      const ventana = ev('Engine').windowSize(m.deck.length);
      let viol = 0;
      for (let i = 0; i < vistas.length; i++) {
        if (ventana > 0 && vistas.slice(Math.max(0, i - ventana), i).includes(vistas[i])) viol++;
      }
      stats.push({ id: m.id, mazo: m.deck.length, ventana, rep: viol });
      if (viol > 0 && (!peor || viol > peor.rep)) peor = { id: m.id, rep: viol, ventana };
    }
    if (peor) warns.push('peor caso: ' + peor.id + ' repitió ' + peor.rep + ' de ' + peor.ventana);
  });

  await run('las reglas activas caducan solas', async () => {
    const previa = MODES().find(m => m.id === 'previa');
    W.startMode(previa);
    for (let i = 0; i < 30; i++) await avanzar(false);
    if (S().rules.length > 6) throw new Error('se acumularon ' + S().rules.length + ' reglas');
  });

  await run('marcador', () => {
    W.go('board');
    if (!$('blist').children.length) throw new Error('marcador vacío');
  });

  await run('ruleta', () => { W.go('ruleta'); W.spin(); });

  await run('impostor', () => {
    W.go('impostor'); W.impStart();
    for (let i = 0; i <= S().players.length; i++) { ev('IMP').i = i; W.impReveal(); }
    W.impRevealImp();
  });

  await run('cuarto rey (baraja completa + reinicio)', () => {
    W.go('rey');
    for (let i = 0; i < 60; i++) W.drawKing();
  });

  await run('modo sin alcohol no deja "sorbo" a la vista', async () => {
    W.setNoAlcohol(true);
    for (const m of MODES()) {
      W.startMode(m);
      for (let i = 0; i < 12; i++) {
        const txt = $('gcard').textContent;
        if (/\bsorbos?\b/i.test(txt)) throw new Error(m.id + ' → ' + txt.slice(0, 140));
        await avanzar(false);
      }
    }
    W.setNoAlcohol(false);
  });

  console.log(logs.join('\n'));

  if (stats.length) {
    const malos = stats.filter(s => s.rep > 0);
    console.log('\n── repeticiones dentro de la ventana ──');
    console.log('  40 turnos por modo · modos limpios: ' + (stats.length - malos.length) + '/' + stats.length);
    malos.forEach(s => console.log('  ⚠ ' + s.id + ': ' + s.rep + ' repeticiones dentro de su ventana de ' + s.ventana + ' (mazo ' + s.mazo + ', 40 turnos)'));
  }
  if (warns.length) console.log('\n' + warns.map(w => '⚠ ' + w).join('\n'));
  if (errors.length) {
    console.log('\n===== ERRORES (' + errors.length + ') =====');
    console.log([...new Set(errors)].join('\n---\n'));
    process.exit(1);
  }
  console.log('\n✅ smoke test sin errores');
})();
