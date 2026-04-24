import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // ⭐ 추가

const firebaseConfig = {
  apiKey: "AIzaSyAx7bWXvNduSREXNivZjM7_g6Pi5JcuI2g",
  authDomain: "on-auction-7e509.firebaseapp.com",
  projectId: "on-auction-7e509",
  storageBucket: "on-auction-7e509.firebasestorage.app",
  messagingSenderId: "914927982490",
  appId: "1:914927982490:web:eaa2ac5bc7024918ba4c23",
};

const app = initializeApp(firebaseConfig);

// ✅ 추가
export const db = getFirestore(app);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();