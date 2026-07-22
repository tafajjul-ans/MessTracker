// Service Worker Banner
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.getElementById('install-banner').classList.remove('hidden'); });
document.getElementById('btn-install').addEventListener('click', async () => { if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; document.getElementById('install-banner').classList.add('hidden'); deferredPrompt = null; } });
document.getElementById('btn-close-install').addEventListener('click', () => document.getElementById('install-banner').classList.add('hidden'));
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./sw.js'); }

// ==================== ENCRYPTION & DECRYPTION FUNCTIONS ==================== //
async function hashPassword(password) {
    const encoder = new TextEncoder(); const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
// Base64 encoding to secure details like Name & Mobile in Database
function enc(text) { return text ? btoa(encodeURIComponent(text)) : text; }
function dec(text) { 
    if(!text) return text;
    try { return decodeURIComponent(atob(text)); } catch(e) { return text; } // Agar purana data un-encrypted hai toh wo break na ho
}

// ==================== CLOUD DATABASE HELPERS ==================== //
const getDB = async (key) => { const snap = await window.db.ref(key).once('value'); return snap.val() || (key === 'mt_payments' ? [] : {}); };
const saveDB = async (key, data) => { await window.db.ref(key).set(data); };

// ==================== THEME MANAGEMENT ==================== //
function applyTheme() {
    const savedTheme = localStorage.getItem('mt_theme') || 'light'; const isDark = savedTheme === 'dark';
    if (isDark) { document.body.classList.remove('light-theme'); document.body.classList.add('dark-theme'); } else { document.body.classList.remove('dark-theme'); document.body.classList.add('light-theme'); }
    const toggle = document.getElementById('dark-mode-toggle'); if (toggle) toggle.checked = isDark;
}
function toggleDarkMode(checkbox) { localStorage.setItem('mt_theme', checkbox.checked ? 'dark' : 'light'); applyTheme(); }
applyTheme();

// ==================== SESSION & NAV ==================== //
let loginRole = 'student'; let currentUser = null; let currentCalDate = new Date(); let selectedDateString = null;
const defaultImg = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

async function checkSession() {
    const savedId = localStorage.getItem('mt_session_id'); const savedRole = localStorage.getItem('mt_session_role');
    if (savedId && savedRole) {
        try {
            const users = await getDB('mt_users');
            if (users[savedId] && users[savedId].role === savedRole) {
                // Decrypt details for local use
                currentUser = { id: savedId, ...users[savedId], name: dec(users[savedId].name), mobile: dec(users[savedId].mobile) };
                loginRole = savedRole;
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                if(savedRole === 'student') document.querySelector('.tab-btn:nth-child(1)').classList.add('active'); else document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
                if (loginRole === 'student') { if (currentUser.firstLogin) navigate('first-login-section'); else { await loadStudentDashboard(); navigate('student-dashboard'); } } else { await loadManagerDashboard(); navigate('manager-dashboard'); }
            } else { logout(); }
        } catch(err) { console.error(err); }
    }
}
checkSession();

function navigate(pageId) { document.querySelectorAll('.page').forEach(p => p.classList.add('hidden')); document.getElementById(pageId).classList.remove('hidden'); document.getElementById(pageId).classList.add('active'); }
function setLoginType(type, btn) {
    loginRole = type; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active');
    document.getElementById('login-id').placeholder = type === 'manager' ? 'Enter Manager ID' : 'Enter Student ID';
    if(type === 'manager') document.getElementById('register-link-container').classList.remove('hidden'); else document.getElementById('register-link-container').classList.add('hidden');
}
function logout() { 
    if(confirm("Log out?")) { currentUser = null; localStorage.removeItem('mt_session_id'); localStorage.removeItem('mt_session_role'); navigate('login-section'); document.getElementById('login-form').reset(); }
}

// ==================== AUTH & REGISTRATION ==================== //
function openPasswordModal() { document.getElementById('password-modal').classList.remove('hidden'); document.getElementById('old-pass').value = ''; document.getElementById('new-pass').value = ''; }
function closePasswordModal() { document.getElementById('password-modal').classList.add('hidden'); }
async function saveNewPassword() {
    const oldP = document.getElementById('old-pass').value; const newP = document.getElementById('new-pass').value;
    if(!oldP || !newP) return alert("Fill both fields!");
    try {
        const hashedOld = await hashPassword(oldP); const hashedNew = await hashPassword(newP);
        const users = await getDB('mt_users');
        if(users[currentUser.id].password !== hashedOld) return alert("Incorrect Current Password!");
        users[currentUser.id].password = hashedNew;
        await saveDB('mt_users', users); alert("Password Updated Successfully!"); closePasswordModal();
    } catch(err) { alert("Error: " + err.message); }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const id = document.getElementById('login-id').value.trim(); const pass = document.getElementById('login-pass').value.trim();
    const btn = e.target.querySelector('button'); btn.innerText = "Checking..."; 
    try {
        const hashedInput = await hashPassword(pass); const users = await getDB('mt_users');
        if (users[id] && users[id].password === hashedInput && users[id].role === loginRole) {
            currentUser = { id, ...users[id], name: dec(users[id].name), mobile: dec(users[id].mobile) };
            localStorage.setItem('mt_session_id', id); localStorage.setItem('mt_session_role', loginRole);
            if (loginRole === 'student') { if (currentUser.firstLogin) navigate('first-login-section'); else { await loadStudentDashboard(); navigate('student-dashboard'); } } else { await loadManagerDashboard(); navigate('manager-dashboard'); }
        } else { alert('Invalid ID or Password!'); }
    } catch(err) { alert("DB Error!"); } finally { btn.innerText = "Login"; }
});

