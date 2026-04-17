import { validateTimeConstraint, createBooking, getBookingsForUI, getPendingRequests, updateBookingStatus, getActiveSlots, setActiveSlotMode, getUserStats, fetchHalls, fetchUser, seedDatabase } from "./db.js";

// DOM Init
const els = {
    loginView: document.getElementById("login-view"),
    dashboardView: document.getElementById("dashboard-view"),
    loginForm: document.getElementById("login-form"),
    
    // User Stats & Booking Selection
    userStats: document.getElementById("user-stats-section"),
    selectionSection: document.getElementById("booking-selection-section"),
    formSection: document.getElementById("booking-form-section"),
    bookingForm: document.getElementById("booking-form"),
    hallTypeSelect: document.getElementById("hall-type"),
    bookingSlot: document.getElementById("booking-slot"),
    eForm: document.getElementById("e-form-section"),
    
    // Manager & Admin Views
    pendingSection: document.getElementById("pending-requests-section"),
    managerSection: document.getElementById("manager-approval-section"),
    settingsSection: document.getElementById("system-settings-section"),
    calendarSection: document.getElementById("calendar-section"),
    calendarGrid: document.getElementById("calendar-grid"),
    reportSection: document.getElementById("morning-report-section"),
    
    // Navigation
    settingsNavBtn: document.getElementById("settings-nav-btn"),
    vipNavBtn: document.getElementById("vip-notifications-btn"),
    backToSelectionBtn: document.getElementById("back-to-selection-btn")
};

let currentUser = JSON.parse(localStorage.getItem("loggedInUser") || "null");
let activeBookingId = null;
let userDelegations = []; 
let userOverrides = []; 
let currentHalls = [];
let selectedCategory = null; 

// Start
initApp();

function initApp() {
    try {
        // 1. Core Listeners
        if (els.loginForm) els.loginForm.addEventListener("submit", handleLogin);
        
        const logoutBtn = document.getElementById("logout-btn");
        if (logoutBtn) logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("loggedInUser");
            window.location.reload();
        });
        
        const loginSeedBtn = document.getElementById("login-seeder-btn");
        if (loginSeedBtn) loginSeedBtn.addEventListener("click", async () => {
            if(confirm("هل تريد تهيئة قاعدة البيانات؟")) await seedDatabase();
        });

        // 2. Choice Cards
        const cLecture = document.getElementById("choice-lecture");
        if (cLecture) cLecture.addEventListener("click", () => openBookingForm('lecture'));
        
        const cMulti = document.getElementById("choice-multi");
        if (cMulti) cMulti.addEventListener("click", () => {
            if (currentUser && currentUser.role === 'Secretary') {
                alert("صلاحيات السكرتارية لا تسمح بحجز القاعات متعددة الأغراض.");
                return;
            }
            openBookingForm('multipurpose');
        });

        if (els.backToSelectionBtn) els.backToSelectionBtn.addEventListener("click", () => {
            els.formSection.classList.add("hidden");
            els.selectionSection.classList.remove("hidden");
        });

        if (els.bookingForm) els.bookingForm.addEventListener("submit", handleBookingSubmit);
        
        // 3. Nav & Panels
        if (els.settingsNavBtn) els.settingsNavBtn.addEventListener("click", () => toggleAdminPanel("settings"));
        
        const myDashBtn = document.getElementById("my-dashboard-btn");
        if (myDashBtn) myDashBtn.addEventListener("click", () => toggleAdminPanel("dashboard"));
        
        const backDashBtn = document.getElementById("back-to-dash-btn");
        if (backDashBtn) backDashBtn.addEventListener("click", () => toggleAdminPanel("dashboard"));
        
        // 4. Settings Tabs & Forms
        const bindTab = (id, tabId) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener("click", (e) => switchSettingTab(e, tabId));
        };
        bindTab("slots-tab-btn", 'slots-settings');
        bindTab("delegation-tab-btn", 'delegation-settings');
        bindTab("override-tab-btn", 'override-settings');

        const delForm = document.getElementById("delegation-form");
        if (delForm) delForm.addEventListener("submit", (e) => {
            e.preventDefault();
            userDelegations.push({
                delegator: document.getElementById("delegator-emp").value,
                delegatee: document.getElementById("delegatee-emp").value
            });
            alert("تم تفعيل التفويض بنجاح.");
            e.target.reset();
        });

        const grantOBtn = document.getElementById("grant-override-btn");
        if (grantOBtn) grantOBtn.addEventListener("click", () => {
            const id = document.getElementById("override-emp").value;
            if (id) {
                userOverrides.push(id);
                alert("تم منح الموظف استثناء لرؤية الجداول المتاحة!");
            }
        });
        
        // 5. Search & Filters
        const applyBtn = document.getElementById("apply-filters-btn");
        if (applyBtn) applyBtn.addEventListener("click", renderCalendar);
        
        const findEmptyBtn = document.getElementById("find-empty-btn");
        if (findEmptyBtn) findEmptyBtn.addEventListener("click", handleEmptySearch);
        
        // 6. Slot & DB Management
        const ramadanBtn = document.getElementById("ramadan-mode-btn");
        if (ramadanBtn) ramadanBtn.addEventListener("click", async () => { setActiveSlotMode('ramadan'); await populateSlots(); await renderCalendar(); });
        
        const normalBtn = document.getElementById("normal-mode-btn");
        if (normalBtn) normalBtn.addEventListener("click", async () => { setActiveSlotMode('standard'); await populateSlots(); await renderCalendar(); });
        
        const seedBtn = document.getElementById("seed-db-btn");
        if (seedBtn) seedBtn.addEventListener("click", seedDatabase);

        // 7. Modals
        const cancelReject = document.getElementById("cancel-reject-btn");
        if (cancelReject) cancelReject.addEventListener("click", () => document.getElementById("reject-modal").classList.add("hidden"));
        
        const confirmReject = document.getElementById("confirm-reject-btn");
        if (confirmReject) confirmReject.addEventListener("click", handleRejectWithAlternative);
        
        const closeVip = document.getElementById("close-vip-btn");
        if (closeVip) closeVip.addEventListener("click", () => document.getElementById("vip-modal").classList.add("hidden"));
        
        if (els.vipNavBtn) els.vipNavBtn.addEventListener("click", () => document.getElementById("vip-modal").classList.remove("hidden"));

        console.log("App Initialized Successfully");
        if(currentUser) showDashboard();
    } catch (err) {
        console.error("App Initialization Failed:", err);
    }
}


