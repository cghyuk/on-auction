"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, provider, db } from "../lib/firebase";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  getDocs,
} from "firebase/firestore";

type Product = {
  id: string;
  title: string;
  desc: string;
  price: number;
  buyNowPrice?: number;
  seller: string;
  sellerUid?: string;
  category: string;
  endText: string;
  endAt?: number;
  images: string[];
  minBid: number;
  highestBidder?: string;
  bidCount: number;
  likeCount: number;
  viewCount: number;
  createdAt?: number;
};

type BidLog = {
  id: string;
  productId: string;
  bidder: string;
  bidderUid: string;
  mode: "min" | "auto";
  bidAmount: number;
  priceAfterBid: number;
  createdAt: number;
};

const categories = [
  "전체",
  "가구/인테리어",
  "패션의류/패션잡화",
  "디지털/가전",
  "자동차",
  "수집품",
];

const productCategories = [
  "가구/인테리어",
  "패션의류/패션잡화",
  "디지털/가전",
  "자동차",
  "수집품",
];

const parseLegacyEndTextToMs = (endText: string) => {
  const day = Number(endText.match(/(\d+)\s*일/)?.[1] || 0);
  const hour = Number(endText.match(/(\d+)\s*시간/)?.[1] || 0);
  const minute = Number(endText.match(/(\d+)\s*분/)?.[1] || 0);
  const totalMs = (day * 24 * 60 + hour * 60 + minute) * 60 * 1000;
  return Date.now() + Math.max(totalMs, 10 * 60 * 1000);
};

const formatCountdown = (endAt?: number, nowMs?: number) => {
  if (!endAt || !nowMs) return "마감 정보 없음";
  const diff = endAt - nowMs;
  if (diff <= 0) return "경매 종료";
  const totalSec = Math.floor(diff / 1000);
  const day = Math.floor(totalSec / 86400);
  const hour = Math.floor((totalSec % 86400) / 3600);
  const minute = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (day > 0) return `${day}일 ${hour}시간 ${minute}분 ${sec}초`;
  return `${hour}시간 ${minute}분 ${sec}초`;
};

