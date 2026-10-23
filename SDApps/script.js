const API = {
  async load(file) {
    try {
      const res = await fetch('/db/' + encodeURIComponent(file) + '?t=' + Date.now());
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } catch (e) {
      console.warn(`Could not fetch ${file}, using localStorage`, e);
      const ls = localStorage.getItem('sdapp_' + file);
      return ls ? JSON.parse(ls) : null;
    }
  },
  async save(file, data) {
    try {
      const res = await fetch('/save?file=' + encodeURIComponent(file), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('save failed');
    } catch (e) {
      console.warn(`Save of ${file} failed, using localStorage`, e);
      localStorage.setItem('sdapp_' + file, JSON.stringify(data));
    }
  }
};

let DB=null, REQUESTS=null, ANNOUNCEMENTS=null, ITEMS=null, COMMENTS=null, LIKES=null,
    CARALLOW=null, REGCARS=null, CARREQ=null, COMMUNITY=null, PERSONAL=null;
let currentUser=null, userRole=null, isSignupMode=false;
let activeChatPeer = null;

const utilityData = [
  { month:'May 2024', electricity:210, water:7.1, carbon:138 },
  { month:'June 2024', electricity:198, water:6.8, carbon:128 },
  { month:'July 2024', electricity:225, water:7.5, carbon:145 },
  { month:'August 2024', electricity:195, water:6.5, carbon:124 },
  { month:'September 2024', electricity:156, water:6.0, carbon:98 },
  { month:'October 2024', electricity:184, water:6.2, carbon:112 }
];

function applyDarkMode(isDark){
  document.body.classList.toggle('dark', isDark);
  const btn = document.getElementById('darkmodeBtn');
  if (btn) {
    const s = btn.querySelector('span'), i = btn.querySelector('i');
    if (s) s.textContent = isDark ? 'Light mode' : 'Dark mode';
    if (i) i.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
  }
  localStorage.setItem('sdapp_darkmode', isDark ? '1' : '0');
}
function toggleDarkMode(){ applyDarkMode(!document.body.classList.contains('dark')); }
(function initDarkMode(){
  const saved = localStorage.getItem('sdapp_darkmode');
  const sys = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const d = saved !== null ? saved === '1' : sys;
  if (d) applyDarkMode(true);
})();

async function bootstrap(){
  const [db, req, ann, items, comments, likes, carallow, regcars, carreq, community, personal] = await Promise.all([
    API.load('db.json'), API.load('request.json'), API.load('announcement.json'),
    API.load('item.json'), API.load('itemComments.json'), API.load('itemLike.json'),
    API.load('carAllow.json'), API.load('registeredCar.json'), API.load('carRequest.json'),
    API.load('communityChat.json'), API.load('personalChat.json')
  ]);
  DB = db || { admin:[], residents:[] };
  REQUESTS = req || { request:[] };
  ANNOUNCEMENTS = ann || { announcement:[] };
  ITEMS = items || {};
  COMMENTS = comments || { Likes:[] };
  LIKES = likes || { residents:[] };
  CARALLOW = carallow || { residents:[] };
  REGCARS = regcars || { cars:[] };
  CARREQ = carreq || { cars:[] };
  COMMUNITY = community || { conversation:[] };
  PERSONAL = personal || { conversation:[{}] };

  if (!Array.isArray(DB.admin)) DB.admin=[];
  if (!Array.isArray(DB.residents)) DB.residents=[];
  if (!Array.isArray(REQUESTS.request)) REQUESTS.request=[];
  if (!Array.isArray(ANNOUNCEMENTS.announcement)) ANNOUNCEMENTS.announcement=[];
  if (!Array.isArray(COMMENTS.Likes)) COMMENTS.Likes=[];
  if (!Array.isArray(LIKES.residents)) LIKES.residents=[];
  if (!Array.isArray(CARALLOW.residents)) CARALLOW.residents=[];
  if (!Array.isArray(REGCARS.cars)) REGCARS.cars=[];
  if (!Array.isArray(CARREQ.cars)) CARREQ.cars=[];
  if (!Array.isArray(COMMUNITY.conversation)) COMMUNITY.conversation = [];
  if (!Array.isArray(PERSONAL.conversation)) PERSONAL.conversation = [{}];
  if (PERSONAL.conversation.length === 0) PERSONAL.conversation.push({});
  if (typeof PERSONAL.conversation[0] !== 'object' || PERSONAL.conversation[0] === null) PERSONAL.conversation[0] = {};
  populateCategories();
}
function populateCategories(){
  const sel = document.getElementById('itemCategory');
  sel.innerHTML = '';
  Object.keys(ITEMS).forEach(cat => {
    const o = document.createElement('option'); o.value = cat; o.textContent = cat; sel.appendChild(o);
  });
}

function nextNumeric(arr, field, prefix, pad){
  const max = arr.reduce((m,o)=>{ const n = parseInt((o[field]||'').replace(prefix,''),10); return !isNaN(n) && n>m ? n : m; }, 0);
  return prefix + String(max+1).padStart(pad,'0');
}
const generateNextUID = () => nextNumeric([...DB.admin, ...DB.residents], 'UID', 'U', 4);
const generateNextAID = () => nextNumeric(ANNOUNCEMENTS.announcement, 'AID', 'A', 4);
const generateNextIID = () => {
  const all=[]; Object.values(ITEMS).forEach(l=>l.forEach(i=>all.push(i)));
  return nextNumeric(all, 'IID', 'I', 4);
};
const generateNextICID = () => nextNumeric(COMMENTS.Likes, 'ICID', 'IC', 4);

function findUserByUID(uid){ return [...DB.admin, ...DB.residents].find(u => u.UID === uid); }
function findUserRole(uid){ return DB.admin.some(a => a.UID === uid) ? 'admin' : 'resident'; }
function findCarByCID(cid){ return (REGCARS.cars || []).find(c => c.CID === cid); }
function formatAnnTime(t){
  const s = String(t);
  if (s.length !== 12) return s;
  return `${s.slice(0,2)}/${s.slice(2,4)}/${s.slice(4,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
}
function formatChatTime(t){
  const s = String(t);
  if (s.length !== 12) return s;
  return `${s.slice(8,10)}:${s.slice(10,12)}`;
}
function currentTimeNumber(){
  const d = new Date(), pad = n => String(n).padStart(2,'0');
  return parseInt(`${pad(d.getDate())}${pad(d.getMonth()+1)}${d.getFullYear()}${pad(d.getHours())}${pad(d.getMinutes())}`, 10);
}
function currentShortDate(){
  const d = new Date(), pad = n => String(n).padStart(2,'0');
  return `${pad(d.getDate())}${pad(d.getMonth()+1)}${d.getFullYear()}`;
}
function likeCountFor(iid){ return LIKES.residents.filter(r => (r.Liked||[]).includes(iid)).length; }
function userLikesThis(iid){
  if (!currentUser) return false;
  const row = LIKES.residents.find(r => r.UID === currentUser.UID);
  return !!(row && (row.Liked||[]).includes(iid));
}
function findItemByIID(iid){
  for (const cat of Object.keys(ITEMS)) {
    const hit = (ITEMS[cat]||[]).find(it => it.IID === iid);
    if (hit) return { category: cat, ...hit };
  }
  return null;
}
function canDeleteItem(it){
  if (!currentUser) return false;
  if (userRole === 'admin') return true;
  return it.UID === currentUser.UID;
}

function renderVisitorCard(){
  const body = document.getElementById('visitorCardBody');
  const pill = document.getElementById('visitorPill');
  if (!currentUser) return;
  const myRequests = (CARREQ.cars || []).filter(c => c.UID === currentUser.UID);
  if (myRequests.length === 0) {
    body.innerHTML = `
      <div style="text-align:center;padding:2rem;color:var(--text-faint);">
        <i class="fas fa-car" style="font-size:2rem;color:var(--text-faint);opacity:.4;margin-bottom:.5rem;display:block;"></i>
        No car request pending entry.
      </div>`;
    pill.textContent = 'NO REQUEST';
    return;
  }
  const cells = myRequests.map(req => {
    const car = findCarByCID(req.CID);
    const imgPath = (car && car.Image) || req.Image || '';
    return `
      <div class="visitor-car-cell" data-cid="${req.CID}">
        <div class="visitor-car-image">
          ${imgPath ? `<img src="${imgPath}" alt="${req.CID}" onerror="this.outerHTML='<div class=&quot;placeholder&quot;>🚗</div>'">` : `<div class="placeholder">🚗</div>`}
        </div>
        <div class="visitor-car-info">
          <div class="plate-thumb">${req.CID}</div>
          <div class="meta">
            <p>Requesting entry</p>
            <p class="small">From UID ${req.UID}</p>
          </div>
        </div>
      </div>`;
  }).join('');
  body.innerHTML = `
    <div class="visitor-cars-grid">${cells}</div>
    <div class="visitor-detail" style="margin-bottom:12px;">
      <p style="font-weight:500;">Allow this car to enter?</p>
      <p class="small">If allowed, the CID is added to your approved guests.</p>
    </div>
    <div class="btn-group">
      <button class="btn btn-primary" id="allowVisitorBtn"><i class="fas fa-check-circle"></i> Allow & remember</button>
      <button class="btn btn-outline" id="denyVisitorBtn"><i class="fas fa-times-circle"></i> Deny</button>
    </div>`;
  pill.textContent = `LIVE · ${myRequests.length} REQUEST${myRequests.length !== 1 ? 'S' : ''}`;
  const allowBtn = document.getElementById('allowVisitorBtn');
  if (allowBtn) allowBtn.onclick = allowVisitor;
  const denyBtn = document.getElementById('denyVisitorBtn');
  if (denyBtn) denyBtn.onclick = denyVisitor;
}

async function allowVisitor(){
  if (!currentUser) return;
  const myReqIdx = CARREQ.cars.findIndex(c => c.UID === currentUser.UID);
  if (myReqIdx === -1) return;
  const req = CARREQ.cars[myReqIdx];
  CARREQ.cars.splice(myReqIdx, 1);
  await API.save('carRequest.json', CARREQ);
  let allowRow = CARALLOW.residents.find(r => r.UID === currentUser.UID);
  if (!allowRow) { allowRow = { UID: currentUser.UID, CID: [] }; CARALLOW.residents.push(allowRow); }
  if (!allowRow.CID.includes(req.CID)) allowRow.CID.push(req.CID);
  await API.save('carAllow.json', CARALLOW);
  renderVisitorCard();
  renderGuests();
}
async function denyVisitor(){
  if (!currentUser) return;
  const idx = CARREQ.cars.findIndex(c => c.UID === currentUser.UID);
  if (idx === -1) return;
  if (!confirm('Deny this car request?')) return;
  CARREQ.cars.splice(idx, 1);
  await API.save('carRequest.json', CARREQ);
  renderVisitorCard();
}

function showAuthError(m){ const e = document.getElementById('authError'); e.textContent = m; e.classList.add('show'); }
function hideAuthError(){ document.getElementById('authError').classList.remove('show'); }
function toggleAuthMode(){
  isSignupMode = !isSignupMode;
  document.getElementById('authTitle').textContent = isSignupMode ? 'Create account' : 'Welcome back';
  document.getElementById('authSubtitle').textContent = isSignupMode ? 'Register as a new resident' : 'Sign in to your SDApp account';
  document.getElementById('authBtn').textContent = isSignupMode ? 'Sign Up' : 'Sign In';
  document.getElementById('toggleAuth').textContent = isSignupMode ? 'Already have an account? Sign in' : "Don't have an account? Sign up";
  hideAuthError();
}
async function handleAuth(){
  const u = document.getElementById('usernameInput').value.trim();
  const p = document.getElementById('passwordInput').value.trim();
  if (!u || !p) { showAuthError('Please fill in all fields'); return; }
  if (!DB) { showAuthError('Database not loaded yet, please refresh.'); return; }
  if (isSignupMode) {
    if ([...DB.admin, ...DB.residents].some(x => x.username.toLowerCase() === u.toLowerCase())) { showAuthError('Username already taken'); return; }
    if (REQUESTS.request.some(r => r.username.toLowerCase() === u.toLowerCase())) { showAuthError('A request with this username is already pending'); return; }
    REQUESTS.request.push({ username:u, password:p, name:u, requestedAt:new Date().toISOString() });
    await API.save('request.json', REQUESTS);
    alert('Registration submitted! Please wait for admin approval.');
    toggleAuthMode();
    document.getElementById('usernameInput').value = '';
    document.getElementById('passwordInput').value = '';
    return;
  }
  const a = DB.admin.find(x => x.username === u && x.password === p);
  if (a) { currentUser = a; userRole = 'admin'; loginSuccess(); return; }
  const r = DB.residents.find(x => x.username === u && x.password === p);
  if (r) { currentUser = r; userRole = 'resident'; loginSuccess(); return; }
  showAuthError('Invalid username or password');
}
function loginSuccess(){
  hideAuthError();
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userRole').textContent = userRole === 'admin' ? 'Administrator' : 'Resident';
  document.getElementById('greetingText').textContent = `Good morning, ${currentUser.name.split(' ')[0]} 👋`;
  document.getElementById('greetingSub').textContent = userRole === 'admin' ? 'SDApp · Admin panel' : 'SDApp · Resident panel';
  document.querySelectorAll('.admin-only').forEach(el => { el.style.display = userRole === 'admin' ? '' : 'none'; });
  renderAll();
  document.getElementById('usernameInput').value = '';
  document.getElementById('passwordInput').value = '';
}
function logout(){
  currentUser = null; userRole = null;
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
  isSignupMode = false; toggleAuthMode();
  document.getElementById('usernameInput').value = '';
  document.getElementById('passwordInput').value = '';
}

function renderAll(){
  renderVisitorCard();
  renderGuests();
  renderUtilities();
  renderMarketplace();
  renderDashMarketPreview();
  renderLikedItems();
  renderCommunityChat();
  renderPersonalPeople();
  renderPersonalThread();
  renderAnnouncements();
  updateDashChatPreview();
  if (userRole === 'admin') { renderAdminApprovals(); renderAdminUsers(); }
}

function updateDashChatPreview(){
  const el = document.getElementById('dashChatPreviewText');
  if (!el) return;
  const msgs = COMMUNITY.conversation || [];
  if (msgs.length === 0) { el.textContent = 'No messages yet'; return; }
  const last = [...msgs].sort((a,b) => b.time - a.time)[0];
  el.textContent = `“${last.Context}” · ${formatChatTime(last.time)}`;
}

function renderGuests(){
  const list = document.getElementById('guestList');
  const count = document.getElementById('guestCount');
  if (!currentUser) { count.textContent = '0 saved'; list.innerHTML = ''; return; }
  const row = (CARALLOW.residents || []).find(r => r.UID === currentUser.UID);
  const cids = (row && Array.isArray(row.CID)) ? row.CID : [];
  if (cids.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-faint);">
      <i class="fas fa-car" style="font-size:2rem;color:var(--text-faint);opacity:.4;margin-bottom:.5rem;display:block;"></i>
      No allowed guests yet. Approve a car request from the Dashboard.
    </div>`;
    count.textContent = '0 saved';
    return;
  }
  count.textContent = `${cids.length} saved`;
  list.innerHTML = cids.map((cid) => {
    const car = findCarByCID(cid);
    const imgPath = car && car.Image ? car.Image : '';
    const img = imgPath
      ? `<img src="${imgPath}" alt="${cid}" onerror="this.outerHTML='<div class=&quot;placeholder&quot;>🚗</div>'">`
      : `<div class="placeholder">🚗</div>`;
    return `
      <div class="guest-card">
        <div class="left">
          <div class="guest-image">${img}</div>
          <div class="plate-small">${cid}</div>
          <div class="info">
            <h4>Registered vehicle</h4>
            <p><i class="fas fa-check-circle" style="color:var(--accent)"></i> Approved · Auto-gate on</p>
          </div>
        </div>
        <div class="guest-actions">
          <div class="badge">Auto-gate on</div>
          <button class="guest-reject-btn" onclick="rejectGuest('${cid}')"><i class="fas fa-trash"></i> Reject</button>
        </div>
      </div>`;
  }).join('');
}
async function rejectGuest(cid){
  if (!currentUser) return;
  if (!confirm(`Remove ${cid} from allowed guests?`)) return;
  const row = (CARALLOW.residents || []).find(r => r.UID === currentUser.UID);
  if (!row) return;
  const i = row.CID.indexOf(cid);
  if (i === -1) return;
  row.CID.splice(i, 1);
  await API.save('carAllow.json', CARALLOW);
  renderGuests();
}