async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "جاري الدخول...";
    
    try {
        const empId = document.getElementById("emp-id").value;
        const inputUsername = document.getElementById("username") ? document.getElementById("username").value.trim() : "";
        
        // NEW: Fetch user from Firestore
        const matchedUser = await fetchUser(empId);
        
        if(!matchedUser && !inputUsername) {
            alert("يرجى إدخال اسم المستخدم للرقم الوظيفي الجديد.");
            btn.disabled = false; btn.textContent = "تسجيل الدخول";
            return;
        }
        
        const username = inputUsername || (matchedUser ? matchedUser.name : "مستخدم جديد");
        const role = matchedUser ? matchedUser.role : "Employee";
        
        // Mock Delegation Check
        let finalRole = role;
        const isDelegated = userDelegations.find(d => d.delegatee === empId);
        if(isDelegated) {
            alert(`أنت الآن تستخدم صلاحيات الموظف المفوض (${isDelegated.delegator}) مؤقتاً.`);
            finalRole = isDelegated.role || "Employee"; 
        }

        currentUser = { empId, username, role: finalRole };
        localStorage.setItem("loggedInUser", JSON.stringify(currentUser));
        
        await showDashboard();
    } catch (err) {
        console.error("Login Error:", err);
        alert("حدث خطأ أثناء تسجيل الدخول: " + err.message);
    } finally {
        btn.disabled = false; btn.textContent = "تسجيل الدخول";
    }
}

async function showDashboard() {
    try {
        if(!currentUser) return;
        
        // Toggle Views
        els.loginView.classList.add("hidden");
        els.dashboardView.classList.remove("hidden");
        
        const welcome = document.getElementById("welcome-msg");
        if(welcome) welcome.textContent = `مرحباً، ${currentUser.username}`;
        
        await setupRoleUI();
        await populateSlots();
        console.log("Dashboard loaded for:", currentUser.username);
    } catch (err) {
        console.error("Dashboard Load Error:", err);
        alert("تعذر تحميل لوحة التحكم: " + err.message);
    }
}


