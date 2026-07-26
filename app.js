// ==================== GLOBAL VARIABLES & SAFE INIT ==================== //
let deferredPrompt;
let loginRole = 'student'; 
let currentUser = null; 
let currentCalDate = new Date(); 
let selectedDateString = null;
const defaultImg = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

let isSelectMode = false;
let selectedNotifIds = new Set();
let currentNotifsList = []; 
let pressTimer;

let isHistorySelectMode = false;
let selectedHistoryIds = new Set();
let currentHistoryList = [];

let cropperInstance = null;
let currentCropTarget = null;

function safeBind(id, eventType, callback) {
    const el = document.getElementById(id);
    if (el) { el.addEventListener(eventType, callback); }
}

// ==================== APP INITIALIZATION ==================== //
window.addEventListener('beforeinstallprompt', (e) => { 
    e.preventDefault(); 
    deferredPrompt = e; 
    const banner = document.getElementById('install-banner');
    if(banner) banner.classList.remove('hidden'); 
});

if ('serviceWorker' in navigator) { 
    navigator.serviceWorker.register('./sw.js').catch(err => console.log("SW Error", err)); 
}

// ==================== BRANDED LOADER & CUSTOM MODAL ==================== //
function showLoader() { const l = document.getElementById('global-loader'); if (l) l.classList.remove('hidden'); }
function hideLoader() { const l = document.getElementById('global-loader'); if (l) l.classList.add('hidden'); }

function showCustomAlert(title, text, icon = 'fa-info-circle') {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        if(!modal) { alert(text); return resolve(true); } 
        
        document.getElementById('custom-modal-title').innerText = title;
        document.getElementById('custom-modal-text').innerText = text;
        document.getElementById('custom-modal-icon').innerHTML = `<i class="fas ${icon}"></i>`;
        document.getElementById('custom-modal-cancel').classList.add('hidden');
        document.getElementById('custom-modal-input').classList.add('hidden');
        
        const okBtn = document.getElementById('custom-modal-ok');
        okBtn.innerText = "OK"; modal.classList.remove('hidden');

        const handleOk = () => { modal.classList.add('hidden'); okBtn.removeEventListener('click', handleOk); resolve(true); };
        okBtn.addEventListener('click', handleOk);
    });
}

function showCustomConfirm(title, text) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        if(!modal) { resolve(confirm(text)); return; } 
        
        document.getElementById('custom-modal-title').innerText = title;
        document.getElementById('custom-modal-text').innerText = text;
        document.getElementById('custom-modal-icon').innerHTML = `<i class="fas fa-question-circle"></i>`;
        document.getElementById('custom-modal-input').classList.add('hidden');
        
        const cancelBtn = document.getElementById('custom-modal-cancel'); cancelBtn.classList.remove('hidden');
        const okBtn = document.getElementById('custom-modal-ok'); okBtn.innerText = "Yes"; modal.classList.remove('hidden');

        const handleOk = () => { modal.classList.add('hidden'); cleanup(); resolve(true); };
        const handleCancel = () => { modal.classList.add('hidden'); cleanup(); resolve(false); };
        const cleanup = () => { okBtn.removeEventListener('click', handleOk); cancelBtn.removeEventListener('click', handleCancel); };
        
        okBtn.addEventListener('click', handleOk); cancelBtn.addEventListener('click', handleCancel);
    });
}

function showCustomPrompt(title, text, defaultVal = "") {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        if(!modal) { resolve(prompt(text, defaultVal)); return; }
        
        document.getElementById('custom-modal-title').innerText = title;
        document.getElementById('custom-modal-text').innerText = text;
        document.getElementById('custom-modal-icon').innerHTML = `<i class="fas fa-edit"></i>`;
        
        const inputField = document.getElementById('custom-modal-input');
        inputField.classList.remove('hidden');
        inputField.value = defaultVal;
        
        const cancelBtn = document.getElementById('custom-modal-cancel'); cancelBtn.classList.remove('hidden');
        const okBtn = document.getElementById('custom-modal-ok'); okBtn.innerText = "Save"; modal.classList.remove('hidden');

        const handleOk = () => { modal.classList.add('hidden'); cleanup(); resolve(inputField.value.trim()); };
        const handleCancel = () => { modal.classList.add('hidden'); cleanup(); resolve(null); };
        const cleanup = () => { okBtn.removeEventListener('click', handleOk); cancelBtn.removeEventListener('click', handleCancel); };
        
        okBtn.addEventListener('click', handleOk); cancelBtn.addEventListener('click', handleCancel);
    });
}

// ==================== ENCRYPTION ==================== //
async function hashPassword(password) {
    try {
        const encoder = new TextEncoder(); const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch(e) { return btoa(password); }
}
function enc(text) { return text ? btoa(encodeURIComponent(text)) : text; }
function dec(text) { if(!text) return text; try { return decodeURIComponent(atob(text)); } catch(e) { return text; } }

// ==================== CLOUD DATABASE HELPERS ==================== //
const getDB = async (key) => { 
    if(!window.db) throw new Error("Database not initialized yet.");
    const snap = await window.db.ref(key).once('value'); const val = snap.val();
    if(key === 'mt_payments' || key === 'mt_notifications') { if(!val) return []; return Array.isArray(val) ? val : Object.values(val); }
    return val || {}; 
};
const saveDB = async (key, data) => { if(!window.db) return; await window.db.ref(key).set(data); };

// ==================== PHOTO CROPPER SYSTEM ==================== //
function openCropper(file, target) {
    currentCropTarget = target;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('cropper-image').src = e.target.result;
        document.getElementById('cropper-modal').classList.remove('hidden');
        
        if (cropperInstance) { cropperInstance.destroy(); }
        
        const image = document.getElementById('cropper-image');
        cropperInstance = new Cropper(image, {
            aspectRatio: 1,
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 1,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
        });
    };
    reader.readAsDataURL(file);
}

function uploadProfilePic(event) {
    const file = event.target.files[0];
    if (file) { openCropper(file, 'student'); }
}

function uploadMgrProfilePic(event) {
    const file = event.target.files[0];
    if (file) { openCropper(file, 'manager'); }
}

