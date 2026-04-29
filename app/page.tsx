"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, provider, db, functions, storage } from "../lib/firebase";
import { FirebaseError } from "firebase/app";
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
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  getDocs,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";

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
  expireAt?: number;
  images: string[];
  thumbnailImages?: string[];
  minBid: number;
  highestBidder?: string;
  bidCount: number;
  likeCount: number;
  viewCount: number;
  editCount?: number;
  createdAt?: number;
};

const EXPIRE_AFTER_END_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PRODUCT_IMAGES = 5;
const MAX_ORIGINAL_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_COMPRESSED_IMAGE_BYTES = 1 * 1024 * 1024;
const FILE_UPLOAD_TIMEOUT_MS = 60 * 1000;
const MAX_IMAGE_LONG_EDGE = 1200;
const MAX_THUMBNAIL_LONG_EDGE = 400;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

type BidLog = {
  id: string;
  productId: string;
  bidder: string;
  bidderUid: string;
  mode: "min" | "auto" | "buy_now";
  bidAmount: number;
  priceAfterBid: number;
  createdAt: number;
};

type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  phone: string;
  point: number;
  createdAt: number;
  updatedAt: number;
};

const categories = [
  "전체",
  "수집품",
  "디지털/가전",
  "패션의류/패션잡화",
  "가구/인테리어",
  "아트/악기",
];

const productCategories = [
  "수집품",
  "디지털/가전",
  "패션의류/패션잡화",
  "가구/인테리어",
  "아트/악기",
];

const parseLegacyEndTextToMs = (endText: string) => {
  const day = Number(endText.match(/(\d+)\s*일/)?.[1] || 0);
  const hour = Number(endText.match(/(\d+)\s*시간/)?.[1] || 0);
  const minute = Number(endText.match(/(\d+)\s*분/)?.[1] || 0);
  const totalMs = (day * 24 * 60 + hour * 60 + minute) * 60 * 1000;
  return Date.now() + Math.max(totalMs, 10 * 60 * 1000);
};

const readImageFile = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`이미지 파일을 읽을 수 없습니다: ${file.name}`));
    };
    image.src = objectUrl;
  });

const canvasToCompressedBlob = (
  canvas: HTMLCanvasElement,
  quality: number,
  preferredType: "image/webp" | "image/jpeg"
) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          canvas.toBlob(
            (fallbackBlob) => {
              if (!fallbackBlob) {
                reject(new Error("이미지 변환에 실패했습니다."));
                return;
              }
              resolve(fallbackBlob);
            },
            "image/jpeg",
            quality
          );
          return;
        }
        resolve(blob);
      },
      preferredType,
      quality
    );
  });

const resizeImageToCompressedBlob = async (
  file: File,
  maxLongEdge: number,
  quality: number,
  preferredType: "image/webp" | "image/jpeg"
) => {
  const image = await readImageFile(file);
  const longEdge = Math.max(image.width, image.height);
  const ratio = Math.min(1, maxLongEdge / longEdge);
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("이미지 처리 컨텍스트를 생성할 수 없습니다.");
  }
  context.drawImage(image, 0, 0, width, height);
  return canvasToCompressedBlob(canvas, quality, preferredType);
};

