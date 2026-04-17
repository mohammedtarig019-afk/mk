import { collection, addDoc, getDocs, query, where, Timestamp, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-init.js";

const COLLECTION_NAME = "bookings";

export class BookingError extends Error {
    constructor(message) {
        super(message);
        this.name = "BookingError";
    }
}

// System Slots Configuration (Simulates dynamic slots)
export const SYSTEM_SLOTS = {
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
};

// Current active mode
export let currentSlotMode = 'standard';

export function getActiveSlots() {
    return SYSTEM_SLOTS[currentSlotMode];
}

export function setActiveSlotMode(mode) {
    currentSlotMode = mode;
}

// Memory Mock (Persisted to sessionStorage to survive refreshes)
let mockBookings = JSON.parse(sessionStorage.getItem("mock_bookings") || "[]");
function saveMock() { sessionStorage.setItem("mock_bookings", JSON.stringify(mockBookings)); }

export function validateTimeConstraint(bookingDate, role, hallType) {
    const now = new Date();
    const bookingDateTime = new Date(`${bookingDate}T00:00:00`);
    const diffHours = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (role === 'Employee' && hallType === 'lecture') {
        if (diffHours < 24) {
            throw new BookingError("يجب حجز قاعات المحاضرات قبل 24 ساعة على الأقل للموظفين.");
        }
    } else if (role === 'Secretary' && hallType === 'multipurpose') {
        if (diffHours < 48) {
            throw new BookingError("يجب حجز القاعات متعددة الأغراض قبل 48 ساعة على الأقل للسكرتارية.");
        }
    }
    return true;
}

export async function checkConflict(hallId, bookingDate, slotId) {
    if (!db) {
        return mockBookings.some(b => 
            b.hallId === hallId && 
            b.date === bookingDate && 
            b.slotId === slotId && 
            b.status !== 'REJECTED'
        );
    }
    
    try {
        const bookingsRef = collection(db, COLLECTION_NAME);
        const q = query(bookingsRef, where("hallId", "==", hallId), where("date", "==", bookingDate), where("slotId", "==", slotId));
        const qs = await getDocs(q);
        let conflict = false;
        qs.forEach((doc) => { if (doc.data().status !== 'REJECTED') conflict = true; });
        return conflict;
    } catch (error) { throw new BookingError("خطأ في التحقق من التوفر."); }
}

export async function createBooking(bookingData) {
    if (!db) {
        const hasMockConflict = await checkConflict(bookingData.hallId, bookingData.date, bookingData.slotId);
        if (hasMockConflict) throw new BookingError("القاعة محجوزة في هذا الوقت.");
        
        const newDoc = { id: "mock-" + Date.now(), ...bookingData };
        mockBookings.push(newDoc);
        saveMock();
        return newDoc;
    }
    
    const conflict = await checkConflict(bookingData.hallId, bookingData.date, bookingData.slotId);
    if (conflict) throw new BookingError("القاعة محجوزة في هذا الوقت.");
    
    try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), { ...bookingData, createdAt: Timestamp.now() });
        return { id: docRef.id, ...bookingData };
    } catch (e) { throw e; }
}

export async function getBookingsForUI(filters = {}) {
    if (!db) {
        return mockBookings.filter(b => {
             if(filters.type && filters.type !== 'all' && b.hallType !== filters.type) return false;
             if(filters.date && b.date !== filters.date) return false;
             if(filters.slotId && filters.slotId !== 'all' && b.slotId !== filters.slotId) return false;
             if(b.status === 'REJECTED' && !b.alternativeProposed) return false;
             return true;
        });
    }

    try {
        const q = query(collection(db, COLLECTION_NAME));
        const qs = await getDocs(q);
        const results = [];
        qs.forEach((doc) => {
            const data = doc.data();
            if (data.status !== 'REJECTED' || data.alternativeProposed) {
                if (filters.type && filters.type !== 'all' && data.hallType !== filters.type) return;
                if (filters.date && data.date !== filters.date) return;
                if (filters.slotId && filters.slotId !== 'all' && data.slotId !== filters.slotId) return;
                results.push({ id: doc.id, ...data });
            }
        });
        return results;
    } catch (e) { return []; }
}

export async function getPendingRequests() {
    if (!db) return mockBookings.filter(b => b.status === 'PENDING');
    try {
        const q = query(collection(db, COLLECTION_NAME), where("status", "==", "PENDING"));
        const qs = await getDocs(q);
        return qs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { return []; }
}

export async function getUserStats(empId) {
    if (!db) {
        const myBooks = mockBookings.filter(b => b.empId === empId);
        return {
            pending: myBooks.filter(b=>b.status==='PENDING').length,
            approved: myBooks.filter(b=>b.status==='APPROVED').length,
            rejected: myBooks.filter(b=>b.status==='REJECTED').length
        }
    }
    // implementation for real firestore querying
    return { pending:0, approved:0, rejected:0 };
}

export async function updateBookingStatus(bookingId, updates) {
    if (!db) {
        const idx = mockBookings.findIndex(b => b.id === bookingId);
        if(idx > -1) {
            mockBookings[idx] = { ...mockBookings[idx], ...updates };
            saveMock();
        }
        return;
    }
    try { await updateDoc(doc(db, COLLECTION_NAME, bookingId), updates); } 
    catch (e) { throw e; }
}
