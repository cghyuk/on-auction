import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "여기에 실제 apiKey",
  authDomain: "여기에 실제 authDomain",
  projectId: "여기에 실제 projectId",
  storageBucket: "on-auction-7e509.appspot.com",
  messagingSenderId: "여기에 실제 messagingSenderId",
  appId: "여기에 실제 appId",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();