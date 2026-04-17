import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";

// User's Real Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBZtmfW6NNdtVfIRZwB1GVVUAqfkkhO4WM",
  authDomain: "larry-a3e06.firebaseapp.com",
  projectId: "larry-a3e06",
  storageBucket: "larry-a3e06.firebasestorage.app",
  messagingSenderId: "571056282672",
  appId: "1:571056282672:web:1bb3461ee807e33de961f5",
  measurementId: "G-5L9LPBQ90V"
};

// Initialize Firebase
let app, db, analytics;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    analytics = getAnalytics(app);
    console.log("Firebase connected successfully to larry-a3e06");
} catch (e) {
    console.error("Firebase Initialization Error:", e);
    // Fallback to null for DB to trigger local storage mode in db.js
    db = null;
}

export { db };
