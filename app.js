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

  angleEl.addEventListener('input', ()=> angleVal.textContent = angleEl.value);
  speedEl.addEventListener('input', ()=> speedVal.textContent = speedEl.value);
  gravityEl.addEventListener('input', ()=> gravityVal.textContent = gravityEl.value);
  massEl.addEventListener('input', ()=> massVal.textContent = massEl.value);

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

async function saveProgress(moduleKey, data){
  if(!firebaseLoaded) return console.warn('Firebase not loaded');
  // prefer explicit currentUser variable, but fall back to auth.currentUser to avoid timing/race issues
  const uid = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid);
  if(!uid) return console.warn('Not signed in (no uid)');
  const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
  const userRef = doc(db, 'users', uid);
  // write partial update to user doc under field 'progress'
  const payload = { [moduleKey]: data, lastUpdated: Date.now() };
  try{ await setDoc(userRef, { progress: payload }, { merge: true }); console.log('Saved', payload); }
  catch(e){ console.error('Save error', e); }
}

async function loadProgress(){
  if(!firebaseLoaded) return alert('Firebase belum terhubung');
  if(!currentUser) return alert('Silakan masuk terlebih dahulu');
  const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
  const userRef = doc(db, 'users', currentUser.uid);
  try{
    const snap = await getDoc(userRef);
    if(snap.exists()){
      const data = snap.data();
      if(data.progress) {
        // merge remote into local
        Object.assign(localState, data.progress);
        updateProgressUI();
        alert('Progress dimuat dari Firestore.');
      } else alert('Belum ada progress di server.');
    } else alert('Tidak ada dokumen user.');
  }catch(e){console.error(e); alert('Load error:'+e.message)}
}

// initial UI (update called in init)
console.log('App initialized.');