document.getElementById('first-login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const newPass = document.getElementById('new-first-pass').value.trim();
    const hashedNew = await hashPassword(newPass); const users = await getDB('mt_users');
    users[currentUser.id].password = hashedNew; users[currentUser.id].firstLogin = false;
    await saveDB('mt_users', users); currentUser.firstLogin = false; alert('Password set successfully!');
    await loadStudentDashboard(); navigate('student-dashboard');
});

// Manager Registration with Success Page
document.getElementById('manager-register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mgrName = document.getElementById('reg-mgr-name').value.trim();
    const hostelName = document.getElementById('reg-hostel-name').value.trim();
    const pass = document.getElementById('reg-mgr-pass').value.trim();
    const btn = e.target.querySelector('button'); btn.innerText = "Registering...";

    try {
        const users = await getDB('mt_users');
        for(let key in users) { if(users[key].role === 'manager' && users[key].hostel.toLowerCase() === hostelName.toLowerCase()) { alert(`Error: Hostel '${hostelName}' is taken.`); btn.innerText = "Register Now"; return; } }
        
        const hashedPass = await hashPassword(pass);
        const newMgrId = 'MGR' + Math.floor(1000 + Math.random() * 9000);
        
        // Save encrypted name in DB
        users[newMgrId] = { role: 'manager', name: enc(mgrName), hostel: hostelName, password: hashedPass };
        await saveDB('mt_users', users);

        const settings = await getDB('mt_settings'); settings[hostelName] = { meals: { B: 30, L: 50, D: 50 } }; await saveDB('mt_settings', settings);

        // Show Success Page
        document.getElementById('success-id').innerText = newMgrId;
        document.getElementById('success-pass').innerText = pass; // showing raw pass only once
        document.getElementById('manager-register-form').reset();
        navigate('registration-success-section');

    } catch (err) { alert("Error"); } finally { btn.innerText = "Register Now"; }
});

function copyDetails() {
    const id = document.getElementById('success-id').innerText;
    const pass = document.getElementById('success-pass').innerText;
    navigator.clipboard.writeText(`My MessTracker Login:\nID: ${id}\nPassword: ${pass}`);
    alert("Copied to clipboard!");
}
function copyStudentId() {
    const text = document.getElementById('generated-id-msg').innerText;
    navigator.clipboard.writeText(text);
    alert("Student ID Copied!");
}

