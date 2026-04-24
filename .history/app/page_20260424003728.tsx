"use client";

import { useMemo, useState } from "react";

type Product = {
  id: number;
  title: string;
  desc: string;
  price: number; // 현재 입찰가
  seller: string;
  category: string;
  endText: string;
  images: string[];
  minBid: number; // 입찰 단위
  highestBidder?: string;
};

const categories = [
  "전체",
  "가구/인테리어",
  "패션의류/패션잡화",
  "디지털/가전",
  "자동차",
  "수집품",
];

const initialProducts: Product[] = [
  {
    id: 1,
    title: "한정판 피규어 컬렉션",
    desc: "박스 포함, 진열 상태 우수한 수집품입니다.",
    price: 2900,
    minBid: 3000,
    seller: "figure_world",
    category: "수집품",
    endText: "종료 6시간 57분 전",
    highestBidder: "",
    images: [
      "https://images.unsplash.com/photo-1572375992501-4b0892d50c69?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1608889825103-eb5ed706fc64?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: 2,
    title: "미개봉 휴대용 전자기기",
    desc: "미개봉 상태의 디지털/가전 경매 상품입니다.",
    price: 8000,
    minBid: 3000,
    seller: "game_master",
    category: "디지털/가전",
    endText: "종료 9시간 57분 전",
    highestBidder: "",
    images: [
      "https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: 3,
    title: "커스텀 PC 부품 세트",
    desc: "실사용 가능한 고성능 부품 구성입니다.",
    price: 2500,
    minBid: 3000,
    seller: "collector",
    category: "디지털/가전",
    endText: "종료 1시간 57분 전",
    highestBidder: "",
    images: [
      "https://images.unsplash.com/photo-1592840496694-26d035b52b48?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1616588589676-62b3bd4ff6d2?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: 4,
    title: "모던 소파 세트",
    desc: "가구/인테리어 카테고리 샘플 상품입니다.",
    price: 5400,
    minBid: 3000,
    seller: "home_studio",
    category: "가구/인테리어",
    endText: "종료 4시간 10분 전",
    highestBidder: "",
    images: [
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: 5,
    title: "빈티지 명품 시계",
    desc: "빈티지 감성이 살아있는 패션 경매 품목입니다.",
    price: 2750,
    minBid: 3000,
    seller: "parts_lab",
    category: "패션의류/패션잡화",
    endText: "종료 11시간 57분 전",
    highestBidder: "",
    images: [
      "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: 6,
    title: "스포츠카 모델 차량",
    desc: "자동차 카테고리 샘플 상품입니다.",
    price: 12500,
    minBid: 3000,
    seller: "auto_house",
    category: "자동차",
    endText: "종료 8시간 20분 전",
    highestBidder: "",
    images: [
      "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80",
    ],
  },
];

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const [bidModeById, setBidModeById] = useState<Record<number, "min" | "auto">>(
    {}
  );
  const [autoBidById, setAutoBidById] = useState<Record<number, string>>({});

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const categoryMatch =
        selectedCategory === "전체" || product.category === selectedCategory;

      const keyword = search.trim().toLowerCase();
      const searchMatch =
        keyword === "" ||
        product.title.toLowerCase().includes(keyword) ||
        product.desc.toLowerCase().includes(keyword);

      return categoryMatch && searchMatch;
    });
  }, [products, selectedCategory, search]);

  const selectedProduct =
    products.find((product) => product.id === selectedProductId) ?? null;

  const openModal = (productId: number) => {
    setSelectedProductId(productId);
    setSelectedImageIndex(0);
  };

  const closeModal = () => {
    setSelectedProductId(null);
    setSelectedImageIndex(0);
  };

  const handleBid = (productId: number) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    const mode = bidModeById[productId] || "min";

    if (mode === "min") {
      const newPrice = product.price + product.minBid;

      setProducts((prev) =>
        prev.map((item) =>
          item.id === productId
            ? {
                ...item,
                price: newPrice,
                highestBidder: "현재 사용자",
              }
            : item
        )
      );

      alert(
        `${product.title}\n입찰 완료\n현재 입찰가가 ${newPrice.toLocaleString()}원으로 올라갔습니다.`
      );
      return;
    }

    const autoBidValue = Number(autoBidById[productId] || 0);

    if (!autoBidValue || autoBidValue < product.price + product.minBid) {
      alert(
        `자동입찰 금액은 ${(product.price + product.minBid).toLocaleString()}원 이상이어야 합니다.`
      );
      return;
    }

    const newPrice = product.price + product.minBid;

    setProducts((prev) =>
      prev.map((item) =>
        item.id === productId
          ? {
              ...item,
              price: newPrice,
              highestBidder: "현재 사용자(자동입찰)",
            }
          : item
      )
    );

    alert(
      `${product.title}\n자동입찰 설정 완료\n현재 입찰가는 ${newPrice.toLocaleString()}원으로 반영되었습니다.\n자동입찰 상한가: ${autoBidValue.toLocaleString()}원`
    );
  };

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900">
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-4 bg-slate-950 px-6 py-4 text-white">
        <div className="text-4xl font-bold tracking-tight">온경매</div>

        <div className="mx-auto flex w-full max-w-[620px] items-center gap-2">
          <input
            type="text"
            placeholder="상품명 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-black outline-none"
          />
          <button className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-700">
            검색
          </button>
        </div>

        <nav className="flex items-center gap-5 text-sm">
          <button
            className="hover:underline"
            onClick={() => alert("로그인 기능은 다음 단계에서 붙이면 됩니다.")}
          >
            로그인
          </button>
          <button className="hover:underline">이용안내</button>
          <button className="hover:underline">고객센터</button>
        </nav>
      </header>

      <div className="mx-auto grid max-w-[1500px] grid-cols-[220px_1fr] gap-5 px-6 py-5">
        <aside className="h-fit rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-3xl font-bold">카테고리</h2>

          <ul className="space-y-2">
            {categories.map((category) => {
              const active = selectedCategory === category;
              return (
                <li key={category}>
                  <button
                    onClick={() => setSelectedCategory(category)}
                    className={`w-full rounded-xl px-4 py-3 text-left text-sm transition ${
                      active
                        ? "bg-blue-50 font-bold text-blue-700"
                        : "border border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    {category}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 text-xs leading-5 text-gray-500">
            대분류 기준 카테고리 구조입니다.
            <br />
            상품 클릭 시 큰 이미지와 추가 이미지가 팝업으로 열립니다.
          </p>
        </aside>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold">경매 상품</h2>
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">
                {filteredProducts.length}개
              </span>
            </div>

            <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option>최신순</option>
              <option>낮은가격순</option>
              <option>높은가격순</option>
              <option>마감임박순</option>
            </select>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
              등록된 상품이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              {filteredProducts.map((product) => (
                <article
                  key={product.id}
                  onClick={() => openModal(product.id)}
                  className="cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <img
                    src={product.images[0]}
                    alt={product.title}
                    className="aspect-square w-full object-cover"
                  />

                  <div className="space-y-2 p-4">
                    <h3 className="min-h-[44px] text-base font-bold leading-6">
                      {product.title}
                    </h3>

                    <p className="min-h-[42px] text-sm leading-5 text-gray-600">
                      {product.desc}
                    </p>

                    <div className="pt-1 text-2xl font-extrabold">
                      {product.price.toLocaleString()}원
                    </div>

                    <div className="text-xs font-semibold text-blue-600">
                      입찰 단위: {product.minBid.toLocaleString()}원
                    </div>

                    <div className="text-xs text-gray-500">
                      카테고리: {product.category}
                    </div>
                    <div className="text-xs text-gray-500">
                      판매자 {product.seller}
                    </div>
                    <div className="text-xs font-bold text-orange-600">
                      {product.endText}
                    </div>
                    <div className="text-xs text-gray-500">
                      현재 최고 입찰자: {product.highestBidder || "없음"}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5"
          onClick={closeModal}
        >
          <div
            className="relative grid max-h-[92vh] w-full max-w-6xl grid-cols-1 overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[1.3fr_0.8fr]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              className="absolute right-4 top-4 z-10 h-10 w-10 rounded-full bg-black/60 text-xl font-bold text-white"
            >
              ×
            </button>

            <div className="bg-slate-950 p-5">
              <div className="flex min-h-[420px] items-center justify-center rounded-2xl bg-slate-900 p-4">
                <img
                  src={selectedProduct.images[selectedImageIndex]}
                  alt={selectedProduct.title}
                  className="max-h-[420px] w-auto max-w-full object-contain"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {selectedProduct.images.map((image, index) => (
                  <img
                    key={index}
                    src={image}
                    alt={`${selectedProduct.title}-${index}`}
                    onClick={() => setSelectedImageIndex(index)}
                    className={`h-20 w-20 cursor-pointer rounded-xl border-2 object-cover ${
                      selectedImageIndex === index
                        ? "border-blue-500"
                        : "border-transparent"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="overflow-y-auto p-6">
              <h3 className="mb-3 text-3xl font-bold">
                {selectedProduct.title}
              </h3>

              <div className="mb-4 text-4xl font-extrabold">
                {selectedProduct.price.toLocaleString()}원
              </div>

              <div className="mb-4 text-sm font-semibold text-blue-600">
                입찰 단위: {selectedProduct.minBid.toLocaleString()}원
              </div>

              <div className="mb-4 space-y-1 text-sm text-gray-600">
                <div>카테고리: {selectedProduct.category}</div>
                <div>판매자: {selectedProduct.seller}</div>
                <div>{selectedProduct.endText}</div>
                <div>
                  현재 최고 입찰자: {selectedProduct.highestBidder || "없음"}
                </div>
              </div>

              <div className="mb-4 rounded-2xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">
                {selectedProduct.desc}
              </div>

              <div className="rounded-2xl border border-gray-200 p-4">
                <div className="mb-3 text-base font-bold">입찰하기</div>

                <div className="space-y-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`bid-mode-${selectedProduct.id}`}
                      checked={
                        (bidModeById[selectedProduct.id] || "min") === "min"
                      }
                      onChange={() =>
                        setBidModeById((prev) => ({
                          ...prev,
                          [selectedProduct.id]: "min",
                        }))
                      }
                    />
                    <span>
                      즉시 입찰{" "}
                      <span className="font-bold text-blue-600">
                        {(selectedProduct.price + selectedProduct.minBid).toLocaleString()}원
                      </span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`bid-mode-${selectedProduct.id}`}
                      checked={
                        (bidModeById[selectedProduct.id] || "min") === "auto"
                      }
                      onChange={() =>
                        setBidModeById((prev) => ({
                          ...prev,
                          [selectedProduct.id]: "auto",
                        }))
                      }
                    />
                    <span>자동입찰</span>
                  </label>

                  {(bidModeById[selectedProduct.id] || "min") === "auto" && (
                    <input
                      type="number"
                      placeholder={`자동입찰 상한가 (${(selectedProduct.price + selectedProduct.minBid).toLocaleString()}원 이상)`}
                      value={autoBidById[selectedProduct.id] || ""}
                      onChange={(e) =>
                        setAutoBidById((prev) => ({
                          ...prev,
                          [selectedProduct.id]: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
                    />
                  )}

                  <button
                    onClick={() => handleBid(selectedProduct.id)}
                    className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700"
                  >
                    입찰하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}