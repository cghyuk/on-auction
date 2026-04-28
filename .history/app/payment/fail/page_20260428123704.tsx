"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function PaymentFailPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "UNKNOWN";
  const message = searchParams.get("message") || "결제가 취소되었거나 실패했습니다.";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-5 px-4 text-center">
      <h1 className="text-2xl font-bold">결제 실패</h1>
      <p className="text-sm text-gray-700">코드: {code}</p>
      <p className="text-sm text-gray-700">{message}</p>
      <Link
        href="/"
        className="rounded-lg bg-gray-800 px-4 py-3 text-sm font-bold text-white hover:bg-black"
      >
        메인으로 돌아가기
      </Link>
    </main>
  );
}
