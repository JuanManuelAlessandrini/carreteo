const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const L = require('../live.js');

test('los códigos tienen 6 caracteres sin 0, O, 1 ni I', () => {
  let i = 0;
  const seq = [0, 0.99, 0.5, 0.25, 0.75, 0.1];
  const c = L.newCode(() => seq[i++ % seq.length]);
  assert.equal(c.length, 6);
  assert.ok(L.validCode(c));
  for (let k = 0; k < 500; k++) assert.doesNotMatch(L.newCode(), /[01OI]/);
});

test('validCode rechaza lo que no es un código', () => {
  ['', null, 'ABC', 'ABCDEFG', 'abcdef', 'ABCDE0', 'ABCDEI', 'ABC DE'].forEach(c =>
    assert.equal(L.validCode(c), false, String(c)));
  assert.equal(L.validCode('K7Q2AB'), true);
});

test('codeFromHash lee #ver=CODIGO y acepta minúsculas', () => {
  assert.equal(L.codeFromHash('#ver=K7Q2AB'), 'K7Q2AB');
  assert.equal(L.codeFromHash('#ver=k7q2ab'), 'K7Q2AB');
  assert.equal(L.codeFromHash('#ver=K7Q2A0'), null);
  assert.equal(L.codeFromHash('#otra=K7Q2AB'), null);
  assert.equal(L.codeFromHash(''), null);
});

test('el link usa la página actual si es https, y la publicada si no', () => {
  assert.equal(
    L.viewUrl({ protocol: 'https:', origin: 'https://x.github.io', pathname: '/carreteo/index.html' }, 'K7Q2AB'),
    'https://x.github.io/carreteo/index.html#ver=K7Q2AB');
  assert.equal(L.viewUrl({ protocol: 'file:', origin: 'null', pathname: '/c/index.html' }, 'K7Q2AB'),
    L.CFG.site + '#ver=K7Q2AB');
  assert.equal(L.viewUrl({ protocol: 'http:', origin: 'http://localhost:8080', pathname: '/' }, 'K7Q2AB'),
    L.CFG.site + '#ver=K7Q2AB');
});

test('applyEvent: put en la raíz reemplaza todo', () => {
  const s = L.applyEvent({ a: 1 }, 'put', { path: '/', data: { b: 2 } });
  assert.deepEqual(s, { b: 2 });
  assert.equal(L.applyEvent({ a: 1 }, 'put', { path: '/', data: null }), null);
});

test('applyEvent: put en una ruta cambia solo esa parte y no muta', () => {
  const orig = { players: [{ n: 'Ana', sips: 1 }, { n: 'Beto', sips: 0 }], unit: 'sorbos' };
  const s = L.applyEvent(orig, 'put', { path: '/players/1/sips', data: 4 });
  assert.equal(s.players[1].sips, 4);
  assert.equal(s.players[0].sips, 1);
  assert.equal(orig.players[1].sips, 0);
  const sinCarta = L.applyEvent({ card: { text: 'x' }, v: 1 }, 'put', { path: '/card', data: null });
  assert.deepEqual(sinCarta, { v: 1 });
});

test('applyEvent: patch mezcla y borra con null', () => {
  const s = L.applyEvent({ card: { text: 'a', ans: 'b' }, v: 1 }, 'patch', { path: '/card', data: { text: 'c', ans: null } });
  assert.deepEqual(s, { card: { text: 'c' }, v: 1 });
  const vacio = L.applyEvent(null, 'patch', { path: '/', data: { v: 1 } });
  assert.deepEqual(vacio, { v: 1 });
});

test('asList ordena los arreglos que Firebase devuelve como objeto', () => {
  assert.deepEqual(L.asList({ 10: 'k', 2: 'b', 0: 'a' }), ['a', 'b', 'k']);
  assert.deepEqual(L.asList([null, 'a']), ['a']);
  assert.deepEqual(L.asList(undefined), []);
});