// ==================== NOTIFICATION SYSTEM ==================== //
async function sendSmartNotification(hostel, target, msg) {
    try {
        const notifs = await getDB('mt_notifications');
        notifs.push({ id: Date.now(), hostel: hostel, target: target, message: enc(msg), timestamp: Date.now(), readBy: {}, deletedBy: {} });
        await saveDB('mt_notifications', notifs);
    } catch(err) { console.error(err); }
}

async function checkNotices() {
    try {
        if(!currentUser) return;
        const notifs = await getDB('mt_notifications'); const now = Date.now();
        const unseenExist = notifs.some(n => {
            if (n.hostel !== currentUser.hostel || (now - n.timestamp) > 86400000) return false;
            if (n.deletedBy && n.deletedBy[currentUser.id]) return false;
            if (n.readBy && n.readBy[currentUser.id]) return false;
            if (loginRole === 'manager') return n.target === 'MGR' || n.target === 'all';
            if (loginRole === 'student') return n.target === 'all' || n.target === currentUser.id;
            return false;
        });
        const badgeId = loginRole === 'manager' ? 'mgr-notif-badge' : 'notif-badge';
        const badge = document.getElementById(badgeId);
        if (badge) { if (unseenExist) badge.classList.remove('hidden'); else badge.classList.add('hidden'); }
    } catch(err) {}
}

async function openNotificationPage() {
    showLoader();
    try {
        navigate('notification-page');
        isSelectMode = false; selectedNotifIds.clear(); 
        
        const toolbar = document.getElementById('notif-selection-toolbar');
        if(toolbar) toolbar.classList.add('hidden');
        const listDiv = document.getElementById('page-notification-list');
        if(listDiv) listDiv.classList.remove('selection-active');
        
        const notifs = await getDB('mt_notifications');
        const now = Date.now();
        currentNotifsList = [];
        let noticesListHtml = ""; let activityListHtml = ""; let updated = false;

        notifs.forEach(n => {
            if (n.hostel !== currentUser.hostel || (now - n.timestamp) > 86400000) return;
            if (n.deletedBy && n.deletedBy[currentUser.id]) return; 

            n.readBy = n.readBy || {};
            if (!n.readBy[currentUser.id]) {
                if ((loginRole === 'manager' && (n.target === 'MGR' || n.target === 'all')) || 
                    (loginRole === 'student' && (n.target === 'all' || n.target === currentUser.id))) {
                    n.readBy[currentUser.id] = true; updated = true;
                }
            }

            if (n.target === 'all') {
                let noticeText = dec(n.message);
                const timeString = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                noticesListHtml = `
                    <div style="padding: 8px 0; border-bottom: 1px dashed var(--border);">
                        <p style="font-size: 14px; color: var(--text-main); font-weight: 500;">📌 ${noticeText}</p>
                        <small class="text-muted" style="font-size: 10px;">${timeString}</small>
                    </div>` + noticesListHtml;
            } else if ((loginRole === 'manager' && n.target === 'MGR') || (loginRole === 'student' && n.target === currentUser.id)) {
                currentNotifsList.push(n); 
                let msgText = dec(n.message);
                let borderColor = 'var(--primary)';
                if(msgText.toLowerCase().includes('verified')) borderColor = 'var(--success)';
                if(msgText.toLowerCase().includes('rejected')) borderColor = 'var(--danger)';
                if(msgText.toLowerCase().includes('pending')) borderColor = 'var(--warning)';

                const timeString = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                activityListHtml = `
                    <div id="notif-${n.id}" class="card notif-item" style="border-left: 4px solid ${borderColor}; padding: 12px; margin-bottom: 10px; cursor:pointer;" 
                         ontouchstart="startPress(event, ${n.id}, 'notif')" 
                         ontouchmove="cancelPress()" 
                         ontouchend="endPress()" 
                         onmousedown="startPress(event, ${n.id}, 'notif')" 
                         onmouseup="endPress()" 
                         onmouseleave="endPress()"
                         onclick="toggleSelect(${n.id}, 'notif')" 
                         oncontextmenu="event.preventDefault();">
                        
                        <div class="select-checkbox"><i class="fas fa-check" style="color: #000;"></i></div>
                        <p style="font-size: 14px; margin-bottom: 5px; padding-right:25px;">${msgText}</p>
                        <small class="text-muted" style="font-size: 11px;"><i class="fas fa-clock"></i> ${timeString}</small>
                    </div>` + activityListHtml;
            }
        });

        if (updated) { await saveDB('mt_notifications', notifs); checkNotices(); }
        
        document.getElementById('page-todays-notice-list').innerHTML = noticesListHtml || '<p class="text-muted">No active notice from manager.</p>';
        document.getElementById('page-notification-list').innerHTML = activityListHtml || '<p class="text-muted" style="text-align:center; padding: 15px 0;">No new payment updates.</p>';
    } finally { hideLoader(); }
}

function startPress(e, id, type) {
    if(type === 'notif' && isSelectMode) return;
    if(type === 'history' && isHistorySelectMode) return;
    
    pressTimer = setTimeout(() => {
        if(navigator.vibrate) navigator.vibrate(50);
        
        if(type === 'notif') {
            isSelectMode = true;
            document.getElementById('notif-selection-toolbar').classList.remove('hidden');
            document.getElementById('page-notification-list').classList.add('selection-active');
            toggleSelect(id, 'notif');
        } else if (type === 'history') {
            isHistorySelectMode = true;
            document.getElementById('history-selection-toolbar').classList.remove('hidden');
            document.getElementById('student-pay-history').classList.add('selection-active');
            toggleSelect(id, 'history');
        }
    }, 600);
}
function endPress() { clearTimeout(pressTimer); }
function cancelPress() { clearTimeout(pressTimer); }

function toggleSelect(id, type) {
    if(type === 'notif') {
        if(!isSelectMode) return;
        const elem = document.getElementById(`notif-${id}`);
        if(selectedNotifIds.has(id)) { 
            selectedNotifIds.delete(id); elem.classList.remove('selected'); 
        } else { 
            selectedNotifIds.add(id); elem.classList.add('selected'); 
        }
        document.getElementById('selected-notif-count').innerText = `${selectedNotifIds.size} Selected`;
        if(selectedNotifIds.size === 0) cancelNotifSelection();
    } else if (type === 'history') {
        if(!isHistorySelectMode) return;
        const elem = document.getElementById(`hist-${id}`);
        if(selectedHistoryIds.has(id)) { 
            selectedHistoryIds.delete(id); elem.classList.remove('selected'); 
        } else { 
            selectedHistoryIds.add(id); elem.classList.add('selected'); 
        }
        document.getElementById('selected-history-count').innerText = `${selectedHistoryIds.size} Selected`;
        if(selectedHistoryIds.size === 0) cancelHistorySelection();
    }
}

