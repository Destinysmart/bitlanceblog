import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyC3u6AUI8q8RI7rnjFCbBQsEDlBel0Y8Tc",
  authDomain: "bitlanceblog.firebaseapp.com",
  projectId: "bitlanceblog",
  storageBucket: "bitlanceblog.firebasestorage.app",
  messagingSenderId: "479648612879",
  appId: "1:479648612879:web:2c2acc06ef7cc68e12597a",
  measurementId: "G-EN16PSL38F"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Clear any legacy bypass_auth flag that old code may have stored
if (typeof window !== "undefined") {
  localStorage.removeItem("bypass_auth");
}

// Initialize Analytics dynamically to prevent crashes on SSR/unsupported environments
let analytics = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

export { app, auth, db, analytics };