function renderUtilities(){
  document.getElementById('utilityTableBody').innerHTML = utilityData.map((row,i) => {
    const c = i === utilityData.length - 1;
    return `<tr>
      <td style="${c?'font-weight:600;color:var(--accent);':''}">${row.month}${c?' (current)':''}</td>
      <td style="${c?'font-weight:600;':''}">${row.electricity}</td>
      <td style="${c?'font-weight:600;':''}">${row.water}</td>
      <td style="${c?'font-weight:600;color:var(--accent);':''}">${row.carbon}</td>
    </tr>`;
  }).join('');
}

function flattenItems(){
  const out=[]; Object.keys(ITEMS).forEach(cat => (ITEMS[cat]||[]).forEach(it => out.push({ category:cat, ...it })));
  return out;
}
function itemCardHtml(it){
  const seller = findUserByUID(it.UID);
  const sellerName = seller ? seller.name : 'Unknown';
  const img = it.Image ? `<img src="${it.Image}" alt="${it.Name}" onerror="this.outerHTML='<div class=&quot;placeholder&quot;>📦</div>'">` : `<div class="placeholder">📦</div>`;
  const likes = likeCountFor(it.IID);
  const deletable = canDeleteItem(it);
  const delBtn = deletable
    ? `<button class="item-delete-btn" title="Delete listing" onclick="event.stopPropagation();deleteItem('${it.IID}')"><i class="fas fa-trash"></i></button>`
    : '';
  return `
    <div class="market-card" onclick="openItemModal('${it.IID}')">
      ${delBtn}
      <div class="card-image">${img}</div>
      <div class="card-body">
        <h4 title="${it.Name}">${it.Name}</h4>
        <div class="desc">${it.category} · ${it.Address || ''}</div>
        <div class="price">RM ${it.Price}</div>
        <span class="state-tag">${it.State || ''}</span>
        <div class="like-row"><i class="fas fa-heart"></i> ${likes} like${likes!==1?'s':''}</div>
        <div class="seller"><i class="fas fa-user"></i> ${sellerName}</div>
      </div>
    </div>`;
}
function renderMarketplace(){
  const grid = document.getElementById('marketplaceGrid');
  const search = (document.getElementById('marketSearch')?.value || '').toLowerCase();
  let items = flattenItems();
  if (search) items = items.filter(it =>
    it.Name.toLowerCase().includes(search) ||
    it.category.toLowerCase().includes(search) ||
    (it.Address||'').toLowerCase().includes(search) ||
    (it.State||'').toLowerCase().includes(search));
  document.getElementById('listingCount').textContent = `${items.length} listing${items.length!==1?'s':''}`;
  if (items.length === 0) {
    grid.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-faint);grid-column:1/-1;">
      <i class="fas fa-box-open" style="font-size:2rem;color:var(--text-faint);opacity:.4;margin-bottom:.5rem;display:block;"></i>
      No listings match your search.
    </div>`;
    return;
  }
  grid.innerHTML = items.map(itemCardHtml).join('');
}
function renderDashMarketPreview(){
  const wrap = document.getElementById('dashMarketPreview');
  const items = flattenItems().slice(0,2);
  if (items.length === 0) { wrap.innerHTML = `<div style="color:var(--text-faint);font-size:.8rem;padding:.5rem;">No items yet.</div>`; return; }
  wrap.innerHTML = items.map(it => `
    <div class="market-item">
      <div class="icon-bubble"><i class="fas fa-box"></i></div>
      <h4 title="${it.Name}">${it.Name}</h4>
      <p>RM ${it.Price} · ${likeCountFor(it.IID)} likes</p>
    </div>`).join('');
}
function renderLikedItems(){
  const grid = document.getElementById('likedGrid');
  const countEl = document.getElementById('likedCount');
  if (!currentUser) return;
  const row = LIKES.residents.find(r => r.UID === currentUser.UID);
  const likedIds = row ? (row.Liked||[]) : [];
  const items = flattenItems().filter(it => likedIds.includes(it.IID));
  countEl.textContent = `${items.length} item${items.length!==1?'s':''}`;
  if (items.length === 0) {
    grid.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-faint);grid-column:1/-1;">
      <i class="fas fa-heart" style="font-size:2rem;color:var(--text-faint);opacity:.4;margin-bottom:.5rem;display:block;"></i>
      You haven't liked any items yet.
    </div>`;
    return;
  }
  grid.innerHTML = items.map(itemCardHtml).join('');
}

