import { validateTimeConstraint, createBooking, getBookingsForUI, getPendingRequests, updateBookingStatus, getActiveSlots, setActiveSlotMode, getUserStats } from "./db.js";

// DOM Init
const els = {
    loginView: document.getElementById("login-view"),
    dashboardView: document.getElementById("dashboard-view"),
    loginForm: document.getElementById("login-form"),
    
    // User Stats & Booking
    userStats: document.getElementById("user-stats-section"),
    bookingSection: document.getElementById("booking-section"),
    bookingForm: document.getElementById("booking-form"),
    hallTypeSelect: document.getElementById("hall-type"),
    bookingSlot: document.getElementById("booking-slot"),
    eForm: document.getElementById("e-form-section"),
    
    // Settings & Admin Modals
    settingsNavBtn: document.getElementById("settings-nav-btn"),
    vipNavBtn: document.getElementById("vip-notifications-btn"),
    settingsSection: document.getElementById("system-settings-section"),
    calendarSection: document.getElementById("calendar-section"),
    pendingSection: document.getElementById("pending-requests-section"),
    reportSection: document.getElementById("morning-report-section"),
    
    // Admin specific Views
    monthlyViewBtn: document.getElementById("monthly-view-btn"),
    weeklyViewBtn: document.getElementById("weekly-view-btn"),
    calTitle: document.getElementById("cal-view-title"),
    calendarGrid: document.getElementById("calendar-grid")
};

let currentUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "null");
let userDelegations = []; // Mocks
let userOverrides = []; // Mocks
let viewMode = 'weekly';
let selectedBookingForReject = null;

const ALL_HALLS = {
    lecture: [
        { id: "L1", name: "قاعة محاضرات 1 (ثابت)" },
        { id: "L2", name: "مدرج 2" }
    ],
    multipurpose: [
        { id: "M1", name: "قاعة متعددة الأغراض A" },
        { id: "M2", name: "قاعة متعددة الأغراض B" }
    ]
};

// Start
initApp();

function initApp() {
    els.loginForm.addEventListener("submit", handleLogin);
    document.getElementById("logout-btn").addEventListener("click", () => {
        sessionStorage.removeItem("loggedInUser");
        window.location.reload();
    });
    
    els.hallTypeSelect.addEventListener("change", handleHallChange);
    els.bookingForm.addEventListener("submit", handleBookingSubmit);
    
    // Navigation / Views
    els.settingsNavBtn.addEventListener("click", () => toggleAdminPanel("settings"));
    document.getElementById("my-dashboard-btn").addEventListener("click", () => toggleAdminPanel("dashboard"));
    
    // Settings Tabs
    document.getElementById("slots-tab-btn").addEventListener("click", (e) => switchSettingTab(e, 'slots-settings'));
    document.getElementById("delegation-tab-btn").addEventListener("click", (e) => switchSettingTab(e, 'delegation-settings'));
    document.getElementById("override-tab-btn").addEventListener("click", (e) => switchSettingTab(e, 'override-settings'));
    
    // Filters & Search
    document.getElementById("apply-filters-btn").addEventListener("click", renderCalendar);
    document.getElementById("find-empty-btn").addEventListener("click", handleEmptySearch);
    
    // Slot Management
    document.getElementById("ramadan-mode-btn").addEventListener("click", () => { setActiveSlotMode('ramadan'); renderSettings(); populateSlots(); renderCalendar(); });
    document.getElementById("normal-mode-btn").addEventListener("click", () => { setActiveSlotMode('standard'); renderSettings(); populateSlots(); renderCalendar(); });
    
    // Calendar Views
    els.weeklyViewBtn.addEventListener("click", () => { viewMode = 'weekly'; els.calTitle.textContent = "الأسبوعي"; renderCalendar(); });
    els.monthlyViewBtn.addEventListener("click", () => { viewMode = 'monthly'; els.calTitle.textContent = "الشهري"; renderCalendar(); });
    
    // Modals
    document.getElementById("cancel-reject-btn").addEventListener("click", () => document.getElementById("reject-modal").classList.add("hidden"));
    document.getElementById("confirm-reject-btn").addEventListener("click", handleRejectWithAlternative);
    document.getElementById("close-vip-btn").addEventListener("click", () => document.getElementById("vip-modal").classList.add("hidden"));
    els.vipNavBtn.addEventListener("click", () => document.getElementById("vip-modal").classList.remove("hidden"));
}

function handleLogin(e) {
    e.preventDefault();
    const empId = document.getElementById("emp-id").value;
    const username = document.getElementById("username").value;
    let role = document.getElementById("role-select").value;
    
    // Mock Delegation Check
    const isDelegated = userDelegations.find(d => d.delegatee === empId);
    if(isDelegated) {
        alert(`أنت الآن تستخدم صلاحيات الموظف المفوض (${isDelegated.delegator}) مؤقتاً.`);
        role = isDelegated.role; 
    }

    currentUser = { empId, username, role, hasOverride: userOverrides.includes(empId) };
    sessionStorage.setItem("loggedInUser", JSON.stringify(currentUser));
    
    showDashboard();
}

