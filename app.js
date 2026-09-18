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

const S={players:[],noAlcohol:false,mode:null,deck:[],idx:0,rules:[],prev:'home',
  lastP:null,drawn:0,kings:[],kingCount:0,timer:null};

const AVCOLORS=['#ff3d7f','#ffb24d','#8b6cff','#59c2ff','#34d399','#f472b6','#facc15','#7dd3fc'];
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

function setNoAlcohol(v){S.noAlcohol=v;$('alcoSwitch').classList.toggle('on',v);toast(v?'Modo sin alcohol: sorbos → puntos, shots → prendas 🧃':'Modo con alcohol activado 🍺 Con moderación.')}

/* ---------- jugadores ---------- */
function addPlayer(){
  const i=$('pname'),n=i.value.trim();
  if(!n) return;
  if(S.players.some(p=>p.n.toLowerCase()===n.toLowerCase())){toast('Ese nombre ya está');return}
  S.players.push({n,sips:0,c:AVCOLORS[S.players.length%AVCOLORS.length]});
  i.value='';i.focus();renderPlayers();
}
function delPlayer(i){S.players.splice(i,1);renderPlayers()}
function renderPlayers(){
  const L=$('plist');L.innerHTML='';
  S.players.forEach((p,i)=>{
    const d=document.createElement('div');d.className='prow';
    d.innerHTML=`<div class="pav" style="background:${p.c}">${p.n[0].toUpperCase()}</div><div class="nm">${esc(p.n)}</div><button class="del" onclick="delPlayer(${i})">✕</button>`;
    L.appendChild(d);
  });
  $('phint').style.display=S.players.length?'none':'block';
  $('pcount').textContent=S.players.length;
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
function startMode(m){
  if(m.min&&S.players.length<m.min){toast(`Este modo necesita mínimo ${m.min} jugadores`);return}
  S.mode=m;S.deck=shuffle(m.deck);S.idx=0;S.rules=[];S.drawn=0;
  document.documentElement.style.setProperty('--accent',m.c);
  go('game');
  $('gmode').textContent=`${m.em} ${m.nm}`;
  showCard(S.deck[0]);
}
function pickPlayers(){
  let p1=rnd(S.players);
  if(S.players.length>1){let g=0;while(p1===S.lastP&&g++<6)p1=rnd(S.players)}
  let p2=p1;
  if(S.players.length>1){while(p2===p1)p2=rnd(S.players)}
  S.lastP=p1;return[p1,p2];
}
let curCard=null,curP1=null,curP2=null;
function showCard(raw){
  clearTimer();
  const c=parseCard(raw);curCard=c;
  const [p1,p2]=pickPlayers();curP1=p1;curP2=p2;
  let ans=null,txt=c.x;
  if(c.k==='p'&&txt.includes('§')){[txt,ans]=txt.split('§')}
  const html=esc(adapt(txt))
    .replace(/\{j2\}/g,`<span class="pj">${esc(p2.n)}</span>`)
    .replace(/\{j\}/g,`<span class="pj">${esc(p1.n)}</span>`);
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
    b.onclick=()=>{p.sips+=n;toast(`${p.n}: ${p.sips} ${S.noAlcohol?'puntos':'sorbos'} 🏆`)};q.appendChild(b)};
  if(txt.includes('{j}'))mk(p1);
  if(txt.includes('{j2}'))mk(p2);
  const all=document.createElement('button');all.className='qbtn';all.innerHTML=`+1 <b>todos</b>`;
  all.onclick=()=>{S.players.forEach(p=>p.sips++);toast('Todos +1 🍻')};q.appendChild(all);
}
function nextCard(skipped){
  const card=$('gcard');
  card.classList.add('out');
  // reglas activas: descontar
  S.rules.forEach(r=>r.left--);
  const expired=S.rules.filter(r=>r.left<=0);
  S.rules=S.rules.filter(r=>r.left>0);
  if(expired.length)toast('Regla terminada: '+expired[0].txt);
  // si la actual era regla y no la saltaron, activarla
  if(curCard&&curCard.k==='rg'&&!skipped){
    let t=adapt(curCard.x).replace(/\{j2\}/g,curP2.n).replace(/\{j\}/g,curP1.n);
    S.rules.push({txt:t,left:curCard.n||3});
  }
  setTimeout(()=>{
    S.idx++;
    if(S.idx>=S.deck.length){S.deck=shuffle(S.mode.deck);S.idx=0;toast('Mazo barajado de nuevo 🔄')}
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
    if(t<=0){clearTimer();d.textContent='⏰ ¡TIEMPO!';beep()}
  },1000);
}
function beep(){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);
    o.frequency.value=740;g.gain.setValueAtTime(.25,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.6);
    o.start();o.stop(ctx.currentTime+.6);
  }catch(e){}
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
    d.querySelectorAll('.sipbtns button').forEach(b=>b.onclick=()=>{p.sips=Math.max(0,p.sips+parseInt(b.dataset.a));renderBoard()});
    L.appendChild(d);
  });
  $('bhint').style.display=S.players.length?'none':'block';
  $('bfoot').textContent=S.players.length?(S.noAlcohol?'Puntos acumulados · el que más tiene paga una penitencia':'Sorbos estimados · si alguien va muy arriba, tócale agua 💧'):'';
}
function chg(n,v){const p=S.players.find(p=>p.n===n);if(p){p.sips=Math.max(0,p.sips+v);renderBoard()}}
function resetSips(){S.players.forEach(p=>p.sips=0);renderBoard();toast('Marcador en cero')}

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
  wSpinning=true;$('spinbtn').style.opacity=.5;
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
      beep();
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
renderModes();

/* ---------- pie de página con el conteo real ---------- */
function renderFootnote(){
  const cartas=MODES.reduce((s,m)=>s+m.deck.length,0);
  const modos=MODES.length+SPECIALS.length;
  const f=$('foot');
  if(f) f.innerHTML=`${cartas} cartas originales · ${modos} modos · funciona sin internet una vez cargado.<br>Bebe con responsabilidad. Nada de esto es obligatorio: saltar siempre es opción.`;
}
renderFootnote();
