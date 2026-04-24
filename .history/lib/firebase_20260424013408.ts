import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "여기에 복붙",
  authDomain: "여기에 복붙",
  projectId: "여기에 복붙",
  storageBucket: "여기에 복붙",
  messagingSenderId: "여기에 복붙",
  appId: "여기에 복붙",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();