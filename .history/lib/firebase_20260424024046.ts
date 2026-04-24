// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAx7bWXvNduSREXNivZjM7_g6Pi5JcuI2g",
  authDomain: "on-auction-7e509.firebaseapp.com",
  projectId: "on-auction-7e509",
  storageBucket: "on-auction-7e509.firebasestorage.app",
  messagingSenderId: "914927982490",
  appId: "1:914927982490:web:eaa2ac5bc7024918ba4c23",
  measurementId: "G-TTCZ6KS1TE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);