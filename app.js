/* =========================================================
   CARRETEO · app.js
   Pantallas, estado y todo lo que toca el DOM.
   Barajar, repartir turnos y filtrar vive en engine.js.
   ========================================================= */
const $=id=>document.getElementById(id);
const E=window.Engine;

/* atajos: el resto del archivo se lee igual que en la v1 */
const rnd=a=>E.rnd(a);
const shuffle=a=>E.shuffle(a);
const parseCard=s=>E.parseCard(s);
const adapt=t=>E.adapt(t,S.noAlcohol);

const S={
  /* se guarda entre sesiones */
  players:[], noAlcohol:false, intensity:3, sound:true, mix:[], startedAt:0, totalDrawn:0,
  log:[],      // [hora, nombre, sorbos] de cada anotación, para los gráficos
  /* solo de esta sesión */
  mode:null, deck:[], allCards:[], idx:0, rules:[], prev:'home', drawn:0,
  kings:[], kingCount:0, timer:null,
  recent:{},   // cartas ya vistas por modo, para no repetir
  bag:{}       // bolsa de turnos por modo, para repartir parejo
};

const AVCOLORS=['#ff3d7f','#ffb24d','#8b6cff','#59c2ff','#34d399','#f472b6','#facc15','#7dd3fc'];
const LVL_NM={1:'Suave',2:'Medio',3:'Picante'};
const TRIVIA_SEGS=20;   // segundos para responder una carta con respuesta

/* Los switch se declaran con role="switch", asi que el estado visual no
   alcanza: un lector de pantalla lee aria-checked, no la clase. */
function setSwitch(id,v){
  const e=$(id);
  if(!e) return;
  e.classList.toggle('on',!!v);
  e.setAttribute('aria-checked',v?'true':'false');
}

/* Primera letra del nombre. Array.from respeta los emoji: con n[0] se
   parte el par surrogate y sale el rombo de caracter invalido. */
function inicial(n){ return (Array.from(String(n||'?'))[0]||'?').toUpperCase() }

/* Los que se fueron a acostar siguen en S.players con su marcador, pero ya no
   participan: no salen sorteados, no entran en la ronda de la bomba y no
   toman cuando la carta dice "todos". Todo lo que reparte juego usa esta
   lista; el marcador y el resumen usan S.players entera. */
function enJuego(){ return S.players.filter(p=>!p.out) }
function hora(ts){
  const d=new Date(ts||0);
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}

/* ---------- memoria ----------
   Jugadores, marcador y preferencias sobreviven al cierre.
   El historial de cartas no: cada fiesta parte con el mazo limpio.
-------------------------------*/
const SKEY='carreteo.v2';
/* Historial para los gráficos. En vez de tocar cada lugar que suma
   sorbos (cartas, ruleta, bomba, marcador, premio o castigo...), save()
   compara con lo último que vio y anota la diferencia. */
const LOG_CAP=2000;
let lastSips=null;
function trackSips(){
  if(!lastSips){ lastSips={}; S.players.forEach(p=>lastSips[p.n]=p.sips||0); return }
  const now=Date.now();
  S.players.forEach(p=>{
    const d=(p.sips||0)-(lastSips[p.n]||0);
    if(d) S.log.push([now,p.n,d]);
    lastSips[p.n]=p.sips||0;
  });
  // recortar no rompe los gráficos: lo que el log no explica queda como
  // punto de partida de cada uno
  if(S.log.length>LOG_CAP) S.log=S.log.slice(-LOG_CAP);
}
function resetLog(){ S.log=[]; lastSips=null }
function save(){
  trackSips();
  try{
    localStorage.setItem(SKEY,JSON.stringify({
      players:S.players, noAlcohol:S.noAlcohol, intensity:S.intensity,
      sound:S.sound, mix:S.mix, startedAt:S.startedAt, totalDrawn:S.totalDrawn, log:S.log
    }));
  }catch(e){/* modo incógnito o storage lleno: se juega igual */}
  // si se está compartiendo en vivo, los que miran se enteran del cambio
  if(window.Live&&Live.touch) Live.touch();
}
function load(){
  try{
    const raw=localStorage.getItem(SKEY);
    if(!raw) return;
    const d=JSON.parse(raw)||{};
    if(Array.isArray(d.players)){
      S.players=d.players.filter(p=>p&&p.n).map((p,i)=>({
        n:String(p.n).slice(0,16), sips:+p.sips||0, done:+p.done||0, skip:+p.skip||0,
        out:+p.out||0,                      // hora en que se fue a acostar
        // el color entra a un atributo style: si no se valida, un
        // localStorage manipulado puede inyectar atributos
        c:/^#[0-9a-f]{6}$/i.test(p.c||'')?p.c:AVCOLORS[i%AVCOLORS.length]
      }));
    }
    S.noAlcohol=!!d.noAlcohol;
    S.intensity=[1,2,3].indexOf(d.intensity)>=0?d.intensity:3;
    S.sound=d.sound!==false;
    S.mix=Array.isArray(d.mix)?d.mix:[];
    S.startedAt=+d.startedAt||0;
    S.totalDrawn=+d.totalDrawn||0;
    S.log=Array.isArray(d.log)?d.log.filter(e=>Array.isArray(e)&&typeof e[0]==='number'&&typeof e[1]==='string'&&typeof e[2]==='number').slice(-LOG_CAP):[];
    // Si paso medio dia, es otra fiesta: sin esto el resumen de la noche
    // siguiente dice "168 h de carrete" con las cartas acumuladas.
    if(S.startedAt&&Date.now()-S.startedAt>8*3600*1000){ S.startedAt=0;S.totalDrawn=0;S.log=[] }
  }catch(e){/* datos corruptos: se empieza de cero */}
}

/* ---------- sonido y vibración ----------
   Sintetizado con WebAudio: ni un archivo de audio que cargar.
   El contexto se crea al primer toque (política de autoplay).
------------------------------------------*/
const sfx=(function(){
  let ctx=null;
  function ac(){
    if(!S.sound) return null;
    try{
      if(!ctx) ctx=new (window.AudioContext||window.webkitAudioContext)();
      if(ctx.state==='suspended') ctx.resume();
      return ctx;
    }catch(e){ return null }
  }
  function tone(freq,dur,type,vol,slideTo){
    const c=ac(); if(!c) return;
    try{
      const o=c.createOscillator(), g=c.createGain();
      o.type=type||'sine';
      o.frequency.setValueAtTime(freq,c.currentTime);
      if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo,c.currentTime+dur);
      g.gain.setValueAtTime(vol==null?.2:vol,c.currentTime);
      g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime+dur);
    }catch(e){}
  }
  return {
    card(){ tone(300,.11,'triangle',.10,520) },
    tap(){ tone(660,.05,'sine',.08) },
    tick(hi){ tone(hi?1100:820,.035,'square',.07) },
    timeUp(){ tone(740,.55,'sine',.25) },
    boom(){ tone(110,.8,'sawtooth',.3,28); tone(240,.35,'square',.18,60) },
    spin(){ tone(380,.6,'sine',.13,880) },
    win(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,.22,'triangle',.16),i*100)) },
    bad(){ tone(210,.32,'square',.18,90) }
  };
})();
function vib(p){ try{ if(S.sound&&navigator.vibrate) navigator.vibrate(p) }catch(e){} }
/* ---------- navegación ---------- */
function go(id){
  const cur=document.querySelector('.screen.on');
  // board y summary son pantallas de paso: si se guardaran como origen,
  // el boton atras quedaria rebotando entre las dos sin salida.
  if(cur&&cur.id!=='board'&&cur.id!=='summary') S.prev=cur.id;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));
  $(id).classList.add('on');
  if(id==='players') renderPlayers();
  if(id==='modes') renderModes();
  if(id==='board') renderBoard();
  if(id==='summary'){
    renderSummary();
    // terminar la noche cierra la sala en vivo: el QR de hoy deja de servir
    if(window.Live&&Live.isSharing()&&confirm('¿Cerrar la sala en vivo? Los demás dejan de ver la partida y el QR deja de servir.')) Live.stopShare();
  }
  if(id==='ruleta') initWheel();
  if(id==='impostor') impSetup();
  if(id==='rey') initKing();
  if(id==='dealer') initDealer();
  if(id==='agente') initAgente(); else if(typeof AG!=='undefined') agPause();
  // Salir de la pantalla apaga la mecha a propósito: si siguiera corriendo,
  // explotaría en una pantalla que nadie está mirando. Se avisa para que no
  // parezca que se perdió sola.
  if(id==='bomba') initBomb();
  else { if(BOMB.running) toast('Mecha apagada al salir'); clearBomb() }
}
function closeGate(){$('gate').style.display='none'}
/* ---------- candado de host ----------
   Sin la clave de host, la app solo sirve para mirar una partida con el QR
   de alguien. La clave se comprueba contra Firebase una vez por celular. */
function showLock(){ const l=$('lock'); if(l) l.style.display='flex' }
function tryUnlock(){
  const i=$('lockkey'), b=$('lockbtn'), m=$('lockmsg');
  if(!i.value.trim()){ m.textContent='Escribe la clave'; return }
  b.disabled=true; m.textContent='Revisando…';
  Live.unlockHost(i.value).then(()=>{
    $('lock').style.display='none'; i.value=''; toast('Listo: este celular es host 🔓');
  },e=>{
    b.disabled=false;
    m.textContent=/clave/.test(e.message)?'Clave incorrecta':'No se pudo revisar: necesitas internet la primera vez';
  });
}
function toast(m){
  const t=$('toast');
  // el aviso de version nueva deja el toast clickeable y con onclick.
  // Si no se limpia aqui, queda invisible pero recargando la pagina
  // al tocarlo, justo encima de los botones del juego.
  t.onclick=null;t.style.pointerEvents='none';
  t.textContent=m;t.classList.add('show');
  clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove('show'),2200);
}