const formatCountdown = (
  endAt?: number,
  nowMs?: number,
  options?: { showSecondsUnderOneHour?: boolean }
) => {
  if (!endAt || !nowMs) return "마감 정보 없음";
  const diff = endAt - nowMs;
  if (diff <= 0) return "경매 종료";
  const totalSec = Math.floor(diff / 1000);
  const day = Math.floor(totalSec / 86400);
  const hour = Math.floor((totalSec % 86400) / 3600);
  const minute = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const showSecondsUnderOneHour = options?.showSecondsUnderOneHour ?? true;
  if (day > 0) return `${day}일 ${hour}시간 ${minute}분`;
  if (!showSecondsUnderOneHour) return `${hour}시간 ${minute}분`;
  if (totalSec >= 3600) return `${hour}시간 ${minute}분`;
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
    desc: "아트/악기 카테고리 샘플 상품입니다.",
    price: 12500,
    minBid: 3000,
    seller: "auto_house",
    sellerUid: "",
    category: "아트/악기",
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
const SAMPLE_PRODUCT_IDS = initialProducts.map((product) => product.id);

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedImageZoom, setSelectedImageZoom] = useState(1);
  const [selectedImageOffset, setSelectedImageOffset] = useState({ x: 0, y: 0 });
  const [selectedImageDragging, setSelectedImageDragging] = useState(false);
  const [selectedImageDragStart, setSelectedImageDragStart] = useState<{
    x: number;
    y: number;
  } | null>(null);

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
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("수집품");
  const [newPrice, setNewPrice] = useState("1000");
  const [newMinBid, setNewMinBid] = useState("1000");
  const [newBuyNowPrice, setNewBuyNowPrice] = useState("2000");
  const [newEndDays, setNewEndDays] = useState("1");
  const [newImagesText, setNewImagesText] = useState("");
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviewUrls, setNewImagePreviewUrls] = useState<string[]>([]);
  const [bidLogs, setBidLogs] = useState<BidLog[]>([]);
  const [nowMs, setNowMs] = useState(0);

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState("디지털/가전");
  const [editMinBid, setEditMinBid] = useState("1000");
  const [editEndDays, setEditEndDays] = useState("1");
  const [editImagesText, setEditImagesText] = useState("");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      try {
        setCurrentUser(user);
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = undefined;
        }

        if (!user) {
          setCurrentUserProfile(null);
          return;
        }

        const userRef = doc(db, "users", user.uid);
        const now = Date.now();
        const existingUserSnap = await getDoc(userRef);
        if (!existingUserSnap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email ?? "",
            displayName: user.displayName ?? "",
            photoURL: user.photoURL ?? "",
            phone: "",
            point: 10000,
            createdAt: now,
            updatedAt: now,
          } satisfies UserProfile);
        } else {
          await setDoc(
            userRef,
            {
              email: user.email ?? "",
              displayName: user.displayName ?? "",
              photoURL: user.photoURL ?? "",
              updatedAt: now,
            },
            { merge: true }
          );
        }

        unsubscribeProfile = onSnapshot(userRef, (snapshot) => {
          setCurrentUserProfile((snapshot.data() as UserProfile | undefined) ?? null);
        });
      } catch (error) {
        console.error("auth/profile sync error", error);
      }
    });

    return () => {
      if (unsubscribeProfile) unsubscribeProfile();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    const setupProductsAndSubscribe = async () => {
      try {
        const colRef = collection(db, "products");
        await getDocs(colRef);

        const unsubscribe = onSnapshot(
          colRef,
          (snapshot) => {
            const loaded = snapshot.docs.map((d) => {
              const raw = d.data() as Omit<Product, "endAt" | "expireAt"> & {
                endAt?: number | { toMillis: () => number };
                expireAt?: number | { toMillis: () => number };
              };
              const normalizedCategory =
                raw.category === "자동차" ? "아트/악기" : raw.category;
              const endAtValue =
                typeof raw.endAt === "number"
                  ? raw.endAt
                  : raw.endAt && typeof raw.endAt === "object" && "toMillis" in raw.endAt
                  ? raw.endAt.toMillis()
                  : parseLegacyEndTextToMs(raw.endText);
              const expireAtValue =
                typeof raw.expireAt === "number"
                  ? raw.expireAt
                  : raw.expireAt &&
                    typeof raw.expireAt === "object" &&
                    "toMillis" in raw.expireAt
                  ? raw.expireAt.toMillis()
                  : endAtValue + EXPIRE_AFTER_END_MS;
              return {
                ...raw,
                category: normalizedCategory,
                endAt: endAtValue,
                expireAt: expireAtValue,
                editCount: raw.editCount ?? 0,
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
    if (!currentUser) return;

    const cleanupSampleProducts = async () => {
      try {
        for (const sampleId of SAMPLE_PRODUCT_IDS) {
          const ref = doc(db, "products", sampleId);
          const snap = await getDoc(ref);
          if (!snap.exists()) continue;
          const data = snap.data() as Partial<Product>;
          // 기본 샘플 형태(판매자 uid 없음)만 지워서 실제 상품을 건드리지 않도록 보호
          if (data.sellerUid) continue;
          await deleteDoc(ref);
        }
      } catch (error) {
        console.warn("sample products cleanup skipped", error);
      }
    };

    cleanupSampleProducts();
  }, [currentUser]);

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

  const formatPhone = (phone: string) => {
    const normalized = phone.replace(/[^0-9]/g, "");
    if (normalized.length === 11) {
      return `${normalized.slice(0, 3)}-${normalized.slice(3, 7)}-${normalized.slice(7)}`;
    }
    if (normalized.length === 10) {
      return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
    }
    return normalized;
  };

  const formatMaskedPhone = (phone: string) => {
    const normalized = phone.replace(/[^0-9]/g, "");
    if (normalized.length === 11) {
      return `${normalized.slice(0, 3)}-****-${normalized.slice(7)}`;
    }
    if (normalized.length === 10) {
      return `${normalized.slice(0, 3)}-***-${normalized.slice(6)}`;
    }
    return "미등록";
  };

  const isOwnedByCurrentUser = (product: Product | null, user: User | null) => {
    if (!product || !user) return false;
    if (product.sellerUid && product.sellerUid === user.uid) return true;
    return product.seller === getMaskedName(user);
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (SAMPLE_PRODUCT_IDS.includes(product.id)) return false;
      if (product.expireAt && product.expireAt <= nowMs) return false;
      const categoryMatch =
        selectedCategory === "전체" || product.category === selectedCategory;

      const keyword = search.trim().toLowerCase();
      const searchMatch =
        keyword === "" ||
        product.title.toLowerCase().includes(keyword) ||
        product.desc.toLowerCase().includes(keyword);

      return categoryMatch && searchMatch;
    });
  }, [products, selectedCategory, search, nowMs]);

  const selectedProduct =
    products.find(
      (product) => product.id === selectedProductId && !SAMPLE_PRODUCT_IDS.includes(product.id)
    ) ?? null;
  const selectedNextBidPrice = selectedProduct
    ? selectedProduct.price + selectedProduct.minBid
    : 0;
  const selectedWillBuyNowByMinBid =
    !!selectedProduct?.buyNowPrice && selectedNextBidPrice >= selectedProduct.buyNowPrice;

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
      if (error instanceof FirebaseError) {
        const helpByCode: Record<string, string> = {
          "auth/unauthorized-domain":
            "Firebase Console > Authentication > Settings > Authorized domains에 현재 접속 도메인을 추가해주세요. (onauction.kr, www.onauction.kr, on-auction.vercel.app)",
          "auth/popup-blocked":
            "브라우저에서 팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도해주세요.",
          "auth/popup-closed-by-user":
            "로그인 팝업이 닫혀 인증이 취소되었습니다. 다시 시도해주세요.",
          "auth/operation-not-allowed":
            "Firebase Console > Authentication > Sign-in method에서 Google 로그인을 활성화해주세요.",
          "auth/network-request-failed":
            "네트워크 문제로 인증 요청에 실패했습니다. 잠시 후 다시 시도해주세요.",
          "auth/invalid-api-key":
            "Firebase API 키가 올바르지 않습니다. 배포 환경변수를 다시 확인해주세요.",
        };
        const help =
          helpByCode[error.code] ??
          "콘솔 오류 코드를 확인해 Firebase 인증 설정을 점검해주세요.";
        alert(`구글 로그인 실패 (${error.code})\n${help}`);
        return;
      }
      alert("구글 로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
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
    setSelectedImageZoom(1);
    setSelectedImageOffset({ x: 0, y: 0 });
    setSelectedImageDragging(false);
    setSelectedImageDragStart(null);
  };

  const resetSelectedImageView = () => {
    setSelectedImageZoom(1);
    setSelectedImageOffset({ x: 0, y: 0 });
    setSelectedImageDragging(false);
    setSelectedImageDragStart(null);
  };

  const handleSelectedImageWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const zoomStep = 0.15;
    const nextZoom =
      event.deltaY < 0
        ? Math.min(4, selectedImageZoom + zoomStep)
        : Math.max(1, selectedImageZoom - zoomStep);
    setSelectedImageZoom(nextZoom);
    if (nextZoom === 1) {
      setSelectedImageOffset({ x: 0, y: 0 });
      setSelectedImageDragging(false);
      setSelectedImageDragStart(null);
    }
  };

  const handleSelectedImageMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (selectedImageZoom <= 1) return;
    event.preventDefault();
    setSelectedImageDragging(true);
    setSelectedImageDragStart({
      x: event.clientX - selectedImageOffset.x,
      y: event.clientY - selectedImageOffset.y,
    });
  };

  const handleSelectedImageMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedImageDragging || !selectedImageDragStart) return;
    setSelectedImageOffset({
      x: event.clientX - selectedImageDragStart.x,
      y: event.clientY - selectedImageDragStart.y,
    });
  };

  const handleSelectedImageMouseUp = () => {
    setSelectedImageDragging(false);
    setSelectedImageDragStart(null);
  };

  const clampZoom = (zoom: number) => Math.max(1, Math.min(4, zoom));

  const handleSelectedImageZoomIn = () => {
    setSelectedImageZoom((prev) => clampZoom(prev + 0.25));
  };

  const handleSelectedImageZoomOut = () => {
    setSelectedImageZoom((prev) => {
      const next = clampZoom(prev - 0.25);
      if (next === 1) {
        setSelectedImageOffset({ x: 0, y: 0 });
        setSelectedImageDragging(false);
        setSelectedImageDragStart(null);
      }
      return next;
    });
  };

  const handleSelectedImageDoubleClick = () => {
    if (selectedImageZoom === 1) {
      setSelectedImageZoom(2);
      return;
    }
    resetSelectedImageView();
  };

  useEffect(() => {
    if (!selectedProductId) return;
    resetSelectedImageView();
  }, [selectedProductId, selectedImageIndex]);

  const openWarningModal = async (productId: string) => {
    if (!currentUser) {
      alert("입찰하려면 먼저 구글 로그인해주세요.");
      return;
    }
    const ok = await ensurePhoneProfile("입찰");
    if (!ok) return;

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
    if (!(await ensurePhoneProfile("입찰"))) return;

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

        const defaultNextPrice = latest.price + bidAmount;
        const isBuyNowTriggered =
          mode === "min" &&
          !!latest.buyNowPrice &&
          defaultNextPrice >= latest.buyNowPrice;
        const nextPrice = isBuyNowTriggered ? latest.buyNowPrice! : defaultNextPrice;
        const nextBidCount = latest.bidCount + 1;
        const nextHighestBidder = isBuyNowTriggered
          ? `${bidderName}(즉시구매)`
          : highestBidder;

        transaction.update(productRef, {
          price: nextPrice,
          highestBidder: nextHighestBidder,
          bidCount: nextBidCount,
          ...(isBuyNowTriggered
            ? {
                endAt: Date.now(),
                expireAt: Date.now() + EXPIRE_AFTER_END_MS,
              }
            : {}),
        });

        const bidRef = doc(collection(db, "products", productId, "bids"));
        transaction.set(bidRef, {
          id: bidRef.id,
          productId,
          bidder: bidderName,
          bidderUid: currentUser.uid,
          mode,
          bidAmount: nextPrice - latest.price,
          priceAfterBid: nextPrice,
          createdAt: Date.now(),
        } satisfies BidLog);

        return { nextPrice, highestBidder: nextHighestBidder, isBuyNowTriggered };
      });

      alert(
        result.isBuyNowTriggered
          ? `즉시구매 완료\n구매 금액: ${result.nextPrice.toLocaleString()}원\n구매자: ${
              result.highestBidder
            }`
          : `입찰 완료\n현재 입찰가: ${result.nextPrice.toLocaleString()}원\n최고 입찰자: ${
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

  const handleBuyNow = async (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product || !currentUser) return;
    if (!(await ensurePhoneProfile("즉시구매"))) return;
    if (!product.buyNowPrice) {
      alert("즉시구매가가 설정되지 않은 상품입니다.");
      return;
    }
    if (isOwnedByCurrentUser(product, currentUser)) {
      alert("본인이 등록한 상품은 즉시구매할 수 없습니다.");
      return;
    }
    if (product.endAt && product.endAt <= Date.now()) {
      alert("이미 마감된 경매 상품입니다.");
      return;
    }

    const bidderName = getMaskedName(currentUser);
    const confirmed = window.confirm(
      `즉시구매가 ${product.buyNowPrice.toLocaleString()}원에 구매하시겠습니까?`
    );
    if (!confirmed) return;

    try {
      const result = await runTransaction(db, async (transaction) => {
        const productRef = doc(db, "products", productId);
        const latestSnap = await transaction.get(productRef);
        if (!latestSnap.exists()) {
          throw new Error("상품이 존재하지 않습니다.");
        }
        const latest = latestSnap.data() as Product;
        if (!latest.buyNowPrice) {
          throw new Error("즉시구매가가 설정되지 않은 상품입니다.");
        }
        if (isOwnedByCurrentUser(latest, currentUser)) {
          throw new Error("본인 상품은 즉시구매할 수 없습니다.");
        }
        if (latest.endAt && latest.endAt <= Date.now()) {
          throw new Error("마감된 경매입니다.");
        }

        const buyNowPrice = latest.buyNowPrice;
        transaction.update(productRef, {
          price: buyNowPrice,
          highestBidder: `${bidderName}(즉시구매)`,
          bidCount: latest.bidCount + 1,
          endAt: Date.now(),
          expireAt: Date.now() + EXPIRE_AFTER_END_MS,
        });

        const bidRef = doc(collection(db, "products", productId, "bids"));
        transaction.set(bidRef, {
          id: bidRef.id,
          productId,
          bidder: bidderName,
          bidderUid: currentUser.uid,
          mode: "buy_now",
          bidAmount: Math.max(0, buyNowPrice - latest.price),
          priceAfterBid: buyNowPrice,
          createdAt: Date.now(),
        } satisfies BidLog);

        return { buyNowPrice, highestBidder: `${bidderName}(즉시구매)` };
      });

      alert(
        `즉시구매 완료\n구매 금액: ${result.buyNowPrice.toLocaleString()}원\n구매자: ${
          result.highestBidder
        }`
      );
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "즉시구매 처리 중 문제가 발생했습니다."
      );
    }
  };

  const ensurePhoneProfile = async (actionLabel: string) => {
    if (!currentUser) {
      alert(`${actionLabel}은 로그인 후 가능합니다.`);
      return false;
    }
    if (currentUserProfile?.phone?.trim()) return true;

    const input = window.prompt(
      `${actionLabel} 전에 연락처(전화번호) 입력이 필요합니다.\n예: 01012345678`
    );
    if (!input) return false;

    const normalized = input.replace(/[^0-9]/g, "");
    if (normalized.length < 10 || normalized.length > 11) {
      alert("전화번호 형식이 올바르지 않습니다. 숫자 10~11자리로 입력해주세요.");
      return false;
    }

    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        phone: normalized,
        updatedAt: Date.now(),
      });
      return true;
    } catch (error) {
      console.error(error);
      alert("연락처 저장 중 문제가 발생했습니다.");
      return false;
    }
  };

  const handleEditPhone = async () => {
    if (!currentUser) return;
    const prevPhone = currentUserProfile?.phone ? formatPhone(currentUserProfile.phone) : "";
    const input = window.prompt(
      "전화번호를 수정해주세요. (숫자만 10~11자리)",
      prevPhone
    );
    if (!input) return;
    const normalized = input.replace(/[^0-9]/g, "");
    if (normalized.length < 10 || normalized.length > 11) {
      alert("전화번호 형식이 올바르지 않습니다. 숫자 10~11자리로 입력해주세요.");
      return;
    }
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        phone: normalized,
        updatedAt: Date.now(),
      });
      alert("전화번호가 수정되었습니다.");
    } catch (error) {
      console.error(error);
      alert("전화번호 수정 중 문제가 발생했습니다.");
    }
  };

  const openRegisterModal = async () => {
    if (!currentUser) {
      alert("상품 등록은 로그인 후 가능합니다.");
      return;
    }
    const ok = await ensurePhoneProfile("상품 등록");
    if (!ok) return;
    setRegisterOpen(true);
  };

  const closeRegisterModal = () => {
    setRegisterOpen(false);
    setNewTitle("");
    setNewDesc("");
    setNewCategory("수집품");
    setNewPrice("1000");
    setNewMinBid("1000");
    setNewBuyNowPrice("2000");
    setNewEndDays("1");
    setNewImagesText("");
    setNewImageFiles([]);
    setNewImagePreviewUrls([]);
  };

  useEffect(() => {
    if (newImageFiles.length === 0) {
      setNewImagePreviewUrls([]);
      return;
    }

    const previewUrls = newImageFiles.map((file) => URL.createObjectURL(file));
    setNewImagePreviewUrls(previewUrls);

    return () => {
      previewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    };
  }, [newImageFiles]);

  const newImageUrlCount = newImagesText
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean).length;
  const selectedImageCount = newImageFiles.length + newImageUrlCount;
  const reachedMaxProductImages = selectedImageCount >= MAX_PRODUCT_IMAGES;

  const syncFromBuyNowPrice = (nextBuyNowPrice: number, shouldLowerBasePrice: boolean) => {
    const safeBuyNowPrice = Math.max(2000, Math.floor(nextBuyNowPrice / 1000) * 1000);
    setNewBuyNowPrice(String(safeBuyNowPrice));
    if (shouldLowerBasePrice) {
      setNewPrice(String(safeBuyNowPrice - 1000));
    }
  };

  const handleIncreaseBuyNowPrice = () => {
    const current = Number(newBuyNowPrice) || 2000;
    syncFromBuyNowPrice(current + 1000, false);
  };

  const handleDecreaseBuyNowPrice = () => {
    const current = Number(newBuyNowPrice) || 2000;
    const currentBasePrice = Number(newPrice) || 1000;
    const isLinked = currentBasePrice === current - 1000;
    syncFromBuyNowPrice(Math.max(2000, current - 1000), isLinked);
  };

  const handleRegisterProduct = async () => {
    if (!currentUser) {
      alert("상품 등록은 로그인 후 가능합니다.");
      return;
    }
    if (!(await ensurePhoneProfile("상품 등록"))) return;

    if (
      !newTitle.trim() ||
      !newDesc.trim() ||
      !newPrice.trim() ||
      !newMinBid.trim()
    ) {
      alert("상품명, 설명, 시작가, 입찰단위를 입력해주세요.");
      return;
    }

    const price = Number(newPrice);
    const minBid = Number(newMinBid);
    const buyNowPrice = Number(newBuyNowPrice);

    if (!price || price < 1000 || price % 1000 !== 0) {
      alert("시작가는 1,000원 이상이며 1,000원 단위로 입력해주세요.");
      return;
    }

    if (!minBid || minBid < 1000 || minBid % 1000 !== 0) {
      alert("입찰 단위는 1,000원 이상이며 1,000원 단위로 입력해주세요.");
      return;
    }
    if (
      !buyNowPrice ||
      buyNowPrice < 2000 ||
      buyNowPrice % 1000 !== 0 ||
      buyNowPrice < price + 1000
    ) {
      alert(
        "즉시구매가는 최소 2,000원이며, 시작가보다 최소 1,000원 높아야 합니다."
      );
      return;
    }

    const endDays = Number(newEndDays);
    if (!endDays || endDays < 1 || endDays > 30) {
      alert("마감일은 1일 이상 30일 이하로 선택해주세요.");
      return;
    }

    const imageUrlList = newImagesText
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);

    if (imageUrlList.length + newImageFiles.length > MAX_PRODUCT_IMAGES) {
      alert(`상품 이미지는 최대 ${MAX_PRODUCT_IMAGES}장까지 등록할 수 있습니다.`);
      return;
    }
    if (imageUrlList.length === 0 && newImageFiles.length === 0) {
      alert("이미지 URL 또는 PC 이미지 파일을 최소 1개 등록해주세요.");
      return;
    }
    const invalidFile = newImageFiles.find((file) => {
      const lowerName = file.name.toLowerCase();
      const hasAllowedExtension = ALLOWED_IMAGE_EXTENSIONS.some((ext) =>
        lowerName.endsWith(ext)
      );
      const hasAllowedMimeType = ALLOWED_IMAGE_TYPES.includes(file.type);
      return !hasAllowedExtension || !hasAllowedMimeType;
    });
    if (invalidFile) {
      alert(
        `지원하지 않는 이미지 형식입니다.\n허용 형식: JPG, PNG, WEBP\n대상: ${invalidFile.name}`
      );
      return;
    }
    const tooLargeFile = newImageFiles.find(
      (file) => file.size > MAX_ORIGINAL_IMAGE_BYTES
    );
    if (tooLargeFile) {
      alert(
        `원본 이미지 용량이 너무 큽니다. (최대 10MB)\n대상: ${tooLargeFile.name}`
      );
      return;
    }

    setRegisterLoading(true);

    try {
      if (newImageFiles.length > 0) {
        const uploadsEnabledSnap = await getDoc(doc(db, "settings", "app"));
        const uploadsEnabledRaw = uploadsEnabledSnap.exists()
          ? uploadsEnabledSnap.data()?.uploadsEnabled
          : true;
        const uploadsEnabled = uploadsEnabledRaw !== false;
        if (!uploadsEnabled) {
          alert("관리자 설정으로 현재 이미지 업로드가 일시 중지되어 있습니다.");
          return;
        }
      }

      const uploadedImageUrls: string[] = [];
      const uploadedThumbnailUrls: string[] = [];
      for (const file of newImageFiles) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const unique = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}-${safeName}`;

        const compressedBlob = await resizeImageToCompressedBlob(
          file,
          MAX_IMAGE_LONG_EDGE,
          0.82,
          "image/webp"
        );
        if (compressedBlob.size > MAX_COMPRESSED_IMAGE_BYTES) {
          throw new Error(
            `압축 후 이미지 용량이 1MB를 초과합니다: ${file.name}`
          );
        }

        const thumbnailBlob = await resizeImageToCompressedBlob(
          file,
          MAX_THUMBNAIL_LONG_EDGE,
          0.72,
          "image/webp"
        );
        if (thumbnailBlob.size > MAX_COMPRESSED_IMAGE_BYTES) {
          throw new Error(
            `압축 후 썸네일 용량이 1MB를 초과합니다: ${file.name}`
          );
        }

        const storageRef = ref(storage, `products/${currentUser.uid}/${unique}`);
        const thumbnailRef = ref(
          storage,
          `products/${currentUser.uid}/thumb-${unique}`
        );
        await Promise.race([
          uploadBytes(storageRef, compressedBlob, { contentType: compressedBlob.type }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`이미지 업로드 시간 초과: ${file.name}`)),
              FILE_UPLOAD_TIMEOUT_MS
            )
          ),
        ]);
        await Promise.race([
          uploadBytes(thumbnailRef, thumbnailBlob, { contentType: thumbnailBlob.type }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`썸네일 업로드 시간 초과: ${file.name}`)),
              FILE_UPLOAD_TIMEOUT_MS
            )
          ),
        ]);
        const url = await getDownloadURL(storageRef);
        const thumbnailUrl = await getDownloadURL(thumbnailRef);
        uploadedImageUrls.push(url);
        uploadedThumbnailUrls.push(thumbnailUrl);
      }

      const imageList = [...uploadedImageUrls, ...imageUrlList];
      const thumbnailImageList = [
        ...uploadedThumbnailUrls,
        ...imageUrlList,
      ];
      try {
        const createProductWithFee = httpsCallable(functions, "createProductWithFee");
        await createProductWithFee({
          title: newTitle.trim(),
          desc: newDesc.trim(),
          category: newCategory,
          price,
          minBid,
          buyNowPrice,
          endDays,
          images: imageList,
          thumbnailImages: thumbnailImageList,
        });
        closeRegisterModal();
        alert("상품이 등록되었습니다. 등록 수수료 1,000P가 차감되었습니다.");
      } catch (callableError) {
        // 임시 우회: Functions 호출 실패 시 클라이언트 직접 등록(수수료 차감 없음)
        const now = Date.now();
        const endAt = now + endDays * DAY_MS;
        const productRef = doc(collection(db, "products"));
        await setDoc(productRef, {
          id: productRef.id,
          title: newTitle.trim(),
          desc: newDesc.trim(),
          price,
          buyNowPrice,
          seller: getMaskedName(currentUser),
          sellerUid: currentUser.uid,
          category: newCategory,
          endText: "",
          endAt,
          expireAt: endAt + EXPIRE_AFTER_END_MS,
          images: imageList,
          thumbnailImages: thumbnailImageList,
          minBid,
          highestBidder: "",
          bidCount: 0,
          likeCount: 0,
          viewCount: 0,
          editCount: 0,
          createdAt: now,
        });
        console.warn("createProductWithFee failed, fallback create used", callableError);
        closeRegisterModal();
        alert("상품이 등록되었습니다. (임시 테스트 모드: 수수료 차감 없음)");
      }
    } catch (error) {
      console.error(error);
      if (error instanceof FirebaseError) {
        alert(
          `상품 등록 실패 (${error.code})\n${
            error.message ||
            "Storage 권한/버킷 설정을 확인해주세요."
          }`
        );
      } else {
        alert(
          error instanceof Error
            ? error.message
            : "상품 등록 중 문제가 발생했습니다."
        );
      }
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleRemoveNewImageFile = (targetIndex: number) => {
    setNewImageFiles((prev) => prev.filter((_, index) => index !== targetIndex));
  };

  const openEditModal = () => {
    if (!selectedProduct || !isOwnProduct) return;
    setEditTitle(selectedProduct.title);
    setEditDesc(selectedProduct.desc);
    setEditCategory(selectedProduct.category);
    setEditMinBid(String(selectedProduct.minBid));
    setEditImagesText(selectedProduct.images.join("\n"));
    const remainDays = selectedProduct.endAt
      ? Math.max(1, Math.min(30, Math.ceil((selectedProduct.endAt - Date.now()) / DAY_MS)))
      : 1;
    setEditEndDays(String(remainDays));
    setEditOpen(true);
  };

  const closeEditModal = () => {
    setEditOpen(false);
    setEditTitle("");
    setEditDesc("");
    setEditCategory("디지털/가전");
    setEditMinBid("1000");
    setEditEndDays("1");
    setEditImagesText("");
  };

  const handleUpdateProduct = async () => {
    if (!selectedProduct || !currentUser || !isOwnProduct) return;
    const currentEditCount = selectedProduct.editCount ?? 0;
    if (currentEditCount >= 2) {
      alert("상품 수정은 최대 2회까지 가능합니다.");
      return;
    }
    if (!editTitle.trim() || !editDesc.trim() || !editMinBid.trim()) {
      alert("상품명, 설명, 입찰단위는 필수입니다.");
      return;
    }
    const minBid = Number(editMinBid);
    if (!minBid || minBid < 1000 || minBid % 1000 !== 0) {
      alert("입찰 단위는 1,000원 이상이며 1,000원 단위로 입력해주세요.");
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
        images: imageList,
        editCount: currentEditCount + 1,
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
      const urlsToDelete = [
        ...(selectedProduct.images || []),
        ...(selectedProduct.thumbnailImages || []),
      ];
      for (const url of urlsToDelete) {
        try {
          // Storage 다운로드 URL을 직접 참조로 변환해 삭제
          await deleteObject(ref(storage, url));
        } catch (imageDeleteError) {
          // 외부 이미지 URL이거나 이미 삭제된 경우는 무시하고 문서 삭제는 계속 진행
          console.warn("image delete skipped", imageDeleteError);
        }
      }
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
      <header className="bg-slate-950 px-4 py-4 text-white sm:px-6">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 lg:grid lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">온경매</div>
            <div className="flex items-center gap-4 text-sm lg:hidden">
              <button
                className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700"
                onClick={openRegisterModal}
              >
                상품등록
              </button>
              <button className="min-h-11 hover:underline">이용안내</button>
              <button className="min-h-11 hover:underline">고객센터</button>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-[620px] items-center gap-2">
          <input
            type="text"
            placeholder="상품명 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-black outline-none"
          />
          <button className="h-11 shrink-0 whitespace-nowrap rounded-lg bg-blue-600 px-4 text-sm font-bold hover:bg-blue-700">
            검색
          </button>
        </div>

          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <button
            className="hidden min-h-11 items-center rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700 lg:inline-flex"
            onClick={openRegisterModal}
          >
            상품등록
          </button>

          {currentUser ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex min-h-11 items-center rounded-lg bg-red-500 px-3 py-2 font-semibold text-white hover:bg-red-600"
                  onClick={handleLogout}
                >
                  로그아웃
                </button>
                <span className="font-semibold">{getMaskedName(currentUser)} 님</span>
              </div>
              <button
                className="min-h-11 text-xs text-gray-200 underline underline-offset-2 hover:text-white"
                onClick={handleEditPhone}
              >
                전화번호:{" "}
                {currentUserProfile?.phone
                  ? formatMaskedPhone(currentUserProfile.phone)
                  : "미등록(클릭하여 등록)"}
              </button>
            </>
          ) : (
            <button className="min-h-11 hover:underline" onClick={handleGoogleLogin}>
              구글 로그인
            </button>
          )}

          <button className="hidden min-h-11 hover:underline lg:inline-flex">이용안내</button>
          <button className="hidden min-h-11 hover:underline lg:inline-flex">고객센터</button>
        </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:grid-cols-[220px_1fr] lg:gap-5">
        <aside className="h-fit rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-2xl font-bold sm:mb-4 sm:text-3xl">카테고리</h2>

          <ul className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
            {categories.map((category) => {
              const active = selectedCategory === category;
              return (
                <li key={category} className="shrink-0 lg:shrink">
                  <button
                    onClick={() => setSelectedCategory(category)}
                    className={`w-full whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm transition lg:whitespace-normal ${
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

        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold sm:text-3xl">경매 상품</h2>
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">
                {filteredProducts.length}개
              </span>
            </div>

            <select className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm sm:w-auto">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {filteredProducts.map((product) => (
                <article
                  key={product.id}
                  onClick={() => openModal(product.id)}
                  className="cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:-translate-y-1 hover:shadow-lg"
                >
                  {product.thumbnailImages?.[0] ? (
                    <img
                      src={product.thumbnailImages[0]}
                      alt={product.title}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-gray-200 text-xs text-gray-500">
                      썸네일 없음
                    </div>
                  )}
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
                    {product.buyNowPrice ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleBuyNow(product.id);
                        }}
                        disabled={
                          isOwnedByCurrentUser(product, currentUser) ||
                          !!(product.endAt && product.endAt <= nowMs)
                        }
                        className={`w-full rounded-lg px-3 py-2 text-xs font-bold text-white ${
                          isOwnedByCurrentUser(product, currentUser) ||
                          !!(product.endAt && product.endAt <= nowMs)
                            ? "cursor-not-allowed bg-gray-400"
                            : "bg-purple-600 hover:bg-purple-700"
                        }`}
                      >
                        즉시구매 바로가기
                      </button>
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="relative grid h-[92vh] w-full grid-cols-1 overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-6xl sm:rounded-3xl lg:grid-cols-[1.3fr_0.8fr]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              className="absolute right-4 top-4 z-10 h-10 w-10 rounded-full bg-black/60 text-xl font-bold text-white"
            >
              ×
            </button>

            <div className="bg-slate-950 p-4 sm:p-5">
              <div
                className={`flex min-h-[260px] items-center justify-center overflow-hidden rounded-2xl bg-slate-900 p-3 sm:min-h-[420px] sm:p-4 ${
                  selectedImageZoom > 1
                    ? selectedImageDragging
                      ? "cursor-grabbing"
                      : "cursor-grab"
                    : "cursor-zoom-in"
                }`}
                onWheel={handleSelectedImageWheel}
                onMouseDown={handleSelectedImageMouseDown}
                onMouseMove={handleSelectedImageMouseMove}
                onMouseUp={handleSelectedImageMouseUp}
                onMouseLeave={handleSelectedImageMouseUp}
                onDoubleClick={handleSelectedImageDoubleClick}
              >
                <img
                  src={selectedProduct.images[selectedImageIndex]}
                  alt={selectedProduct.title}
                  draggable={false}
                  style={{
                    transform: `translate(${selectedImageOffset.x}px, ${selectedImageOffset.y}px) scale(${selectedImageZoom})`,
                    transition: selectedImageDragging ? "none" : "transform 120ms ease-out",
                  }}
                  className="max-h-[260px] w-auto max-w-full select-none object-contain sm:max-h-[420px]"
                />
              </div>
              <div className="mt-3 flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectedImageZoomOut}
                  className="rounded-md border border-slate-600 px-3 py-1.5 font-semibold text-white hover:bg-slate-800"
                >
                  -
                </button>
                <div className="min-w-14 text-center font-semibold text-slate-200">
                  {(selectedImageZoom * 100).toFixed(0)}%
                </div>
                <button
                  type="button"
                  onClick={handleSelectedImageZoomIn}
                  className="rounded-md border border-slate-600 px-3 py-1.5 font-semibold text-white hover:bg-slate-800"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={resetSelectedImageView}
                  className="rounded-md border border-slate-600 px-3 py-1.5 font-semibold text-white hover:bg-slate-800"
                >
                  Reset
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {selectedProduct.images.map((image, index) => (
                  <img
                    key={index}
                    src={image}
                    alt={`${selectedProduct.title}-${index}`}
                    onClick={() => {
                      setSelectedImageIndex(index);
                      resetSelectedImageView();
                    }}
                    className={`h-16 w-16 cursor-pointer rounded-xl border-2 object-cover sm:h-20 sm:w-20 ${
                      selectedImageIndex === index
                        ? "border-blue-500"
                        : "border-transparent"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="overflow-y-auto p-4 sm:p-6">
              <h3 className="mb-3 text-2xl font-bold sm:text-3xl">{selectedProduct.title}</h3>

              <div className="mb-4 text-3xl font-extrabold sm:text-4xl">
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
                <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={openEditModal}
                    disabled={(selectedProduct.editCount ?? 0) >= 2}
                    className="flex-1 rounded-lg bg-amber-500 px-4 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-gray-400"
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
              {isOwnProduct && (
                <div className="mb-4 text-xs text-gray-500">
                  수정 횟수: {selectedProduct.editCount ?? 0}/2
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
                      {selectedWillBuyNowByMinBid ? "즉시구매" : "즉시 입찰"}{" "}
                      <span className="font-bold text-blue-600">
                        {(
                          selectedWillBuyNowByMinBid
                            ? selectedProduct.buyNowPrice
                            : selectedProduct.price + selectedProduct.minBid
                        )?.toLocaleString()}
                        원
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
                    {(bidModeById[selectedProduct.id] || "min") === "min" &&
                    selectedWillBuyNowByMinBid
                      ? "즉시구매하기"
                      : "입찰하기"}
                  </button>
                  {selectedProduct.buyNowPrice ? (
                    <button
                      onClick={() => handleBuyNow(selectedProduct.id)}
                      disabled={isOwnProduct || isAuctionClosed}
                      className={`w-full rounded-lg px-4 py-3 text-sm font-bold text-white ${
                        isOwnProduct || isAuctionClosed
                          ? "cursor-not-allowed bg-gray-400"
                          : "bg-purple-600 hover:bg-purple-700"
                      }`}
                    >
                      즉시구매가 제시하기 ({selectedProduct.buyNowPrice.toLocaleString()}원)
                    </button>
                  ) : null}
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
                        {log.mode === "auto"
                          ? "자동입찰"
                          : log.mode === "buy_now"
                          ? "즉시구매"
                          : "즉시입찰"}{" "}
                        / +{log.bidAmount.toLocaleString()}원 / 현재가{" "}
                        {log.priceAfterBid.toLocaleString()}원
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
            className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
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

            <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row">
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
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6"
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
                  min={1000}
                  step={1000}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />

              <input
                type="text"
                value={`마감시간 고정 (현재: ${editEndDays}일 뒤 마감)`}
                readOnly
                className="w-full rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-600 outline-none"
              />

              <textarea
                placeholder={"이미지 URL 입력 (한 줄에 하나씩)\nhttps://...\nhttps://..."}
                value={editImagesText}
                onChange={(e) => setEditImagesText(e.target.value)}
                className="h-28 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
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
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-5 text-2xl font-bold">상품 등록</h3>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">상품명</label>
              <input
                type="text"
                placeholder="상품명"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">상품 설명</label>
              <textarea
                placeholder="상품 설명"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="h-28 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">카테고리</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              >
                {productCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                  시작가 / 입찰 단위
                </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="number"
                  placeholder="시작가"
                  value={newPrice}
                  onChange={(e) => {
                    const nextPrice = e.target.value;
                    setNewPrice(nextPrice);
                    const numericPrice = Number(nextPrice);
                    if (nextPrice.trim() && Number.isFinite(numericPrice) && numericPrice > 0) {
                      const currentBuyNow = Number(newBuyNowPrice);
                      const minBuyNow = numericPrice + 1000;
                      if (!currentBuyNow || currentBuyNow < minBuyNow) {
                        setNewBuyNowPrice(String(minBuyNow));
                      }
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
                  min={1000}
                  step={1000}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
                />
              </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">즉시구매가</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="number"
                  placeholder="즉시구매가 (시작가 + 1000)"
                  value={newBuyNowPrice}
                  onChange={(e) => {
                    const value = e.target.value;
                    const numericValue = Number(value);
                    if (value.trim() && Number.isFinite(numericValue)) {
                      const normalizedBuyNow = Math.max(
                        2000,
                        Math.floor(numericValue / 1000) * 1000
                      );
                      const currentBuyNow = Number(newBuyNowPrice) || 2000;
                      const currentBasePrice = Number(newPrice) || 1000;
                      const isDecrease = normalizedBuyNow < currentBuyNow;
                      const isLinked = currentBasePrice === currentBuyNow - 1000;
                      setNewBuyNowPrice(String(normalizedBuyNow));
                      if (isDecrease && isLinked) {
                        setNewPrice(String(normalizedBuyNow - 1000));
                      }
                    } else {
                      setNewBuyNowPrice(value);
                    }
                  }}
                  min={2000}
                  step={1000}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={handleDecreaseBuyNowPrice}
                  disabled={Number(newBuyNowPrice) <= 2000}
                  className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  -1000
                </button>
                <button
                  type="button"
                  onClick={handleIncreaseBuyNowPrice}
                  className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700"
                >
                  +1000
                </button>
              </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">마감일</label>
              <select
                value={newEndDays}
                onChange={(e) => setNewEndDays(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              >
                {[1, 3, 5, 7].map((day) => (
                  <option key={day} value={String(day)}>
                    {day}일 뒤 마감
                  </option>
                ))}
              </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">이미지 URL</label>
              <textarea
                placeholder={"이미지 URL 입력 (한 줄에 하나씩)\nhttps://...\nhttps://..."}
                value={newImagesText}
                onChange={(e) => setNewImagesText(e.target.value)}
                className="h-28 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none"
              />
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-700">
                  <span>또는 PC 이미지 업로드</span>
                  <span>
                    {selectedImageCount}/{MAX_PRODUCT_IMAGES}장
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={reachedMaxProductImages}
                  onChange={(e) => setNewImageFiles(Array.from(e.target.files ?? []))}
                  className="w-full text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
                {reachedMaxProductImages ? (
                  <div className="mt-2 text-xs font-semibold text-red-600">
                    상품 이미지는 최대 5장까지 등록할 수 있습니다.
                  </div>
                ) : null}
                {newImagePreviewUrls.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {newImagePreviewUrls.map((previewUrl, index) => (
                      <div
                        key={`${previewUrl}-${index}`}
                        className="relative overflow-hidden rounded-lg border"
                      >
                        <img
                          src={previewUrl}
                          alt={`업로드 미리보기 ${index + 1}`}
                          className="h-20 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveNewImageFile(index)}
                          className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-bold text-white hover:bg-black"
                          aria-label={`미리보기 ${index + 1} 삭제`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
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