const initialProducts: Product[] = [
  {
    id: "1",
    title: "한정판 피규어 컬렉션",
    desc: "박스 포함, 진열 상태 우수한 수집품입니다.",
    price: 2900,
    minBid: 3000,
    seller: "figure_world",
    sellerUid: "",
    category: "수집품",
    endText: "종료 6시간 57분 전",
    highestBidder: "",
    bidCount: 0,
    likeCount: 12,
    viewCount: 148,
    createdAt: 1,
    images: [
      "https://images.unsplash.com/photo-1572375992501-4b0892d50c69?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1608889825103-eb5ed706fc64?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: "2",
    title: "미개봉 휴대용 전자기기",
    desc: "미개봉 상태의 디지털/가전 경매 상품입니다.",
    price: 8000,
    minBid: 3000,
    seller: "game_master",
    sellerUid: "",
    category: "디지털/가전",
    endText: "종료 9시간 57분 전",
    highestBidder: "",
    bidCount: 1,
    likeCount: 9,
    viewCount: 96,
    createdAt: 2,
    images: [
      "https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: "3",
    title: "커스텀 PC 부품 세트",
    desc: "실사용 가능한 고성능 부품 구성입니다.",
    price: 2500,
    minBid: 3000,
    seller: "collector",
    sellerUid: "",
    category: "디지털/가전",
    endText: "종료 1시간 57분 전",
    highestBidder: "",
    bidCount: 0,
    likeCount: 6,
    viewCount: 72,
    createdAt: 3,
    images: [
      "https://images.unsplash.com/photo-1592840496694-26d035b52b48?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1616588589676-62b3bd4ff6d2?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: "4",
    title: "모던 소파 세트",
    desc: "가구/인테리어 카테고리 샘플 상품입니다.",
    price: 5400,
    minBid: 3000,
    seller: "home_studio",
    sellerUid: "",
    category: "가구/인테리어",
    endText: "종료 4시간 10분 전",
    highestBidder: "",
    bidCount: 2,
    likeCount: 15,
    viewCount: 203,
    createdAt: 4,
    images: [
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: "5",
    title: "빈티지 명품 시계",
    desc: "빈티지 감성이 살아있는 패션 경매 품목입니다.",
    price: 2750,
    minBid: 3000,
    seller: "parts_lab",
    sellerUid: "",
    category: "패션의류/패션잡화",
    endText: "종료 11시간 57분 전",
    highestBidder: "",
    bidCount: 3,
    likeCount: 21,
    viewCount: 315,
    createdAt: 5,
    images: [
      "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: "6",
    title: "스포츠카 모델 차량",
    desc: "자동차 카테고리 샘플 상품입니다.",
    price: 12500,
    minBid: 3000,
    seller: "auto_house",
    sellerUid: "",
    category: "자동차",
    endText: "종료 8시간 20분 전",
    highestBidder: "",
    bidCount: 4,
    likeCount: 18,
    viewCount: 264,
    createdAt: 6,
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
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const [bidModeById, setBidModeById] = useState<Record<string, "min" | "auto">>(
    {}
  );
  const [autoBidById, setAutoBidById] = useState<Record<string, string>>({});

  const [warningOpen, setWarningOpen] = useState(false);
  const [warningChecked, setWarningChecked] = useState(false);
  const [pendingBidProductId, setPendingBidProductId] = useState<string | null>(
    null
  );

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("디지털/가전");
  const [newPrice, setNewPrice] = useState("1000");
  const [newMinBid, setNewMinBid] = useState("500");
  const [newBuyNowPrice, setNewBuyNowPrice] = useState("2000");
  const [newEndAtText, setNewEndAtText] = useState("");
  const [newImagesText, setNewImagesText] = useState("");
  const [bidLogs, setBidLogs] = useState<BidLog[]>([]);
  const [nowMs, setNowMs] = useState(0);

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState("디지털/가전");
  const [editMinBid, setEditMinBid] = useState("500");
  const [editEndAtText, setEditEndAtText] = useState("");
  const [editImagesText, setEditImagesText] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const setupProductsAndSubscribe = async () => {
      try {
        const colRef = collection(db, "products");
        const snap = await getDocs(colRef);

        if (snap.empty) {
          for (const product of initialProducts) {
            await setDoc(doc(db, "products", product.id), {
              ...product,
              endAt: product.endAt ?? parseLegacyEndTextToMs(product.endText),
            });
          }
        }

        const unsubscribe = onSnapshot(
          colRef,
          (snapshot) => {
            const loaded = snapshot.docs.map((d) => {
              const raw = d.data() as Omit<Product, "endAt"> & {
                endAt?: number | { toMillis: () => number };
              };
              const endAtValue =
                typeof raw.endAt === "number"
                  ? raw.endAt
                  : raw.endAt && typeof raw.endAt === "object" && "toMillis" in raw.endAt
                  ? raw.endAt.toMillis()
                  : parseLegacyEndTextToMs(raw.endText);
              return {
                ...raw,
                endAt: endAtValue,
              };
            });
            loaded.sort((a, b) => {
              const aTime = a.createdAt ?? Number(a.id) ?? 0;
              const bTime = b.createdAt ?? Number(b.id) ?? 0;
              return bTime - aTime;
            });
            setProducts(loaded);
            setLoadingProducts(false);
          },
          (error) => {
            console.error(error);
            alert("실시간 상품 데이터를 불러오는 중 문제가 발생했습니다.");
            setLoadingProducts(false);
          }
        );

        return unsubscribe;
      } catch (error) {
        console.error(error);
        alert("상품 데이터를 준비하는 중 문제가 발생했습니다.");
        setLoadingProducts(false);
      }
    };

    let unsubscribeSnapshot: (() => void) | undefined;

    setupProductsAndSubscribe().then((cleanup) => {
      if (cleanup) unsubscribeSnapshot = cleanup;
    });

    return () => {
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    setNowMs(Date.now());
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedProductId) {
      return;
    }
    const q = query(
      collection(db, "products", selectedProductId, "bids"),
      orderBy("createdAt", "desc"),
      fsLimit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map((item) => item.data() as BidLog);
      setBidLogs(logs);
    });
    return () => unsubscribe();
  }, [selectedProductId]);

  const getMaskedName = (user: User | null) => {
    if (!user?.email) return "회원";
    const id = user.email.split("@")[0];
    if (id.length <= 1) return "*";
    if (id.length === 2) return `${id[0]}*`;
    return `${id[0]}${"*".repeat(id.length - 2)}${id[id.length - 1]}`;
  };

  const isOwnedByCurrentUser = (product: Product | null, user: User | null) => {
    if (!product || !user) return false;
    if (product.sellerUid && product.sellerUid === user.uid) return true;
    return product.seller === getMaskedName(user);
  };

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

  const rankByProductId = useMemo(() => {
    const sorted = [...products].sort((a, b) => b.price - a.price);
    return sorted.reduce<Record<string, number>>((acc, item, index) => {
      acc[item.id] = index + 1;
      return acc;
    }, {});
  }, [products]);

  const isOwnProduct = isOwnedByCurrentUser(selectedProduct, currentUser);

  const isAuctionClosed = !!selectedProduct?.endAt && selectedProduct.endAt <= nowMs;

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      alert("구글 로그인 중 문제가 발생했습니다.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
      alert("로그아웃 중 문제가 발생했습니다.");
    }
  };

  const openModal = async (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    setSelectedProductId(productId);
    setSelectedImageIndex(0);

    try {
      await updateDoc(doc(db, "products", productId), {
        viewCount: product.viewCount + 1,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const closeModal = () => {
    setSelectedProductId(null);
    setSelectedImageIndex(0);
  };

  const openWarningModal = (productId: string) => {
    if (!currentUser) {
      alert("입찰하려면 먼저 구글 로그인해주세요.");
      return;
    }

    const product = products.find((item) => item.id === productId);
    if (isOwnedByCurrentUser(product ?? null, currentUser)) {
      alert("본인이 등록한 상품에는 입찰할 수 없습니다.");
      return;
    }
    if (product?.endAt && product.endAt <= Date.now()) {
      alert("이미 마감된 경매 상품입니다.");
      return;
    }

    setPendingBidProductId(productId);
    setWarningChecked(false);
    setWarningOpen(true);
  };

  const closeWarningModal = () => {
    setWarningOpen(false);
    setWarningChecked(false);
    setPendingBidProductId(null);
  };

  const applyBid = async (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product || !currentUser) return;

    if (isOwnedByCurrentUser(product, currentUser)) {
      alert("본인이 등록한 상품에는 입찰할 수 없습니다.");
      return;
    }

    const mode = bidModeById[productId] || "min";
    const bidderName = getMaskedName(currentUser);

    let bidAmount = product.minBid;
    let highestBidder = bidderName;

    if (mode === "min") {
      bidAmount = product.minBid;
    } else {
      const autoBidValue = Number(autoBidById[productId] || 0);
      if (!autoBidValue || autoBidValue < product.price + product.minBid) {
        alert(
          `자동입찰 금액은 ${(product.price + product.minBid).toLocaleString()}원 이상이어야 합니다.`
        );
        return;
      }
      bidAmount = product.minBid;
      highestBidder = `${bidderName}(자동입찰)`;
    }

    try {
      const result = await runTransaction(db, async (transaction) => {
        const productRef = doc(db, "products", productId);
        const latestSnap = await transaction.get(productRef);
        if (!latestSnap.exists()) {
          throw new Error("상품이 존재하지 않습니다.");
        }
        const latest = latestSnap.data() as Product;
        if (isOwnedByCurrentUser(latest, currentUser)) {
          throw new Error("본인 상품에는 입찰할 수 없습니다.");
        }
        if (latest.endAt && latest.endAt <= Date.now()) {
          throw new Error("마감된 경매입니다.");
        }

        const nextPrice = latest.price + bidAmount;
        const nextBidCount = latest.bidCount + 1;

        transaction.update(productRef, {
          price: nextPrice,
          highestBidder,
          bidCount: nextBidCount,
        });

        const bidRef = doc(collection(db, "products", productId, "bids"));
        transaction.set(bidRef, {
          id: bidRef.id,
          productId,
          bidder: bidderName,
          bidderUid: currentUser.uid,
          mode,
          bidAmount,
          priceAfterBid: nextPrice,
          createdAt: Date.now(),
        } satisfies BidLog);

        return { nextPrice, highestBidder };
      });

      alert(
        `입찰 완료\n현재 입찰가: ${result.nextPrice.toLocaleString()}원\n최고 입찰자: ${
          result.highestBidder
        }`
      );
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "입찰 저장 중 문제가 발생했습니다."
      );
    }
  };

  const handleFinalAgreeBid = async () => {
    if (!pendingBidProductId) return;
    await applyBid(pendingBidProductId);
    closeWarningModal();
  };

  const openRegisterModal = () => {
    if (!currentUser) {
      alert("상품 등록은 로그인 후 가능합니다.");
      return;
    }
    setRegisterOpen(true);
  };

  const closeRegisterModal = () => {
    setRegisterOpen(false);
    setNewTitle("");
    setNewDesc("");
    setNewCategory("디지털/가전");
    setNewPrice("1000");
    setNewMinBid("500");
    setNewBuyNowPrice("2000");
    setNewEndAtText("");
    setNewImagesText("");
  };

  const handleRegisterProduct = async () => {
    if (!currentUser) {
      alert("상품 등록은 로그인 후 가능합니다.");
      return;
    }

    if (
      !newTitle.trim() ||
      !newDesc.trim() ||
      !newPrice.trim() ||
      !newMinBid.trim() ||
      !newEndAtText.trim()
    ) {
      alert("상품명, 설명, 시작가, 입찰단위, 마감일시를 입력해주세요.");
      return;
    }

    const price = Number(newPrice);
    const minBid = Number(newMinBid);
    const buyNowPrice = Number(newBuyNowPrice);

    if (!price || price < 1000 || price % 1000 !== 0) {
      alert("시작가는 1,000원 이상이며 1,000원 단위로 입력해주세요.");
      return;
    }

    if (!minBid || minBid < 500 || minBid % 500 !== 0) {
      alert("입찰 단위는 500원 이상이며 500원 단위로 입력해주세요.");
      return;
    }
    if (!buyNowPrice || buyNowPrice !== price + 1000 || buyNowPrice % 1000 !== 0) {
      alert(
        "즉시구매가는 시작가보다 정확히 1,000원 높게 설정됩니다."
      );
      return;
    }

    const endAt = new Date(newEndAtText).getTime();
    if (!endAt || endAt <= Date.now()) {
      alert("마감일시는 현재 시각 이후로 선택해주세요.");
      return;
    }

    const imageList = newImagesText
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);

    if (imageList.length === 0) {
      alert("이미지 URL을 최소 1개 입력해주세요.");
      return;
    }

    setRegisterLoading(true);

    try {
      const newRef = doc(collection(db, "products"));
      const sellerName = getMaskedName(currentUser);

      const newProduct: Product = {
        id: newRef.id,
        title: newTitle.trim(),
        desc: newDesc.trim(),
        price,
        buyNowPrice,
        seller: sellerName,
        sellerUid: currentUser.uid,
        category: newCategory,
        endText: "",
        endAt,
        images: imageList,
        minBid,
        highestBidder: "",
        bidCount: 0,
        likeCount: 0,
        viewCount: 0,
        createdAt: Date.now(),
      };

      await setDoc(newRef, newProduct);
      closeRegisterModal();
      alert("상품이 등록되었습니다.");
    } catch (error) {
      console.error(error);
      alert("상품 등록 중 문제가 발생했습니다.");
    } finally {
      setRegisterLoading(false);
    }
  };

  const openEditModal = () => {
    if (!selectedProduct || !isOwnProduct) return;
    setEditTitle(selectedProduct.title);
    setEditDesc(selectedProduct.desc);
    setEditCategory(selectedProduct.category);
    setEditMinBid(String(selectedProduct.minBid));
    setEditImagesText(selectedProduct.images.join("\n"));
    const endAtLocal = selectedProduct.endAt
      ? new Date(selectedProduct.endAt).toISOString().slice(0, 16)
      : "";
    setEditEndAtText(endAtLocal);
    setEditOpen(true);
  };

  const closeEditModal = () => {
    setEditOpen(false);
    setEditTitle("");
    setEditDesc("");
    setEditCategory("디지털/가전");
    setEditMinBid("500");
    setEditEndAtText("");
    setEditImagesText("");
  };

  const handleUpdateProduct = async () => {
    if (!selectedProduct || !currentUser || !isOwnProduct) return;
    if (!editTitle.trim() || !editDesc.trim() || !editMinBid.trim() || !editEndAtText.trim()) {
      alert("상품명, 설명, 입찰단위, 마감일시는 필수입니다.");
      return;
    }
    const minBid = Number(editMinBid);
    if (!minBid || minBid < 500 || minBid % 500 !== 0) {
      alert("입찰 단위는 500원 이상이며 500원 단위로 입력해주세요.");
      return;
    }
    const endAt = new Date(editEndAtText).getTime();
    if (!endAt || endAt <= nowMs) {
      alert("마감일시는 현재 시각 이후로 선택해주세요.");
      return;
    }
    const imageList = editImagesText
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
    if (imageList.length === 0) {
      alert("이미지 URL을 최소 1개 입력해주세요.");
      return;
    }

    setEditLoading(true);
    try {
      await updateDoc(doc(db, "products", selectedProduct.id), {
        title: editTitle.trim(),
        desc: editDesc.trim(),
        category: editCategory,
        minBid,
        endAt,
        images: imageList,
      });
      closeEditModal();
      alert("상품 정보가 수정되었습니다.");
    } catch (error) {
      console.error(error);
      alert("상품 수정 중 문제가 발생했습니다.");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!selectedProduct || !currentUser || !isOwnProduct) return;
    const ok = window.confirm("정말 이 상품을 삭제할까요? 삭제 후 복구할 수 없습니다.");
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "products", selectedProduct.id));
      closeModal();
      alert("상품이 삭제되었습니다.");
    } catch (error) {
      console.error(error);
      alert("상품 삭제 중 문제가 발생했습니다.");
    }
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
          <button className="hover:underline" onClick={openRegisterModal}>
            상품등록
          </button>

          {authLoading ? (
            <span className="text-gray-300">확인 중...</span>
          ) : currentUser ? (
            <>
              <span className="font-semibold">{getMaskedName(currentUser)} 님</span>
              <button className="hover:underline" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <button className="hover:underline" onClick={handleGoogleLogin}>
              구글 로그인
            </button>
          )}

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

          {loadingProducts ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
              상품 불러오는 중...
            </div>
          ) : filteredProducts.length === 0 ? (
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
                    {product.buyNowPrice ? (
                      <div className="text-xs font-semibold text-purple-600">
                        즉시구매가: {product.buyNowPrice.toLocaleString()}원
                      </div>
                    ) : null}
                    <div className="text-xs text-gray-500">
                      판매자: {product.seller}
                    </div>
                    <div className="text-xs font-semibold text-emerald-600">
                      실시간 순위 #{rankByProductId[product.id] ?? "-"}
                    </div>
                    <div className="text-xs font-semibold text-red-600">
                      마감까지 {formatCountdown(product.endAt, nowMs)}
                    </div>
                    <div className="text-xs text-gray-500">
                      현재 최고 입찰자: {product.highestBidder || "없음"}
                    </div>
                    <div className="text-xs text-gray-500">
                      입찰 {product.bidCount}건 · 관심 {product.likeCount} · 조회{" "}
                      {product.viewCount}
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
          onClick={(e) => e.stopPropagation()}
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
              <h3 className="mb-3 text-3xl font-bold">{selectedProduct.title}</h3>

              <div className="mb-4 text-4xl font-extrabold">
                {selectedProduct.price.toLocaleString()}원
              </div>

              <div className="mb-4 text-sm font-semibold text-blue-600">
                입찰 단위: {selectedProduct.minBid.toLocaleString()}원
              </div>
              {selectedProduct.buyNowPrice ? (
                <div className="mb-4 text-sm font-semibold text-purple-600">
                  즉시구매가: {selectedProduct.buyNowPrice.toLocaleString()}원
                </div>
              ) : null}

              <div className="mb-4 space-y-1 text-sm text-gray-600">
                <div>카테고리: {selectedProduct.category}</div>
                <div>판매자: {selectedProduct.seller}</div>
                <div className="font-semibold text-red-600">
                  마감까지 {formatCountdown(selectedProduct.endAt, nowMs)}
                </div>
                <div className="font-semibold text-emerald-600">
                  실시간 가격 순위 #{rankByProductId[selectedProduct.id] ?? "-"}
                </div>
                <div>현재 최고 입찰자: {selectedProduct.highestBidder || "없음"}</div>
                <div className="text-xs text-gray-500">
                  입찰 {selectedProduct.bidCount}건 · 관심 {selectedProduct.likeCount} ·
                  조회 {selectedProduct.viewCount}
                </div>
              </div>

              <div className="mb-4 rounded-2xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">
                {selectedProduct.desc}
              </div>

              {isOwnProduct && (
                <div className="mb-4 flex gap-2">
                  <button
                    onClick={openEditModal}
                    className="flex-1 rounded-lg bg-amber-500 px-4 py-3 text-sm font-bold text-white hover:bg-amber-600"
                  >
                    내 상품 수정
                  </button>
                  <button
                    onClick={handleDeleteProduct}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700"
                  >
                    내 상품 삭제
                  </button>
                </div>
              )}

              <div className="rounded-2xl border border-gray-200 p-4">
                <div className="mb-3 text-base font-bold">입찰하기</div>

                {!currentUser && (
                  <div className="mb-3 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                    입찰하려면 먼저 구글 로그인해주세요.
                  </div>
                )}

                {isOwnProduct && (
                  <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    본인이 등록한 상품에는 입찰할 수 없습니다.
                  </div>
                )}
                {isAuctionClosed && (
                  <div className="mb-3 rounded-lg bg-gray-200 px-3 py-2 text-sm text-gray-700">
                    마감된 상품은 입찰할 수 없습니다.
                  </div>
                )}

                <div className="space-y-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`bid-mode-${selectedProduct.id}`}
                      checked={(bidModeById[selectedProduct.id] || "min") === "min"}
                      onChange={() =>
                        setBidModeById((prev) => ({
                          ...prev,
                          [selectedProduct.id]: "min",
                        }))
                      }
                      disabled={isOwnProduct || isAuctionClosed}
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
                      checked={(bidModeById[selectedProduct.id] || "min") === "auto"}
                      onChange={() =>
                        setBidModeById((prev) => ({
                          ...prev,
                          [selectedProduct.id]: "auto",
                        }))
                      }
                      disabled={isOwnProduct || isAuctionClosed}
                    />
                    <span>자동입찰</span>
                  </label>

                  {(bidModeById[selectedProduct.id] || "min") === "auto" && (
                    <input
                      type="number"
                      placeholder={`자동입찰 상한가 (${(
                        selectedProduct.price + selectedProduct.minBid
                      ).toLocaleString()}원 이상)`}
                      value={autoBidById[selectedProduct.id] || ""}
                      onChange={(e) =>
                        setAutoBidById((prev) => ({
                          ...prev,
                          [selectedProduct.id]: e.target.value,
                        }))
                      }
                      disabled={isOwnProduct || isAuctionClosed}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none disabled:bg-gray-100"
                    />
                  )}

                  <button
                    onClick={() => openWarningModal(selectedProduct.id)}
                    disabled={isOwnProduct || isAuctionClosed}
                    className={`w-full rounded-lg px-4 py-3 text-sm font-bold text-white ${
                      isOwnProduct || isAuctionClosed
                        ? "cursor-not-allowed bg-gray-400"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    입찰하기
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-gray-200 p-4">
                <div className="mb-3 text-base font-bold">입찰 기록 로그 (최신 20건)</div>
                {bidLogs.length === 0 ? (
                  <div className="text-sm text-gray-500">아직 입찰 기록이 없습니다.</div>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {bidLogs.map((log) => (
                      <li
                        key={log.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                      >
                        [{new Date(log.createdAt).toLocaleString()}] {log.bidder} /{" "}
                        {log.mode === "auto" ? "자동입찰" : "즉시입찰"} / +{log.bidAmount.toLocaleString()}
                        원 / 현재가 {log.priceAfterBid.toLocaleString()}원
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {warningOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gray-700 px-5 py-4 text-lg font-bold text-red-400">
              [필독] 옥션 입찰시 주의사항
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5 text-sm leading-7 text-gray-800">
              <p className="mb-4 font-bold text-red-500">
                아래 내용은 옥션입찰시 아주 중요한 내용으로써, 입찰시마다 동의를 받고 있습니다.
              </p>

              <div className="mt-6 rounded-xl border border-gray-300 bg-gray-50 p-4">
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={warningChecked}
                    onChange={(e) => setWarningChecked(e.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>위 내용을 확인하였으며, 동의 후 입찰을 진행합니다.</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
              <button
                onClick={handleFinalAgreeBid}
                disabled={!warningChecked}
                className={`flex-1 rounded-lg px-4 py-3 text-sm font-bold text-white ${
                  warningChecked
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "cursor-not-allowed bg-gray-300"
                }`}
              >
                동의하고 입찰하기
              </button>

              <button
                onClick={closeWarningModal}
                className="flex-1 rounded-lg bg-gray-300 px-4 py-3 text-sm font-bold text-gray-800 hover:bg-gray-400"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-5 text-2xl font-bold">내 상품 수정</h3>

            <div className="space-y-4">
              <input
                type="text"
                placeholder="상품명"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />

              <textarea
                placeholder="상품 설명"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="h-28 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />

              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              >
                {productCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>

              <input
                type="number"
                placeholder="입찰 단위"
                value={editMinBid}
                onChange={(e) => setEditMinBid(e.target.value)}
                  min={500}
                  step={500}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />

              <input
                type="datetime-local"
                value={editEndAtText}
                onChange={(e) => setEditEndAtText(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />

              <textarea
                placeholder={"이미지 URL 입력 (한 줄에 하나씩)\nhttps://...\nhttps://..."}
                value={editImagesText}
                onChange={(e) => setEditImagesText(e.target.value)}
                className="h-28 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={handleUpdateProduct}
                disabled={editLoading}
                className="flex-1 rounded-lg bg-amber-500 px-4 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:bg-gray-400"
              >
                {editLoading ? "수정 중..." : "수정 저장"}
              </button>
              <button
                onClick={closeEditModal}
                className="flex-1 rounded-lg bg-gray-300 px-4 py-3 text-sm font-bold text-gray-800 hover:bg-gray-400"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {registerOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-5 text-2xl font-bold">상품 등록</h3>

            <div className="space-y-4">
              <input
                type="text"
                placeholder="상품명"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />

              <textarea
                placeholder="상품 설명"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="h-28 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />

              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              >
                {productCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="시작가"
                  value={newPrice}
                  onChange={(e) => {
                    const nextPrice = e.target.value;
                    setNewPrice(nextPrice);
                    const numericPrice = Number(nextPrice);
                    if (nextPrice.trim() && Number.isFinite(numericPrice) && numericPrice > 0) {
                      setNewBuyNowPrice(String(numericPrice + 1000));
                    } else {
                      setNewBuyNowPrice("");
                    }
                  }}
                  min={1000}
                  step={1000}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
                />
                <input
                  type="number"
                  placeholder="입찰 단위"
                  value={newMinBid}
                  onChange={(e) => setNewMinBid(e.target.value)}
                  min={500}
                  step={500}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
                />
              </div>

              <input
                type="number"
                placeholder="즉시구매가 (시작가 + 1000)"
                value={newBuyNowPrice}
                min={1000}
                step={1000}
                readOnly
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />

              <input
                type="datetime-local"
                value={newEndAtText}
                onChange={(e) => setNewEndAtText(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />

              <textarea
                placeholder={"이미지 URL 입력 (한 줄에 하나씩)\nhttps://...\nhttps://..."}
                value={newImagesText}
                onChange={(e) => setNewImagesText(e.target.value)}
                className="h-28 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={handleRegisterProduct}
                disabled={registerLoading}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-gray-400"
              >
                {registerLoading ? "등록 중..." : "등록하기"}
              </button>
              <button
                onClick={closeRegisterModal}
                className="flex-1 rounded-lg bg-gray-300 px-4 py-3 text-sm font-bold text-gray-800 hover:bg-gray-400"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}