window.deleteItem = async function(iid){
  const it = findItemByIID(iid);
  if (!it) return;
  if (!canDeleteItem(it)) { alert('You can only delete your own listings.'); return; }
  if (!confirm(`Delete "${it.Name}"?`)) return;
  for (const cat of Object.keys(ITEMS)) {
    const idx = (ITEMS[cat]||[]).findIndex(x => x.IID === iid);
    if (idx !== -1) { ITEMS[cat].splice(idx, 1); break; }
  }
  await API.save('item.json', ITEMS);
  LIKES.residents.forEach(r => { if (Array.isArray(r.Liked)) r.Liked = r.Liked.filter(x => x !== iid); });
  await API.save('itemLike.json', LIKES);
  COMMENTS.Likes = COMMENTS.Likes.filter(c => c.IID !== iid);
  await API.save('itemComments.json', COMMENTS);
  closeItemModal();
  renderMarketplace();
  renderDashMarketPreview();
  renderLikedItems();
  alert('Listing deleted.');
};

let activeItemIID = null;
function openItemModal(iid){
  activeItemIID = iid;
  const it = findItemByIID(iid);
  if (!it) return;
  const seller = findUserByUID(it.UID);
  const sellerName = seller ? seller.name : 'Unknown';
  const img = it.Image ? `<img src="${it.Image}" alt="${it.Name}" onerror="this.outerHTML='<div class=&quot;placeholder&quot;>📦</div>'">` : `<div class="placeholder">📦</div>`;
  const liked = userLikesThis(iid);
  const likeCount = likeCountFor(iid);
  const comments = COMMENTS.Likes.filter(c => c.IID === iid);
  const deletable = canDeleteItem(it);

  document.getElementById('itemModalBody').innerHTML = `
    <div class="item-detail-image">${img}</div>
    <div class="item-detail-info">
      <h3>${it.Name}</h3>
      <div class="price">RM ${it.Price}</div>
      <div class="meta">${it.category} · ${it.Address || ''} · ${it.State || ''}</div>
      <div class="meta">Seller: <strong>${sellerName}</strong></div>
    </div>
    <div class="item-detail-actions">
      <button class="btn ${liked?'btn-primary like-active':'btn-outline'}" onclick="toggleLike('${iid}')">
        <i class="fas fa-heart"></i> ${liked?'Liked':'Like'} (${likeCount})
      </button>
      <button class="btn btn-outline" onclick="startPersonalChatWith('${it.UID}')">
        <i class="fas fa-comment"></i> Message seller
      </button>
      ${deletable ? `<button class="btn btn-outline" onclick="deleteItem('${iid}')"><i class="fas fa-trash"></i> Delete</button>` : ''}
    </div>
    <div class="comments-section">
      <h4><i class="fas fa-comments"></i> Comments (${comments.length})</h4>
      ${comments.map(c => {
        const u = findUserByUID(c.Postedby);
        const n = u ? u.name : c.Postedby;
        return `<div class="comment-row">
          <div class="c-avatar">${n.charAt(0).toUpperCase()}</div>
          <div class="c-body">
            <div class="c-head"><strong>${n}</strong><span>${c.Posted}</span></div>
            <p>${c.Comments}</p>
          </div>
        </div>`;
      }).join('') || `<p style="font-size:.8rem;color:var(--text-faint);">No comments yet. Be the first!</p>`}
      <div class="comment-input-row">
        <input type="text" id="commentInput" placeholder="Add a comment...">
        <button onclick="submitComment('${iid}')"><i class="fas fa-paper-plane"></i></button>
      </div>
    </div>`;
  document.getElementById('itemModal').classList.add('open');
}
function closeItemModal(){ document.getElementById('itemModal').classList.remove('open'); activeItemIID = null; }