// ==================== STUDENT LOGIC ==================== //
async function switchStudentTab(tabName, btn) {
    document.querySelectorAll('.stu-tab').forEach(t => { t.classList.add('hidden'); t.classList.remove('active'); });
    document.getElementById(`stu-tab-${tabName}`).classList.remove('hidden'); document.getElementById(`stu-tab-${tabName}`).classList.add('active');
    if(btn) { document.querySelectorAll('#student-dashboard .nav-item').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
    if(tabName === 'home') await renderCalendar();
    if(tabName === 'profile') applyTheme();
}

async function loadStudentDashboard() {
    const users = await getDB('mt_users');
    document.getElementById('stu-header-name').innerText = currentUser.name.split(' ')[0];
    document.getElementById('header-dues-amount').innerText = users[currentUser.id].dues || 0;
    document.getElementById('pay-dues-amount').innerText = users[currentUser.id].dues || 0;
    document.getElementById('profile-name').innerText = currentUser.name;
    document.getElementById('profile-id').innerText = currentUser.id;
    document.getElementById('profile-img-display').src = users[currentUser.id].profilePic || defaultImg;

    // Payments History Load
    const payments = await getDB('mt_payments');
    const myPayments = payments.filter(p => p.studentId === currentUser.id);
    const historyUl = document.getElementById('student-pay-history'); historyUl.innerHTML = '';
    if(myPayments.length === 0) historyUl.innerHTML = '<li><span class="text-muted">No payments yet.</span></li>';
    else {
        myPayments.forEach(p => {
            historyUl.innerHTML += `<li><span>₹${p.amount} <small class="text-muted">(${p.date})</small></span>
                <span style="color: ${p.status==='verified'?'var(--success)':'#f59e0b'}; font-weight:bold;">${p.status.toUpperCase()}</span></li>`;
        });
    }

    // Members Grid Load
    const membersGrid = document.getElementById('stu-members-list'); membersGrid.innerHTML = '';
    for(let id in users) {
        if(users[id].role === 'student' && users[id].hostel === currentUser.hostel) {
            let memberName = dec(users[id].name);
            membersGrid.innerHTML += `<div class="member-card"><img src="${users[id].profilePic || defaultImg}" class="member-pic"><div class="member-name">${memberName.split(' ')[0]}</div></div>`;
        }
    }
    await renderCalendar();
}

function uploadProfilePic(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const base64Str = e.target.result;
            document.getElementById('profile-img-display').src = base64Str;
            const users = await getDB('mt_users');
            users[currentUser.id].profilePic = base64Str;
            await saveDB('mt_users', users);
            alert("Profile Picture Updated!");
        };
        reader.readAsDataURL(file);
    }
}

