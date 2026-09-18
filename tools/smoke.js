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

  await run('el pie escrito a mano en index.html no quedó desfasado', () => {
    // renderFootnote() lo reemplaza al cargar, pero el HTML crudo es lo que
    // ve un buscador o alguien sin JS: no puede prometer un número falso.
    const cartas = MODES().reduce((s, m) => s + m.deck.length, 0);
    const modos = MODES().length + ev('SPECIALS').length;
    const crudo = require('fs')
      .readFileSync(require('path').join(ROOT, 'index.html'), 'utf8')
      .match(/id="foot"[^>]*>([^<]*)/);
    if (!crudo) throw new Error('no encontré el pie en index.html');
    const dice = crudo[1];
    const nums = (dice.match(/\d+/g) || []).map(Number);
    if (!nums.includes(cartas) || !nums.includes(modos)) {
      throw new Error('el pie de index.html dice "' + dice.trim() +
        '" pero hay ' + cartas + ' cartas y ' + modos + ' modos');
    }
  });

  await run('jugar 40 turnos en cada modo', async () => {
    let peor = null;
    for (const m of MODES()) {
      if (m.pick) continue;            // Verdad o reto tiene su propio test
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

  await run('bolsa de turnos: reparto parejo entre jugadores', async () => {
    const m = MODES()[0];
    W.startMode(m);
    const conteo = {};
    for (let i = 0; i < 40; i++) {
      const nombre = $('gcard').querySelector('.pj');
      if (nombre) conteo[nombre.textContent] = (conteo[nombre.textContent] || 0) + 1;
      await avanzar(false);
    }
    const veces = Object.values(conteo);
    if (veces.length < 4) throw new Error('solo salieron ' + veces.length + ' jugadores distintos');
    const dif = Math.max(...veces) - Math.min(...veces);
    if (dif > 2) throw new Error('reparto desparejo: ' + JSON.stringify(conteo));
    logs.push('   turnos por jugador: ' + JSON.stringify(conteo));
  });

  await run('chips de intensidad filtran el contenido', async () => {
    const chips = W.document.querySelectorAll('#lvlChips .chip');
    if (chips.length !== 3) throw new Error('no están los 3 chips');
    const hot = MODES().find(m => m.id === 'hot');

    chips[2].click();                       // picante
    if (ev('S').intensity !== 3) throw new Error('el chip picante no aplicó');
    W.startMode(hot);
    const picante = ev('S').allCards.length;

    chips[0].click();                       // suave
    if (ev('S').intensity !== 1) throw new Error('el chip suave no aplicó');
    W.startMode(MODES().find(m => m.id === 'previa'));
    const suave = ev('S').allCards.length;
    if (!suave) throw new Error('el nivel suave dejó Previa sin cartas');

    chips[2].click();
    logs.push('   hot en picante: ' + picante + ' cartas · previa en suave: ' + suave);
  });

  await run('la memoria sobrevive al cierre', () => {
    ev('S').players[0].sips = 7;
    W.save();
    const guardado = JSON.parse(W.localStorage.getItem('carreteo.v2'));
    if (!guardado || guardado.players[0].sips !== 7) throw new Error('no guardó los sorbos');
    if (!('intensity' in guardado) || !('sound' in guardado)) throw new Error('faltan preferencias');
    // simula reabrir: se vacía el estado y se recarga del storage
    ev('S').players = [];
    W.load();
    if (ev('S').players.length !== 4) throw new Error('no recuperó los jugadores');
    if (ev('S').players[0].sips !== 7) throw new Error('no recuperó el marcador');
    logs.push('   recuperados ' + ev('S').players.length + ' jugadores con su marcador');
  });

  await run('partida nueva deja el marcador en cero sin perder jugadores', () => {
    W.newGame();
    const ps = ev('S').players;
    if (ps.length !== 4) throw new Error('perdió jugadores');
    if (ps.some(p => p.sips || p.done || p.skip)) throw new Error('no limpió los contadores');
  });

  await run('se cuentan retos hechos y saltados', async () => {
    W.startMode(MODES()[0]);
    let conNombre = 0;
    for (let i = 0; i < 12; i++) {
      if ($('gcard').querySelector('.pj')) conNombre++;   // solo esas cuentan
      await avanzar(i % 2 === 0);
    }
    const ps = ev('S').players;
    const hechos = ps.reduce((a, p) => a + (p.done || 0), 0);
    const saltados = ps.reduce((a, p) => a + (p.skip || 0), 0);
    if (hechos + saltados !== conNombre) {
      throw new Error('se contaron ' + (hechos + saltados) + ' pero ' + conNombre + ' cartas nombraban a alguien');
    }
    if (!hechos || !saltados) throw new Error('faltó contar hechos o saltados');
    logs.push('   hechos: ' + hechos + ' · saltados: ' + saltados + ' (de ' + conNombre + ' cartas con nombre)');
  });

  await run('el switch de sonido no rompe nada', () => {
    W.toggleSound(); W.toggleSound();
    W.toggleAlcohol(); W.toggleAlcohol();
  });

  await run('premio o castigo: los botones aplican el resultado', async () => {
    const premio = MODES().find(m => m.id === 'premio');
    if (!premio) throw new Error('falta el modo premio');
    W.startMode(premio);

    const total = () => ev('S').players.reduce((a, p) => a + p.sips, 0);
    const antes = total();
    let btns = $('cwidget').querySelectorAll('.wbtn');
    if (btns.length !== 2) throw new Error('no salieron los dos botones de juicio');
    btns[1].click();                                  // falló
    if (!$('cwidget').querySelector('.answer.bad')) throw new Error('no reveló el castigo');
    if (total() <= antes) throw new Error('el castigo no anotó sorbos en el marcador');
    logs.push('   castigo anotó ' + (total() - antes) + ' sorbos');

    await avanzar(false);
    btns = $('cwidget').querySelectorAll('.wbtn');
    if (btns.length !== 2) throw new Error('la segunda carta no trajo botones');
    const antes2 = total();
    btns[0].click();                                  // lo logró
    if (!$('cwidget').querySelector('.answer.good')) throw new Error('no reveló el premio');
    if (total() !== antes2) throw new Error('el premio no debería anotar sorbos solo');
  });

  await run('verdad o reto: elige primero y no repite', async () => {
    const vor = MODES().find(m => m.id === 'vor');
    W.startMode(vor);
    const vistas = [];
    for (let i = 0; i < 16; i++) {
      const btns = $('cwidget').querySelectorAll('.wbtn');
      if (btns.length !== 2) throw new Error('turno ' + i + ': no aparecieron Verdad y Reto');
      if (!/eliges/.test($('gcard').textContent)) throw new Error('turno ' + i + ': no volvió a preguntar');
      btns[i % 2].click();                            // alterna verdad y reto
      const t = $('gcard').querySelector('.ctext').textContent;
      if (/eliges/.test(t)) throw new Error('turno ' + i + ': no sacó carta');
      vistas.push(t);
      await avanzar(false);
    }
    const verdades = vistas.filter((_, i) => i % 2 === 0);
    const retos = vistas.filter((_, i) => i % 2 === 1);
    // no puede no-repetir más cartas de las que tiene el mazo
    const td = ev('TRUTH_DARE');
    const nv = Math.min(verdades.length, td.truths.length);
    const nr = Math.min(retos.length, td.dares.length);
    if (new Set(verdades.slice(0, nv)).size !== nv) throw new Error('se repitió una verdad');
    if (new Set(retos.slice(0, nr)).size !== nr) throw new Error('se repitió un reto');
    logs.push('   ' + nv + ' verdades y ' + nr + ' retos sin repetir (mazos de ' +
      td.truths.length + ' y ' + td.dares.length + ')');
  });

  await run('mix: junta modos y muestra el origen de cada carta', async () => {
    W.openMix();
    const filas = W.document.querySelectorAll('#mixlist .mixrow');
    if (filas.length < 10) throw new Error('la lista trae solo ' + filas.length + ' modos');
    ev('S').mix.length = 0;
    filas[0].click(); filas[1].click(); filas[2].click();
    if (ev('S').mix.length !== 3) throw new Error('no quedaron 3 modos marcados');
    if ($('mixgo').disabled) throw new Error('el botón de jugar sigue bloqueado');

    W.startMix();
    const origenes = new Set();
    const vistas = [];
    for (let i = 0; i < 30; i++) {
      const et = $('gcard').querySelector('.ctype').textContent;
      const partes = et.split('·');
      if (partes.length < 2) throw new Error('la carta no dice de qué modo viene: ' + et);
      origenes.add(partes[partes.length - 1].trim());
      vistas.push($('gcard').querySelector('.ctext').textContent);
      await avanzar(false);
    }
    if (origenes.size < 2) throw new Error('todas las cartas vinieron del mismo modo');
    if (new Set(vistas).size !== vistas.length) throw new Error('el mix repitió una carta');
    logs.push('   mix de ' + origenes.size + ' modos, 30 cartas sin repetir');
  });

  await run('bomba: enciende, hace tic-tac y explota', async () => {
    W.go('bomba');
    if (!$('bombcard')) throw new Error('no se dibujó la bomba');
    W.toggleBomb();
    if (!ev('BOMB').running) throw new Error('no encendió la mecha');
    const cat = $('bombcat').textContent;
    if (!cat || /Toca encender/.test(cat)) throw new Error('no salió una categoría');
    for (let i = 0; i < 80 && ev('BOMB').running; i++) await tick();
    if (ev('BOMB').running) throw new Error('la mecha nunca se acabó');
    if (!/BOOM/.test($('bombcat').textContent)) throw new Error('no mostró la explosión');
    if (!/3/.test($('bombhint').textContent)) throw new Error('no dice cuánto toma el perdedor');
    logs.push('   categoría: ' + cat);
    W.go('modes');
    if (ev('BOMB').t) throw new Error('la mecha quedó corriendo al salir de la pantalla');
  });

  await run('el atras del marcador no queda atrapado en el resumen', () => {
    // board y summary se visitan una desde la otra: si alguna se guardara
    // como pantalla de origen, el atras rebotaria entre las dos y la unica
    // salida seria "Partida nueva", que borra el marcador.
    W.go('home');
    W.go('board');        // 🏆 desde el inicio
    W.go('summary');      // "Terminar la noche"
    W.go('board');        // ← del resumen
    const destino = ev('S').prev || 'home';
    if (destino !== 'home') {
      throw new Error('el atras del marcador lleva a "' + destino + '" en vez de home');
    }
    logs.push('   atras desde el marcador -> ' + destino);
  });

  await run('ningun emoji quedo como codigo en el codigo fuente', () => {
    // La U mayuscula no forma un escape valido en JS: "\U0001F381" se
    // queda como el texto literal U0001F381 y sale asi en pantalla.
    const fs2 = require('fs'), path2 = require('path');
    const roto = /\\U[0-9A-Fa-f]{8}/g;
    const malos = [];
    ['app.js', 'cards.js', 'engine.js', 'index.html', 'sw.js'].forEach(f => {
      const m = fs2.readFileSync(path2.join(ROOT, f), 'utf8').match(roto);
      if (m) malos.push(f + ': ' + [...new Set(m)].join(' '));
    });
    if (malos.length) throw new Error(malos.join(' | '));
  });

  await run('ninguna pantalla muestra codigos de emoji crudos', async () => {
    const sucias = [];
    for (const id of ['home', 'players', 'modes', 'game', 'board', 'summary',
                      'ruleta', 'impostor', 'rey', 'mixpick', 'bomba']) {
      if (!$(id)) continue;
      W.go(id); await tick();
      if (/U000[0-9A-Fa-f]{5}/.test($(id).textContent)) sucias.push(id);
    }
    W.go('modes');   // apaga la mecha de la bomba
    if (sucias.length) throw new Error('pantallas con codigos crudos: ' + sucias.join(', '));
  });

  await run('marcador', () => {
    W.go('board');
    if (!$('blist').children.length) throw new Error('marcador vacío');
  });

  await run('resumen de la noche', () => {
    ev('S').players[0].sips = 12; ev('S').players[0].done = 9;
    ev('S').players[1].sips = 4;  ev('S').players[1].skip = 6;
    ev('S').totalDrawn = 57;
    W.go('summary');
    const t = $('sumbox').textContent;
    if (!$('sumbox').querySelector('.podium')) throw new Error('no dibujó el podio');
    if (!/57/.test(t)) throw new Error('no muestra las cartas jugadas');
    if (!/valiente/i.test(t)) throw new Error('falta el valiente');
    if (!/gallina/i.test(t)) throw new Error('falta el gallina');
    if (!/sorbos/i.test(t)) throw new Error('no dice sorbos');
    // el primero del podio tiene que ser el que más tomó
    const primero = $('sumbox').querySelector('.podium .podnm').textContent;
    if (primero !== ev('S').players[0].n) throw new Error('el podio no está ordenado: ' + primero);
    logs.push('   podio encabezado por ' + primero);
  });

  await run('resumen en modo sin alcohol dice puntos', () => {
    W.setNoAlcohol(true);
    W.go('summary');
    const t = $('sumbox').textContent;
    if (/\bsorbos\b/i.test(t)) throw new Error('quedó "sorbos" en modo sin alcohol');
    if (!/puntos/i.test(t)) throw new Error('no tradujo a puntos');
    W.setNoAlcohol(false);
  });

  await run('resumen sin jugadores no explota', () => {
    const guardados = ev('S').players.slice();
    ev('S').players.length = 0;
    W.go('summary');
    if (!$('sumbox').textContent.trim()) throw new Error('quedó vacío sin mensaje');
    guardados.forEach(p => ev('S').players.push(p));
  });

  await run('PWA: manifest, íconos y service worker declarados', () => {
    const man = W.document.querySelector('link[rel="manifest"]');
    if (!man) throw new Error('falta el <link rel=manifest>');
    if (!W.document.querySelector('link[rel="apple-touch-icon"]')) throw new Error('falta el ícono de iOS');
    const fs2 = require('fs'), path2 = require('path');
    const m = JSON.parse(fs2.readFileSync(path2.join(ROOT, 'manifest.json'), 'utf8'));
    if (m.display !== 'standalone') throw new Error('el manifest no abre en standalone');
    if (!m.icons.some(i => i.purpose === 'maskable')) throw new Error('falta el ícono maskable');
    m.icons.forEach(i => {
      if (!fs2.existsSync(path2.join(ROOT, i.src))) throw new Error('no existe ' + i.src);
    });
    const sw = fs2.readFileSync(path2.join(ROOT, 'sw.js'), 'utf8');
    const ver = sw.match(/CACHE\s*=\s*'([^']+)'/);
    if (!ver) throw new Error('sw.js no declara la versión del cache');
    // todo archivo que la página carga tiene que estar precacheado
    ['index.html', 'cards.js', 'engine.js', 'app.js'].forEach(f => {
      if (!sw.includes(f)) throw new Error('sw.js no precachea ' + f);
    });
    logs.push('   cache: ' + ver[1] + ' · ' + m.icons.length + ' íconos');
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
