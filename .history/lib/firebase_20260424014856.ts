import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "여기에 실제값",
  authDomain: "여기에 실제값",
  projectId: "여기에 실제값",
  storageBucket: "여기에 실제값",
  messagingSenderId: "여기에 실제값",
  appId: "여기에 실제값",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();