import { collection, addDoc, getDocs, query, where, Timestamp, updateDoc, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-init.js";

const COLLECTION_NAME = "bookings";

export class BookingError extends Error {
    constructor(message) {
        super(message);
        this.name = "BookingError";
    }
}

// Memory Mock (Persisted to sessionStorage)
let mockBookings = JSON.parse(sessionStorage.getItem("mock_bookings") || "[]");
function saveMock() { sessionStorage.setItem("mock_bookings", JSON.stringify(mockBookings)); }

// -- NEW: Firestore Data Fetchers --

export async function fetchSystemSlots() {
    if (!db) return null;
    try {
        const docRef = doc(db, "system_settings", "slots");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return docSnap.data();
    } catch (e) { console.error("Error fetching slots:", e); }
    return null;
}

export async function fetchHalls() {
    if (!db) return [];
    try {
        const querySnapshot = await getDocs(collection(db, "halls"));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error fetching halls:", e);
        return [];
    }
}

export async function fetchUser(empId) {
    if (!db) return null;
    try {
        // First check for delegation
        const userDoc = await getDoc(doc(db, "users", empId));
        if (userDoc.exists()) return userDoc.data();
    } catch (e) { console.error("Error fetching user:", e); }
    return null;
}

// -- SEEDER: Initialize Firebase with detailed AASTMT data --
export async function seedDatabase() {
    if (!db) return alert("Firebase is not connected!");
    
    try {
        // 1. Seed Slots
        await setDoc(doc(db, "system_settings", "slots"), {
            standard: [
                { id: "S1", label: "08:00 ص - 10:00 ص" },
                { id: "S2", label: "10:00 ص - 12:00 م" },
                { id: "S3", label: "12:00 م - 02:00 م" },
                { id: "S4", label: "02:00 م - 04:00 م" }
            ],
            ramadan: [
                { id: "R1", label: "09:00 ص - 10:30 ص" },
                { id: "R2", label: "10:30 ص - 12:00 م" },
                { id: "R3", label: "12:00 م - 01:30 م" },
                { id: "R4", label: "01:30 م - 03:00 م" }
            ]
        });

        // 2. Seed Users (Correct AASTMT Roels)
        const users = [
            { empId: "1000", name: "المسؤول (الأدمن)", role: "Admin", overrides: [], delegations: [] },
            { empId: "2000", name: "مدير الفرع", role: "Branch Manager", overrides: [], delegations: [] },
            { empId: "3000", name: "موظف أ", role: "Employee", overrides: [], delegations: [] },
            { empId: "3001", name: "موظف ب (متميز)", role: "Employee", overrides: ["view_rooms"], delegations: [] },
            { empId: "4000", name: "سكرتير الكلية", role: "Secretary", overrides: [], delegations: [] }
        ];
        for (const user of users) {
             await setDoc(doc(db, "users", user.empId), user);
        }

        // 3. Seed Halls
        const halls = [
            { id: "L1", name: "قاعة محاضرات 101", category: "lecture" },
            { id: "L2", name: "مدرج ميكانيكا", category: "lecture" },
            { id: "M1", name: "قاعة المؤتمرات الكبرى", category: "multipurpose" },
            { id: "M2", name: "قاعة الندوات (M2)", category: "multipurpose" }
        ];
        for (const hall of halls) {
            await setDoc(doc(db, "halls", hall.id), hall);
        }

        // 4. Seed Fixed Schedules (Academic Schedule)
        const fixedSchedules = [
            { hallId: "L1", day: 1, slotId: "S1", subject: "فيزياء - م1", type: "FIXED" },
            { hallId: "L1", day: 3, slotId: "S2", subject: "رياضيات - م1", type: "FIXED" },
            { hallId: "L2", day: 2, slotId: "S3", subject: "ميكانيكا - م2", type: "FIXED" }
        ];
        for (const fs of fixedSchedules) {
            await setDoc(doc(db, "fixed_schedule", `${fs.hallId}-${fs.day}-${fs.slotId}`), fs);
        }

        alert("تمت تهيئة النظام بمتطلبات الأكاديمية بنجاح!");
    } catch (e) {
        console.error("Seeding error:", e);
        alert("فشلت عملية تهيئة البيانات: " + e.message);
    }
}

// --- Dynamic Slots Logic ---
export let currentSlotMode = 'standard';
let cachedSlots = null;

export async function getActiveSlots() {
    if (!cachedSlots && db) cachedSlots = await fetchSystemSlots();
    const source = cachedSlots || { 
        standard: [
            { id: "S1", label: "08:00 ص - 10:00 ص" },
            { id: "S2", label: "10:00 ص - 12:00 م" },
            { id: "S3", label: "12:00 م - 02:00 م" },
            { id: "S4", label: "02:00 م - 04:00 م" }
        ],
        ramadan: []
    };
    return source[currentSlotMode];
}

export function setActiveSlotMode(mode) {
    currentSlotMode = mode;
}

// --- Validation & Conflicts ---

export function validateTimeConstraint(bookingDate, role, hallType) {
    const now = new Date();
    const bookingDateTime = new Date(`${bookingDate}T00:00:00`);
    const diffHours = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (role === 'Employee') {
        if (diffHours < 24) throw new BookingError("يجب حجز المواعيد قبل 24 ساعة على الأقل للموظفين.");
    } else if (role === 'Secretary') {
        if (hallType !== 'multipurpose') throw new BookingError("السكرتارية مسموح لهم بحجز القاعات متعددة الأغراض فقط.");
        if (diffHours < 48) throw new BookingError("يجب حجز القاعات متعددة الأغراض قبل 48 ساعة على الأقل للسكرتارية.");
    }
    return true;
}

export async function checkConflict(hallId, bookingDate, slotId) {
    const bookingDay = new Date(bookingDate).getDay() + 1; // 1-indexed days
    
    if (!db) return false;

    try {
        // 1. Check Fixed Schedule
        const fsDoc = await getDoc(doc(db, "fixed_schedule", `${hallId}-${bookingDay}-${slotId}`));
        if (fsDoc.exists()) return "جدول دراسي ثابت";

        // 2. Check Existing Bookings
        const q = query(collection(db, COLLECTION_NAME), 
            where("hallId", "==", hallId), 
            where("date", "==", bookingDate), 
            where("slotId", "==", slotId)
        );
        const qs = await getDocs(q);
        let conflict = false;
        qs.forEach((doc) => { if (['PENDING', 'APPROVED', 'REVIEWED'].includes(doc.data().status)) conflict = "حجز مسبق"; });
        return conflict;
    } catch (error) { throw new BookingError("خطأ في التحقق من التوفر."); }
}

export async function createBooking(bookingData) {
    if (!db) throw new BookingError("Firebase Error");
    
    const conflict = await checkConflict(bookingData.hallId, bookingData.date, bookingData.slotId);
    if (conflict) throw new BookingError(`هذه القاعة مشغولة بـ (${conflict})`);
    
    try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), { 
            ...bookingData, 
            createdAt: Timestamp.now(),
            // Ensure fields exist for reports
            mobile: bookingData.mobile || "",
            purpose: bookingData.purpose || "",
            techReqs: {
                mics: bookingData.mics || 0,
                laptop: bookingData.laptop || false,
                video: bookingData.video || false
            }
        });
        return { id: docRef.id, ...bookingData };
    } catch (e) { throw e; }
}