async function setupRoleUI() {
    hideAllPanels();
    els.settingsNavBtn.classList.add("hidden");
    els.vipNavBtn.classList.add("hidden");
    
    currentHalls = await fetchHalls();

    const hasViewPerm = currentUser.role === 'Admin' || 
                       currentUser.role === 'Branch Manager' || 
                       (currentUser.overrides && currentUser.overrides.includes('view_rooms'));

    if (currentUser.role === 'Admin') {
        els.settingsNavBtn.classList.remove("hidden");
        els.vipNavBtn.classList.remove("hidden");
        els.calendarSection.classList.remove("hidden");
        els.pendingSection.classList.remove("hidden");
        document.getElementById("morning-report-section").classList.remove("hidden");
        
        await renderCalendar();
        await loadPendingRequests();
        await generateMorningReport();
        await loadVipNotifications();
        await loadMonthlyInsights();
    } else if (currentUser.role === 'Branch Manager') {
        els.calendarSection.classList.remove("hidden");
        els.managerSection.classList.remove("hidden");
        await renderCalendar();
        await loadManagerRequests();
    } else {
        // Employee / Secretary
        els.userStats.classList.remove("hidden");
        els.selectionSection.classList.remove("hidden");
        
        if (hasViewPerm) {
            els.calendarSection.classList.remove("hidden");
            await renderCalendar();
        } else {
            els.calendarSection.classList.add("hidden"); // Blind Booking
        }
        
        const stats = await getUserStats(currentUser.empId);
        document.getElementById("stat-pending").textContent = stats.pending;
        document.getElementById("stat-reviewed").textContent = stats.reviewed || 0;
        document.getElementById("stat-approved").textContent = stats.approved;
        // NEW: Show rejected count if needed
    }
}


function populateHallsSelect(halls) {
    els.hallTypeSelect.innerHTML = '';
    halls.forEach(h => {
        const o = document.createElement("option"); o.value = h.id; o.textContent = h.name;
        o.dataset.type = h.category;
        els.hallTypeSelect.appendChild(o);
    });
}

function openBookingForm(category) {
    selectedCategory = category;
    els.selectionSection.classList.add("hidden");
    els.formSection.classList.remove("hidden");
    
    document.getElementById("booking-form-title").textContent = 
        category === 'lecture' ? "حجز قاعة محاضرات" : "حجز قاعة متعددة الأغراض";
    
    if (category === 'multipurpose') els.eForm.classList.remove("hidden");
    else els.eForm.classList.add("hidden");

    populateHallsSelect(currentHalls.filter(h => h.category === category));
}

function handleHallChange(e) {
    const opt = e.target.options[e.target.selectedIndex];
    if(opt.dataset.type === 'multipurpose') els.eForm.classList.remove("hidden");
    else els.eForm.classList.add("hidden");
}

