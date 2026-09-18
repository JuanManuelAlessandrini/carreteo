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
  players:[], noAlcohol:false, intensity:3, sound:true, mix:[], startedAt:0,
  /* solo de esta sesión */
  mode:null, deck:[], allCards:[], idx:0, rules:[], prev:'home', drawn:0,
  kings:[], kingCount:0, timer:null,
  recent:{},   // cartas ya vistas por modo, para no repetir
  bag:{}       // bolsa de turnos por modo, para repartir parejo
};

const AVCOLORS=['#ff3d7f','#ffb24d','#8b6cff','#59c2ff','#34d399','#f472b6','#facc15','#7dd3fc'];
const LVL_NM={1:'Suave',2:'Medio',3:'Picante'};

/* ---------- memoria ----------
   Jugadores, marcador y preferencias sobreviven al cierre.
   El historial de cartas no: cada fiesta parte con el mazo limpio.
-------------------------------*/
const SKEY='carreteo.v2';
function save(){
  try{
    localStorage.setItem(SKEY,JSON.stringify({
      players:S.players, noAlcohol:S.noAlcohol, intensity:S.intensity,
      sound:S.sound, mix:S.mix, startedAt:S.startedAt
    }));
  }catch(e){/* modo incógnito o storage lleno: se juega igual */}
}
function load(){
  try{
    const raw=localStorage.getItem(SKEY);
    if(!raw) return;
    const d=JSON.parse(raw)||{};
    if(Array.isArray(d.players)){
      S.players=d.players.filter(p=>p&&p.n).map((p,i)=>({
        n:String(p.n).slice(0,16), sips:+p.sips||0, done:+p.done||0, skip:+p.skip||0,
        c:p.c||AVCOLORS[i%AVCOLORS.length]
      }));
    }
    S.noAlcohol=!!d.noAlcohol;
    S.intensity=[1,2,3].indexOf(d.intensity)>=0?d.intensity:3;
    S.sound=d.sound!==false;
    S.mix=Array.isArray(d.mix)?d.mix:[];
    S.startedAt=+d.startedAt||0;
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
  if(cur&&cur.id!=='board') S.prev=cur.id;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));
  $(id).classList.add('on');
  if(id==='players') renderPlayers();
  if(id==='modes') renderModes();
  if(id==='board') renderBoard();
  if(id==='ruleta') initWheel();
  if(id==='impostor') impSetup();
  if(id==='rey') initKing();
}
function closeGate(){$('gate').style.display='none'}
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove('show'),2200)}