async function toggleLike(iid){
  if (!currentUser) return;
  let row = LIKES.residents.find(r => r.UID === currentUser.UID);
  if (!row) { row = { UID: currentUser.UID, Liked: [] }; LIKES.residents.push(row); }
  const i = row.Liked.indexOf(iid);
  if (i === -1) row.Liked.push(iid); else row.Liked.splice(i,1);
  await API.save('itemLike.json', LIKES);
  openItemModal(iid);
  renderMarketplace();
  renderDashMarketPreview();
  renderLikedItems();
}
async function submitComment(iid){
  const input = document.getElementById('commentInput');
  const text = input.value.trim(); if (!text) return;
  COMMENTS.Likes.push({
    ICID: generateNextICID(),
    IID: iid,
    Posted: currentShortDate(),
    Postedby: currentUser.UID,
    Comments: text
  });
  await API.save('itemComments.json', COMMENTS);
  openItemModal(iid);
}

/* COMMUNITY CHAT */
function renderCommunityChat(){
  const c = document.getElementById('chatMessages');
  if (!c) return;
  const msgs = [...(COMMUNITY.conversation || [])].sort((a,b) => a.time - b.time);
  if (msgs.length === 0) {
    c.innerHTML = `<div style="text-align:center;font-size:.8rem;color:var(--text-faint);padding:1rem;">No messages yet. Say hi!</div>`;
    return;
  }
  c.innerHTML = msgs.map(m => {
    const isOut = currentUser && m.UID === currentUser.UID;
    const sender = findUserByUID(m.UID);
    const senderName = sender ? sender.name : m.UID;
    return `
      <div class="wa-bubble ${isOut ? 'out' : 'in'}">
        ${!isOut ? `<div class="wa-sender">${senderName}</div>` : ''}
        ${m.Context}
        <div class="wa-time">${formatChatTime(m.time)}</div>
      </div>`;
  }).join('');
  c.scrollTop = c.scrollHeight;
}
async function sendCommunityMessage(){
  const input = document.getElementById('chatInput');
  const text = input.value.trim(); if (!text || !currentUser) return;
  COMMUNITY.conversation.push({
    UID: currentUser.UID,
    Context: text,
    time: currentTimeNumber()
  });
  await API.save('communityChat.json', COMMUNITY);
  input.value = '';
  renderCommunityChat();
  updateDashChatPreview();
}