async function changeMonth(step) { currentCalDate.setMonth(currentCalDate.getMonth() + step); await renderCalendar(); }
async function renderCalendar() {
    const grid = document.getElementById('calendar-days'); const records = await getDB('mt_meal_records');
    const year = currentCalDate.getFullYear(); const month = currentCalDate.getMonth(); const today = new Date();
    document.getElementById('month-year-display').innerText = currentCalDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    grid.innerHTML = '';
    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div></div>`;
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const isFut = new Date(year, month, i) > today;
        let dots = '';
        if(records[currentUser.id] && records[currentUser.id][dateStr]) {
            const dM = records[currentUser.id][dateStr];
            if(dM.B) dots += `<div class="dot b"></div>`; if(dM.L) dots += `<div class="dot l"></div>`; if(dM.D) dots += `<div class="dot d"></div>`;
        }
        grid.innerHTML += `<div class="cal-day ${isFut ? 'disabled' : ''}" onclick="selectDate('${dateStr}', this)">${i}<div class="meal-dots">${dots}</div></div>`;
    }
}
async function selectDate(dateStr, elem) {
    document.querySelectorAll('.cal-day').forEach(el => el.classList.remove('selected')); elem.classList.add('selected'); selectedDateString = dateStr;
    const box = document.getElementById('meal-manager-box'); const container = document.getElementById('meal-toggles-container');
    const settings = await getDB('mt_settings'); const records = await getDB('mt_meal_records');
    const myMeals = (records[currentUser.id] && records[currentUser.id][dateStr]) || { B:false, L:false, D:false };
    const mySet = settings[currentUser.hostel] || { meals: { B: 0, L: 0, D: 0 } };
    box.classList.remove('hidden'); document.getElementById('selected-date-title').innerText = `Meals on ${dateStr}`; container.innerHTML = '';
    [{key:'B', n:'Breakfast', c:mySet.meals.B}, {key:'L', n:'Lunch', c:mySet.meals.L}, {key:'D', n:'Dinner', c:mySet.meals.D}].forEach(m => {
        if(m.c > 0) container.innerHTML += `<button class="meal-btn ${myMeals[m.key] ? 'active' : ''}" onclick="toggleMeal('${m.key}', ${m.c})">${m.key}<small>${m.n} (₹${m.c})</small></button>`;
    });
}
async function toggleMeal(mealKey, cost) {
    const records = await getDB('mt_meal_records'); const users = await getDB('mt_users');
    if(!records[currentUser.id]) records[currentUser.id] = {};
    if(!records[currentUser.id][selectedDateString]) records[currentUser.id][selectedDateString] = {B:false, L:false, D:false};
    const isAct = records[currentUser.id][selectedDateString][mealKey];
    records[currentUser.id][selectedDateString][mealKey] = !isAct;
    users[currentUser.id].dues += (!isAct ? Number(cost) : -Number(cost));
    await saveDB('mt_meal_records', records); await saveDB('mt_users', users);
    await selectDate(selectedDateString, document.querySelector('.cal-day.selected')); await renderCalendar();
    document.getElementById('header-dues-amount').innerText = users[currentUser.id].dues;
}

// Payment Submission
document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let payments = Array.isArray(await getDB('mt_payments')) ? await getDB('mt_payments') : [];
    payments.push({
        id: 'PAY' + Date.now(), studentId: currentUser.id,
        amount: Number(document.getElementById('pay-amount').value), ref: document.getElementById('pay-ref').value,
        status: 'pending', date: new Date().toLocaleDateString()
    });
    await saveDB('mt_payments', payments);
    alert('Submitted! Waiting for verification.');
    document.getElementById('payment-form').reset(); await loadStudentDashboard();
});


// ==================== MANAGER LOGIC ==================== //
function switchManagerTab(tabName, btn) {
    document.querySelectorAll('.mgr-tab').forEach(t => { t.classList.add('hidden'); t.classList.remove('active'); });
    document.getElementById(`mgr-tab-${tabName}`).classList.remove('hidden'); document.getElementById(`mgr-tab-${tabName}`).classList.add('active');
    if(btn) { document.querySelectorAll('#manager-dashboard .nav-item').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
}

async function loadManagerDashboard() {
    const settings = await getDB('mt_settings'); const users = await getDB('mt_users'); const payments = await getDB('mt_payments');
    const myHostelSettings = settings[currentUser.hostel] || { meals: { B: 0, L: 0, D: 0 } };
    document.getElementById('mgr-settings-hostel-name').innerText = currentUser.hostel;
    document.getElementById('cost-b').value = myHostelSettings.meals.B || 0; document.getElementById('cost-l').value = myHostelSettings.meals.L || 0; document.getElementById('cost-d').value = myHostelSettings.meals.D || 0;
    
    const tbodyManager = document.getElementById('mgr-notebook-list'); tbodyManager.innerHTML = '';
    
    for (let key in users) {
        if (users[key].role === 'student' && users[key].hostel === currentUser.hostel) {
            let totalPaid = 0;
            const stuPayments = payments.filter(p => p.studentId === key && p.status === 'verified');
            stuPayments.forEach(p => totalPaid += p.amount);
            let sName = dec(users[key].name);

            tbodyManager.innerHTML += `
                <tr>
                    <td>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <img src="${users[key].profilePic || defaultImg}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; border:1px solid var(--border);">
                            <div style="line-height:1.2;">
                                <span>${sName.split(' ')[0]}</span><br>
                                <small class="text-muted" style="font-size:11px;">${key}</small>
                            </div>
                        </div>
                    </td>
                    <td style="color:var(--danger); font-weight:bold;">₹${users[key].dues || 0}</td>
                    <td style="color:var(--success);">₹${totalPaid}</td>
                    <td>
                        <button onclick="removeStudent('${key}')" class="btn-icon text-danger" style="background:#fee2e2; padding:5px 8px; border-radius:5px;"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
        }
    }
    
    const myPending = payments.filter(p => p.status === 'pending' && users[p.studentId] && users[p.studentId].hostel === currentUser.hostel);
    const pendingCard = document.getElementById('pending-card');
    if (myPending.length > 0) { pendingCard.classList.remove('hidden'); document.getElementById('pending-count').innerText = `${myPending.length} waiting`; } 
    else pendingCard.classList.add('hidden');
}