function showDashboard() {
    if(!currentUser) return;
    els.loginView.classList.add("hidden");
    els.dashboardView.classList.remove("hidden");
    document.getElementById("welcome-msg").textContent = `مرحباً، ${currentUser.username}`;
    document.getElementById("user-role-badge").textContent = currentUser.role;
    
    setupRoleUI();
    populateSlots();
}

// Automatically login on refresh if session exists
if(currentUser) {
    showDashboard();
}

async function setupRoleUI() {
    hideAllPanels();
    els.settingsNavBtn.classList.add("hidden");
    els.vipNavBtn.classList.add("hidden");
    
    if (currentUser.role === 'Admin') {
        els.settingsNavBtn.classList.remove("hidden");
        // VIP setup mocked
        document.getElementById("notif-count").textContent = "1";
        document.getElementById("vip-list").innerHTML = "<li>مدير الفرع وافق على حجز قاعة متعددة A.</li>";
        
        els.calendarSection.classList.remove("hidden");
        els.reportSection.classList.remove("hidden");
        
        setupAdminDashboard();
    } else if (currentUser.role === 'Branch Manager') {
        els.calendarSection.classList.remove("hidden");
        els.pendingSection.classList.remove("hidden");
        renderCalendar();
        loadPendingRequests();
    } else {
        // Employee / Secretary
        els.userStats.classList.remove("hidden");
        els.bookingSection.classList.remove("hidden");
        
        const stats = await getUserStats(currentUser.empId);
        document.getElementById("stat-pending").textContent = stats.pending;
        document.getElementById("stat-approved").textContent = stats.approved;
        document.getElementById("stat-rejected").textContent = stats.rejected;
        
        populateHallsSelect(currentUser.role === 'Employee' ? ALL_HALLS.lecture : ALL_HALLS.multipurpose);
        if (currentUser.role === 'Employee') els.eForm.classList.add("hidden");
        
        // System Override
        if (currentUser.hasOverride) {
            els.calendarSection.classList.remove("hidden");
            renderCalendar();
        }
    }
}

function populateHallsSelect(halls) {
    els.hallTypeSelect.innerHTML = '';
    halls.forEach(h => {
        const o = document.createElement("option"); o.value = h.id; o.textContent = h.name;
        o.dataset.type = ALL_HALLS.lecture.some(hx=>hx.id===h.id)?'lecture':'multipurpose';
        els.hallTypeSelect.appendChild(o);
    });
}

function handleHallChange(e) {
    const opt = e.target.options[e.target.selectedIndex];
    if(opt.dataset.type === 'multipurpose') els.eForm.classList.remove("hidden");
    else els.eForm.classList.add("hidden");
}

function populateSlots() {
    const slots = getActiveSlots();
    // Fill booking form slots
    els.bookingSlot.innerHTML = '';
    document.getElementById("filter-slot").innerHTML = '<option value="all">كل الفترات</option>';
    document.getElementById("alt-slot").innerHTML = '<option value="">-- اختر فترة --</option>';
    
    slots.forEach(s => {
        els.bookingSlot.innerHTML += `<option value="${s.id}">${s.label}</option>`;
        document.getElementById("filter-slot").innerHTML += `<option value="${s.id}">${s.label}</option>`;
        document.getElementById("alt-slot").innerHTML += `<option value="${s.id}">${s.label}</option>`;
    });
}

async function handleBookingSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById("submit-booking-btn");
    btn.disabled = true; btn.textContent = "جاري الحجز...";
    document.getElementById("booking-error").textContent = '';

    const date = document.getElementById("booking-date").value;
    const slotId = els.bookingSlot.value;
    const opt = els.hallTypeSelect.options[els.hallTypeSelect.selectedIndex];
    
    try {
        validateTimeConstraint(date, currentUser.role, opt.dataset.type);
        
        let extra = {};
        if (opt.dataset.type === 'multipurpose') {
            extra = {
                purpose: document.getElementById("booking-purpose").value,
                manager: document.getElementById("manager-name").value,
                job: document.getElementById("manager-job").value,
                mics: document.getElementById("req-mic").checked ? document.getElementById("mic-count").value : 0,
                laptop: document.getElementById("req-laptop").checked,
                video: document.getElementById("req-video").checked
            };
        }
        
        await createBooking({
            empId: currentUser.empId, username: currentUser.username, 
            hallId: opt.value, hallName: opt.textContent, hallType: opt.dataset.type,
            date, slotId, status: opt.dataset.type==='multipurpose'?'PENDING':'APPROVED', ...extra
        });
        
        alert("تم الحجز بنجاح!");
        setupRoleUI(); // refresh stats
    } catch (err) {
        document.getElementById("booking-error").textContent = err.message;
    } finally {
        btn.disabled = false; btn.textContent = "طلب حجز";
    }
}