/* ---------- preferencias ---------- */
function setNoAlcohol(v){
  S.noAlcohol=v;
  setSwitch('alcoSwitch',v);
  save();
  toast(v?'Modo sin alcohol: sorbos → puntos, shots → prendas 🧃':'Modo con alcohol activado 🍺 Con moderación.');
}
function setIntensity(l){
  S.intensity=l; renderChips(); save(); sfx.tap();
  toast(`Intensidad: ${LVL_NM[l]} ${l===1?'😇':l===2?'😏':'🌶️'}`);
}
function setSound(v){
  S.sound=v; setSwitch('sndSwitch',v); save();
  if(v){ sfx.tap(); vib(15) }
}
function toggleAlcohol(){ setNoAlcohol(!S.noAlcohol) }
function toggleSound(){ setSound(!S.sound) }
function renderChips(){
  document.querySelectorAll('#lvlChips .chip').forEach(b=>{
    b.classList.toggle('on',+b.dataset.l===S.intensity);
  });
}

/* ---------- jugadores ---------- */
function addPlayer(){
  const i=$('pname'),n=i.value.trim();
  if(!n) return;
  const ya=S.players.findIndex(p=>p.n.toLowerCase()===n.toLowerCase());
  if(ya>=0){
    // Si se había ido a acostar y vuelve, lo natural es escribir su nombre de
    // nuevo: se despierta con su marcador en vez de rebotar por duplicado.
    if(S.players[ya].out){ i.value=''; i.focus(); despertar(ya); return }
    toast('Ese nombre ya está'); return;
  }
  S.players.push({n,sips:0,done:0,skip:0,out:0,c:AVCOLORS[S.players.length%AVCOLORS.length]});
  if(!S.startedAt) S.startedAt=Date.now();
  S.bag={};                       // cambió el grupo: se rearma el reparto de turnos
  i.value='';i.focus();
  renderPlayers(); save(); sfx.tap();
}
/* Sacar a alguien de la lista significa que se fue a acostar: conserva sus
   sorbos y queda en el resumen con la hora. El borrado de verdad esta en la
   seccion de los dormidos, por si el nombre habia quedado mal escrito. */
function aDormir(i){
  const p=S.players[i]; if(!p||p.out) return;
  p.out=Date.now(); S.bag={};              // cambio la mesa: se rearma el reparto
  renderPlayers(); save(); sfx.tap(); vib(15);
  toast(`${p.n} se fue a acostar 🛌`);
}
function despertar(i){
  const p=S.players[i]; if(!p||!p.out) return;
  p.out=0; S.bag={};
  renderPlayers(); save(); sfx.tap();
  toast(`${p.n} volvio 🎉`);
}
function borrarJugador(i){
  const p=S.players[i]; if(!p) return;
  S.players.splice(i,1); S.bag={};
  renderPlayers(); save();
  toast(`${p.n} borrado de la lista`);
}
const delPlayer=aDormir;   // nombre viejo, por si quedo alguna referencia
function newGame(){
  S.players.forEach(p=>{p.sips=0;p.done=0;p.skip=0;p.out=0});   // vuelven todos
  S.recent={}; S.bag={}; S.startedAt=Date.now(); S.totalDrawn=0; resetLog();
  if(window.Live&&Live.isSharing()) Live.stopShare();   // partida nueva, sala nueva
  renderPlayers(); save();
  toast('Partida nueva: marcador en cero, mismos jugadores 🔄');
}
function clearAll(){
  if(!confirm('¿Borrar los jugadores y el marcador guardados?')) return;
  S.players=[]; S.recent={}; S.bag={}; S.startedAt=0; S.totalDrawn=0; resetLog();
  try{ localStorage.removeItem(SKEY) }catch(e){}
  renderPlayers();
  toast('Todo borrado');
}
function renderPlayers(){
  const L=$('plist');L.innerHTML='';
  const despiertos=[],dormidos=[];
  S.players.forEach((p,i)=>(p.out?dormidos:despiertos).push({p,i}));

  despiertos.forEach(({p,i})=>{
    const d=document.createElement('div');d.className='prow';
    d.innerHTML=`<div class="pav" style="background:${p.c}">${esc(inicial(p.n))}</div><div class="nm">${esc(p.n)}</div><button class="del" onclick="aDormir(${i})" aria-label="${esc(p.n)} se fue a acostar">🛌</button>`;
    L.appendChild(d);
  });

  if(dormidos.length){
    const t=document.createElement('div');t.className='sect sleep';
    t.textContent='Se fueron a acostar';
    L.appendChild(t);
    dormidos.sort((a,b)=>a.p.out-b.p.out).forEach(({p,i})=>{
      const d=document.createElement('div');d.className='prow sleeping';
      d.innerHTML=`<div class="pav" style="background:${p.c}">${esc(inicial(p.n))}</div>
        <div class="nm">${esc(p.n)} <span class="sleeptag">${hora(p.out)} · ${p.sips||0}</span></div>
        <button class="del" onclick="despertar(${i})" aria-label="${esc(p.n)} volvio">↩</button>
        <button class="del" onclick="borrarJugador(${i})" aria-label="Borrar a ${esc(p.n)} de la lista">✕</button>`;
      L.appendChild(d);
    });
  }

  const act=enJuego();
  $('phint').style.display=S.players.length?'none':'block';
  $('pcount').textContent=act.length;
  $('presetRow').style.display=S.players.length?'flex':'none';
  const ok=act.length>=2;
  $('toModes').disabled=!ok;$('toModes').style.opacity=ok?1:.4;
}
function esc(s){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}

/* ---------- modos ---------- */
function tile(m,onclick){
  const b=document.createElement('button');b.className='mtile';b.style.setProperty('--mc',m.c);
  b.innerHTML=`<span class="free">GRATIS</span><span class="em">${m.em}</span><div><div class="nm">${m.nm}</div><div class="ds">${m.ds}</div></div>`;
  b.onclick=onclick;return b;
}
function renderModes(){
  const mx=$('mgridMix');mx.innerHTML='';
  mx.appendChild(tile({nm:'Mix',em:'🎰',c:'#e879f9',
    ds:'Elige tus modos favoritos y se revuelven en un solo mazo.'},openMix));
  const g=$('mgridCards');g.innerHTML='';
  MODES.filter(m=>!m.season).forEach(m=>g.appendChild(tile(m,()=>startMode(m))));
  const s=$('mgridSpecial');s.innerHTML='';
  SPECIALS.forEach(m=>s.appendChild(tile(m,()=>{
    if(m.min&&enJuego().length<m.min){toast(`Este modo necesita mínimo ${m.min} jugadores`);return}
    go(m.id);
  })));
  const z=$('mgridSeason');z.innerHTML='';
  MODES.filter(m=>m.season).forEach(m=>z.appendChild(tile(m,()=>startMode(m))));
}

/* ---------- motor de cartas ---------- */

/* Qué cartas entran según la intensidad elegida.
   Si el modo queda demasiado corto se avisa, pero nunca se deja vacío. */
function deckFor(m){
  const filtrado=E.filterByIntensity(m.deck,m.lvl,S.intensity);
  if(filtrado.length>=8) return filtrado;
  if(filtrado.length>0){
    toast(`${m.nm} tiene pocas cartas en nivel ${LVL_NM[S.intensity]} 🌶️`);
    return filtrado;
  }
  toast(`${m.nm} es más fuerte que tu nivel: va completo`);
  return m.deck;
}

function startMode(m){
  clearAnim();
  if(m.min&&enJuego().length<m.min){toast(`Este modo necesita mínimo ${m.min} jugadores`);return}
  S.mode=m;S.rules=[];S.drawn=0;
  if(!S.startedAt) S.startedAt=Date.now();
  document.documentElement.style.setProperty('--accent',m.c);
  go('game');
  $('gmode').textContent=`${m.em} ${m.nm}`;
  // Verdad o reto no reparte carta de entrada: primero el jugador elige.
  if(m.pick){ S.vorDeck={};S.vorIdx={};showPick();return }
  S.allCards=deckFor(m);
  S.deck=E.buildDeck(S.allCards,S.recent[m.id]||[]);
  S.idx=0;
  showCard(S.deck[0]);
}

/* Bolsa de turnos: nadie vuelve a ser {j} hasta que pasaron todos. */
function pickPlayers(){
  const key=S.mode?S.mode.id:'_';
  const ps=enJuego();
  if(!ps.length) return [null,null];
  const r=E.nextPlayers(S.bag[key]||{},ps.length);
  S.bag[key]=r.state;
  const p1=ps[r.i1]||ps[0];
  const p2=ps[r.i2]||p1;
  return [p1,p2];
}
function otherThan(p){
  const ps=enJuego();
  if(ps.length<2) return p;
  return rnd(ps.filter(x=>x!==p));
}
let curCard=null,curP1=null,curP2=null;
/* La animacion de salida dura 200 ms y recien ahi se dibuja la carta
   siguiente. Sin este candado, dos taps seguidos gastan dos cartas (y
   suman dos veces al marcador); y si se sale de la partida en el medio,
   el timeout dibuja una carta en una pantalla que ya no se ve. */