function selectAllNotifs() {
    if(selectedNotifIds.size === currentNotifsList.length) {
        selectedNotifIds.clear(); 
        document.querySelectorAll('.notif-item').forEach(el => el.classList.remove('selected')); 
        cancelNotifSelection();
    } else {
        currentNotifsList.forEach(n => { 
            selectedNotifIds.add(n.id); 
            document.getElementById(`notif-${n.id}`).classList.add('selected'); 
        });
        document.getElementById('selected-notif-count').innerText = `${selectedNotifIds.size} Selected`;
    }
}
function cancelNotifSelection() {
    isSelectMode = false; selectedNotifIds.clear();
    const toolbar = document.getElementById('notif-selection-toolbar');
    if(toolbar) toolbar.classList.add('hidden');
    const list = document.getElementById('page-notification-list');
    if(list) list.classList.remove('selection-active');
    document.querySelectorAll('.notif-item').forEach(el => el.classList.remove('selected'));
}

async function deleteSelectedNotifs() {
    if(selectedNotifIds.size === 0) return;
    if(await showCustomConfirm("Delete", `Delete ${selectedNotifIds.size} selected notifications?`)) {
        showLoader();
        try {
            const notifs = await getDB('mt_notifications');
            notifs.forEach(n => { 
                if(selectedNotifIds.has(n.id)) { 
                    n.deletedBy = n.deletedBy || {}; n.deletedBy[currentUser.id] = true; 
                } 
            });
            await saveDB('mt_notifications', notifs); 
            await openNotificationPage(); 
        } finally { hideLoader(); }
    }
}