test('ago dice cuánto hace', () => {
  assert.equal(L.ago(5000), 'recién');
  assert.equal(L.ago(3 * 60000), 'hace 3 min');
  assert.equal(L.ago(2 * 3600000), 'hace 2 h');
});

test('las reglas de la base aceptan los mismos códigos que genera la app', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8'));
  const sala = rules.rules.salas.$code;
  const re = new RegExp(/matches\(\/(.+?)\/\)/.exec(sala['.validate'])[1]);
  for (let k = 0; k < 200; k++) assert.match(L.newCode(), re);
  assert.match(sala['.write'], /auth\.uid/);
  assert.equal(rules.rules['.read'], undefined, 'la raíz no se puede leer: no se listan las salas');
});

test('pidOf deja cualquier nombre como clave válida de Firebase', () => {
  ['Ana', 'J.P.', 'a$b#c[d]/e', 'José María', '🍺'].forEach(n => {
    const k = L.pidOf(n);
    assert.doesNotMatch(k, /[.$#[\]/]/, n);
    assert.equal(decodeURIComponent(k), n);
  });
  assert.notEqual(L.pidOf('J.P.'), L.pidOf('JP'));
});

test('tally cuenta votos y ordena de más a menos', () => {
  assert.deepEqual(L.tally({ a: 'Beto', b: 'Ana', c: 'Beto', d: 5 }), [{ n: 'Beto', v: 2 }, { n: 'Ana', v: 1 }]);
  assert.deepEqual(L.tally(null), []);
});

test('seatedNames dice quiénes tienen celular', () => {
  const ps = [{ n: 'Ana' }, { n: 'J.P.' }, { n: 'Cata' }];
  assert.deepEqual(L.seatedNames({ [L.pidOf('J.P.')]: 'u1', Ana: 'u2' }, ps), ['Ana', 'J.P.']);
});

test('reglas: lo privado solo lo lee su asiento y los votos solo van a la urna abierta', () => {
  const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8')).rules;
  assert.match(r.privado.$code.$pid['.read'], /asientos.*\$pid.*auth\.uid/);
  assert.equal(r.privado.$code['.read'], undefined, 'nadie lee todos los roles juntos');
  assert.match(r.privado.$code['.write'], /host.*auth\.uid/);
  assert.match(r.votos.$code.$vid['.read'], /host.*auth\.uid/, 'el voto es secreto: solo lo ve el host');
  assert.match(r.votos.$code.$vid.$pid['.write'], /asientos.*\$pid.*auth\.uid/, 'cada uno vota solo por su asiento');
  assert.match(r.votos.$code.$vid.$pid['.validate'], /vote.*id.*\$vid/);
  assert.match(r.asientos.$code.$pid['.write'], /!data\.exists\(\) && newData\.val\(\) === auth\.uid/, 'el primero que llega se queda el asiento');
});

test('reglas: solo quien tiene la clave crea salas, y la clave nunca está en el repo', () => {
  const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8')).rules;
  assert.match(r.salas.$code['.write'], /root\.child\('hosts'\)\.child\(auth\.uid\)\.exists\(\)/);
  const h = r.hosts.$uid['.write'];
  assert.match(h, /\$uid === auth\.uid/, 'cada uno se anota solo a sí mismo');
  assert.match(h, /newData\.val\(\) === '__CLAVE_HOST__'/, 'en el repo va el marcador, la clave real se pone solo en la consola');
  assert.equal(r.hosts['.read'], undefined);
  assert.equal(r.hosts.$uid['.read'], undefined, 'nadie lee la lista de hosts');
});

test('reglas: una sala sin novedades en 12 horas ya no se puede leer', () => {
  const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8')).rules;
  assert.match(r.salas.$code['.read'], /now - 43200000/);
  assert.match(r.asientos.$code['.read'], /now - 43200000/);
  assert.match(r.asientos.$code.$pid['.validate'], /now - 43200000/, 'no se sienta nadie en una sala vieja');
  assert.ok(L.ROOM_TTL <= 12 * 3600 * 1000, 'la app no retoma salas que las reglas ya no sirven');
});