/* PERSONAL CHAT — RID-based room identity */
function getRooms(){
  return PERSONAL.conversation[0] || {};
}

function roomKeyFor(uidA, uidB){
  const rooms = getRooms();
  // Find a room whose RID matches {uidA, uidB} as a set
  for (const rk of Object.keys(rooms)) {
    const rid = rooms[rk]?.RID;
    if (Array.isArray(rid) && rid.length === 2 &&
        rid.includes(uidA) && rid.includes(uidB)) {
      return rk;
    }
  }
  // Create new room
  const maxNum = Object.keys(rooms).reduce((m, rk) => {
    const n = parseInt(rk.replace('room',''), 10);
    return !isNaN(n) && n > m ? n : m;
  }, 0);
  const newKey = 'room' + String(maxNum + 1).padStart(4, '0');
  rooms[newKey] = { RID: [uidA, uidB] };
  return newKey;
}

function nextMessageKey(room){
  const maxNum = Object.keys(room).reduce((max, k) => {
    if (!k.startsWith('MessageA')) return max;
    const n = parseInt(k.replace('MessageA',''), 10);
    return !isNaN(n) && n > max ? n : max;
  }, 0);
  return 'MessageA' + String(maxNum + 1).padStart(8, '0');
}

function renderPersonalPeople(){
  const wrap = document.getElementById('peopleList');
  if (!currentUser) return;
  const search = (document.getElementById('peopleSearch')?.value || '').toLowerCase();
  const others = [...DB.admin, ...DB.residents].filter(u => u.UID !== currentUser.UID);
  const filtered = others.filter(u =>
    u.name.toLowerCase().includes(search) || u.username.toLowerCase().includes(search));
  document.getElementById('personalPill').textContent = `${filtered.length} people`;
  if (filtered.length === 0) {
    wrap.innerHTML = `<div style="font-size:.78rem;color:var(--text-faint);padding:1rem;text-align:center;">No one matches "${search}".</div>`;
    return;
  }
  wrap.innerHTML = filtered.map(u => {
    const isAdmin = DB.admin.some(a => a.UID === u.UID);
    return `<div class="wa-contact ${activeChatPeer === u.UID ? 'active' : ''}" onclick="startPersonalChatWith('${u.UID}')">
      <div class="wa-avatar">${u.name.charAt(0).toUpperCase()}</div>
      <div class="wa-contact-info">
        <h5>${u.name}</h5>
        <p>${isAdmin ? 'Administrator' : 'Resident'}</p>
      </div>
    </div>`;
  }).join('');
}