async function exportSelectedNotifs() {
    if(selectedNotifIds.size === 0) return;
    if (typeof html2pdf === 'undefined') { return showCustomAlert("Error", "PDF library failed to load.", "fa-times-circle"); }
    const filename = await showCustomPrompt("Export PDF", "Enter file name:", "MessPayment_Notifications");
    if(!filename) return;
    
    showLoader();
    try {
        const printDiv = document.createElement('div');
        printDiv.style.padding = '20px'; printDiv.style.fontFamily = 'Arial, sans-serif';
        printDiv.innerHTML = `<h2 style="color:#ca8a04; text-align:center;">${filename}</h2><p style="text-align:center; color:#666;">Generated via MessTracker</p><hr style="margin:20px 0;">`;
        
        currentNotifsList.forEach(n => {
            if(selectedNotifIds.has(n.id)) {
                const msgText = dec(n.message); 
                const timeString = new Date(n.timestamp).toLocaleString();
                printDiv.innerHTML += `
                    <div style="margin-bottom:15px; padding:10px; border-left:4px solid #ca8a04; background:#f9f9f9;">
                        <p style="margin:0 0 5px 0; font-size:14px; color:#333;">${msgText}</p>
                        <small style="color:#888;">${timeString}</small>
                    </div>`;
            }
        });
        
        const opt = { margin: 10, filename: `${filename}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
        await html2pdf().set(opt).from(printDiv).save(); 
        cancelNotifSelection();
    } finally { hideLoader(); }
}

function goBackFromNotifications() {
    cancelNotifSelection();
    if (loginRole === 'manager') { 
        navigate('manager-dashboard'); switchManagerTab('home', document.querySelector('.bottom-nav .nav-item:nth-child(1)')); 
    } else { 
        navigate('student-dashboard'); switchStudentTab('home', document.querySelector('#student-dashboard .bottom-nav .nav-item:nth-child(1)')); 
    }
}

async function cleanupOldNotices() {
    try {
        const notifs = await getDB('mt_notifications'); const now = Date.now();
        const validNotifs = notifs.filter(n => (now - n.timestamp) <= 86400000);
        if (validNotifs.length !== notifs.length) { await saveDB('mt_notifications', validNotifs); }
    } catch(err) {}
}

// ==================== PAYMENT HISTORY SELECTION LOGIC ==================== //
function selectAllHistory() {
    if(selectedHistoryIds.size === currentHistoryList.length) {
        selectedHistoryIds.clear(); document.querySelectorAll('.history-item').forEach(el => el.classList.remove('selected')); cancelHistorySelection();
    } else {
        currentHistoryList.forEach(h => { selectedHistoryIds.add(h.id); document.getElementById(`hist-${h.id}`).classList.add('selected'); });
        document.getElementById('selected-history-count').innerText = `${selectedHistoryIds.size} Selected`;
    }
}
function cancelHistorySelection() {
    isHistorySelectMode = false; selectedHistoryIds.clear();
    const toolbar = document.getElementById('history-selection-toolbar');
    if(toolbar) toolbar.classList.add('hidden');
    const list = document.getElementById('student-pay-history');
    if(list) list.classList.remove('selection-active');
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('selected'));
}

async function deleteSelectedHistory() {
    if(selectedHistoryIds.size === 0) return;
    if(await showCustomConfirm("Delete", `Delete ${selectedHistoryIds.size} selected payment records? (This hides them from your view)`)) {
        showLoader();
        try {
            const payments = await getDB('mt_payments');
            payments.forEach(p => { if(selectedHistoryIds.has(p.id)) { p.deletedBy = p.deletedBy || {}; p.deletedBy[currentUser.id] = true; } });
            await saveDB('mt_payments', payments); await loadStudentDashboard(); 
            cancelHistorySelection();
        } finally { hideLoader(); }
    }
}

async function exportSelectedHistory() {
    if(selectedHistoryIds.size === 0) return;
    if (typeof html2pdf === 'undefined') { return showCustomAlert("Error", "PDF library failed to load.", "fa-times-circle"); }
    const filename = await showCustomPrompt("Export PDF", "Enter file name:", "MessPayment_History");
    if(!filename) return;
    
    showLoader();
    try {
        const printDiv = document.createElement('div');
        printDiv.style.padding = '20px'; printDiv.style.fontFamily = 'Arial, sans-serif';
        printDiv.innerHTML = `<h2 style="color:#ca8a04; text-align:center;">${filename}</h2><p style="text-align:center; color:#666;">Generated via MessTracker</p><hr style="margin:20px 0;">`;
        currentHistoryList.forEach(h => {
            if(selectedHistoryIds.has(h.id)) {
                let color = h.status === 'verified' ? '#16a34a' : h.status === 'rejected' ? '#dc2626' : '#f59e0b';
                printDiv.innerHTML += `
                    <div style="margin-bottom:10px; padding:10px; border:1px solid #ddd; background:#fff; display:flex; justify-content:space-between;">
                        <div>
                            <strong style="font-size:16px; color:#000;">₹${h.amount}</strong>
                            <p style="margin:2px 0 0 0; font-size:12px; color:#888;">Ref: ${h.ref} | Date: ${h.date}</p>
                        </div>
                        <strong style="color:${color};">${h.status.toUpperCase()}</strong>
                    </div>`;
            }
        });
        const opt = { margin: 10, filename: `${filename}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
        await html2pdf().set(opt).from(printDiv).save(); cancelHistorySelection();
    } finally { hideLoader(); }
}

// ==================== THEME MANAGEMENT ==================== //
function applyTheme() {
    try {
        const savedTheme = localStorage.getItem('mt_theme') || 'dark'; 
        const isDark = savedTheme === 'dark';
        if (isDark) { 
            document.body.classList.remove('light-theme'); document.body.classList.add('dark-theme'); 
        } else { 
            document.body.classList.remove('dark-theme'); document.body.classList.add('light-theme'); 
        }
        const toggleStu = document.getElementById('dark-mode-toggle'); 
        if (toggleStu) toggleStu.checked = isDark;
        const toggleMgr = document.getElementById('mgr-dark-mode-toggle'); 
        if (toggleMgr) toggleMgr.checked = isDark;
    } catch(e){}
}

function toggleDarkMode(checkbox) { 
    localStorage.setItem('mt_theme', checkbox.checked ? 'dark' : 'light'); 
    applyTheme(); 
}

// ==================== SESSION & NAV ==================== //
async function checkSession() {
    try {
        const savedId = localStorage.getItem('mt_session_id'); 
        const savedRole = localStorage.getItem('mt_session_role');
        
        if (savedId && savedRole) {
            showLoader();
            const users = await getDB('mt_users');
            if (users[savedId] && users[savedId].role === savedRole) {
                currentUser = { id: savedId, ...users[savedId], name: dec(users[savedId].name), mobile: dec(users[savedId].mobile) };
                loginRole = savedRole;
                
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                if(savedRole === 'student') {
                    const btn = document.querySelector('.tab-btn:nth-child(1)');
                    if(btn) btn.classList.add('active'); 
                } else {
                    const btn = document.querySelector('.tab-btn:nth-child(2)');
                    if(btn) btn.classList.add('active');
                }
                
                if (loginRole === 'student') { 
                    if (currentUser.firstLogin) navigate('first-login-section'); 
                    else { await loadStudentDashboard(); navigate('student-dashboard'); } 
                } else { 
                    await loadManagerDashboard(); navigate('manager-dashboard'); 
                }
            } else { await logout(true); }
        }
    } catch(err) { console.error(err); } finally { hideLoader(); }
}

function navigate(pageId) { 
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden')); 
    const page = document.getElementById(pageId);
    if(page) { page.classList.remove('hidden'); page.classList.add('active'); }
}

function setLoginType(type, btn) {
    loginRole = type; 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
    if (btn) btn.classList.add('active');
    const loginId = document.getElementById('login-id');
    if(loginId) loginId.placeholder = 'Enter ID';
    const regLink = document.getElementById('register-link-container');
    if(regLink) {
        if(type === 'manager') regLink.classList.remove('hidden'); 
        else regLink.classList.add('hidden');
    }
}

async function logout(force = false) { 
    if(force || await showCustomConfirm("Logout", "Are you sure you want to log out?")) {
        currentUser = null; localStorage.removeItem('mt_session_id'); localStorage.removeItem('mt_session_role'); navigate('login-section'); 
        const loginForm = document.getElementById('login-form');
        if(loginForm) loginForm.reset();
    }
}

// ==================== AUTH & REGISTRATION ==================== //
function openPasswordModal() { document.getElementById('password-modal').classList.remove('hidden'); document.getElementById('old-pass').value = ''; document.getElementById('new-pass').value = ''; }
function closePasswordModal() { document.getElementById('password-modal').classList.add('hidden'); }

async function saveNewPassword() {
    const oldP = document.getElementById('old-pass').value; 
    const newP = document.getElementById('new-pass').value;
    if(!oldP || !newP) return showCustomAlert("Error", "Fill both fields!", "fa-exclamation-triangle");
    
    showLoader();
    try {
        const hashedOld = await hashPassword(oldP); const hashedNew = await hashPassword(newP);
        const users = await getDB('mt_users');
        if(users[currentUser.id].password !== hashedOld) { return showCustomAlert("Error", "Incorrect Current Password!", "fa-times-circle"); }
        
        users[currentUser.id].password = hashedNew;
        await saveDB('mt_users', users); 
        await showCustomAlert("Success", "Password Updated Successfully!", "fa-check-circle"); closePasswordModal();
    } catch(err) { showCustomAlert("Error", err.message, "fa-times-circle"); } finally { hideLoader(); }
}

function copyDetails() {
    const id = document.getElementById('success-id').innerText; const pass = document.getElementById('success-pass').innerText;
    navigator.clipboard.writeText(`My MessTracker Login:\nID: ${id}\nPassword: ${pass}`); showCustomAlert("Copied", "Details copied to clipboard!", "fa-copy");
}
function copyStudentId() {
    const text = document.getElementById('generated-id-msg').innerText; navigator.clipboard.writeText(text); showCustomAlert("Copied", "Student ID Copied!", "fa-copy");
}

// ==================== STUDENT LOGIC ==================== //
async function switchStudentTab(tabName, btn) {
    document.querySelectorAll('.stu-tab').forEach(t => { t.classList.add('hidden'); t.classList.remove('active'); });
    document.getElementById(`stu-tab-${tabName}`).classList.remove('hidden'); document.getElementById(`stu-tab-${tabName}`).classList.add('active');
    
    if(btn) { document.querySelectorAll('#student-dashboard .nav-item').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
    if(tabName === 'home') await renderCalendar();
    if(tabName === 'pay') cancelHistorySelection();
}

async function loadStudentDashboard() {
    showLoader();
    try {
        await checkNotices();
        const users = await getDB('mt_users'); const settings = await getDB('mt_settings');
        const myHostelSettings = settings[currentUser.hostel] || {};
        
        document.getElementById('stu-menu-display').innerText = myHostelSettings.menu || 'Manager has not updated the menu yet.';
        document.getElementById('stu-header-name').innerText = currentUser.name.split(' ')[0];
        document.getElementById('header-dues-amount').innerText = users[currentUser.id].dues || 0;
        document.getElementById('pay-dues-amount').innerText = users[currentUser.id].dues || 0;
        document.getElementById('profile-name').innerText = currentUser.name;
        document.getElementById('profile-id').innerText = currentUser.id;
        document.getElementById('profile-img-display').src = users[currentUser.id].profilePic || defaultImg;

        const payments = await getDB('mt_payments');
        currentHistoryList = [];
        const historyUl = document.getElementById('student-pay-history'); historyUl.innerHTML = '';
        let hasVisiblePayments = false;

        payments.forEach(p => {
            if(p.studentId === currentUser.id && !(p.deletedBy && p.deletedBy[currentUser.id])) {
                currentHistoryList.push(p); hasVisiblePayments = true;
                let color = p.status==='verified' ? 'var(--success)' : p.status==='rejected' ? 'var(--danger)' : '#f59e0b';
                
                historyUl.innerHTML = `
                    <li id="hist-${p.id}" class="history-item" style="padding: 10px; margin-bottom: 8px; border: 1px solid var(--border); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; background: var(--card-bg);"
                        ontouchstart="startPress(event, '${p.id}', 'history')" 
                        ontouchmove="cancelPress()" 
                        ontouchend="endPress()" 
                        onmousedown="startPress(event, '${p.id}', 'history')" 
                        onmouseup="endPress()" 
                        onmouseleave="endPress()"
                        onclick="toggleSelect('${p.id}', 'history')" 
                        oncontextmenu="event.preventDefault();">
                        
                        <div class="select-checkbox"><i class="fas fa-check" style="color: #000;"></i></div>
                        
                        <div>
                            <span style="font-weight: bold; font-size: 15px;">₹${p.amount}</span>
                            <br><small class="text-muted" style="font-size: 11px;">${p.date}</small>
                        </div>
                        <span style="color: ${color}; font-weight:bold; font-size: 12px; padding-right:25px;">${p.status.toUpperCase()}</span>
                    </li>` + historyUl.innerHTML;
            }
        });

        if(!hasVisiblePayments) { historyUl.innerHTML = '<li style="text-align:center; padding:10px;"><span class="text-muted">No payment history.</span></li>'; }

        const membersGrid = document.getElementById('stu-members-list'); membersGrid.innerHTML = '';
        let hostelManager = null;
        for(let id in users) { if(users[id].role === 'manager' && users[id].hostel === currentUser.hostel) { hostelManager = { id, ...users[id], name: dec(users[id].name), mobile: dec(users[id].mobile) }; break; } }
        
        let serialNo = 1;

        if(hostelManager) {
            membersGrid.innerHTML += `
                <tr style="cursor:pointer; background: var(--calendar-day-bg);" onclick="openManagerContact('${hostelManager.name}', '${hostelManager.mobile || 'N/A'}', '${hostelManager.profilePic || defaultImg}')">
                    <td><b>${serialNo++}</b></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <img src="${hostelManager.profilePic || defaultImg}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; border:2px solid var(--primary);">
                            <div style="line-height:1.2;">
                                <span style="font-weight:bold; color:var(--primary);">${hostelManager.name.split(' ')[0]}</span><br>
                                <small class="text-muted" style="font-size:11px;">Tap to Call <i class="fas fa-phone"></i></small>
                            </div>
                        </div>
                    </td>
                    <td><span style="background:var(--primary); color:#000; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:bold;">Manager</span></td>
                </tr>`;
        }

        for(let id in users) {
            if(users[id].role === 'student' && users[id].hostel === currentUser.hostel) {
                let memberName = dec(users[id].name); let isMe = (id === currentUser.id);
                membersGrid.innerHTML += `
                    <tr style="${isMe ? 'background: rgba(253, 224, 71, 0.1);' : ''}">
                        <td><b>${serialNo++}</b></td>
                        <td>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <img src="${users[id].profilePic || defaultImg}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; border:1px solid ${isMe ? 'var(--primary)' : 'var(--border)'};">
                                <div style="line-height:1.2;"><span>${memberName.split(' ')[0]}</span></div>
                            </div>
                        </td>
                        <td>${isMe ? '<span style="background:var(--primary); color:#000; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:bold;">You</span>' : '<span style="font-size:12px; color:var(--text-muted);">Student</span>'}</td>
                    </tr>`;
            }
        }
        await renderCalendar();
    } finally { hideLoader(); }
}

function openManagerContact(name, mobile, pic) {
    document.getElementById('modal-mgr-pic').src = pic; document.getElementById('modal-mgr-name').innerText = name;
    const phoneLink = document.getElementById('modal-mgr-phone-link'); phoneLink.innerText = mobile; phoneLink.href = `tel:${mobile}`;
    document.getElementById('manager-contact-modal').classList.remove('hidden');
}

async function changeMonth(step) { currentCalDate.setMonth(currentCalDate.getMonth() + step); await renderCalendar(); }
async function renderCalendar() {
    const grid = document.getElementById('calendar-days'); const records = await getDB('mt_meal_records');
    const year = currentCalDate.getFullYear(); const month = currentCalDate.getMonth(); const today = new Date();
    document.getElementById('month-year-display').innerText = currentCalDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    grid.innerHTML = ''; const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div></div>`;
    
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const isFut = new Date(year, month, i) > today; let dots = '';
        if(records[currentUser.id] && records[currentUser.id][dateStr]) {
            const dM = records[currentUser.id][dateStr];
            if(dM.B) dots += `<div class="dot b"></div>`; if(dM.L) dots += `<div class="dot l"></div>`; if(dM.D) dots += `<div class="dot d"></div>`;
            if(dM.guests > 0) dots += `<div class="dot" style="background:var(--warning);"></div>`;
        }
        grid.innerHTML += `<div class="cal-day ${isFut ? 'disabled' : ''}" onclick="selectDate('${dateStr}', this)">${i}<div class="meal-dots">${dots}</div></div>`;
    }
}

async function selectDate(dateStr, elem) {
    document.querySelectorAll('.cal-day').forEach(el => el.classList.remove('selected')); elem.classList.add('selected'); selectedDateString = dateStr;
    const box = document.getElementById('meal-manager-box'); const container = document.getElementById('meal-toggles-container');
    const settings = await getDB('mt_settings'); const records = await getDB('mt_meal_records');
    const myMeals = (records[currentUser.id] && records[currentUser.id][dateStr]) || { B:false, L:false, D:false, guests: 0 };
    const mySet = settings[currentUser.hostel] || { meals: { B: 0, L: 0, D: 0 } };
    box.classList.remove('hidden'); document.getElementById('selected-date-title').innerText = `Meals on ${dateStr}`; container.innerHTML = '';
    [{key:'B', n:'Breakfast', c:mySet.meals.B}, {key:'L', n:'Lunch', c:mySet.meals.L}, {key:'D', n:'Dinner', c:mySet.meals.D}].forEach(m => {
        if(m.c > 0) container.innerHTML += `<button class="meal-btn ${myMeals[m.key] ? 'active' : ''}" onclick="toggleMeal('${m.key}', ${m.c})">${m.key}<small>${m.n} (₹${m.c})</small></button>`;
    });
    document.getElementById('guest-count').innerText = myMeals.guests || 0;
    document.getElementById('guest-cost').innerText = mySet.meals.L || mySet.meals.D || 50;
}

async function toggleMeal(mealKey, cost) {
    showLoader();
    try {
        const records = await getDB('mt_meal_records'); const users = await getDB('mt_users');
        if(!records[currentUser.id]) records[currentUser.id] = {};
        if(!records[currentUser.id][selectedDateString]) records[currentUser.id][selectedDateString] = {B:false, L:false, D:false, guests: 0};
        const isAct = records[currentUser.id][selectedDateString][mealKey];
        records[currentUser.id][selectedDateString][mealKey] = !isAct;
        users[currentUser.id].dues += (!isAct ? Number(cost) : -Number(cost));
        await saveDB('mt_meal_records', records); await saveDB('mt_users', users);
        await selectDate(selectedDateString, document.querySelector('.cal-day.selected')); await renderCalendar();
        document.getElementById('header-dues-amount').innerText = users[currentUser.id].dues; document.getElementById('pay-dues-amount').innerText = users[currentUser.id].dues;
    } finally { hideLoader(); }
}

async function addGuestMeal() {
    showLoader();
    try {
        const settings = await getDB('mt_settings'); const mySet = settings[currentUser.hostel] || { meals: { B: 0, L: 0, D: 0 } };
        const guestCost = mySet.meals.L || mySet.meals.D || 50; const records = await getDB('mt_meal_records'); const users = await getDB('mt_users');
        if(!records[currentUser.id]) records[currentUser.id] = {}; if(!records[currentUser.id][selectedDateString]) records[currentUser.id][selectedDateString] = {B:false, L:false, D:false, guests: 0};
        records[currentUser.id][selectedDateString].guests = (records[currentUser.id][selectedDateString].guests || 0) + 1;
        users[currentUser.id].dues += Number(guestCost);
        await saveDB('mt_meal_records', records); await saveDB('mt_users', users);
        await selectDate(selectedDateString, document.querySelector('.cal-day.selected')); await renderCalendar();
        document.getElementById('header-dues-amount').innerText = users[currentUser.id].dues; document.getElementById('pay-dues-amount').innerText = users[currentUser.id].dues;
        await showCustomAlert("Success", `1 Guest meal added successfully for ₹${guestCost}!`, "fa-check-circle");
    } finally { hideLoader(); }
}

// ==================== MANAGER LOGIC ==================== //
async function sendNotice() {
    const input = document.getElementById('mgr-notice-msg'); const msg = input.value.trim();
    if (!msg) return showCustomAlert("Error", "Please type a message!", "fa-exclamation-triangle");
    showLoader();
    try {
        await sendSmartNotification(currentUser.hostel, 'all', msg);
        input.value = ''; await showCustomAlert("Success", "Notice sent to all students successfully!", "fa-check-circle");
    } finally { hideLoader(); }
}

function switchManagerTab(tabName, btn) {
    document.querySelectorAll('.mgr-tab').forEach(t => { t.classList.add('hidden'); t.classList.remove('active'); });
    document.getElementById(`mgr-tab-${tabName}`).classList.remove('hidden'); document.getElementById(`mgr-tab-${tabName}`).classList.add('active');
    if(btn) { document.querySelectorAll('#manager-dashboard .nav-item').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
    if(tabName === 'profile') loadManagerProfileUI();
}

async function loadManagerDashboard() {
    showLoader();
    try {
        await cleanupOldNotices(); await checkNotices();
        const settings = await getDB('mt_settings'); const users = await getDB('mt_users'); const payments = await getDB('mt_payments');
        const myHostelSettings = settings[currentUser.hostel] || { menu: '', meals: { B: 0, L: 0, D: 0 } };
        document.getElementById('mgr-settings-hostel-name').innerText = currentUser.hostel;
        document.getElementById('mgr-menu-input').value = myHostelSettings.menu || '';
        document.getElementById('cost-b').value = myHostelSettings.meals.B || 0; document.getElementById('cost-l').value = myHostelSettings.meals.L || 0; document.getElementById('cost-d').value = myHostelSettings.meals.D || 0;
        
        const tbodyManager = document.getElementById('mgr-notebook-list'); tbodyManager.innerHTML = ''; let serialNo = 1;
        for (let key in users) {
            if (users[key].role === 'student' && users[key].hostel === currentUser.hostel) {
                let totalPaid = 0; const stuPayments = payments.filter(p => p.studentId === key && p.status === 'verified');
                stuPayments.forEach(p => totalPaid += p.amount);
                let sName = dec(users[key].name); let sMob = dec(users[key].mobile);
                tbodyManager.innerHTML += `
                    <tr>
                        <td><b>${serialNo++}</b></td>
                        <td>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <img src="${users[key].profilePic || defaultImg}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; border:1px solid var(--border);">
                                <div style="line-height:1.2;"><span>${sName}</span><br><small class="text-muted" style="font-size:11px;">${key}</small></div>
                            </div>
                        </td>
                        <td style="color:var(--danger); font-weight:bold;">₹${users[key].dues || 0}</td>
                        <td style="color:var(--success);">₹${totalPaid}</td>
                        <td style="display: flex; gap: 5px;">
                            <button onclick="sendWhatsAppBill('${sName}', '${sMob}', ${users[key].dues || 0}, ${totalPaid})" class="btn-icon" style="background:#dcf8c6; color:#16a34a; padding:5px 8px; border-radius:5px; border: 1px solid #16a34a;"><i class="fab fa-whatsapp"></i></button>
                            <button onclick="removeStudent('${key}')" class="btn-icon text-danger" style="background:#fee2e2; padding:5px 8px; border-radius:5px; border: 1px solid var(--danger);"><i class="fas fa-trash-alt"></i></button>
                        </td>
                    </tr>`;
            }
        }
        const myPending = payments.filter(p => p.status === 'pending' && users[p.studentId] && users[p.studentId].hostel === currentUser.hostel);
        const pendingCard = document.getElementById('pending-card');
        if (myPending.length > 0) { pendingCard.classList.remove('hidden'); document.getElementById('pending-count').innerText = `${myPending.length} waiting`; } else pendingCard.classList.add('hidden');
    } finally { hideLoader(); }
}

function sendWhatsAppBill(name, mobile, due, paid) {
    if(!mobile || mobile === 'N/A' || mobile === 'null') return showCustomAlert("Notice", "Mobile number not available.", "fa-exclamation-triangle");
    const msg = `Hello ${name},\n\n*MessTracker Bill Update*\n🏠 Hostel: ${currentUser.hostel}\n\n*Total Due:* ₹${due}\n*Total Paid:* ₹${paid}\n\nPlease clear your pending dues on time.\n\n- Hostel Manager`;
    window.open(`https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`, '_blank');
}

async function loadManagerProfileUI() {
    const users = await getDB('mt_users'); const me = users[currentUser.id];
    document.getElementById('mgr-profile-name').innerText = currentUser.name; document.getElementById('mgr-profile-id').innerText = currentUser.id;
    document.getElementById('mgr-profile-mob').innerText = currentUser.mobile || 'N/A'; document.getElementById('mgr-profile-img-display').src = me.profilePic || defaultImg; applyTheme();
}

async function removeStudent(studentId) {
    if(await showCustomConfirm("Remove Student", "Are you SURE you want to remove this student? All their data will be permanently deleted!")) {
        showLoader();
        try {
            const users = await getDB('mt_users'); delete users[studentId]; await saveDB('mt_users', users); await showCustomAlert("Success", "Student removed successfully!", "fa-check-circle"); await loadManagerDashboard();
        } finally { hideLoader(); }
    }
}

async function showVerificationList() {
    showLoader();
    try {
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
                    <input type="text" id="remark-${p.id}" placeholder="Type remark (Optional)..." style="margin-top: 10px; margin-bottom: 10px; padding: 8px; font-size:13px; width: 100%; box-sizing: border-box; border: 1px solid var(--border); border-radius: 5px; background: var(--bg-color); color: var(--text-main);">
                    <div style="display: flex; gap: 10px;">
                        <button onclick="processPayment('${p.id}', 'verified')" class="btn-success btn-small" style="flex: 1; background: var(--success); color:#fff; border:none;">Verify</button>
                        <button onclick="processPayment('${p.id}', 'rejected')" class="btn-danger btn-small" style="flex: 1; background: var(--danger); color:#fff; border:none;">Reject</button>
                    </div>
                </div>`;
        });
    } finally { hideLoader(); }
}

