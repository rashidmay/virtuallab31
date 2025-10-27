// app.js - frontend interactivity and Firebase integration (ES modules)
// This file now tries to load Firebase modules dynamically. If the CDN modules fail to load
// (offline, network, or MIME/CSP issues), the rest of the UI remains functional and
// will show helpful messages when Firebase features are attempted.

// --- CONFIG: web app Firebase (paste from Firebase Console) ---
const firebaseConfig = {
  apiKey: "AIzaSyC_H8MZEO8EkAHzG6z4YZkBFmvI1jynroo",
  authDomain: "virtuallab31.firebaseapp.com",
  projectId: "virtuallab31",
  storageBucket: "virtuallab31.firebasestorage.app",
  messagingSenderId: "199857718937",
  appId: "1:199857718937:web:c64f2d8e14b6fb90481a08",
  measurementId: "G-8W3S1GWNZV"
};
// --------------------------------------------------------------

// Firebase runtime references (may remain null if dynamic import fails)
let auth = null;
let db = null;
let provider = null;
let firebaseLoaded = false;
// animation handle so we can cancel previous animation when re-running
let _animHandle = null;
// camera follow flag
let followBall = false;

async function tryInitFirebase(){
  try{
    const appModule = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js');
    const authModule = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js');
    const firestoreModule = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
    const app = appModule.initializeApp(firebaseConfig);
    auth = authModule.getAuth(app);
    provider = new authModule.GoogleAuthProvider();
    db = firestoreModule.getFirestore(app);
    // Bring selected functions into top-level scope for convenience
    // We'll reference the authModule / firestoreModule functions directly where needed.
    firebaseLoaded = true;
    console.log('Firebase modules loaded dynamically');
    return { authModule, firestoreModule };
  }catch(e){
    console.warn('Firebase modules failed to load — continuing without Firebase', e);
    firebaseLoaded = false;
    return {};
  }
}

// UI refs (grab from DOM)
const btnSignIn = document.getElementById('btn-signin');
const btnSignOut = document.getElementById('btn-signout');
const userInfo = document.getElementById('user-info');
const moduleArea = document.getElementById('module-area');
const moduleBtns = document.querySelectorAll('.module-btn');
const progressJson = document.getElementById('progress-json');
const btnSaveLocal = document.getElementById('btn-save-local');
const btnLoadLocal = document.getElementById('btn-load-local');

let currentUser = null;
let localState = { physics: {} };