function startPersonalChatWith(uid){
  if (!currentUser || uid === currentUser.UID) return;
  activeChatPeer = uid;
  switchView('chat-personal');
  renderPersonalPeople();
  renderPersonalThread();
  setTimeout(() => document.getElementById('personalInput')?.focus(), 50);
}

function renderPersonalThread(){
  const header = document.getElementById('waThreadHeader');
  const empty = document.getElementById('waThreadEmpty');
  const box = document.getElementById('personalMessages');
  const inputWrap = document.getElementById('personalInputWrap');
  if (!activeChatPeer) {
    header.style.display = 'none';
    empty.style.display = 'flex';
    box.style.display = 'none';
    inputWrap.style.display = 'none';
    return;
  }
  const peer = findUserByUID(activeChatPeer);
  if (!peer) return;
  const isAdmin = DB.admin.some(a => a.UID === peer.UID);
  header.style.display = 'flex';
  empty.style.display = 'none';
  box.style.display = 'flex';
  inputWrap.style.display = 'flex';
  document.getElementById('ptAvatar').textContent = peer.name.charAt(0).toUpperCase();
  document.getElementById('ptName').textContent = peer.name;
  document.getElementById('ptRole').textContent = isAdmin ? 'Administrator · online' : 'Resident · online';

  const roomKey = roomKeyFor(currentUser.UID, peer.UID);
  const room = getRooms()[roomKey] || {};
  const keys = Object.keys(room).filter(k => k.startsWith('MessageA')).sort();
  if (keys.length === 0) {
    box.innerHTML = `<div style="text-align:center;font-size:.8rem;color:var(--text-faint);padding:1rem;">No messages yet. Say hi!</div>`;
  } else {
    box.innerHTML = keys.map(k => {
      const m = room[k];
      const isOut = m.UID === currentUser.UID;
      const sender = findUserByUID(m.UID);
      const senderName = sender ? sender.name : m.UID;
      return `
        <div class="wa-bubble ${isOut ? 'out' : 'in'}">
          ${!isOut ? `<div class="wa-sender">${senderName}</div>` : ''}
          ${m.context}
          <div class="wa-time">${formatChatTime(m.time)}</div>
        </div>`;
    }).join('');
  }
  box.scrollTop = box.scrollHeight;
}

async function sendPersonalMessage(){
  if (!activeChatPeer || !currentUser) { alert('Pick a person first.'); return; }
  const input = document.getElementById('personalInput');
  const text = input.value.trim(); if (!text) return;
  const roomKey = roomKeyFor(currentUser.UID, activeChatPeer);
  const room = getRooms()[roomKey];
  const msgKey = nextMessageKey(room);
  room[msgKey] = {
    UID: currentUser.UID,
    time: currentTimeNumber(),
    context: text
  };
  await API.save('personalChat.json', PERSONAL);
  input.value = '';
  renderPersonalThread();
}

/* ANNOUNCEMENTS */
function renderAnnouncements(){
  const list = document.getElementById('announcementList');
  const countEl = document.getElementById('annCount');
  const badge = document.getElementById('annBadge');
  const sorted = [...ANNOUNCEMENTS.announcement].sort((a,b) => b.time - a.time);
  countEl.textContent = `${sorted.length} announcement${sorted.length!==1?'s':''}`;
  if (sorted.length > 0) { badge.textContent = sorted.length; badge.style.display = ''; }
  else badge.style.display = 'none';
  if (sorted.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-faint);"><i class="fas fa-bullhorn" style="font-size:2rem;color:var(--text-faint);opacity:.4;margin-bottom:.5rem;display:block;"></i>No announcements yet.</div>`;
    return;
  }
  list.innerHTML = sorted.map(a => {
    const author = findUserByUID(a.UID);
    const name = author ? author.name : 'Unknown';
    const delBtn = userRole === 'admin'
      ? `<button class="ann-delete-btn" title="Delete announcement" onclick="deleteAnnouncement('${a.AID}')"><i class="fas fa-trash"></i></button>`
      : '';
    return `<div class="announcement-card">
      <div class="ann-header">
        <div class="ann-author"><div class="avatar-sm">${name.charAt(0).toUpperCase()}</div>${name}</div>
        <div class="ann-time">${formatAnnTime(a.time)}</div>
      </div>
      <div class="ann-message">${a.message}</div>
      <div class="ann-meta">
        <span><i class="fas fa-hashtag"></i> AID ${a.AID}</span>
        <span><i class="fas fa-user-shield"></i> UID ${a.UID}</span>
        ${delBtn}
      </div>
    </div>`;
  }).join('');
}
window.deleteAnnouncement = async function(aid){
  if (userRole !== 'admin') { alert('Only admins can delete announcements.'); return; }
  const idx = ANNOUNCEMENTS.announcement.findIndex(a => a.AID === aid);
  if (idx === -1) return;
  if (!confirm(`Delete announcement ${aid}?`)) return;
  ANNOUNCEMENTS.announcement.splice(idx, 1);
  await API.save('announcement.json', ANNOUNCEMENTS);
  renderAnnouncements();
};
async function postAnnouncement(){
  const input = document.getElementById('announceInput');
  const message = input.value.trim();
  if (!message) { alert('Please enter a message.'); return; }
  ANNOUNCEMENTS.announcement.push({
    AID: generateNextAID(),
    UID: currentUser.UID,
    time: currentTimeNumber(),
    message
  });
  await API.save('announcement.json', ANNOUNCEMENTS);
  input.value = '';
  renderAnnouncements();
  alert('Announcement posted.');
}