async function processPayment(paymentId, status) {
    const remarkInput = document.getElementById(`remark-${paymentId}`);
    const remark = remarkInput ? remarkInput.value.trim() : '';
    showLoader();
    try {
        const payments = await getDB('mt_payments'); const users = await getDB('mt_users');
        const pIndex = payments.findIndex(p => p.id === paymentId);
        
        if(pIndex > -1) {
            payments[pIndex].status = status;
            const sId = payments[pIndex].studentId;
            const amt = payments[pIndex].amount;
            if(status === 'verified') { if(users[sId]) users[sId].dues = (users[sId].dues || 0) - amt; }
            
            await saveDB('mt_payments', payments); await saveDB('mt_users', users);
            
            let notifyMsg = `Your payment of ₹${amt} was ${status.toUpperCase()}.`;
            if(remark) notifyMsg += ` Remark: ${remark}`;
            await sendSmartNotification(currentUser.hostel, sId, notifyMsg);
            
            await showVerificationList(); await loadManagerDashboard();
        }
    } finally { hideLoader(); }
}

// ==================== SAFE EVENT BINDINGS (CRASH-PROOF) ==================== //
document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    checkSession();
    
    safeBind('btn-crop-cancel', 'click', () => {
        document.getElementById('cropper-modal').classList.add('hidden');
        if (cropperInstance) cropperInstance.destroy();
        const sInput = document.getElementById('profile-upload'); if(sInput) sInput.value = '';
        const mInput = document.getElementById('mgr-profile-upload'); if(mInput) mInput.value = '';
    });

    safeBind('btn-crop-save', 'click', async () => {
        if (!cropperInstance) return;
        showLoader();
        try {
            const canvas = cropperInstance.getCroppedCanvas({ width: 400, height: 400 });
            const base64Str = canvas.toDataURL('image/jpeg', 0.8); 
            const users = await getDB('mt_users');
            users[currentUser.id].profilePic = base64Str;
            await saveDB('mt_users', users);
            
            if (currentCropTarget === 'student') { document.getElementById('profile-img-display').src = base64Str; } 
            else if (currentCropTarget === 'manager') { document.getElementById('mgr-profile-img-display').src = base64Str; }
            
            document.getElementById('cropper-modal').classList.add('hidden');
            cropperInstance.destroy();
            await showCustomAlert("Success", "Profile Picture Updated!", "fa-check-circle");
        } catch(e) { showCustomAlert("Error", "Failed to update picture", "fa-times-circle"); } 
        finally { hideLoader(); }
    });

    safeBind('login-form', 'submit', async (e) => {
        e.preventDefault(); 
        const id = document.getElementById('login-id').value.trim(); 
        const pass = document.getElementById('login-pass').value.trim();
        showLoader();
        try {
            const hashedInput = await hashPassword(pass); 
            const users = await getDB('mt_users');
            if (users && users[id] && users[id].password === hashedInput && users[id].role === loginRole) {
                currentUser = { id, ...users[id], name: dec(users[id].name), mobile: dec(users[id].mobile) };
                localStorage.setItem('mt_session_id', id); localStorage.setItem('mt_session_role', loginRole);
                if (loginRole === 'student') { 
                    if (currentUser.firstLogin) navigate('first-login-section'); 
                    else { await loadStudentDashboard(); navigate('student-dashboard'); } 
                } else { await loadManagerDashboard(); navigate('manager-dashboard'); }
            } else { showCustomAlert("Login Failed", "Invalid ID or Password!", "fa-times-circle"); }
        } catch(err) { showCustomAlert("DB Error", err.message, "fa-times-circle"); } finally { hideLoader(); }
    });

    safeBind('first-login-form', 'submit', async (e) => {
        e.preventDefault(); 
        const newPass = document.getElementById('new-first-pass').value.trim();
        showLoader();
        try {
            const hashedNew = await hashPassword(newPass); 
            const users = await getDB('mt_users');
            users[currentUser.id].password = hashedNew; 
            users[currentUser.id].firstLogin = false;
            await saveDB('mt_users', users); 
            currentUser.firstLogin = false; 
            await showCustomAlert("Success", "Password set successfully!", "fa-check-circle");
            await loadStudentDashboard(); navigate('student-dashboard');
        } finally { hideLoader(); }
    });

    safeBind('manager-register-form', 'submit', async (e) => {
        e.preventDefault();
        const mgrName = document.getElementById('reg-mgr-name').value.trim(); 
        const hostelName = document.getElementById('reg-hostel-name').value.trim();
        const mobile = document.getElementById('reg-mgr-mobile').value.trim(); 
        const pass = document.getElementById('reg-mgr-pass').value.trim();
        showLoader();
        try {
            const users = await getDB('mt_users');
            for(let key in users) { 
                if(users[key].role === 'manager' && users[key].hostel.toLowerCase() === hostelName.toLowerCase()) { 
                    showCustomAlert("Error", `Hostel '${hostelName}' is already taken.`, "fa-exclamation-triangle"); 
                    hideLoader(); return; 
                } 
            }
            const hashedPass = await hashPassword(pass); 
            const newMgrId = 'MGR' + Math.floor(1000 + Math.random() * 9000);
            users[newMgrId] = { role: 'manager', name: enc(mgrName), mobile: enc(mobile), hostel: hostelName, password: hashedPass };
            await saveDB('mt_users', users);

            const settings = await getDB('mt_settings'); 
            settings[hostelName] = { menu: "Welcome to Hostel! Menu updating soon...", meals: { B: 30, L: 50, D: 50 } }; 
            await saveDB('mt_settings', settings);
            document.getElementById('success-id').innerText = newMgrId; 
            document.getElementById('success-pass').innerText = pass;
            document.getElementById('manager-register-form').reset(); 
            navigate('registration-success-section');
        } catch (err) { showCustomAlert("Error", err.message, "fa-times-circle"); } finally { hideLoader(); }
    });

    safeBind('settings-form', 'submit', async (e) => {
        e.preventDefault(); 
        showLoader();
        try {
            const settings = await getDB('mt_settings');
            if(!settings[currentUser.hostel]) settings[currentUser.hostel] = { meals: {} };
            settings[currentUser.hostel].menu = document.getElementById('mgr-menu-input').value.trim();
            settings[currentUser.hostel].meals = { B: Number(document.getElementById('cost-b').value), L: Number(document.getElementById('cost-l').value), D: Number(document.getElementById('cost-d').value) };
            await saveDB('mt_settings', settings); 
            await showCustomAlert("Success", "Settings & Menu Updated!", "fa-check-circle");
        } finally { hideLoader(); }
    });

    safeBind('add-student-form', 'submit', async (e) => {
        e.preventDefault(); 
        const name = document.getElementById('stu-name').value; 
        const mobile = document.getElementById('stu-mobile').value;
        showLoader();
        try {
            const newId = 'STU' + Math.floor(1000 + Math.random() * 9000); 
            const users = await getDB('mt_users');
            const defaultHashedPass = await hashPassword('123');
            users[newId] = { role: 'student', name: enc(name), mobile: enc(mobile), password: defaultHashedPass, firstLogin: true, dues: 0, hostel: currentUser.hostel };
            await saveDB('mt_users', users);
            const msgBox = document.getElementById('generated-id-box'); 
            msgBox.classList.remove('hidden');
            document.getElementById('generated-id-msg').innerText = `ID: ${newId} \n(Pass: 123)`; 
            document.getElementById('add-student-form').reset(); 
            await loadManagerDashboard();
        } finally { hideLoader(); }
    });

    safeBind('payment-form', 'submit', async (e) => {
        e.preventDefault(); 
        const amt = Number(document.getElementById('pay-amount').value);
        showLoader();
        try {
            let payments = await getDB('mt_payments');
            payments.push({ id: 'PAY' + Date.now(), studentId: currentUser.id, amount: amt, ref: document.getElementById('pay-ref').value, status: 'pending', date: new Date().toLocaleDateString('en-IN') });
            await saveDB('mt_payments', payments);
            await sendSmartNotification(currentUser.hostel, 'MGR', `New payment of ₹${amt} is pending verification from ${currentUser.name.split(' ')[0]}.`);
            await showCustomAlert("Submitted", "Payment submitted! Waiting for manager verification.", "fa-paper-plane");
            document.getElementById('payment-form').reset(); 
            await loadManagerDashboard(); // Fixed to refresh correctly
        } finally { hideLoader(); }
    });
});
// Function to toggle Offline Screen
function handleOfflineStatus() {
  const offlineScreen = document.getElementById('offline-screen');
  if (offlineScreen) {
    if (!navigator.onLine) {
      offlineScreen.style.display = 'flex';
    } else {
      offlineScreen.style.display = 'none';
    }
  }
}

// Network state listeners
window.addEventListener('online', handleOfflineStatus);
window.addEventListener('offline', handleOfflineStatus);

// Check network on page load
document.addEventListener('DOMContentLoaded', handleOfflineStatus);