let avanzando=false,animT=null;
function clearAnim(){ if(animT){clearTimeout(animT);animT=null} avanzando=false }
function showCard(raw,forceP1){
  clearTimer();
  if(window.Live) Live.closeVote();   // la carta anterior pudo abrir una votación
  if(S.mode&&!S.mode.pick) S.recent[S.mode.id]=E.pushRecent(S.recent[S.mode.id],raw,E.RECENT_CAP);
  sfx.card(); vib(12);
  const c=parseCard(raw);curCard=c;
  // La bolsa solo avanza si la carta nombra a alguien. Si avanzara también
  // en las cartas grupales ("el último en tocar algo rojo"), se gastarían
  // turnos invisibles y el reparto visible volvería a ser puro azar.
  const nombra=/\{j2?\}/.test(c.x);
  let p1=null,p2=null;
  if(nombra){
    if(forceP1){ p1=forceP1; p2=otherThan(forceP1) }
    else { const r=pickPlayers(); p1=r[0]; p2=r[1] }
  }
  curP1=p1;curP2=p2;
  // en Mix cada carta se pinta con el color de su modo de origen
  const origen=S.mode&&S.mode.mix&&S.mixMap?S.mixMap[raw]:null;
  if(origen) document.documentElement.style.setProperty('--accent',origen.c);
  let ans=null,txt=c.x;
  if(c.k==='p'&&txt.includes('§')){[txt,ans]=txt.split('§')}
  if(c.k==='pc'){txt=c.parts[0]}
  // el reemplazo va como funcion: un nombre con $' o $& se interpretaria
  // como patron y duplicaria el texto de la carta
  const html=esc(adapt(txt))
    .replace(/\{j2\}/g,()=>p2?`<span class="pj">${esc(p2.n)}</span>`:'alguien')
    .replace(/\{j\}/g,()=>p1?`<span class="pj">${esc(p1.n)}</span>`:'alguien');
  const card=$('gcard');
  card.classList.remove('out');
  card.style.animation='none';void card.offsetWidth;card.style.animation='';
  const etiqueta=(TYPES[c.k]?TYPES[c.k].l:'Carta')
    +(c.k==='rg'?` · ${c.n} rondas`:'')
    +(origen?` · ${esc(origen.nm)}`:'');
  card.innerHTML=`<span class="ctype">${etiqueta}</span>
    <div class="ctext">${html}</div>
    ${S.mode.ds&&(c.k==='mm'||c.k==='sh')?`<div class="csub">${esc(adapt(S.mode.ds))}</div>`:''}
    <div class="cwidget" id="cwidget"></div>`;
  const w=$('cwidget');
  if(c.k==='pc') renderPremio(c,w,p1);
  if(c.k==='tm'){
    const b=document.createElement('button');b.className='wbtn';b.textContent=`▶ Iniciar ${c.n}s`;
    b.onclick=()=>runTimer(c.n,b,w);w.appendChild(b);
  }
  if(c.k==='dd'){
    const b=document.createElement('button');b.className='wbtn';b.textContent='🎲 Lanzar dado';
    b.onclick=()=>{const r=1+Math.floor(Math.random()*6);b.remove();const d=document.createElement('div');d.className='dicebig';d.textContent=['⚀','⚁','⚂','⚃','⚄','⚅'][r-1]+' '+r;w.appendChild(d)};
    w.appendChild(b);
  }
  if(ans){
    /* Trivia contra reloj: el cronometro arranca solo al salir la carta, que
       es lo que le da gracia. Al acabarse se revela la respuesta sola y queda
       la fila de sorbos lista para anotarle al que no supo. Se puede revelar
       antes tocando el boton. Los segundos salen de la carta (p20|...) y si
       no dice nada, 20. */
    const segs=c.n||TRIVIA_SEGS;
    const reloj=document.createElement('div');reloj.className='timerbig';reloj.textContent=segs;
    const b=document.createElement('button');b.className='wbtn';b.textContent='👁 Ver respuesta';
    const revelar=()=>{
      clearTimer();
      reloj.remove(); b.remove();
      const d=document.createElement('div');d.className='answer';d.textContent=adapt(ans);
      w.appendChild(d);
    };
    b.onclick=revelar;
    w.appendChild(reloj);w.appendChild(b);
    let t=segs;
    S.timer=setInterval(()=>{
      t--;reloj.textContent=t;
      if(t>0){
        sfx.tick(t<=3);
        if(t<=3){ reloj.classList.add('urgent'); vib(20) }
      }else{
        sfx.timeUp(); vib([120,60,120]);
        revelar();
      }
    },1000);
  }
  // votación: los que eligieron jugador en su celular votan desde ahí
  if(c.k==='vt'&&window.Live&&Live.isSharing()) Live.openVote(w,card.querySelector('.ctext').textContent);
  renderQuick(txt,c,p1,p2);
  renderRules();
  S.drawn++;S.totalDrawn++;$('gcount').textContent=`carta ${S.drawn}`;
}
/* ---------- anotar sorbos ----------
   Muchas cartas no dicen quien pierde ("el ultimo en tocar algo rojo"), y en
   la ruleta, el impostor o la bomba lo decide el juego y no la carta. Antes
   solo se le podia anotar al que la carta nombraba; el resto habia que
   sumarlo a mano en el marcador. Ahora salen todos: los que la carta nombra
   van destacados, pero se puede tocar a cualquiera. Una sola fila que se
   desliza, asi la carta no pierde alto aunque sean ocho.
--------------------------------------*/
function addSips(p,n){
  if(!p) return;
  p.sips=(p.sips||0)+n; save(); sfx.tap(); vib(10);
  toast(`${p.n}: ${p.sips} ${S.noAlcohol?'puntos':'sorbos'} 🏆`);
}
function renderSipRow(cont,n,destacados,conTodos,etiqueta){
  if(!cont) return;
  cont.innerHTML='';
  const ps=enJuego();
  if(!ps.length) return;
  const dest=(destacados||[]).filter(Boolean);
  const pal=S.noAlcohol?'puntos':'sorbos';

  const lab=document.createElement('div');
  lab.className='qlabel';
  lab.textContent=`${etiqueta||'toca al que toma'} · +${n} ${pal}`;
  cont.appendChild(lab);

  const row=document.createElement('div');row.className='qrow';
  ps.forEach(p=>{
    const b=document.createElement('button');
    b.className='qbtn'+(dest.indexOf(p)>=0?' named':'');
    b.innerHTML=`+${n} <b>${esc(p.n)}</b>`;
    b.setAttribute('aria-label',`Sumarle ${n} ${pal} a ${p.n}`);
    b.onclick=()=>addSips(p,n);
    row.appendChild(b);
  });
  cont.appendChild(row);

  if(conTodos){
    const all=document.createElement('button');
    all.className='qbtn qall';all.innerHTML=`+1 <b>a todos</b>`;
    all.setAttribute('aria-label',`Sumarle un ${pal.slice(0,-1)} a todos`);
    all.onclick=()=>{ps.forEach(p=>p.sips=(p.sips||0)+1);save();sfx.tap();toast('Todos +1 🍻')};
    cont.appendChild(all);
  }
}
/* La misma fila dentro de una pantalla especial, creando el contenedor. */
function sipRowIn(parent,n,destacados,etiqueta){
  if(!parent) return null;
  let c=parent.querySelector('.quickadd');
  if(!c){ c=document.createElement('div');c.className='quickadd';parent.appendChild(c) }
  renderSipRow(c,n,destacados,false,etiqueta);
  return c;
}
function renderQuick(txt,c,p1,p2){
  renderSipRow($('quickadd'),E.sipsInText(adapt(txt)),[p1,p2],true);
}
function nextCard(skipped){
  if(avanzando) return;
  avanzando=true;
  const card=$('gcard');
  card.classList.add('out');
  // quién se la jugó y quién se arrugó, para el resumen de la noche
  // solo cuenta si habia carta: en la pantalla de "verdad o reto" todavia
  // no se eligio nada y no corresponde anotar nada a nadie
  if(curP1&&curCard){ if(skipped) curP1.skip=(curP1.skip||0)+1; else curP1.done=(curP1.done||0)+1; save() }
  // reglas activas: descontar
  S.rules.forEach(r=>r.left--);
  const expired=S.rules.filter(r=>r.left<=0);
  S.rules=S.rules.filter(r=>r.left>0);
  if(expired.length)toast('Regla terminada: '+expired[0].txt);
  // si la actual era regla y no la saltaron, activarla
  if(curCard&&curCard.k==='rg'&&!skipped){
    let t=adapt(curCard.x).replace(/\{j2\}/g,()=>curP2?curP2.n:'alguien').replace(/\{j\}/g,()=>curP1?curP1.n:'alguien');
    S.rules.push({txt:t,left:curCard.n||3});
  }
  animT=setTimeout(()=>{
    animT=null;avanzando=false;
    if(S.mode&&S.mode.pick){ showPick(); return }   // vuelve a "verdad o reto"
    S.idx++;
    if(S.idx>=S.deck.length){
      // se rearma el mazo dejando al fondo lo recién visto
      S.deck=E.buildDeck(S.allCards.length?S.allCards:S.mode.deck,S.recent[S.mode.id]||[]);
      S.idx=0;
    }
    showCard(S.deck[S.idx]);
  },200);
}
function renderRules(){
  const b=$('rulesbar');b.innerHTML='';
  S.rules.forEach((r,i)=>{
    const c=document.createElement('button');c.className='rulechip';
    c.textContent=`📌 ${r.txt} (${r.left})`;c.title='Tocar para cancelar';
    c.onclick=()=>{S.rules.splice(i,1);renderRules();toast('Regla cancelada')};
    b.appendChild(c);
  });
}
function endGame(){clearTimer();clearAnim();if(window.Live)Live.closeVote();go('modes')}

/* ---------- timer ---------- */
function clearTimer(){if(S.timer){clearInterval(S.timer);S.timer=null}}
function runTimer(sec,btn,w){
  btn.remove();
  const d=document.createElement('div');d.className='timerbig';d.textContent=sec;w.appendChild(d);
  let t=sec;
  S.timer=setInterval(()=>{
    t--;d.textContent=t;
    if(t>0){
      sfx.tick(t<=3);                 // los últimos segundos suenan más agudos
      if(t<=3){ d.classList.add('urgent'); vib(20) }
    }else{
      clearTimer();
      d.textContent='⏰ ¡TIEMPO!';
      sfx.timeUp(); vib([120,60,120]);
    }
  },1000);
}

/* ---------- swipe ---------- */
/* La barra de reglas scrollea horizontal y una carta larga scrollea
   vertical. Sin filtrar, arrastrarlas para leerlas saltaba la carta y la
   contaba como arrugada. Se exige un gesto claramente horizontal y se
   ignoran las zonas que se manejan solas. */
let tx=0,ty=0,swipeOk=false;
document.addEventListener('touchstart',e=>{
  swipeOk=false;
  if(!$('game').classList.contains('on'))return;
  const t=e.target;
  if(t&&t.closest&&t.closest('.rulesbar,#quickadd,#cwidget,button'))return;
  swipeOk=true;tx=e.touches[0].clientX;ty=e.touches[0].clientY;
},{passive:true});
document.addEventListener('touchend',e=>{
  if(!swipeOk||!$('game').classList.contains('on'))return;
  swipeOk=false;
  const dx=e.changedTouches[0].clientX-tx;
  const dy=e.changedTouches[0].clientY-ty;
  if(Math.abs(dy)>40||Math.abs(dy)>=Math.abs(dx))return;   // era un scroll
  if(dx<-60)nextCard(false); else if(dx>60)nextCard(true);
},{passive:true});