/* ADMIN */
function renderAdminApprovals(){
  const reqs = REQUESTS.request || [];
  const list = document.getElementById('adminApprovalList');
  document.getElementById('adminPendingCount').textContent = `${reqs.length} pending`;
  if (reqs.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-faint);"><i class="fas fa-check-circle" style="font-size:2rem;color:var(--text-faint);opacity:.4;margin-bottom:.5rem;display:block;"></i>No pending requests</div>`;
    return;
  }
  list.innerHTML = reqs.map((r,idx) => `
    <div class="approval-item">
      <div class="info"><h4>${r.name || r.username}</h4><p>@${r.username} · ${new Date(r.requestedAt).toLocaleDateString()}</p></div>
      <div class="action-buttons">
        <button class="btn-sm" onclick="approveRequest(${idx})"><i class="fas fa-check"></i> Approve</button>
        <button class="btn-sm reject" onclick="rejectRequest(${idx})"><i class="fas fa-times"></i></button>
      </div>
    </div>`).join('');
}
window.approveRequest = async function(index){
  const req = REQUESTS.request[index]; if (!req) return;
  const newUID = generateNextUID();
  DB.residents.push({ UID:newUID, username:req.username, name:req.name || req.username, password:req.password });
  await API.save('db.json', DB);
  REQUESTS.request.splice(index,1);
  await API.save('request.json', REQUESTS);
  renderAdminApprovals();
  renderAdminUsers();
  alert(`Approved! ${req.name || req.username} added with UID ${newUID}`);
};
window.rejectRequest = async function(index){
  const req = REQUESTS.request[index]; if (!req) return;
  if (!confirm(`Reject ${req.name || req.username}?`)) return;
  REQUESTS.request.splice(index,1);
  await API.save('request.json', REQUESTS);
  renderAdminApprovals();
};

function renderAdminUsers(){
  const tbody = document.getElementById('adminUserTableBody');
  const countPill = document.getElementById('userCountPill');
  if (!tbody) return;
  const all = [
    ...DB.admin.map(u => ({ ...u, role: 'admin' })),
    ...DB.residents.map(u => ({ ...u, role: 'resident' }))
  ];
  countPill.textContent = `${all.length} users`;
  if (all.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text-faint);">No users yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = all.map(u => `
    <tr>
      <td><strong>${u.UID}</strong></td>
      <td>${u.username}</td>
      <td>${u.name}</td>
      <td><span class="user-role-pill ${u.role === 'admin' ? 'role-admin' : 'role-resident'}">${u.role}</span></td>
      <td>
        <div class="user-actions">
          <button class="icon-btn" title="Edit" onclick="openUserForm('${u.UID}')"><i class="fas fa-pen"></i></button>
          <button class="icon-btn danger" title="Remove" onclick="removeUser('${u.UID}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openUserForm(uid){
  const mount = document.getElementById('adminUserFormMount');
  const editing = !!uid;
  let user = null, role = 'resident';
  if (editing) {
    user = findUserByUID(uid);
    role = findUserRole(uid);
    if (!user) return;
  }
  mount.innerHTML = `
    <div class="admin-edit-form">
      <h4 style="font-size:.9rem;font-weight:600;margin-bottom:.8rem;color:var(--text);">${editing ? 'Edit user ' + uid : 'Add new user'}</h4>
      <div class="row">
        <div class="form-group"><label>UID</label><input type="text" id="fUID" value="${editing ? user.UID : generateNextUID()}" ${editing ? 'disabled' : ''}></div>
        <div class="form-group"><label>Role</label>
          <select id="fRole" style="width:100%;padding:9px 12px;border:1px solid var(--glass-border);border-radius:10px;font-size:.83rem;background:var(--glass-strong);color:var(--text);">
            <option value="resident" ${role === 'resident' ? 'selected' : ''}>Resident</option>
            <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
      </div>
      <div class="row">
        <div class="form-group"><label>Username</label><input type="text" id="fUsername" value="${editing ? user.username : ''}"></div>
        <div class="form-group"><label>Name</label><input type="text" id="fName" value="${editing ? user.name : ''}"></div>
      </div>
      <div class="form-group"><label>Password</label><input type="text" id="fPassword" value="${editing ? user.password : ''}"></div>
      <div class="upload-actions">
        <button class="btn btn-outline" onclick="cancelUserForm()">Cancel</button>
        <button class="btn btn-primary" onclick="saveUserForm('${editing ? user.UID : ''}')"><i class="fas fa-check"></i> ${editing ? 'Save changes' : 'Add user'}</button>
      </div>
    </div>`;
}
function cancelUserForm(){ document.getElementById('adminUserFormMount').innerHTML = ''; }
async function saveUserForm(editingUID){
  const uid = document.getElementById('fUID').value.trim();
  const role = document.getElementById('fRole').value;
  const username = document.getElementById('fUsername').value.trim();
  const name = document.getElementById('fName').value.trim();
  const password = document.getElementById('fPassword').value.trim();
  if (!uid || !username || !name || !password) { alert('Please fill all fields.'); return; }
  const all = [...DB.admin, ...DB.residents];
  if (all.some(u => u.username.toLowerCase() === username.toLowerCase() && u.UID !== editingUID)) {
    alert('Username already taken.'); return;
  }
  if (editingUID) {
    DB.admin = DB.admin.filter(u => u.UID !== editingUID);
    DB.residents = DB.residents.filter(u => u.UID !== editingUID);
    const updated = { UID: editingUID, username, name, password };
    if (role === 'admin') DB.admin.push(updated); else DB.residents.push(updated);
  } else {
    const newUser = { UID: uid, username, name, password };
    if (role === 'admin') DB.admin.push(newUser); else DB.residents.push(newUser);
  }
  await API.save('db.json', DB);
  cancelUserForm();
  renderAdminUsers();
  alert(editingUID ? 'User updated.' : 'User added.');
}
window.removeUser = async function(uid){
  if (uid === currentUser.UID) { alert('You cannot remove your own account.'); return; }
  const user = findUserByUID(uid);
  if (!user) return;
  if (!confirm(`Remove user ${user.name} (${uid})?`)) return;
  DB.admin = DB.admin.filter(u => u.UID !== uid);
  DB.residents = DB.residents.filter(u => u.UID !== uid);
  await API.save('db.json', DB);
  renderAdminUsers();
  alert('User removed.');
};