async function handleEmptySearch() {
    const date = document.getElementById("filter-date").value;
    const slot = document.getElementById("filter-slot").value;
    const type = document.getElementById("filter-room-type").value;
    const resBox = document.getElementById("empty-search-results");
    
    if(!date || slot === 'all') { alert("حدد التاريخ والفترة بدقة للبحث المتخصص"); return; }
    
    const bookings = await getBookingsForUI({date, slotId: slot});
    const takenIds = bookings.map(b => b.hallId);
    
    let allH = [];
    if(type==='all') allH = [...ALL_HALLS.lecture, ...ALL_HALLS.multipurpose];
    else if(type==='lecture') allH = ALL_HALLS.lecture;
    else allH = ALL_HALLS.multipurpose;
    
    const emptyHalls = allH.filter(h => !takenIds.includes(h.id));
    resBox.classList.remove("hidden");
    resBox.innerHTML = `القاعات المتاحة في ${date} للفترة المحددة: <br> ${emptyHalls.map(h=>`[${h.name}] `).join(' - ') || 'لا يوجد قاعات فارغة.'}`;
}

async function renderCalendar() {
    els.calendarGrid.innerHTML = '';
    const slots = getActiveSlots();
    
    els.calendarGrid.innerHTML += `<div class="calendar-header">الفترة</div>`;
    for(let i=1;i<=6;i++) els.calendarGrid.innerHTML += `<div class="calendar-header">يوم ${i}</div>`;
    
    const books = await getBookingsForUI(); // In a real app we'd pass timeframe bounds
    
    slots.forEach(s => {
        els.calendarGrid.innerHTML += `<div class="calendar-cell"><strong>${s.label}</strong></div>`;
        for(let d=1; d<=6; d++) {
            // Very naive match
            const cb = books.filter(b => b.slotId === s.id);
            let h = '';
            cb.forEach(b=>{
                const col = b.hallType==='lecture'?'bg-lecture':'bg-multi';
                h += `<div class="booking-item ${col}">${b.hallName}</div>`
            });
            els.calendarGrid.innerHTML += `<div class="calendar-cell">${h}</div>`;
        }
    });
}

function setupAdminDashboard() {
    renderSettings();
    renderCalendar();
    
    // MOCK Morning Report
    els.reportSection.innerHTML = `
    <div class="glass-panel">
        <h3>التقرير الصباحي اليوم</h3>
        <ul class="slots-list">
            <li><span>ندوة تكنولوجيا (قاعة متعددة A)</span> <span>مسؤول التنظيم: د.كريم</span></li>
            <li><span>تغيير استثنائي لمدرج 2 (بدل الأونلاين)</span> <span>مسؤول التنظيم: القسم</span></li>
        </ul>
        <p style="margin-top:1rem;color:var(--text-muted)">* برجاء توجيه العمال لتجهيز المقاعد وأجهزة Video Conference للقاعة متعددة A.</p>
    </div>`;
}

function renderSettings() {
    const list = document.getElementById("current-slots-list");
    list.innerHTML = '';
    getActiveSlots().forEach(s => {
        list.innerHTML += `<li><span>${s.id}</span> <span>${s.label}</span></li>`;
    });
}

function hideAllPanels() {
    Object.values(els).forEach(el => {
        if(el && el.classList && el.id && document.getElementById(el.id).classList.contains('panel')) {
            el.classList.add("hidden");
        }
    });
}

function toggleAdminPanel(mode) {
    hideAllPanels();
    if(mode === 'settings') {
        els.settingsSection.classList.remove("hidden");
    } else {
        els.calendarSection.classList.remove("hidden");
        els.reportSection.classList.remove("hidden");
    }
}

function switchSettingTab(e, targetId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.settings-content').forEach(c => c.classList.add('hidden'));
    e.target.classList.add("active");
    document.getElementById(targetId).classList.remove("hidden");
    document.getElementById(targetId).classList.add("active");
}

async function loadPendingRequests() { /* Branch Manager */
    const list = document.getElementById("requests-list");
    const r = await getPendingRequests();
    list.innerHTML = r.map(x=>`<div class="request-card">...</div>`).join('');
}

async function handleRejectWithAlternative() {
    // Basic mock connection
    alert("تم رفض الطلب واقتراح البديل!");
    document.getElementById("reject-modal").classList.add("hidden");
}

// Delegation Mock Attach 
document.getElementById("delegation-form").addEventListener("submit", (e)=>{
    e.preventDefault();
    userDelegations.push({
        delegator: document.getElementById("delegator-emp").value,
        delegatee: document.getElementById("delegatee-emp").value,
        role: "Employee" // simplifcation
    });
    alert("تم تفعيل التفويض بنجاح.");
    e.target.reset();
});

document.getElementById("grant-override-btn").addEventListener("click", ()=>{
    userOverrides.push(document.getElementById("override-emp").value);
    alert("تم منح الموظف استثناء لرؤية الجداول المتاحة!");
});