/* ---------- marcador ---------- */
function renderBoard(){
  const L=$('blist');L.innerHTML='';
  const sorted=S.players.slice().sort((a,b)=>b.sips-a.sips);
  const max=sorted.length?sorted[0].sips:0;
  sorted.forEach(p=>{
    const d=document.createElement('div');d.className='prow'+(p.out?' sleeping':'');
    d.innerHTML=`<div class="pav" style="background:${p.c}">${esc(inicial(p.n))}</div>
      <div class="nm">${esc(p.n)} ${p.sips===max&&max>0?'<span class="crown">👑</span>':''}${p.out?`<span class="sleeptag">🛌 ${hora(p.out)}</span>`:''}</div>
      <div class="sipnum">${p.sips}</div>
      <div class="sipbtns"><button data-a="-1" aria-label="Restarle uno a ${esc(p.n)}">−</button><button data-a="1" aria-label="Sumarle uno a ${esc(p.n)}">＋</button></div>`;
    d.querySelectorAll('.sipbtns button').forEach(b=>b.onclick=()=>{p.sips=Math.max(0,p.sips+parseInt(b.dataset.a));renderBoard();save();sfx.tap()});
    L.appendChild(d);
  });
  renderCharts($('bcharts'));
  $('bhint').style.display=S.players.length?'none':'block';
  $('bfoot').textContent=S.players.length?(S.noAlcohol?'Puntos acumulados · el que más tiene paga una penitencia':'Sorbos estimados · si alguien va muy arriba, tócale agua 💧'):'';
}
function chg(n,v){const p=S.players.find(p=>p.n===n);if(p){p.sips=Math.max(0,p.sips+v);save();renderBoard()}}
function resetSips(){S.players.forEach(p=>p.sips=0);resetLog();renderBoard();save();toast('Marcador en cero')}

/* ---------- gráficos ---------- */
function chartData(){
  return {log:S.log, players:S.players, t0:S.startedAt, now:Date.now(), unit:S.noAlcohol?'puntos':'sorbos'};
}
function renderCharts(box){
  if(!box||!window.Charts) return;
  if(!S.players.some(p=>p.sips>0)){ box.innerHTML=''; return }
  const d=chartData();
  d.race=Charts.race(d.log,d.players,d.t0,d.now);
  box.innerHTML=Charts.panel(d);
  Charts.attachRace(box,d.race,d.unit);
}

/* ---------- resumen de la noche ----------
   Arma el resumen con E.summary(): el mismo objeto sirve para pintar
   la pantalla y para dibujar la imagen para compartir.
-------------------------------------------*/
function fmtMin(min){
  if(min<60) return `${min} min`;
  const h=Math.floor(min/60),m=min%60;
  return m?`${h} h ${m} min`:`${h} h`;
}
function renderSummary(){
  const box=$('sumbox');
  if(!S.players.length){
    box.innerHTML=`<div class="emptyhint">Todavía no hay nada que resumir.<br>Agrega jugadores y jueguen un rato 🎉</div>`;
    return;
  }
  const s=E.summary(S.players,{drawn:S.totalDrawn,startedAt:S.startedAt},Date.now());
  const word=adapt('sorbos');
  let html='';
  const podio=s.ranking.slice(0,3);
  if(podio.length){
    html+=`<div class="podium">${podio.map((p,i)=>`
      <div class="podspot p${i+1}">
        <div class="podav" style="background:${p.c}">${esc(inicial(p.n))}</div>
        <div class="podnm">${esc(p.n)}</div>
        <div class="podn">${p.sips||0}</div>
      </div>`).join('')}</div>`;
  }
  const resto=s.ranking.slice(3);
  if(resto.length){
    html+=`<div class="sumlist">${resto.map((p,i)=>`
      <div class="sumrow"><span class="sumpos">${i+4}</span>
        <div class="pav" style="background:${p.c}">${esc(inicial(p.n))}</div>
        <div class="nm">${esc(p.n)}</div><div class="sipnum">${p.sips||0}</div></div>`).join('')}</div>`;
  }
  if(s.brave){
    html+=`<div class="sumcard"><span class="sumtag">El valiente 💪</span>
      <div class="sumbig">${esc(s.brave.n)}</div>
      <div class="sumsub">${s.brave.done} retos cumplidos</div></div>`;
  }
  if(s.chicken){
    html+=`<div class="sumcard"><span class="sumtag">El gallina 🐔</span>
      <div class="sumbig">${esc(s.chicken.n)}</div>
      <div class="sumsub">${s.chicken.skip} retos saltados</div></div>`;
  }
  const dormidos=S.players.filter(x=>x.out).sort((a,b)=>a.out-b.out);
  if(dormidos.length){
    html+=`<div class="sumcard"><span class="sumtag">Se fueron a acostar 🛌</span>
      <div class="sumbig">${esc(dormidos[0].n)} fue el primero en caer</div>
      <div class="sleeplist">${dormidos.map(x=>`
        <div class="sleeprow">
          <div class="pav" style="background:${x.c}">${esc(inicial(x.n))}</div>
          <div class="nm">${esc(x.n)}</div>
          <div class="sleepwhen">${hora(x.out)}</div>
          <div class="sipnum">${x.sips||0}</div>
        </div>`).join('')}</div></div>`;
  }
  html+=`<div class="sumstats">
    <div class="sumstat"><div class="sn">${s.cards}</div><div class="sl">cartas jugadas</div></div>
    <div class="sumstat"><div class="sn">${fmtMin(s.minutes)}</div><div class="sl">de carrete</div></div>
    <div class="sumstat"><div class="sn">${s.total}</div><div class="sl">${esc(word)} repartidos</div></div>
  </div>`;
  html+=`<div id="sumcharts"></div>`;
  box.innerHTML=html;
  renderCharts($('sumcharts'));
}

/* rectángulo con esquinas redondeadas para el canvas, sin depender
   de ctx.roundRect() que aún no está en todos los navegadores */
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
async function shareSummary(){
  if(!S.players.length){toast('Agrega jugadores primero');return}
  try{
    const s=E.summary(S.players,{drawn:S.totalDrawn,startedAt:S.startedAt},Date.now());
    const word=adapt('sorbos');
    const W=1080,H=1350;
    const cv=document.createElement('canvas');cv.width=W;cv.height=H;
    const cx=cv.getContext('2d');
    if(document.fonts&&document.fonts.ready) await document.fonts.ready.catch(()=>{});
    const grad=cx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,'#2a2240');grad.addColorStop(1,'#17131f');
    cx.fillStyle=grad;cx.fillRect(0,0,W,H);
    cx.textAlign='center';
    cx.fillStyle='#ff3d7f';cx.font='400 92px Anton, Impact, sans-serif';
    cx.fillText('CARRETEO',W/2,150);
    cx.fillStyle='#a99cc4';cx.font='500 32px Space Grotesk, sans-serif';
    cx.fillText('Resumen de la noche',W/2,196);
    let y=270;const rowH=100;
    s.ranking.slice(0,6).forEach((p,i)=>{
      cx.fillStyle=p.c;roundRect(cx,90,y,900,rowH-18,22);cx.fill();
      cx.fillStyle='#17131f';cx.font='700 38px Space Grotesk, sans-serif';cx.textAlign='center';
      cx.fillText(inicial(p.n),150,y+(rowH-18)/2+14);
      cx.textAlign='left';cx.font='700 34px Space Grotesk, sans-serif';
      const nm=p.n.length>17?p.n.slice(0,16)+'…':p.n;
      cx.fillText(`${i+1}. ${nm}`,210,y+(rowH-18)/2+12);
      cx.textAlign='right';cx.font='400 36px Anton, Impact, sans-serif';
      cx.fillText(String(p.sips||0),940,y+(rowH-18)/2+13);
      cx.textAlign='left';
      y+=rowH;
    });
    y+=24;
    const filas=[];
    if(s.brave) filas.push(['El valiente 💪',`${s.brave.n} · ${s.brave.done} retos`]);
    if(s.chicken) filas.push(['El gallina 🐔',`${s.chicken.n} · ${s.chicken.skip} saltados`]);
    filas.push(['Cartas jugadas',String(s.cards)]);
    filas.push(['Duración',fmtMin(s.minutes)]);
    filas.push([`Total de ${word}`,String(s.total)]);
    cx.font='500 30px Space Grotesk, sans-serif';
    filas.forEach(([label,val])=>{
      cx.fillStyle='#a99cc4';cx.textAlign='left';cx.fillText(label,90,y);
      cx.fillStyle='#f5f0ff';cx.textAlign='right';cx.fillText(val,990,y);
      y+=52;
    });
    cx.textAlign='center';cx.fillStyle='#3a3152';cx.font='400 22px Space Grotesk, sans-serif';
    cx.fillText('carreteo · el juego de fiesta gratis',W/2,H-40);

    const blob=await new Promise(res=>cv.toBlob(res,'image/png'));
    if(!blob) throw new Error('sin blob');
    const file=new File([blob],'carreteo.png',{type:'image/png'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      try{
        await navigator.share({files:[file],title:'Carreteo',text:'Resumen de la noche 🎉'});
        return;
      }catch(err){
        // cerrar el menu a proposito no es un error
        if(err&&err.name==='AbortError') return;
        // iOS puede rechazar el share si el canvas se demoro: la imagen
        // ya existe, asi que se descarga en vez de decir que fallo
      }
    }
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='carreteo.png';
    document.body.appendChild(a);a.click();a.remove();
    URL.revokeObjectURL(url);
  }catch(e){
    if(e&&e.name==='AbortError') return;   // el usuario cerró el share sheet: no es un error
    toast('No se pudo generar la imagen');
  }
}