// Remove Student Feature
async function removeStudent(studentId) {
    if(confirm("Are you SURE you want to remove this student? All their data will be permanently deleted!")) {
        const users = await getDB('mt_users');
        delete users[studentId]; // Student deleted from DB
        await saveDB('mt_users', users);
        alert("Student removed successfully!");
        await loadManagerDashboard();
    }
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const settings = await getDB('mt_settings');
    if(!settings[currentUser.hostel]) settings[currentUser.hostel] = { meals: {} };
    settings[currentUser.hostel].meals = { B: Number(document.getElementById('cost-b').value), L: Number(document.getElementById('cost-l').value), D: Number(document.getElementById('cost-d').value) };
    await saveDB('mt_settings', settings); alert('Costs Updated!');
});

document.getElementById('add-student-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('stu-name').value;
    const mobile = document.getElementById('stu-mobile').value;
    const newId = 'STU' + Math.floor(1000 + Math.random() * 9000);
    const users = await getDB('mt_users');
    
    const defaultHashedPass = await hashPassword('123');
    // Save details as Encoded (Inscripted) Base64 string
    users[newId] = { role: 'student', name: enc(name), mobile: enc(mobile), password: defaultHashedPass, firstLogin: true, dues: 0, hostel: currentUser.hostel };
    await saveDB('mt_users', users);
    
    const msgBox = document.getElementById('generated-id-box');
    msgBox.classList.remove('hidden');
    document.getElementById('generated-id-msg').innerText = `ID: ${newId} \n(Pass: 123)`;
    document.getElementById('add-student-form').reset(); await loadManagerDashboard();
});

// Verification Area
async function showVerificationList() {
    navigate('verification-page');
    const payments = await getDB('mt_payments'); const users = await getDB('mt_users');
    const listDiv = document.getElementById('verification-list'); listDiv.innerHTML = '';
    const myPending = payments.filter(p => p.status === 'pending' && users[p.studentId] && users[p.studentId].hostel === currentUser.hostel);
    if (myPending.length === 0) return listDiv.innerHTML = '<p class="text-muted">No pending payments.</p>';

    myPending.forEach(p => {
        const studentName = users[p.studentId] ? dec(users[p.studentId].name) : 'Unknown';
        listDiv.innerHTML += `
            <div class="card highlight-card mt-2" style="background: var(--card-bg); color: var(--text-main); border: 1px solid var(--border);">
                <div><strong>${studentName} (${p.studentId})</strong><br><span class="text-muted">Amt: ₹${p.amount} | Ref: ${p.ref}</span></div>
                <button onclick="verifyPayment('${p.id}')" class="btn-success btn-small" style="margin-left:auto;">Verify</button>
            </div>`;
    });
}
async function verifyPayment(paymentId) {
    const payments = await getDB('mt_payments'); const users = await getDB('mt_users');
    const pIndex = payments.findIndex(p => p.id === paymentId);
    if(pIndex > -1) {
        payments[pIndex].status = 'verified';
        const sId = payments[pIndex].studentId;
        if(users[sId]) users[sId].dues = (users[sId].dues || 0) - payments[pIndex].amount;
        await saveDB('mt_payments', payments); await saveDB('mt_users', users);
        await showVerificationList(); await loadManagerDashboard();
    }
}
