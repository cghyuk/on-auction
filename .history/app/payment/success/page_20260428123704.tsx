"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { FirebaseError } from "firebase/app";
import { functions } from "../../../lib/firebase";

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("결제 승인 처리 중...");
  const [done, setDone] = useState(false);
  const executedRef = useRef(false);

  useEffect(() => {
    if (executedRef.current) return;
    executedRef.current = true;

    const paymentKey = searchParams.get("paymentKey") || "";
    const orderId = searchParams.get("orderId") || "";
    const amount = Number(searchParams.get("amount") || 0);

    if (!paymentKey || !orderId || !amount) {
      setMessage("필수 결제 정보가 누락되었습니다.");
      setDone(true);
      return;
    }

    const run = async () => {
      try {
        const confirmPayment = httpsCallable(functions, "confirmPayment");
        await confirmPayment({ paymentKey, orderId, amount });
        setMessage("결제가 정상적으로 승인되었습니다.");
      } catch (error) {
        console.error(error);
        if (error instanceof FirebaseError) {
          setMessage(error.message || "결제 승인 중 문제가 발생했습니다.");
        } else {
          setMessage("결제 승인 중 문제가 발생했습니다.");
        }
      } finally {
        setDone(true);
      }
    };

    run();
  }, [searchParams]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-5 px-4 text-center">
      <h1 className="text-2xl font-bold">결제 결과</h1>
      <p className="text-sm text-gray-700">{message}</p>
      {done ? (
        <Link
          href="/"
          className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700"
        >
          메인으로 돌아가기
        </Link>
      ) : null}
    </main>
  );
}