/* ---------- ruleta ---------- */
let wAngle=0,wSpinning=false;
function initWheel(){
  drawWheel(wAngle);
  $('wheelres').innerHTML='<div class="what">Gira para elegir a la víctima… digo, al afortunado.</div>';
  const q=$('wheelbox').querySelector('.quickadd'); if(q) q.remove();
}
function drawWheel(angle){
  const cv=$('wheel'),ctx=cv.getContext('2d');
  const ps=enJuego();
  const N=Math.max(ps.length,2),R=150;
  ctx.clearRect(0,0,300,300);ctx.save();ctx.translate(150,150);ctx.rotate(angle);
  for(let i=0;i<N;i++){
    const a0=i*2*Math.PI/N,a1=(i+1)*2*Math.PI/N;
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,R,a0,a1);ctx.closePath();
    ctx.fillStyle=AVCOLORS[i%AVCOLORS.length];ctx.fill();
    ctx.save();ctx.rotate((a0+a1)/2);ctx.textAlign='right';
    ctx.fillStyle='#17131f';ctx.font='700 14px Space Grotesk, sans-serif';
    ctx.fillText((ps[i]?ps[i].n:'—').slice(0,10),R-12,5);
    ctx.restore();
  }
  ctx.restore();
  ctx.beginPath();ctx.arc(150,150,26,0,7);ctx.fillStyle='#221c30';ctx.fill();
  ctx.fillStyle='#f5f0ff';ctx.font='16px sans-serif';ctx.textAlign='center';ctx.fillText('🎡',150,156);
}
function spin(){
  if(wSpinning)return;
  if(enJuego().length<2){toast('Agrega jugadores primero');return}
  wSpinning=true;sfx.spin();$('spinbtn').style.opacity=.5;
  const extra=6*Math.PI+Math.random()*2*Math.PI;
  const start=wAngle,dur=3200,t0=performance.now();
  function frame(t){
    const p=Math.min((t-t0)/dur,1),e=1-Math.pow(1-p,3);
    wAngle=start+extra*e;drawWheel(wAngle);
    if(p<1)requestAnimationFrame(frame);
    else{
      wSpinning=false;$('spinbtn').style.opacity=1;
      const ps=enJuego();
      const N=ps.length;
      const norm=((-Math.PI/2 - wAngle)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
      const idx=Math.floor(norm/(2*Math.PI/N));
      const who=ps[idx]||ps[0];
      const reto=adapt(rnd(WHEEL_DARES));
      $('wheelres').innerHTML=`<div class="who">${esc(who.n)}</div><div class="what">${esc(reto)}</div>`;
      sipRowIn($('wheelbox'),E.sipsInText(reto),[who],'si no lo hace, toma');
      sfx.win(); vib([40,40,90]);
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- impostor ---------- */
let IMP={};
function impSetup(){
  const box=$('impbox');
  box.innerHTML=`<div class="impcard"><h3>¿Cómo se juega?</h3>
  <p style="color:var(--muted);font-size:14px;line-height:1.6">Todos reciben la misma palabra secreta… menos uno: <b>el impostor</b>, que solo conoce la categoría. Por turnos, cada uno da una pista de UNA palabra sin delatarse. Luego votan. Si atrapan al impostor, toma 4; si se salva, todos los demás toman 2.</p></div>
  <button class="btn btn-primary" onclick="impStart()">Repartir roles 🎲</button>`;
}
function impStart(){
  const ps=enJuego();
  if(ps.length<3){ toast('El impostor necesita al menos 3 jugadores'); return }
  const cats=Object.keys(IMP_WORDS),cat=rnd(cats);
  // se congela la mesa al repartir: si alguien se va a acostar a mitad de
  // ronda, los indices no se corren y el impostor sigue siendo el mismo
  IMP={cat,word:rnd(IMP_WORDS[cat]),ps,imp:Math.floor(Math.random()*ps.length),i:0,r:Date.now(),phones:[]};
  // Los que eligieron jugador en su celular ven el rol ahí: no hace falta
  // pasarles el teléfono. Si el envío falla, se juega como siempre.
  if(window.Live&&Live.isSharing()){
    const ronda=IMP;
    $('impbox').innerHTML=`<div class="impcard"><h3>Repartiendo roles…</h3></div>`;
    Promise.race([Live.sendImpostor(ronda),new Promise(r=>setTimeout(()=>r([]),5000))]).then(names=>{
      if(IMP!==ronda) return;
      ronda.phones=names||[];
      impReveal();
    });
    return;
  }
  impReveal();
}
function impReveal(){
  const box=$('impbox');
  while(IMP.i<IMP.ps.length&&IMP.phones&&IMP.phones.indexOf(IMP.ps[IMP.i].n)>=0) IMP.i++;
  if(IMP.i>=IMP.ps.length){
    box.innerHTML=`<div class="impcard"><h3>¡A debatir! 🗣️</h3>
    <p style="color:var(--muted);font-size:14px;line-height:1.6">Categoría: <b style="color:var(--mango)">${IMP.cat}</b>.<br>Una pista por cabeza, después voten en voz alta.</p>
    ${IMP.phones&&IMP.phones.length?`<p style="color:var(--muted);font-size:13px;margin-top:8px">📱 Lo vieron en su celular: ${IMP.phones.map(esc).join(', ')}</p>`:''}</div>
    <button class="btn btn-ghost" onclick="impRevealImp()" style="margin-bottom:10px">Revelar al impostor 👀</button>
    <button class="btn btn-primary" onclick="impStart()">Otra ronda</button>`;
    return;
  }
  const p=IMP.ps[IMP.i];
  box.innerHTML=`${IMP.phones&&IMP.phones.length?`<div class="qlabel">📱 ${IMP.phones.map(esc).join(', ')} ya lo ven en su celular</div>`:''}<div class="impcard"><h3>Pásale el cel a</h3><div class="impword">${esc(p.n)}</div>
  <p style="color:var(--muted);font-size:13px">Que nadie más mire 👀</p></div>
  <button class="holdbtn" id="holdb">Mantén presionado para ver tu rol</button>
  <button class="btn btn-primary" id="impnext" style="margin-top:12px;display:none" onclick="IMP.i++;impReveal()">Listo, siguiente →</button>`;
  const hb=$('holdb'),card=box.querySelector('.impcard');
  const show=()=>{card.innerHTML=IMP.i===IMP.imp
      ?`<h3>Shhh…</h3><div class="impimp">ERES EL IMPOSTOR 🤫</div><p style="color:var(--muted);font-size:13px">Categoría: <b>${IMP.cat}</b>. Disimula.</p>`
      :`<h3>Palabra secreta</h3><div class="impword">${esc(IMP.word)}</div><p style="color:var(--muted);font-size:13px">Categoría: ${IMP.cat}</p>`;
    $('impnext').style.display='block'};
  const hide=()=>{card.innerHTML=`<h3>Rol visto ✓</h3><p style="color:var(--muted)">Suelta el celular y pásalo.</p>`};
  hb.addEventListener('touchstart',e=>{e.preventDefault();show()});
  hb.addEventListener('touchend',hide);
  hb.addEventListener('mousedown',show);
  hb.addEventListener('mouseup',hide);
}
function impRevealImp(){
  const p=IMP.ps&&IMP.ps[IMP.imp];
  if(!p) return;
  $('impbox').insertAdjacentHTML('afterbegin',`<div class="impcard"><h3>El impostor era…</h3><div class="impimp">${esc(p.n)} 🕵️</div><p style="color:var(--muted);font-size:14px">¿Lo atraparon? Toma 4. ¿Se salvó? El resto toma 2.</p></div>`);
  sipRowIn($('impbox'),4,[p],'¿quién toma?');
}

/* ---------- cuarto rey ---------- */
function initKing(){
  const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suits=['♠️','♥️','♦️','♣️'];
  S.kings=shuffle(ranks.flatMap(r=>suits.map(s=>r+'|'+s)));
  S.kingCount=0;updateKingPill();
}
function updateKingPill(){$('reyleft').textContent=`${S.kings.length} cartas · ${S.kingCount}/4 👑`}
function drawKing(){
  if(!S.kings.length){initKing();toast('Baraja nueva 🃏')}
  const [r,s]=S.kings.pop().split('|');
  let rule=KING_RULES[r];
  if(r==='K'){S.kingCount++;if(S.kingCount>=4)rule=KING_LAST}
  const c=$('reycard');
  c.classList.remove('out');void c.offsetWidth;
  c.style.animation='none';requestAnimationFrame(()=>{c.style.animation=''});
  c.innerHTML=`<span class="ctype" style="background:#eab308">${r} ${s}</span>
  <div class="ctext">${esc(adapt(rule))}</div>`;
  updateKingPill();
}

/* ---------- init ---------- */
$('pname').addEventListener('keydown',e=>{if(e.key==='Enter')addPlayer()});
document.querySelectorAll('#lvlChips .chip').forEach(b=>{
  b.onclick=()=>setIntensity(+b.dataset.l);
});
renderModes();

/* =========================================================
   MODOS NUEVOS
   ========================================================= */

/* ---------- Premio o castigo ----------
   La carta muestra solo el reto. El grupo juzga con dos botones y ahi
   recien se revela el premio o el castigo. El castigo se anota solo;
   el premio suele ser "reparte", que lo decide una persona.
-----------------------------------------*/
function renderPremio(c,w,p1){
  const premio=c.parts[1]||'Te salvaste', castigo=c.parts[2]||'Toma 2 sorbos';
  const row=document.createElement('div');row.className='pcrow';
  const mk=(label,cls,texto,gana)=>{
    const b=document.createElement('button');
    b.className='wbtn '+cls;b.textContent=label;
    b.onclick=()=>{
      row.remove();
      const d=document.createElement('div');
      d.className='answer '+(gana?'good':'bad');
      d.textContent=(gana?'🎁 ':'💀 ')+adapt(texto);
      w.appendChild(d);
      if(gana){
        sfx.win(); vib([30,40,70]);
        toast('¡Lo logró! 🎉');
      }else{
        const n=E.sipsInText(adapt(castigo));
        if(p1){p1.sips+=n;save()}
        sfx.bad(); vib(170);
        toast(p1?`${p1.n}: +${n} ${S.noAlcohol?'puntos':'sorbos'} 💀`:'Castigo aplicado 💀');
      }
    };
    return b;
  };
  row.appendChild(mk('✅ Lo logró','good',premio,true));
  row.appendChild(mk('❌ Falló','bad',castigo,false));
  w.appendChild(row);
}

/* ---------- Verdad o reto ----------
   Primero el jugador elige a ciegas, despues sale la carta. Cada lista
   lleva su propio historial para que tampoco se repitan entre si.
-------------------------------------*/
function showPick(){
  clearTimer();
  const [p1]=pickPlayers();
  curCard=null;curP1=p1;curP2=null;
  const card=$('gcard');
  card.classList.remove('out');
  card.style.animation='none';void card.offsetWidth;card.style.animation='';
  card.innerHTML=`<span class="ctype">Te toca</span>
    <div class="ctext">${esc(p1?p1.n:'Alguien')}, ¿qué eliges?</div>
    <div class="csub">Elige antes de ver la carta. Después no se puede cambiar.</div>
    <div class="cwidget" id="cwidget"></div>`;
  const w=$('cwidget');
  const row=document.createElement('div');row.className='pcrow';
  const mk=(label,cls,cual)=>{
    const b=document.createElement('button');b.className='wbtn '+cls;b.textContent=label;
    b.onclick=()=>{sfx.tap();drawVor(cual,p1)};
    return b;
  };
  row.appendChild(mk('🤐 Verdad','good','truths'));
  row.appendChild(mk('🔥 Reto','bad','dares'));
  w.appendChild(row);
  $('quickadd').innerHTML='';
  renderRules();
}
function drawVor(cual,p){
  const lista=E.filterByIntensity(TRUTH_DARE[cual],S.mode.lvl,S.intensity);
  const pool=lista.length?lista:TRUTH_DARE[cual];
  const key='vor:'+cual;
  if(!S.vorDeck[cual]||S.vorIdx[cual]>=S.vorDeck[cual].length){
    S.vorDeck[cual]=E.buildDeck(pool,S.recent[key]||[]);
    S.vorIdx[cual]=0;
  }
  const raw=S.vorDeck[cual][S.vorIdx[cual]++];
  S.recent[key]=E.pushRecent(S.recent[key],raw,E.RECENT_CAP);
  showCard(raw,p);
}

/* ---------- Mix ----------
   Une los mazos elegidos sin duplicados y recuerda de que modo vino
   cada carta, para mostrarlo y pintarla con su color.
----------------------------*/
function openMix(){
  const box=$('mixlist');box.innerHTML='';
  MODES.filter(m=>!m.pick).forEach(m=>{
    const b=document.createElement('button');
    b.className='mixrow'+(S.mix.indexOf(m.id)>=0?' on':'');
    b.innerHTML=`<span class="mem">${m.em}</span><span class="mnm">${esc(m.nm)}</span>
      <span class="mct">${m.deck.length}</span><span class="tick">✓</span>`;
    b.onclick=()=>{
      const i=S.mix.indexOf(m.id);
      if(i>=0) S.mix.splice(i,1); else S.mix.push(m.id);
      b.classList.toggle('on');
      save(); sfx.tap(); updateMixBtn();
    };
    box.appendChild(b);
  });
  updateMixBtn();
  go('mixpick');
}
function updateMixBtn(){
  const n=E.buildMixDeck(MODES,S.mix,S.intensity).length;
  const b=$('mixgo');
  const listo=S.mix.length>=2&&n>=10;
  b.disabled=!listo;
  b.style.opacity=listo?1:.4;
  b.textContent=listo?`Jugar mix · ${n} cartas`:'Elige al menos 2 modos';
}
function startMix(){
  const mezcla=E.buildMixDeck(MODES,S.mix,S.intensity);
  if(mezcla.length<10){toast('Elige al menos 2 modos');return}
  S.mixMap={};
  mezcla.forEach(x=>{S.mixMap[x.card]={nm:x.nm,c:x.color}});
  startMode({id:'mix',nm:'Mix',em:'🎰',c:'#e879f9',mix:true,lvl:S.intensity,
    ds:'Tus modos favoritos, todos revueltos.',deck:mezcla.map(x=>x.card)});
}

/* ---------- La bomba ----------
   Categoria al azar y mecha oculta. El tic-tac acelera al final:
   nadie sabe cuanto queda, esa es la gracia.
--------------------------------*/
let BOMB={t:null,running:false,left:0,turno:0,orden:[]};
function clearBomb(){ if(BOMB.t){clearTimeout(BOMB.t);BOMB.t=null} BOMB.running=false }
function initBomb(){
  clearBomb();
  $('bombabox').innerHTML=`<div class="bombcard" id="bombcard">
      <div class="bombemoji" id="bombemoji">💣</div>
      <div class="bombcat" id="bombcat">Toca encender para sacar categoría</div>
      <div class="bombhint" id="bombhint">Por turnos, cada uno dice un ejemplo y pasa el celular.
      A quien le explote, ${S.noAlcohol?'suma 3 puntos':'toma 3 sorbos'}.</div>
    </div>`;
  $('bombbtn').textContent='🔥 Encender la mecha';
}
function toggleBomb(){
  if(BOMB.running){ clearBomb(); initBomb(); toast('Mecha apagada'); return }
  const ps=enJuego();
  if(ps.length<3){ toast('La bomba necesita al menos 3 jugadores'); return }
  /* La vuelta sigue el orden en que se anotaron los nombres, que es el orden
     en que estan sentados. Cada ronda la empieza el siguiente, asi a todos
     les toca partir y nadie queda siempre con la papa caliente. */
  const inicio=BOMB.turno%ps.length;
  BOMB.orden=ps.slice(inicio).concat(ps.slice(0,inicio));
  BOMB.turno=inicio+1;
  $('bombcat').textContent=rnd(BOMB_CATS);
  $('bombemoji').textContent='🧨';
  $('bombcard').className='bombcard lit';
  $('bombhint').innerHTML=`Empieza <b>${esc(BOMB.orden[0].n)}</b> y sigue en este orden:`
    +`<div class="bomborden">${BOMB.orden.map(x=>esc(x.n)).join(' → ')} → ↻</div>`;
  $('bombbtn').textContent='✋ Apagar';
  BOMB.running=true;
  BOMB.left=18+Math.floor(Math.random()*28);   // entre 18 y 45 tics, oculto
  bombTick(BOMB.left);
}
function bombTick(total){
  if(!BOMB.running) return;
  BOMB.left--;
  if(BOMB.left<=0){ bombBoom(); return }
  const queda=BOMB.left/total;
  sfx.tick(queda<.35);
  if(queda<.35) vib(8);
  const espera=queda<.25?420:queda<.5?680:950;   // el tic-tac acelera
  BOMB.t=setTimeout(()=>bombTick(total),espera);
}
function bombBoom(){
  clearBomb();
  $('bombcard').className='bombcard boom';
  $('bombemoji').textContent='💥';
  $('bombcat').textContent='¡BOOM!';
  $('bombhint').textContent='El celular lo tiene el que perdió. Tócalo aquí abajo y le anoto.';
  $('bombbtn').textContent='🔄 Otra ronda';
  // la app no sabe en manos de quien quedo: hay que decirselo para poder anotar
  sipRowIn($('bombabox'),3,[],'¿a quién le explotó?');
  sfx.boom(); vib([200,80,400]);
}



/* ---------- Doble agente ----------
   El celular del host es el tablero: ahí se anota la pista y se tocan las
   palabras. La clave la ven los jefes en su celular (por el espacio
   privado de compartir en vivo) o, si no hay, manteniendo presionado aquí.
   La lógica está en agente.js.
--------------------------------------*/
const AG_COL={r:'#ff3d7f',a:'#59c2ff',n:'#b9a67a',x:'#0d0a14'};
const AG_NM={r:'Rojo',a:'Azul'};
const AG_EM={r:'🔴',a:'🔵',n:'🙂',x:'💀'};
let AG={phase:'setup',mode:'equipos',teams:null,g:null,clueN:1,secs:0,deadline:null,paused:null,tk:null};
/* ---------- temporizador ----------
   Opcional, por turno. Al llegar a cero el turno pasa (en la cooperativa
   juega el rival). Salir de la pantalla lo pausa. */
function agTimerStart(){
  clearInterval(AG.tk); AG.tk=null; AG.paused=null; AG.manual=false;
  AG.deadline=AG.secs&&AG.g&&!AG.g.winner?Date.now()+AG.secs*1000:null;
  if(AG.deadline) AG.tk=setInterval(agTimerTick,250);
}
function agTimerStop(){ clearInterval(AG.tk); AG.tk=null; AG.deadline=null; AG.paused=null; AG.manual=false }
/* el botón ⏸/▶: una pausa a mano se respeta aunque se salga y se vuelva */
function agTogglePause(){
  if(AG.deadline){ agPause(); AG.manual=true; toast('⏸ Tiempo en pausa') }
  else if(AG.paused!=null){ AG.manual=false; agResume() }
  renderAgente();
}
function agPause(){
  if(!AG.deadline) return;
  AG.paused=Math.max(0,AG.deadline-Date.now());
  clearInterval(AG.tk); AG.tk=null; AG.deadline=null;
}
function agResume(){
  if(AG.paused==null||!AG.g||AG.g.winner) return;
  AG.deadline=Date.now()+AG.paused; AG.paused=null;
  AG.tk=setInterval(agTimerTick,250);
}
let agLastBeep=0;
function agTimerTick(){
  if(!AG.deadline) return;
  const left=AG.deadline-Date.now(), s=Math.ceil(left/1000);
  const el=$('agtimer');
  if(el){ el.textContent=agFmt(s); el.classList.toggle('urgent',s<=10) }
  if(s<=5&&s>0&&s!==agLastBeep){ agLastBeep=s; sfx.tick(true); vib(20) }
  if(left<=0) agTimeUp();
}
function agFmt(s){ s=Math.max(0,s); return `⏱ ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` }
function agTimeUp(){
  agTimerStop();
  if(!AG.g||AG.g.winner) return;
  sfx.timeUp(); vib([120,60,120]);
  toast('⏱ ¡Se acabó el tiempo! Pasa el turno');
  AG.g=Agente.endTurn(AG.g);
  AG.draft='';
  agAfterMove(true);
}
function agSetSecs(n){ AG.secs=n; renderAgente() }
/* después de cada jugada: si cambió el turno, el reloj parte de nuevo */
function agAfterMove(turnoNuevo){
  if(AG.g.winner) agTimerStop(); else if(turnoNuevo) agTimerStart();
  renderAgente();
}
function agNames(){ return enJuego().map(p=>p.n) }
function agWords(){
  const w=AGENTE_WORDS.BASE.slice();
  return S.intensity>=3?w.concat(AGENTE_WORDS.PICANTE):w;
}
function initAgente(){
  if(AG.phase==='play'&&AG.g&&!AG.g.winner){ if(!AG.manual) agResume(); renderAgente(); return }   // volver no corta la partida
  const ns=agNames();
  // se conservan los equipos si la mesa es la misma
  const misma=AG.teams&&ns.length===AG.teams.r.length+AG.teams.a.length&&ns.every(n=>Agente.teamOf(AG.teams,n));
  if(!misma){
    AG.mode=ns.length>=4?'equipos':'coop';
    AG.teams=Agente.makeTeams(ns,AG.mode);
  }
  AG.phase='setup';AG.g=null;
  renderAgente();
}
function agSetMode(m){ AG.mode=m; AG.teams=Agente.makeTeams(agNames(),m); renderAgente() }
function agShuffle(){ AG.teams=Agente.makeTeams(agNames(),AG.mode); renderAgente() }
function agTap(n){
  // equipos: tocar cambia de equipo; en la cooperativa hay uno solo
  if(AG.mode==='coop'){ AG.teams=Agente.setJefe(AG.teams,n); renderAgente(); return }
  AG.teams=Agente.moveTo(AG.teams,n,Agente.teamOf(AG.teams,n)==='r'?'a':'r'); renderAgente();
}
function agJefe(n){ AG.teams=Agente.setJefe(AG.teams,n); renderAgente() }
function agStart(){
  const prob=Agente.teamsProblem(AG.teams,AG.mode);
  if(prob){ toast(prob); return }
  AG.g=Agente.newGame(agWords(),{mode:AG.mode});
  AG.phase='play'; AG.clueN=1; AG.draft='';
  if(!S.startedAt) S.startedAt=Date.now();
  agTimerStart();
  if(window.Live) Live.sendKey(AG);
  renderAgente();
}
function agJefes(){ return ['r','a'].map(k=>AG.teams.jefe[k]).filter(Boolean) }
function agTeamList(k){
  const jefe=AG.teams.jefe[k];
  return `<div class="agteam" style="--tc:${AG_COL[k]}">
    <div class="agth">${AG.mode==='coop'?'🕶️ Equipo':AG_EM[k]+' '+AG_NM[k]}</div>
    ${AG.teams[k].map(n=>`<div class="agmem">
      <button class="agname" onclick="agTap(${esc(JSON.stringify(n))})">${esc(n)}</button>
      <button class="agstar${n===jefe?' on':''}" onclick="agJefe(${esc(JSON.stringify(n))})" aria-label="${esc(n)} es ${n===jefe?'el jefe':'agente: tocar para hacerlo jefe'}">${n===jefe?'🔑 jefe':'hacer jefe'}</button>
    </div>`).join('')}
  </div>`;
}
/* estado de la clave para cada jefe: en su celular, o cómo dársela */
function agKeyPanel(){
  const sharing=window.Live&&Live.isSharing();
  return `<div class="agkey"><div class="qlabel">🔑 La clave la ven solo los jefes</div>
    ${agJefes().map(n=>{
      const tiene=sharing&&Live.seatOf(n);
      return `<div class="agkrow"><span>${esc(n)}</span>${tiene
        ?'<span class="agok">📱 en su celular</span>'
        :`<button class="pill" onclick="agJefeQR(${esc(JSON.stringify(n))})">QR del jefe</button>`}</div>`;
    }).join('')}
    <p class="csub">Sin celular: el jefe mantiene presionado <b>👁 Clave</b> en el tablero. Basta un celular para los dos jefes: la clave es la misma.</p></div>`;
}
function agJefeQR(n){
  if(!window.Live) return;
  Live.jefeQR(n);
}
// elegir el número redibuja: lo escrito en la pista se guarda antes
function agDraft(){ const i=$('agclue'); if(i) AG.draft=i.value }
function agClueN(n){ agDraft(); AG.clueN=n; renderAgente() }
function agGiveClue(){
  const w=($('agclue')&&$('agclue').value||'').trim();
  if(!w){ toast('Escribe la pista que dijo el jefe'); return }
  AG.g=Agente.giveClue(AG.g,w,AG.clueN);
  AG.draft=''; AG.clueN=1;
  renderAgente();
}
function agPass(){
  if(!Agente.canPass(AG.g)){ toast('Hay que intentar al menos una'); return }
  AG.g=Agente.endTurn(AG.g);
  sfx.tap(); agAfterMove(true);
}
/* los sorbos de una jugada van a todo el equipo */
function agApplySips(list){
  const pal=S.noAlcohol?'puntos':'sorbos';
  const msgs=[];
  list.forEach(x=>{
    const ns=AG.teams[x.team];
    S.players.filter(p=>ns.indexOf(p.n)>=0).forEach(p=>p.sips=(p.sips||0)+x.n);
    const quien=AG.mode==='coop'?'El equipo':`${AG_EM[x.team]} ${AG_NM[x.team]}`;
    msgs.push(x.shot?`${quien}: ${S.noAlcohol?'reto':'shot'} por el asesino 💀`:`${quien} +${x.n} ${pal} (${x.why})`);
  });
  if(list.length){ save(); toast(msgs.join(' · ')) }
}
function agGuess(i){
  if(!AG.g||!AG.g.clue){ toast('Primero la pista del jefe'); return }
  const r=Agente.guess(AG.g,i);
  if(!r.res) return;
  const antes=AG.g;
  AG.g=r.g;
  const k=r.res.kind;
  if(k==='own'){ sfx.tap(); vib(20) } else if(k==='assassin'){ sfx.timeUp(); vib([200,80,200,80,300]) } else { sfx.tick(true); vib([60,40,60]) }
  agApplySips(r.res.sips);
  agAfterMove(r.res.end&&!AG.g.winner&&(AG.g.turn!==antes.turn||!AG.g.clue));
}
function agRevealStart(){ const g=$('aggrid'); if(g) g.classList.add('showkey') }
function agRevealEnd(){ const g=$('aggrid'); if(g) g.classList.remove('showkey') }
function agGrid(){
  const g=AG.g;
  return `<div class="aggrid" id="aggrid">${g.words.map((w,i)=>{
    const k=g.key[i], r=g.rev[i];
    return `<button class="agcell${w.length>8?' largo':''}${r?' rev k'+k:''}" data-k="${k}" ${r||!g.clue||g.winner?'disabled':''} onclick="agGuess(${i})" aria-label="${esc(w)}${r?' · '+({r:'rojo',a:'azul',n:'transeúnte',x:'asesino'})[k]:''}">
      <span class="agw">${esc(w)}</span>${r?`<span class="agi">${AG_EM[k]}</span>`:''}</button>`;
  }).join('')}</div>`;
}
function renderAgente(){
  const box=$('agbox');
  if(!box) return;
  if(AG.phase==='setup'){
    const n=agNames().length;
    box.innerHTML=`<div class="impcard" style="text-align:left"><h3>¿Cómo se juega?</h3>
      <p class="csub" style="margin-top:4px">Cada jefe ve una clave secreta con las palabras de su equipo. Por turnos da <b>una palabra y un número</b> ("playa, 2") y su equipo toca las que cree suyas. Transeúnte: 1 sorbo. Del rival: 2 y el punto para ellos. <b>El asesino</b>: pierden y ${S.noAlcohol?'reto':'shot'}. Gana el primero en encontrar todas las suyas.</p></div>
      <div class="chips agmodes">
        <button class="chip${AG.mode==='equipos'?' on':''}" ${n<4?'disabled':''} onclick="agSetMode('equipos')">⚔️ Equipos${n<4?' (4+)':''}</button>
        <button class="chip${AG.mode==='coop'?' on':''}" onclick="agSetMode('coop')">🤝 Cooperativa</button>
      </div>
      ${AG.mode==='coop'?`<p class="csub">Todos juntos contra un rival simulado: después de cada turno, el rival descubre una de sus palabras. Si termina antes que ustedes, pierden.</p>`:`<p class="csub">Toca un nombre para cambiarlo de equipo.</p>`}
      <div class="qlabel" style="margin-top:12px">⏱ Tiempo por turno</div>
      <div class="agnums">${[[0,'Sin tiempo'],[60,'1 min'],[120,'2 min'],[180,'3 min']].map(([n,l])=>`<button class="qbtn${AG.secs===n?' named':''}" onclick="agSetSecs(${n})">${l}</button>`).join('')}</div>
      <div class="agteams">${agTeamList('r')}${AG.mode==='equipos'?agTeamList('a'):''}</div>
      <button class="btn btn-ghost" onclick="agShuffle()" style="margin:10px 0">🔀 Rearmar al azar</button>
      ${agKeyPanel()}
      <button class="btn btn-primary" style="margin-top:12px" onclick="agStart()">Repartir tablero 🕶️</button>`;
    return;
  }
  const g=AG.g, t=g.turn;
  let top='';
  if(g.winner){
    const gano=AG.mode==='coop'?(g.winner==='r'?'¡Ganaron!':'Ganó el rival'):`Ganó el ${AG_EM[g.winner]} ${AG_NM[g.winner]}`;
    const como=g.how==='assassin'?'El asesino 💀 decidió la partida.':g.how==='rival'?'El rival encontró todas sus palabras.':'Encontraron todas sus palabras.';
    top=`<div class="impcard"><h3>${gano}</h3><p class="csub">${como}</p>
      ${AG.mode==='coop'&&g.winner==='r'?`<p class="csub">Le quedaban ${Agente.coopScore(g)} palabras al rival: repartan ${Agente.coopScore(g)} ${S.noAlcohol?'puntos':'sorbos'}.</p>`:''}</div>
      <div id="agsips"></div>
      <button class="btn btn-primary" onclick="agStart()">Otra partida, mismos equipos</button>
      <button class="btn btn-ghost" style="margin-top:8px" onclick="AG.phase='setup';renderAgente()">Cambiar equipos</button>`;
  }else{
    const jefe=AG.teams.jefe[t];
    top=`<div class="agturn" style="--tc:${AG_COL[t]}">${AG.mode==='coop'?'🕶️ Turno del equipo':`Turno ${AG_EM[t]} ${AG_NM[t]}`} · jefe <b>${esc(jefe||'')}</b></div>`;
    if(!g.clue){
      top+=`<div class="agclue"><input id="agclue" maxlength="30" placeholder="Pista del jefe" autocomplete="off" aria-label="Pista del jefe" value="${esc(AG.draft||'')}">
        <div class="agnums">${[0,1,2,3,4,5,6,7,8,9,-1].map(n=>`<button class="qbtn${AG.clueN===n?' named':''}" onclick="agClueN(${n})">${n===-1?'∞':n}</button>`).join('')}</div>
        <button class="btn donebtn" onclick="agGiveClue()">Dar pista</button></div>`;
    }else{
      const quedan=g.left===Infinity?'sin tope':`quedan ${g.left}`;
      top+=`<div class="agclue on"><div class="agcw">"${esc(g.clue.w)}" · ${g.clue.n===-1?'∞':g.clue.n}</div><div class="csub">${quedan} · toquen las suyas</div>
        <button class="btn btn-ghost" onclick="agPass()" ${Agente.canPass(g)?'':'disabled'}>Pasar turno</button></div>`;
    }
  }
  const cuenta=AG.mode==='coop'
    ?`<span>🕶️ faltan ${Agente.leftOf(g,'r')}</span><span>🤖 rival: ${Agente.leftOf(g,'a')}</span>`
    :`<span style="color:${AG_COL.r}">🔴 ${Agente.leftOf(g,'r')}</span><span style="color:${AG_COL.a}">🔵 ${Agente.leftOf(g,'a')}</span>`;
  const reloj=AG.deadline||AG.paused!=null?`<span class="agtimer${AG.paused!=null?' paused':''}" id="agtimer">${agFmt(Math.ceil(((AG.deadline||Date.now()+AG.paused)-Date.now())/1000))}</span><button class="agpause" onclick="agTogglePause()" aria-label="${AG.paused!=null?'Seguir el tiempo':'Pausar el tiempo'}">${AG.paused!=null?'▶':'⏸'}</button>`:'';
  box.innerHTML=`${top}<div class="agcount">${cuenta}${reloj}
    <button class="holdbtn agpeek" id="agpeek">👁 Clave</button></div>
    ${agGrid()}
    <div style="margin-top:12px">${agKeyPanel()}</div>`;
  const hb=$('agpeek');
  hb.addEventListener('touchstart',e=>{e.preventDefault();agRevealStart()});
  hb.addEventListener('touchend',agRevealEnd);
  hb.addEventListener('mousedown',agRevealStart);
  hb.addEventListener('mouseup',agRevealEnd);
  hb.addEventListener('mouseleave',agRevealEnd);
  if(g.winner){
    // el ganador reparte: en equipos, lo que le quedaba al perdedor; en la
    // cooperativa, las palabras que le quedaban al rival
    const n=AG.mode==='coop'?Agente.coopScore(g):Math.max(1,Math.min(5,Agente.leftOf(g,Agente.other(g.winner))));
    if(n>0) sipRowIn($('agsips'),n,[],AG.mode==='coop'?'repartan a quien quieran':`el jefe ${AG_EM[g.winner]} reparte`);
  }
  const inp=$('agclue'); if(inp) inp.addEventListener('keydown',e=>{if(e.key==='Enter')agGiveClue()});
}


/* ---------- Fuck the Dealer ----------
   Un solo celular a la vista de todos: la app sabe la carta, dice "más
   alto" o "más bajo" y anota los sorbos. La lógica está en dealer.js.
--------------------------------------*/
let FTD=null;
function initDealer(){
  if(FTD&&!FTD.over&&FTD.names.every(n=>S.players.some(p=>p.n===n&&!p.out))){ renderDealer(); return }
  FTD=Dealer.newGame(enJuego().map(p=>p.n));
  if(!S.startedAt) S.startedAt=Date.now();
  renderDealer();
}
function dealerNew(){ FTD=Dealer.newGame(enJuego().map(p=>p.n)); renderDealer() }
function dealerGuess(v){
  const r=Dealer.guess(FTD,v);
  if(!r.res) return;
  FTD=r.g;
  const pal=S.noAlcohol?'puntos':'sorbos';
  r.res.drinks.forEach(d=>{ const p=S.players.find(x=>x.n===d.who); if(p) p.sips=(p.sips||0)+d.n });
  if(r.res.drinks.length) save();
  if(r.res.kind==='hint'){ sfx.tap(); vib(15) }
  else if(r.res.kind==='miss'){ sfx.tick(true); vib([60,40,60]) }
  else { sfx.timeUp(); vib([100,50,100]) }
  const msg=r.res.drinks.map(d=>`${d.who} +${d.n} ${pal} (${d.why})`);
  if(r.res.passed) msg.push(`🃏 ${r.res.passed.from} ganó 3 seguidas: ahora reparte ${r.res.passed.to}`);
  if(msg.length) toast(msg.join(' · '));
  renderDealer(r.res);
}
function renderDealer(res){
  const box=$('dealerbox');
  if(!box||!FTD) return;
  const g=FTD, dealer=g.names[g.dealer], quien=g.names[g.guesser];
  const ultima=g.last?`<span class="dlast${g.last.s==='♥'||g.last.s==='♦'?' red':''}">${Dealer.label(g.last)}</span>`:'';
  let head;
  if(g.over){
    head=`<div class="gcard" id="dcard"><span class="ctype">Se acabó el mazo</span><div class="ctext">Fin de la ronda. ${ultima}</div></div>
      <button class="btn btn-primary" onclick="dealerNew()">Barajar de nuevo 🃏</button>`;
  }else{
    const pista=g.stage==='second'?`<b>${g.hint==='up'?'⬆️ Más alto':'⬇️ Más bajo'}</b> que ${Dealer.NAMES[g.first]}. Segundo intento:`:'¿Qué número es la carta de arriba?';
    const res1=res&&res.kind!=='hint'?`<div class="csub">Era ${Dealer.label(res.card)}.</div>`:'';
    head=`<div class="gcard" id="dcard"><span class="ctype">Dealer: ${esc(dealer)} · ${'🔥'.repeat(g.streak)}${g.streak}/3</span>
      <div class="ctext"><span class="pj">${esc(quien)}</span>, ${pista}</div>${res1}</div>
      <div class="dranks">${Dealer.NAMES.slice(1).map((n,i)=>{
        const v=i+1, quedan=4-g.seen[v];
        const fuera=g.stage==='second'&&(g.hint==='up'?v<=g.first:v>=g.first);
        return `<button class="drank" ${quedan<=0||fuera?'disabled':''} onclick="dealerGuess(${v})" aria-label="${n}, quedan ${quedan}">${n}<small>${quedan}</small></button>`;
      }).join('')}</div>`;
  }
  box.innerHTML=`${head}
    <div class="dinfo"><span>🂠 quedan ${Dealer.left(g)}</span>${g.last?`<span>última: ${ultima}</span>`:''}</div>
    <div class="impcard" style="text-align:left"><p class="csub" style="margin:0">A la primera, el dealer toma ${Dealer.RULES.first}. A la segunda, ${Dealer.RULES.second}. Si fallas las dos, tomas la diferencia (máximo ${Dealer.RULES.maxDiff}). Si el dealer gana 3 seguidas, pasa el mazo. Los números chicos bajo cada botón son las cartas que quedan.</p></div>`;
}

/* ---------- pie de página con el conteo real ---------- */
function renderFootnote(){
  const cartas=MODES.reduce((s,m)=>s+m.deck.length,0);
  const modos=MODES.length+SPECIALS.length;
  const f=$('foot');
  if(f) f.innerHTML=`${cartas} cartas originales · ${modos} modos · funciona sin internet una vez cargado.<br>Bebe con responsabilidad. Nada de esto es obligatorio: saltar siempre es opción.`;
}
renderFootnote();

/* ---------- arranque ---------- */
load();
trackSips();   // siembra la referencia: lo que ya venía no es un cambio
setSwitch('alcoSwitch',S.noAlcohol);
setSwitch('sndSwitch',S.sound);
renderChips();
renderPlayers();
if(S.players.length) $('gate').querySelector('.card h2').textContent='Bienvenidos de vuelta';
/* ---------- service worker ----------
   Solo sobre http(s): abierto como archivo suelto no se puede registrar,
   y ahi tampoco hace falta porque ya esta todo local.
   Cuando entra una version nueva se avisa en vez de recargar de golpe,
   para no cortar una partida en curso.
--------------------------------------*/
function initSW(){
  if(!('serviceWorker' in navigator)) return;
  if(!/^https?:$/.test(location.protocol)) return;

  /* El aviso va en su propio elemento, creado aca mismo. Antes reusaba el
     toast normal: como ese se muestra todo el tiempo ("+1 sorbo"), se
     pisaban entre si y quedaba un toast invisible que al tocarlo recargaba
     la pagina en medio de la partida. */
  function banner(){
    let a=$('swupdate');
    if(!a){
      a=document.createElement('div');
      a.id='swupdate';
      a.className='toast';                  // hereda el estilo del toast
      a.style.pointerEvents='auto';
      a.style.cursor='pointer';
      a.style.bottom='150px';               // arriba del toast normal
      document.body.appendChild(a);
    }
    return a;
  }

  function avisar(sw){
    if(!sw) return;
    if(!navigator.serviceWorker.controller) return;   // primera instalacion, nada que avisar
    const a=banner();
    if(a.dataset.on==='1') return;
    a.dataset.on='1';
    a.textContent='Hay una version nueva \u2192 toca para actualizar';
    a.classList.add('show');
    a.onclick=()=>{
      a.textContent='Actualizando\u2026';
      a.onclick=null;
      // Se recarga recien cuando el service worker nuevo toma el control:
      // hacerlo antes volveria a servir la version vieja.
      navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});
      setTimeout(()=>location.reload(),3000);   // por si el evento no llega
      sw.postMessage({type:'SKIP_WAITING'});
    };
  }

  navigator.serviceWorker.register('./sw.js').then(reg=>{
    function seguir(sw){
      if(!sw) return;
      if(sw.state==='installed') return avisar(sw);
      sw.addEventListener('statechange',()=>{ if(sw.state==='installed') avisar(sw) });
    }
    // Puede haber terminado de instalarse antes de llegar aca, asi que se
    // revisa el estado actual y ademas se escucha lo que venga despues.
    if(reg.waiting) avisar(reg.waiting);
    if(reg.installing) seguir(reg.installing);
    reg.addEventListener('updatefound',()=>seguir(reg.installing));
  }).catch(()=>{});
}
initSW();
if(window.Live){ Live.boot(); if(!Live.isHost()&&!Live.isViewing()) showLock() }