export async function checkDelegation(empId, dateString) {
    if (!db) return null;
    try {
        const q = query(collection(db, "delegations"), 
            where("delegatee", "==", empId),
            where("startDate", "<=", dateString),
            where("endDate", ">=", dateString)
        );
        const qs = await getDocs(q);
        if (!qs.empty) return qs.docs[0].data();
    } catch (e) { return null; }
    return null;
}

export async function getUserStats(empId) {
    if (!db) return { pending: 0, reviewed: 0, approved: 0, rejected: 0 };
    try {
        const q = query(collection(db, COLLECTION_NAME), where("empId", "==", empId));
        const qs = await getDocs(q);
        const stats = { pending: 0, reviewed: 0, approved: 0, rejected: 0 };
        qs.forEach(doc => {
            const s = doc.data().status;
            if (s === 'PENDING') stats.pending++;
            else if (s === 'REVIEWED') stats.reviewed++;
            else if (s === 'APPROVED') stats.approved++;
            else if (s === 'REJECTED') stats.rejected++;
        });
        return stats;
    } catch (e) { return { pending: 0, reviewed: 0, approved: 0, rejected: 0 }; }
}

export async function getBookingsForUI(filters = {}) {
    if (!db) return [];
    try {
        const results = [];
        
        // 1. Get Exceptional Bookings
        const q = query(collection(db, COLLECTION_NAME));
        const qs = await getDocs(q);
        qs.forEach((doc) => {
            const data = doc.data();
            if (filters.date && data.date !== filters.date) return;
            if (filters.slotId && filters.slotId !== 'all' && data.slotId !== filters.slotId) return;
            results.push({ id: doc.id, ...data });
        });

        // 2. Add Fixed Schedule if on specific date
        if (filters.date) {
            const dayNum = new Date(filters.date).getDay() + 1;
            const fsQ = query(collection(db, "fixed_schedule"), where("day", "==", dayNum));
            const fsQs = await getDocs(fsQ);
            fsQs.forEach(doc => {
                const data = doc.data();
                if (filters.slotId && filters.slotId !== 'all' && data.slotId !== filters.slotId) return;
                results.push({ ...data, status: 'APPROVED', hallType: 'lecture', username: 'جدول دراسي ثابت' });
            });
        }
        
        return results;
    } catch (e) { return []; }
}

export async function getPendingRequests() {
    if (!db) return mockBookings.filter(b => b.status === 'PENDING');
    try {
        // Only return PENDING for Admin review
        const q = query(collection(db, COLLECTION_NAME), where("status", "==", "PENDING"));
        const qs = await getDocs(q);
        return qs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { return []; }
}

export async function updateBookingStatus(bookingId, updates) {
    if (!db) {
        const idx = mockBookings.findIndex(b => b.id === bookingId);
        if(idx > -1) { mockBookings[idx] = { ...mockBookings[idx], ...updates }; saveMock(); }
        return;
    }
    try { 
        await updateDoc(doc(db, COLLECTION_NAME, bookingId), updates); 
    } catch (e) { throw e; }
}