function openUploadModal(){ document.getElementById('uploadModal').classList.add('open'); populateCategories(); }
function closeUploadModal(){
  document.getElementById('uploadModal').classList.remove('open');
  ['itemName','itemPrice','itemAddress','itemImage'].forEach(id => document.getElementById(id).value = '');
}
async function submitListing(){
  const name = document.getElementById('itemName').value.trim();
  const category = document.getElementById('itemCategory').value;
  const priceRaw = document.getElementById('itemPrice').value.trim();
  const address = document.getElementById('itemAddress').value.trim();
  const state = document.getElementById('itemState').value;
  const image = document.getElementById('itemImage').value.trim();
  if (!name || !category) { alert('Please fill in item name and category.'); return; }
  if (priceRaw === '') { alert('Please enter a price.'); return; }
  const price = Number(priceRaw);
  if (!isFinite(price) || isNaN(price)) { alert('Price must be a valid number.'); return; }
  if (price <= 0) { alert('Price must be greater than 0. Listings cannot be priced at zero or below.'); return; }
  if (!ITEMS[category]) ITEMS[category] = [];
  ITEMS[category].unshift({
    IID: generateNextIID(),
    UID: currentUser.UID,
    Name: name,
    Image: image || '',
    Price: String(price),
    Address: address || '',
    State: state
  });
  await API.save('item.json', ITEMS);
  closeUploadModal();
  renderMarketplace();
  renderDashMarketPreview();
  alert('Listing posted.');
}

function switchView(name){
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.style.display = 'none';
  });
  const v = document.getElementById('view-' + name);
  if (!v) return;
  v.classList.add('active');
  if (name === 'chat-community' || name === 'chat-personal') {
      v.style.display = 'flex';
      document.querySelector('.main').classList.add('chat-open');
    } else {
      v.style.display = 'block';
      document.querySelector('.main').classList.remove('chat-open');
    }

  if (name === 'dashboard') { renderVisitorCard(); renderDashMarketPreview(); updateDashChatPreview(); }
  if (name === 'visitor') renderGuests();
  if (name === 'utilities') renderUtilities();
  if (name === 'market') renderMarketplace();
  if (name === 'liked') renderLikedItems();
  if (name === 'chat-community') {
    renderCommunityChat();
    const op = document.getElementById('communityOnlinePill');
    if (op) op.textContent = `Blk 22 · ${DB.residents.length + DB.admin.length} online`;
  }
  if (name === 'chat-personal') {
    renderPersonalPeople();
    renderPersonalThread();
  }
  if (name === 'announcements') renderAnnouncements();
  if (name === 'admin') { renderAdminApprovals(); renderAdminUsers(); }
}

document.addEventListener('DOMContentLoaded', async () => {
  await bootstrap();
  document.getElementById('authBtn').addEventListener('click', handleAuth);
  document.getElementById('toggleAuth').addEventListener('click', toggleAuthMode);
  document.getElementById('passwordInput').addEventListener('keypress', e => { if (e.key === 'Enter') handleAuth(); });
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('darkmodeBtn').addEventListener('click', toggleDarkMode);
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });
  document.getElementById('sendChatBtn').addEventListener('click', sendCommunityMessage);
  document.getElementById('chatInput').addEventListener('keypress', e => { if (e.key === 'Enter') sendCommunityMessage(); });
  document.getElementById('sendPersonalBtn').addEventListener('click', sendPersonalMessage);
  document.getElementById('personalInput').addEventListener('keypress', e => { if (e.key === 'Enter') sendPersonalMessage(); });
  document.getElementById('peopleSearch').addEventListener('input', renderPersonalPeople);
  document.getElementById('openChatFromDash').addEventListener('click', () => switchView('chat-community'));
  document.getElementById('openUploadBtn').addEventListener('click', openUploadModal);
  document.getElementById('marketSearch')?.addEventListener('input', renderMarketplace);
  document.getElementById('postAnnouncementBtn').addEventListener('click', postAnnouncement);
});