// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Masukkan konfigurasi dari Firebase Console Anda di sini
const firebaseConfig = {
  apiKey: "AIzaSyDbx_lwgCB1s1YeTotCNjZHI1Bzpo_qyyc",
  authDomain: "cbt-smpqualwahdah.firebaseapp.com",
  projectId: "cbt-smpqualwahdah",
  storageBucket: "cbt-smpqualwahdah.firebasestorage.app",
  messagingSenderId: "141237385778",
  appId: "1:141237385778:web:2328bfe0e0d42f833bda2b",
  measurementId: "G-WRPQ1WLR2J"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Ekspor instance dan helper fungsi Firestore agar bisa dipakai di seluruh modul
export { 
  db, 
  auth, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
};
