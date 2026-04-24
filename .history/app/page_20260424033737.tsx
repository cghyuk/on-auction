"use client";

import { useEffect, useState } from "react";
import { auth, provider } from "../lib/firebase";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // 로그인 상태 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // 로그인
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.log(err);
    }
  };

  // 로그아웃
  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <main className="min-h-screen bg-gray-100">
      {/* 상단바 */}
      <div className="flex justify-between items-center px-6 py-4 bg-blue-900 text-white">
        <h1 className="text-xl font-bold">온경매</h1>

        <div className="flex gap-4 items-center">
          {!currentUser ? (
            <>
              <button onClick={handleLogin}>구글 로그인</button>
              <button>이용안내</button>
              <button>고객센터</button>
            </>
          ) : (
            <>
              {/* 🔥 여기다 붙이는거다 */}
              <span className="font-semibold">
                {currentUser.displayName || currentUser.email} 님
              </span>

              <button onClick={handleLogout}>로그아웃</button>
              <button>이용안내</button>
              <button>고객센터</button>
            </>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="p-6">
        <h2 className="text-lg font-bold mb-4">경매 상품</h2>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-bold">테스트 상품</h3>
            <p>가격: 3,000원</p>
            <p className="text-sm text-gray-500">
              입찰자: {currentUser?.displayName || "없음"}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}