async function populateSlots() {
    const slots = await getActiveSlots();
    els.bookingSlot.innerHTML = '';
    document.getElementById("filter-slot").innerHTML = '<option value="all">كل الفترات</option>';
    
    slots.forEach(s => {
        els.bookingSlot.innerHTML += `<option value="${s.id}">${s.label}</option>`;
        document.getElementById("filter-slot").innerHTML += `<option value="${s.id}">${s.label}</option>`;
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
        validateTimeConstraint(date, currentUser.role, selectedCategory);
        
        let extra = {};
        if (selectedCategory === 'multipurpose') {
            extra = {
                mobile: document.getElementById("manager-mobile").value,
                manager_name: document.getElementById("manager-name").value,
                purpose: document.getElementById("booking-purpose").value,
                job: document.getElementById("manager-job").value,
                mics: document.getElementById("req-mic").checked ? document.getElementById("mic-count").value : 0,
                laptop: document.getElementById("req-laptop").checked,
                video: document.getElementById("req-video").checked
            };
        }
        
        await createBooking({
            empId: currentUser.empId, username: currentUser.username, 
            hallId: opt.value, hallName: opt.textContent, hallType: selectedCategory,
            date, slotId, status: 'PENDING', ...extra
        });
        
        alert("تم إرسال الطلب! سيقوم المسؤول بمراجعته.");
        els.formSection.classList.add("hidden");
        await setupRoleUI(); 
    } catch (err) {
        document.getElementById("booking-error").textContent = err.message;
    } finally {
        btn.disabled = false; btn.textContent = "تأكيد طلب الحجز";
    }
}

async function loadPendingRequests() { 
    const list = document.getElementById("requests-list");
    const r = await getPendingRequests();
    list.innerHTML = r.map(x => `
        <div class="request-card">
            <div>
                <strong>${x.username}</strong> - ${x.hallName}<br>
                <small>${x.date} | ${x.slotId}</small>
            </div>
            <div class="review-actions">
                <button onclick="window.processRequest('${x.id}', 'REVIEWED')" class="warning-btn">إرسال للمدير</button>
                <button onclick="window.processRequest('${x.id}', 'REJECTED')" class="secondary-btn">رفض</button>
            </div>
        </div>
    `).join('');
}

async function loadManagerRequests() {
    const list = document.getElementById("manager-list");
    const bookings = await getBookingsForUI(); 
    const filtered = bookings.filter(b => b.status === 'REVIEWED');
    
    list.innerHTML = filtered.map(x => `
        <div class="request-card orange-gradient" style="color:white">
            <div>
                <strong>${x.username}</strong><br>
                ${x.hallName} (${x.date})
            </div>
            <div class="review-actions">
                <button onclick="window.processRequest('${x.id}', 'APPROVED')" class="success-btn">اعتماد نهائي</button>
                <button onclick="window.processRequest('${x.id}', 'REJECTED')" class="danger-btn">رفض</button>
            </div>
        </div>
    `).join('');
}

window.processRequest = async (id, newStatus) => {
    try {
        await updateBookingStatus(id, { status: newStatus });
        alert("تم تحديث حالة الطلب بنجاح.");
        await setupRoleUI();
    } catch (e) { alert("حدث خطأ أثناء التحديث."); }
};

// ... Duplicate handleEmptySearch removed ...

async function renderCalendar() {
    if (!els.calendarGrid) return;
    els.calendarGrid.innerHTML = '';
    const slots = await getActiveSlots();
    
    // Header Row: Periods + 7 Days
    els.calendarGrid.innerHTML += `<div class="calendar-header">الفترة</div>`;
    const days = ["الأحد", "الأثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    days.forEach(d => {
        els.calendarGrid.innerHTML += `<div class="calendar-header">${d}</div>`;
    });
    
    // Fetch all confirmed data
    const bookings = await getBookingsForUI(); // Exceptional
    const allHalls = await fetchHalls();
    
    // We assume the Admin wants to see current week availability
    // Simplified Weekly rendering: Loop through slots (rows), then Days (Cols)
    slots.forEach(s => {
        els.calendarGrid.innerHTML += `<div class="calendar-cell"><strong>${s.label}</strong></div>`;
        
        for (let dayNum = 1; dayNum <= 7; dayNum++) {
            let cellHTML = '';
            
            // 1. Check for Exceptional Bookings that fall on this day-num (approx)
            // Note: date.getDay() + 1 matches dayNum in our seeding
            const dayBookings = bookings.filter(b => {
                const bDay = new Date(b.date).getDay() + 1;
                return bDay === dayNum && b.slotId === s.id && (b.status === 'APPROVED' || b.type === 'FIXED');
            });

            dayBookings.forEach(b => {
                let typeClass = 'exceptional';
                if (b.type === 'FIXED') typeClass = 'fixed-lecture';
                else if (b.hallType === 'multipurpose') typeClass = 'multi-hall';
                
                cellHTML += `<div class="booking-item ${typeClass}" title="${b.purpose || ''}">
                    ${b.hallName}<br><small>${b.username}</small>
                </div>`;
            });
            
            els.calendarGrid.innerHTML += `<div class="calendar-cell">${cellHTML}</div>`;
        }
    });
}

function hideAllPanels() {
    const panels = ['userStats', 'selectionSection', 'formSection', 'pendingSection', 'managerSection', 'settingsSection', 'calendarSection', 'reportSection'];
    panels.forEach(p => { 
        if(els[p]) els[p].classList.add("hidden"); 
    });
}

async function generateMorningReport() {
    const reportBox = document.getElementById("report-content");
    if (!reportBox) return;

    const today = new Date().toISOString().split('T')[0];
    const bookings = await getBookingsForUI({ date: today });
    
    // Filter out FIXED (since they are already known)
    const specialEvents = bookings.filter(b => b.status === 'APPROVED' && b.type !== 'FIXED');
    
    if (specialEvents.length === 0) {
        reportBox.innerHTML = "<p>لا توجد أحداث استثنائية أو فعاليات كبرى لهذا اليوم.</p>";
        return;
    }

    reportBox.innerHTML = specialEvents.map(e => `
        <div class="stat-card vibrant-gradient" style="margin-bottom:0.5rem; text-align:right;">
            <strong>${e.hallName}</strong> - ${e.username}<br>
            <small>الغرض: ${e.purpose || 'غير محدد'}</small><br>
            <small>المتطلبات: ميكروفونات(${e.techReqs?.mics || 0})، لابتوب(${e.techReqs?.laptop ? 'نعم' : 'لا'})</small>
        </div>
    `).join('');
}

