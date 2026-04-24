"use client";

import { useState, useEffect } from "react";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { auth, provider } from "../lib/firebase";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);

  // 🔥 로그인 상태 유지 (새로고침해도 유지됨)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    return () => unsubscribe();
  }, []);

  // 🔐 로그인
  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
    } catch (err) {
      console.error("로그인 에러:", err);
    }
  };

  // 🚪 로그아웃
  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  return (
    <main style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 20 }}>
        온경매 로그인 테스트
      </h1>

      {!user ? (
        <button
          onClick={handleLogin}
          style={{
            padding: "10px 20px",
            background: "#4285F4",
            color: "white",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
          }}
        >
          구글 로그인
        </button>
      ) : (
        <div>
          <div style={{ marginBottom: 20 }}>
            <p><b>이름:</b> {user.displayName}</p>
            <p><b>이메일:</b> {user.email}</p>
          </div>

          <button
            onClick={handleLogout}
            style={{
              padding: "10px 20px",
              background: "#e74c3c",
              color: "white",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
            }}
          >
            로그아웃
          </button>
        </div>
      )}
    </main>
  );
}