/* ---------- preferencias ---------- */
function setNoAlcohol(v){
  S.noAlcohol=v;
  $('alcoSwitch').classList.toggle('on',v);
  save();
  toast(v?'Modo sin alcohol: sorbos → puntos, shots → prendas 🧃':'Modo con alcohol activado 🍺 Con moderación.');
}
function setIntensity(l){
  S.intensity=l; renderChips(); save(); sfx.tap();
  toast(`Intensidad: ${LVL_NM[l]} ${l===1?'😇':l===2?'😏':'🌶️'}`);
}
function setSound(v){
  S.sound=v; $('sndSwitch').classList.toggle('on',v); save();
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
  if(S.players.some(p=>p.n.toLowerCase()===n.toLowerCase())){toast('Ese nombre ya está');return}
  S.players.push({n,sips:0,done:0,skip:0,c:AVCOLORS[S.players.length%AVCOLORS.length]});
  if(!S.startedAt) S.startedAt=Date.now();
  S.bag={};                       // cambió el grupo: se rearma el reparto de turnos
  i.value='';i.focus();
  renderPlayers(); save(); sfx.tap();
}
function delPlayer(i){S.players.splice(i,1);S.bag={};renderPlayers();save()}
function newGame(){
  S.players.forEach(p=>{p.sips=0;p.done=0;p.skip=0});
  S.recent={}; S.bag={}; S.startedAt=Date.now();
  renderPlayers(); save();
  toast('Partida nueva: marcador en cero, mismos jugadores 🔄');
}
function clearAll(){
  if(!confirm('¿Borrar los jugadores y el marcador guardados?')) return;
  S.players=[]; S.recent={}; S.bag={}; S.startedAt=0;
  try{ localStorage.removeItem(SKEY) }catch(e){}
  renderPlayers();
  toast('Todo borrado');
}
function renderPlayers(){
  const L=$('plist');L.innerHTML='';
  S.players.forEach((p,i)=>{
    const d=document.createElement('div');d.className='prow';
    d.innerHTML=`<div class="pav" style="background:${p.c}">${p.n[0].toUpperCase()}</div><div class="nm">${esc(p.n)}</div><button class="del" onclick="delPlayer(${i})">✕</button>`;
    L.appendChild(d);
  });
  $('phint').style.display=S.players.length?'none':'block';
  $('pcount').textContent=S.players.length;
  $('presetRow').style.display=S.players.length?'flex':'none';
  const ok=S.players.length>=2;
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
  const g=$('mgridCards');g.innerHTML='';
  MODES.filter(m=>!m.season).forEach(m=>g.appendChild(tile(m,()=>startMode(m))));
  const s=$('mgridSpecial');s.innerHTML='';
  SPECIALS.forEach(m=>s.appendChild(tile(m,()=>{
    if(m.min&&S.players.length<m.min){toast(`Este modo necesita mínimo ${m.min} jugadores`);return}
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
  if(m.min&&S.players.length<m.min){toast(`Este modo necesita mínimo ${m.min} jugadores`);return}
  S.mode=m;
  S.allCards=deckFor(m);
  S.deck=E.buildDeck(S.allCards,S.recent[m.id]||[]);
  S.idx=0;S.rules=[];S.drawn=0;
  if(!S.startedAt) S.startedAt=Date.now();
  document.documentElement.style.setProperty('--accent',m.c);
  go('game');
  $('gmode').textContent=`${m.em} ${m.nm}`;
  showCard(S.deck[0]);
}

/* Bolsa de turnos: nadie vuelve a ser {j} hasta que pasaron todos. */
function pickPlayers(){
  const key=S.mode?S.mode.id:'_';
  const r=E.nextPlayers(S.bag[key]||{},S.players.length);
  S.bag[key]=r.state;
  const p1=S.players[r.i1]||S.players[0];
  const p2=S.players[r.i2]||p1;
  return [p1,p2];
}
let curCard=null,curP1=null,curP2=null;
function showCard(raw){
  clearTimer();
  if(S.mode) S.recent[S.mode.id]=E.pushRecent(S.recent[S.mode.id],raw,E.RECENT_CAP);
  sfx.card(); vib(12);
  const c=parseCard(raw);curCard=c;
  // La bolsa solo avanza si la carta nombra a alguien. Si avanzara también
  // en las cartas grupales ("el último en tocar algo rojo"), se gastarían
  // turnos invisibles y el reparto visible volvería a ser puro azar.
  const nombra=/\{j2?\}/.test(c.x);
  const [p1,p2]=nombra?pickPlayers():[null,null];
  curP1=p1;curP2=p2;
  let ans=null,txt=c.x;
  if(c.k==='p'&&txt.includes('§')){[txt,ans]=txt.split('§')}
  const html=esc(adapt(txt))
    .replace(/\{j2\}/g,p2?`<span class="pj">${esc(p2.n)}</span>`:'alguien')
    .replace(/\{j\}/g,p1?`<span class="pj">${esc(p1.n)}</span>`:'alguien');
  const card=$('gcard');
  card.classList.remove('out');
  card.style.animation='none';void card.offsetWidth;card.style.animation='';
  card.innerHTML=`<span class="ctype">${TYPES[c.k]?TYPES[c.k].l:'Carta'}${c.k==='rg'?` · ${c.n} rondas`:''}</span>
    <div class="ctext">${html}</div>
    ${S.mode.ds&&(c.k==='mm'||c.k==='sh')?`<div class="csub">${esc(adapt(S.mode.ds))}</div>`:''}
    <div class="cwidget" id="cwidget"></div>`;
  const w=$('cwidget');
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
    const b=document.createElement('button');b.className='wbtn';b.textContent='👁 Ver respuesta';
    b.onclick=()=>{b.remove();const d=document.createElement('div');d.className='answer';d.textContent=adapt(ans);w.appendChild(d)};
    w.appendChild(b);
  }
  renderQuick(txt,c,p1,p2);
  renderRules();
  S.drawn++;$('gcount').textContent=`carta ${S.drawn}`;
}
function renderQuick(txt,c,p1,p2){
  const q=$('quickadd');q.innerHTML='';
  const m=adapt(txt).match(/(\d+)\s*(sorbo|punto)/i);
  const n=m?parseInt(m[1]):1;
  const mk=(p)=>{const b=document.createElement('button');b.className='qbtn';
    b.innerHTML=`+${n} <b>${esc(p.n)}</b>`;
    b.onclick=()=>{p.sips+=n;save();sfx.tap();toast(`${p.n}: ${p.sips} ${S.noAlcohol?'puntos':'sorbos'} 🏆`)};q.appendChild(b)};
  if(txt.includes('{j}'))mk(p1);
  if(txt.includes('{j2}'))mk(p2);
  const all=document.createElement('button');all.className='qbtn';all.innerHTML=`+1 <b>todos</b>`;
  all.onclick=()=>{S.players.forEach(p=>p.sips++);save();sfx.tap();toast('Todos +1 🍻')};q.appendChild(all);
}
function nextCard(skipped){
  const card=$('gcard');
  card.classList.add('out');
  // quién se la jugó y quién se arrugó, para el resumen de la noche
  if(curP1){ if(skipped) curP1.skip=(curP1.skip||0)+1; else curP1.done=(curP1.done||0)+1; save() }
  // reglas activas: descontar
  S.rules.forEach(r=>r.left--);
  const expired=S.rules.filter(r=>r.left<=0);
  S.rules=S.rules.filter(r=>r.left>0);
  if(expired.length)toast('Regla terminada: '+expired[0].txt);
  // si la actual era regla y no la saltaron, activarla
  if(curCard&&curCard.k==='rg'&&!skipped){
    let t=adapt(curCard.x).replace(/\{j2\}/g,curP2?curP2.n:'alguien').replace(/\{j\}/g,curP1?curP1.n:'alguien');
    S.rules.push({txt:t,left:curCard.n||3});
  }
  setTimeout(()=>{
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
function endGame(){clearTimer();go('modes')}

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
let tx=0;
document.addEventListener('touchstart',e=>{if($('game').classList.contains('on'))tx=e.touches[0].clientX},{passive:true});
document.addEventListener('touchend',e=>{
  if(!$('game').classList.contains('on'))return;
  const dx=e.changedTouches[0].clientX-tx;
  if(dx<-60)nextCard(false); else if(dx>60)nextCard(true);
},{passive:true});

/* ---------- marcador ---------- */
function renderBoard(){
  const L=$('blist');L.innerHTML='';
  const sorted=S.players.slice().sort((a,b)=>b.sips-a.sips);
  const max=sorted.length?sorted[0].sips:0;
  sorted.forEach(p=>{
    const d=document.createElement('div');d.className='prow';
    d.innerHTML=`<div class="pav" style="background:${p.c}">${p.n[0].toUpperCase()}</div>
      <div class="nm">${esc(p.n)} ${p.sips===max&&max>0?'<span class="crown">👑</span>':''}</div>
      <div class="sipnum">${p.sips}</div>
      <div class="sipbtns"><button data-a="-1">−</button><button data-a="1">＋</button></div>`;
    d.querySelectorAll('.sipbtns button').forEach(b=>b.onclick=()=>{p.sips=Math.max(0,p.sips+parseInt(b.dataset.a));renderBoard();save();sfx.tap()});
    L.appendChild(d);
  });
  $('bhint').style.display=S.players.length?'none':'block';
  $('bfoot').textContent=S.players.length?(S.noAlcohol?'Puntos acumulados · el que más tiene paga una penitencia':'Sorbos estimados · si alguien va muy arriba, tócale agua 💧'):'';
}
function chg(n,v){const p=S.players.find(p=>p.n===n);if(p){p.sips=Math.max(0,p.sips+v);renderBoard()}}
function resetSips(){S.players.forEach(p=>p.sips=0);renderBoard();save();toast('Marcador en cero')}

/* ---------- ruleta ---------- */
let wAngle=0,wSpinning=false;
function initWheel(){drawWheel(wAngle);$('wheelres').innerHTML='<div class="what">Gira para elegir a la víctima… digo, al afortunado.</div>'}
function drawWheel(angle){
  const cv=$('wheel'),ctx=cv.getContext('2d');
  const N=Math.max(S.players.length,2),R=150;
  ctx.clearRect(0,0,300,300);ctx.save();ctx.translate(150,150);ctx.rotate(angle);
  for(let i=0;i<N;i++){
    const a0=i*2*Math.PI/N,a1=(i+1)*2*Math.PI/N;
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,R,a0,a1);ctx.closePath();
    ctx.fillStyle=AVCOLORS[i%AVCOLORS.length];ctx.fill();
    ctx.save();ctx.rotate((a0+a1)/2);ctx.textAlign='right';
    ctx.fillStyle='#17131f';ctx.font='700 14px Space Grotesk, sans-serif';
    ctx.fillText((S.players[i]?S.players[i].n:'—').slice(0,10),R-12,5);
    ctx.restore();
  }
  ctx.restore();
  ctx.beginPath();ctx.arc(150,150,26,0,7);ctx.fillStyle='#221c30';ctx.fill();
  ctx.fillStyle='#f5f0ff';ctx.font='16px sans-serif';ctx.textAlign='center';ctx.fillText('🎡',150,156);
}
function spin(){
  if(wSpinning)return;
  if(S.players.length<2){toast('Agrega jugadores primero');return}
  wSpinning=true;sfx.spin();$('spinbtn').style.opacity=.5;
  const extra=6*Math.PI+Math.random()*2*Math.PI;
  const start=wAngle,dur=3200,t0=performance.now();
  function frame(t){
    const p=Math.min((t-t0)/dur,1),e=1-Math.pow(1-p,3);
    wAngle=start+extra*e;drawWheel(wAngle);
    if(p<1)requestAnimationFrame(frame);
    else{
      wSpinning=false;$('spinbtn').style.opacity=1;
      const N=S.players.length;
      const norm=((-Math.PI/2 - wAngle)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
      const idx=Math.floor(norm/(2*Math.PI/N));
      const who=S.players[idx];
      $('wheelres').innerHTML=`<div class="who">${esc(who.n)}</div><div class="what">${esc(adapt(rnd(WHEEL_DARES)))}</div>`;
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
  const cats=Object.keys(IMP_WORDS),cat=rnd(cats);
  IMP={cat,word:rnd(IMP_WORDS[cat]),imp:Math.floor(Math.random()*S.players.length),i:0};
  impReveal();
}
function impReveal(){
  const box=$('impbox');
  if(IMP.i>=S.players.length){
    box.innerHTML=`<div class="impcard"><h3>¡A debatir! 🗣️</h3>
    <p style="color:var(--muted);font-size:14px;line-height:1.6">Categoría: <b style="color:var(--mango)">${IMP.cat}</b>.<br>Una pista por cabeza, después voten en voz alta.</p></div>
    <button class="btn btn-ghost" onclick="impRevealImp()" style="margin-bottom:10px">Revelar al impostor 👀</button>
    <button class="btn btn-primary" onclick="impStart()">Otra ronda</button>`;
    return;
  }
  const p=S.players[IMP.i];
  box.innerHTML=`<div class="impcard"><h3>Pásale el cel a</h3><div class="impword">${esc(p.n)}</div>
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
  const p=S.players[IMP.imp];
  $('impbox').insertAdjacentHTML('afterbegin',`<div class="impcard"><h3>El impostor era…</h3><div class="impimp">${esc(p.n)} 🕵️</div><p style="color:var(--muted);font-size:14px">¿Lo atraparon? Toma 4. ¿Se salvó? El resto toma 2.</p></div>`);
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
$('alcoSwitch').classList.toggle('on',S.noAlcohol);
$('sndSwitch').classList.toggle('on',S.sound);
renderChips();
renderPlayers();
if(S.players.length) $('gate').querySelector('.card h2').textContent='Bienvenidos de vuelta';