async function loadVipNotifications() {
    const list = document.getElementById("vip-list");
    if (!list) return;

    const bookings = await getBookingsForUI();
    const bmActions = bookings.filter(b => b.status === 'APPROVED' && b.hallType === 'multipurpose');
    const count = bmActions.length;
    
    document.getElementById("notif-count").textContent = count;
    list.innerHTML = bmActions.map(a => `
        <li>
            <span>${a.hallName}</span>
            <span>بواسطة: مدير الفرع</span>
        </li>
    `).join('');
}

function toggleAdminPanel(mode) {
    hideAllPanels();
    if(mode === 'settings') {
        els.settingsSection.classList.remove("hidden");
    } else {
        setupRoleUI();
    }
}

function switchSettingTab(e, targetId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.settings-content').forEach(c => c.classList.add('hidden'));
    if(e) e.target.classList.add("active");
    document.getElementById(targetId).classList.remove("hidden");
}

async function handleEmptySearch() {
    const date = document.getElementById("filter-date").value;
    const slot = document.getElementById("filter-slot").value;
    const type = document.getElementById("filter-room-type").value;
    const resBox = document.getElementById("empty-search-results");
    
    if(!date || slot === 'all') { alert("حدد التاريخ والفترة بدقة للبحث المتخصص"); return; }
    
    const bookings = await getBookingsForUI({date, slotId: slot});
    const takenIds = bookings.map(b => b.hallId);
    
    let allH = currentHalls;
    if(type !== 'all') allH = currentHalls.filter(h => h.category === type);
    
    const emptyHalls = allH.filter(h => !takenIds.includes(h.id));
    resBox.classList.remove("hidden");
    resBox.innerHTML = `القاعات المتاحة (${date}): <br> <div style="margin-top:0.5rem">${emptyHalls.map(h=>`<span class="status-badge status-approved">${h.name}</span>`).join(' ')}</div>`;
}

async function renderSettings() {
    const list = document.getElementById("current-slots-list");
    list.innerHTML = '';
    const slots = await getActiveSlots();
    slots.forEach(s => {
        list.innerHTML += `<li><span>${s.id}</span> <span>${s.label}</span></li>`;
    });
}

async function handleRejectWithAlternative() {
    const reason = document.getElementById("reject-reason").value;
    const hall = document.getElementById("alt-hall").value;
    const date = document.getElementById("alt-date").value;
    const slot = document.getElementById("alt-slot").value;

    if (!reason) { alert("يرجى إدخال سبب الرفض"); return; }

    try {
        await updateBookingStatus(activeBookingId, {
            status: 'REJECTED',
            rejectionReason: reason,
            suggestedAlt: { hall, date, slot }
        });
        
        alert("تم رفض الطلب بنجاح مع إرسال الاقتراح البديل للموظف.");
        document.getElementById("reject-modal").classList.add("hidden");
        await setupRoleUI();
    } catch (err) {
        alert("فشل تحديث الطلب: " + err.message);
    }
}

async function loadMonthlyInsights() {
    // Simplified Monthly View Heatmap Insight
    const statsContainer = document.getElementById("user-stats-section");
    if (currentUser.role !== 'Admin' || !statsContainer) return;

    const bookings = await getBookingsForUI();
    const dayCounts = {};
    bookings.forEach(b => {
        dayCounts[b.date] = (dayCounts[b.date] || 0) + 1;
    });

    const sortedDays = Object.entries(dayCounts).sort((a,b) => b[1] - a[1]).slice(0, 3);
    
    let html = `<div style="margin-top:1.5rem; padding:1rem; background:rgba(255,165,0,0.1); border-radius:12px; border:1px dashed orange;">
        <h4 style="color:orange; margin-bottom:0.5rem">🔥 نظرة على إشغال الشهر (الأيام الأكثر ازدحاماً)</h4>
        <ul style="font-size:0.85rem; list-style:none; padding:0;">`;
    
    sortedDays.forEach(([date, count]) => {
        html += `<li style="margin-bottom:0.3rem">📅 <strong>${date}</strong>: ${count} حوزات مؤكدة/عالية</li>`;
    });
    
    html += `</ul></div>`;
    
    // Add to stats section
    const existing = document.getElementById("monthly-insight-box");
    if (existing) existing.remove();
    
    const div = document.createElement('div');
    div.id = "monthly-insight-box";
    div.innerHTML = html;
    statsContainer.appendChild(div);
}