// We'll initialize Firebase (if possible) then wire UI. Use an init wrapper so a failed
// dynamic import won't prevent the rest of the UI from working.
(async function init(){
  const modules = await tryInitFirebase();

  // Local helper wrappers which only call Firebase if loaded
  const safeSignIn = async ()=>{
    if(!firebaseLoaded) return alert('Firebase belum terhubung — periksa koneksi atau konfigurasi.');
    try{ const { signInWithPopup } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js');
          const res = await signInWithPopup(auth, provider); console.log('Signed in', res.user);
    }catch(e){ console.error(e); alert('Sign-in error:'+ (e.message||e)); }
  };
  const safeSignOut = async ()=>{
    if(!firebaseLoaded) return alert('Firebase belum terhubung.');
    try{ const { signOut } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js'); await signOut(auth); }
    catch(e){ console.error(e); }
  };

  // Attach auth handlers
  btnSignIn.addEventListener('click', safeSignIn);
  btnSignOut.addEventListener('click', safeSignOut);

  if(firebaseLoaded){
    // subscribe to auth state changes
    const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js');
    onAuthStateChanged(auth, user =>{
      if(user){
        currentUser = user;
        userInfo.textContent = user.displayName || user.email;
        btnSignIn.classList.add('hidden'); btnSignOut.classList.remove('hidden');
        // Automatically load saved preferences for this user
        try{ loadProgress(); }catch(e){ console.warn('Auto-load progress failed', e); }
      }
      else{
        currentUser = null;
        userInfo.textContent = 'Tidak masuk'; btnSignIn.classList.remove('hidden'); btnSignOut.classList.add('hidden');
      }
    });
  } else {
    // If Firebase not loaded, show offline hints
    userInfo.textContent = 'Firebase tidak tersedia';
    btnSignOut.classList.add('hidden');
  }

  // Module switching
  moduleBtns.forEach(b => b.addEventListener('click', ()=> loadModule(b.dataset.module)));

  function loadModule(name){
    // Clear module area
    moduleArea.innerHTML = '';
    if(name==='physics') renderPhysics();
  }

  // Attach save/load handlers (safe wrappers)
  btnSaveLocal.addEventListener('click', ()=>{
    if(!firebaseLoaded) return alert('Masuk untuk menyimpan ke Firestore (Firebase belum terhubung)');
    const userRef = (async ()=>{
      const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
      try{ await setDoc(doc(db, 'users', currentUser.uid), { progress: localState, lastSaved: Date.now() }, { merge: true }); alert('Disimpan.'); }
      catch(e){ console.error(e); alert('Gagal simpan'); }
    })();
  });
  btnLoadLocal.addEventListener('click', ()=> loadProgress());

  // Kick off by showing welcome
  updateProgressUI();
  // render a small debug panel for cache/queue/uid information
  renderDebugPanel();

  // (POV control moved into physics module UI)

})();

// --- Physics: Projectile simulation on canvas ---
function renderPhysics(){
  const container = document.createElement('div'); container.className='panel';
  container.innerHTML = `
    <h3>Fisika - Gerak Proyektil </h3>
    <div class="flex-row">
      <label>Sudut: <span id="angle-val">45</span>°
        <input id="angle" type="range" min="5" max="85" value="45">
      </label>
      <label>Kecepatan (m/s): <span id="speed-val">25</span>
        <input id="speed" type="range" min="5" max="100" value="25">
      </label>
      <label>Gravitasi (m/s²): <span id="g-val">9.8</span>
        <input id="gravity" type="range" min="1" max="20" step="0.1" value="9.8">
      </label>
      <label>Massa (kg): <span id="mass-val">1.0</span>
        <input id="mass" type="range" min="0.1" max="10" step="0.1" value="1.0">
      </label>
      <button id="run-sim" class="btn small">Jalankan Simulasi</button>
      <label class="pov-inline"><input id="pov-checkbox" type="checkbox"> Follow Ball</label>
    </div>
    <canvas id="physics-canvas" width="800" height="320"></canvas>
  `;
  moduleArea.appendChild(container);

  const angleEl = document.getElementById('angle');
  const angleVal = document.getElementById('angle-val');
  const speedEl = document.getElementById('speed');
  const speedVal = document.getElementById('speed-val');
  const gravityEl = document.getElementById('gravity');
  const gravityVal = document.getElementById('g-val');
  const massEl = document.getElementById('mass');
  const massVal = document.getElementById('mass-val');
  const runBtn = document.getElementById('run-sim');
  const canvas = document.getElementById('physics-canvas');
  const ctx = canvas.getContext('2d');

  // hook up POV checkbox inside the module
  const povCheckbox = document.getElementById('pov-checkbox');
  if(povCheckbox) povCheckbox.addEventListener('change', (e)=>{ followBall = e.target.checked; });

  // Debounced auto-save for user preferences (angle, speed, gravity, mass)
  let _savePrefsTimer = null;
  function getPhysicsPrefs(){
    return {
      angle: Number(angleEl.value),
      speed: Number(speedEl.value),
      gravity: Number(gravityEl.value),
      mass: Number(massEl.value)
    };
  }
  function scheduleSavePrefs(delay=700){
    if(_savePrefsTimer) clearTimeout(_savePrefsTimer);
    _savePrefsTimer = setTimeout(()=>{
      const prefs = getPhysicsPrefs();
      // store locally as well
      localState.physicsPrefs = prefs;
      updateProgressUI();
      if(firebaseLoaded) saveProgress('physicsPrefs', prefs);
    }, delay);
  }

  angleEl.addEventListener('input', ()=>{ angleVal.textContent = angleEl.value; scheduleSavePrefs(); });
  speedEl.addEventListener('input', ()=>{ speedVal.textContent = speedEl.value; scheduleSavePrefs(); });
  gravityEl.addEventListener('input', ()=>{ gravityVal.textContent = gravityEl.value; scheduleSavePrefs(); });
  massEl.addEventListener('input', ()=>{ massVal.textContent = massEl.value; scheduleSavePrefs(); });

  runBtn.addEventListener('click', ()=>{
    const angle = Number(angleEl.value) * Math.PI/180;
    const v = Number(speedEl.value);
    const g = Number(gravityEl.value);
    const mass = Number(massEl.value);
    simulateProjectile(ctx, canvas, angle, v, g, mass).then(result =>{
      // include the parameters in saved result
      result.gravity = g;
      result.mass = mass;
      result.weight = (mass * g).toFixed(2);
      localState.physics.last = result;
      updateProgressUI();
      if(firebaseLoaded && currentUser) saveProgress('physics', result);
    });
  });
  // Apply any loaded preferences into the controls after rendering
  applyUserPreferences();
}
async function simulateProjectile(ctx, canvas, angle, v, g=9.8, mass=1.0){
  // physics with optional quadratic air drag: Fd = -k * v * |v|
  // a = F/m -> drag accel = -(k/m) * v * |v|
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // scale meters -> px
  const scale = 5; // px per meter (simple)
  // initial velocities
  let vx = v * Math.cos(angle);
  let vy = v * Math.sin(angle);
  const k = 0.02; // drag coefficient (tunable)
  const dt = 0.02; // time step
  let t = 0;
  const points = [];
  let maxY = 0;
  // simulate using simple Euler integration for position and velocity
  let px = 0; // position x (m)
  let py = 0; // position y (m)
  let steps = 0;
  const maxSteps = 20000;
  while(steps < maxSteps){
    const speed = Math.sqrt(vx*vx + vy*vy);
    // drag accelerations (quadratic)
    const ax = (speed > 0) ? ( - (k/mass) * speed * vx ) : 0;
    const ay = -g + (speed > 0 ? ( - (k/mass) * speed * vy ) : 0);

    // integrate
    vx += ax * dt;
    vy += ay * dt;
    px += vx * dt;
    py += vy * dt;
    t += dt;

    if(py > maxY) maxY = py;

    // record point for drawing (convert to canvas coords)
    points.push({ x: px*scale + 20, y: canvas.height - (py*scale + 20) });

    // stop when projectile hits ground (y <= 0) after it has been launched
    if(py <= 0 && t > 0.02) break;
    steps++;
  }

  // draw path
  ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = '#7dd3fc';
  points.forEach((p,i)=>{ if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
  ctx.stroke();
  // start simple animation of a ball following the computed points
  if(_animHandle) cancelAnimationFrame(_animHandle);
  const ballRadius = 8;
  // draw a simple ground (rectangle + horizon line) at world y = canvas.height - 20
  function drawGround(ctx, canvas){
    const groundY = canvas.height - 20;
    // fill ground
    const ggrad = ctx.createLinearGradient(0, groundY, 0, canvas.height);
    ggrad.addColorStop(0, '#6b4226');
    ggrad.addColorStop(1, '#3b2a1a');
    ctx.fillStyle = ggrad;
    // draw a wide ground area to cover translated view
    ctx.fillRect(-3000, groundY, canvas.width + 6000, canvas.height - groundY + 40);
    // horizon line
    ctx.beginPath(); ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 2; ctx.moveTo(-3000, groundY); ctx.lineTo(canvas.width+3000, groundY); ctx.stroke();
  }
  function drawPath(){
    // draw ground first
    drawGround(ctx, canvas);
    // draw trajectory
    ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = '#7dd3fc';
    points.forEach((p,i)=>{ if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
    ctx.stroke();
  }
  function animateBall(){
    let i = 0;
    const total = points.length;
    function frame(){
      // clear canvas
      ctx.clearRect(0,0,canvas.width,canvas.height);

      // Determine translation to center the ball if followBall is enabled
      let tx = 0, ty = 0;
      if(followBall && i < total){
        const pcenter = points[i];
        tx = (canvas.width/2) - pcenter.x;
        ty = (canvas.height/2) - pcenter.y;
      }

      ctx.save();
      if(tx !== 0 || ty !== 0) ctx.translate(tx, ty);

  // draw path (translated if followBall)
  drawPath();

      // draw ball at current point (if exists)
      if(i < total){
        const p = points[i];
        ctx.beginPath(); ctx.fillStyle = '#fb7185'; ctx.strokeStyle = '#ffffff22';
        ctx.arc(p.x, p.y, ballRadius, 0, Math.PI*2);
        ctx.fill();
      }

      ctx.restore();

      i += 1;
      if(i < total) {
        _animHandle = requestAnimationFrame(frame);
      } else {
        _animHandle = null;
      }
    }
    frame();
  }
  // draw initial static path then animate
  drawPath();
  animateBall();

  const flightTime = +t.toFixed(2);
  const range = +(px).toFixed(2);
  const maxHeight = +maxY.toFixed(2);
  return { angleDeg: (angle*180/Math.PI).toFixed(1), speed: v, flightTime, range, maxHeight };
}



// --- Progress UI and Firestore save/load ---
function updateProgressUI(){ progressJson.textContent = JSON.stringify(localState, null, 2); }

// Local cache helpers and offline queue
function saveToLocalCache(key, obj){
  try{ localStorage.setItem(key, JSON.stringify(obj)); }catch(e){ console.warn('localStorage set failed', e); }
}
function readFromLocalCache(key){
  try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }catch(e){ console.warn('localStorage read failed', e); return null; }
}
function enqueuePendingSave(item){
  try{
    const q = readFromLocalCache('pending_saves') || [];
    q.push(item);
    saveToLocalCache('pending_saves', q);
  }catch(e){ console.warn('enqueuePendingSave failed', e); }
}
async function flushPendingSaves(){
  if(!navigator.onLine) return;
  const q = readFromLocalCache('pending_saves') || [];
  if(!q.length) return;
  // attempt to save each item
  const remaining = [];
  for(const item of q){
    try{
      // call saveProgress which will attempt Firestore write
      await saveProgress(item.moduleKey, item.data);
      // after successful save, also store cached_progress_<uid>
      if(item.uid) saveToLocalCache('cached_progress_'+item.uid, localState);
    }catch(e){
      console.warn('flushPendingSaves: retry failed for', item, e);
      remaining.push(item);
    }
  }
  saveToLocalCache('pending_saves', remaining);
}

// try to flush when browser regains connectivity
window.addEventListener('online', ()=>{ console.log('Browser online — flushing pending saves'); flushPendingSaves(); });

// --- Small debug panel to inspect cache/pending queue and trigger flush ---
function renderDebugPanel(){
  // avoid creating twice
  if(document.getElementById('debug-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.style.position = 'fixed';
  panel.style.right = '10px';
  panel.style.bottom = '10px';
  panel.style.width = '320px';
  panel.style.maxHeight = '40vh';
  panel.style.overflow = 'auto';
  panel.style.background = 'rgba(17,24,39,0.95)';
  panel.style.color = '#fff';
  panel.style.fontSize = '12px';
  panel.style.padding = '10px';
  panel.style.borderRadius = '8px';
  panel.style.boxShadow = '0 6px 18px rgba(0,0,0,0.4)';
  panel.style.zIndex = 9999;

  panel.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px">Debug · Sync & Cache</div>
    <div><strong>UID:</strong> <span id="debug-uid">(not signed)</span></div>
    <div><strong>Cached progress:</strong><pre id="debug-cached" style="white-space:pre-wrap;background:#0f172a;padding:6px;border-radius:4px;margin:6px 0;max-height:120px;overflow:auto"></pre></div>
    <div><strong>Pending saves:</strong> <span id="debug-pending-count">0</span></div>
    <pre id="debug-pending" style="white-space:pre-wrap;background:#0f172a;padding:6px;border-radius:4px;margin:6px 0;max-height:120px;overflow:auto"></pre>
    <div style="display:flex;gap:6px;margin-top:6px"><button id="debug-flush" class="btn small">Flush Now</button><button id="debug-clear" class="btn small">Clear Pending</button></div>
    <div style="margin-top:6px;color:#94a3b8;font-size:11px" id="debug-status">status: idle</div>
  `;

  document.body.appendChild(panel);

  function refreshDebug(){
    const uid = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || null;
    document.getElementById('debug-uid').textContent = uid || '(not signed)';
    const cached = uid ? readFromLocalCache('cached_progress_'+uid) : null;
    document.getElementById('debug-cached').textContent = cached ? JSON.stringify(cached, null, 2) : '(none)';
    const pending = readFromLocalCache('pending_saves') || [];
    document.getElementById('debug-pending-count').textContent = pending.length;
    document.getElementById('debug-pending').textContent = pending.length ? JSON.stringify(pending, null, 2) : '(none)';
  }

  document.getElementById('debug-flush').addEventListener('click', async ()=>{
    document.getElementById('debug-status').textContent = 'status: flushing...';
    try{ await flushPendingSaves(); document.getElementById('debug-status').textContent = 'status: flush complete'; }
    catch(e){ document.getElementById('debug-status').textContent = 'status: flush error'; console.error(e); }
    refreshDebug();
    setTimeout(()=>{ document.getElementById('debug-status').textContent = 'status: idle'; }, 1500);
  });

  document.getElementById('debug-clear').addEventListener('click', ()=>{
    saveToLocalCache('pending_saves', []); refreshDebug();
  });

  // refresh periodically
  refreshDebug();
  setInterval(refreshDebug, 2500);
}

// Apply loaded preferences to UI controls (if present). Called after loadProgress and when modules render.
function applyUserPreferences(){
  try{
    // physics prefs may be stored under localState.physicsPrefs or last result
    const prefs = (localState && (localState.physicsPrefs || (localState.physics && localState.physics.last && {
      angle: Number(localState.physics.last.angleDeg || localState.physics.last.angle || 45),
      speed: Number(localState.physics.last.speed || 25),
      gravity: Number(localState.physics.last.gravity || 9.8),
      mass: Number(localState.physics.last.mass || 1.0)
    }))) || null;
    if(!prefs) return;
    // set inputs if present
    const angleEl = document.getElementById('angle');
    const angleVal = document.getElementById('angle-val');
    const speedEl = document.getElementById('speed');
    const speedVal = document.getElementById('speed-val');
    const gravityEl = document.getElementById('gravity');
    const gravityVal = document.getElementById('g-val');
    const massEl = document.getElementById('mass');
    const massVal = document.getElementById('mass-val');
    if(angleEl && typeof prefs.angle !== 'undefined'){ angleEl.value = prefs.angle; if(angleVal) angleVal.textContent = prefs.angle; }
    if(speedEl && typeof prefs.speed !== 'undefined'){ speedEl.value = prefs.speed; if(speedVal) speedVal.textContent = prefs.speed; }
    if(gravityEl && typeof prefs.gravity !== 'undefined'){ gravityEl.value = prefs.gravity; if(gravityVal) gravityVal.textContent = prefs.gravity; }
    if(massEl && typeof prefs.mass !== 'undefined'){ massEl.value = prefs.mass; if(massVal) massVal.textContent = prefs.mass; }
  }catch(e){ console.warn('applyUserPreferences failed', e); }
}

async function saveProgress(moduleKey, data){
  if(!firebaseLoaded) return console.warn('Firebase not loaded');
  // prefer explicit currentUser variable, but fall back to auth.currentUser to avoid timing/race issues
  const uid = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid);
  if(!uid) return console.warn('Not signed in (no uid)');
  const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
  const userRef = doc(db, 'users', uid);
  // write partial update to user doc under field 'progress'
  const payload = { [moduleKey]: data, lastUpdated: Date.now() };
  try{
    await setDoc(userRef, { progress: payload }, { merge: true });
    console.log('Saved', payload);
    // update local cache copy of the full localState so offline loads can use it
    try{ saveToLocalCache('cached_progress_'+uid, localState); }catch(e){/*noop*/}
    return payload;
  }catch(e){
    console.error('Save error', e);
    // If offline or transient, queue the save and persist local copy
    const isOffline = (!navigator.onLine) || (e && e.message && e.message.toLowerCase().includes('client is offline')) || (e && e.code === 'unavailable');
    // Always save to local cache so UI can recover
    try{ saveToLocalCache('cached_progress_'+uid, localState); }catch(ex){}
    if(isOffline){
      enqueuePendingSave({ uid, moduleKey, data });
      console.warn('Save queued (offline). It will flush when online.');
    }
    throw e;
  }
}


async function loadProgress(){
  if(!firebaseLoaded) return alert('Firebase belum terhubung');
  if(!currentUser) return alert('Silakan masuk terlebih dahulu');
  const uid = currentUser.uid;
  // If offline, fall back to cached local copy
  if(!navigator.onLine){
    const cached = readFromLocalCache('cached_progress_'+uid);
    if(cached){ Object.assign(localState, cached); updateProgressUI(); applyUserPreferences(); alert('Sedang offline — memuat progress dari cache lokal.'); return; }
    return alert('Sedang offline dan tidak ada cache lokal.');
  }
  const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
  const userRef = doc(db, 'users', uid);
  try{
    const snap = await getDoc(userRef);
    if(snap.exists()){
      const data = snap.data();
      if(data.progress) {
        // merge remote into local
        Object.assign(localState, data.progress);
        updateProgressUI();
        // apply any loaded preferences to controls
        applyUserPreferences();
        // cache remote copy locally
        try{ saveToLocalCache('cached_progress_'+uid, data.progress); }catch(e){}
        alert('Progress dimuat dari Firestore.');
      } else alert('Belum ada progress di server.');
    } else alert('Tidak ada dokumen user.');
  }catch(e){
    console.error(e);
    // if client offline error, try local cache
    const msg = e && e.message ? e.message.toLowerCase() : '';
    if(msg.includes('client is offline') || e.code === 'unavailable'){
      const cached = readFromLocalCache('cached_progress_'+uid);
      if(cached){ Object.assign(localState, cached); updateProgressUI(); applyUserPreferences(); alert('Gagal ambil dari server — memuat cache lokal.'); return; }
    }
    alert('Load error:'+ (e.message||e));
  }
}

// initial UI (update called in init)
console.log('App initialized.');