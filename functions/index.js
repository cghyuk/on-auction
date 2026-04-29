const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();
const REGISTER_FEE_POINT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRE_AFTER_END_MS = 5 * 60 * 1000;
const MAX_PRODUCT_IMAGES = 5;

function getMaskedNameFromEmail(email) {
  if (!email || typeof email !== "string") return "회원";
  const id = email.split("@")[0] || "";
  if (id.length <= 1) return "*";
  if (id.length === 2) return `${id[0]}*`;
  return `${id[0]}${"*".repeat(id.length - 2)}${id[id.length - 1]}`;
}

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getStoragePathFromDownloadUrl(downloadUrl) {
  const url = asTrimmedString(downloadUrl);
  if (!url.includes("firebasestorage.googleapis.com")) return null;
  const marker = "/o/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;
  const encodedPath = url.slice(markerIndex + marker.length).split("?")[0];
  if (!encodedPath) return null;
  return decodeURIComponent(encodedPath);
}

async function deleteProductImagesByUrls(urls) {
  const normalized = Array.isArray(urls) ? urls : [];
  for (const rawUrl of normalized) {
    try {
      const path = getStoragePathFromDownloadUrl(rawUrl);
      if (!path) continue;
      await bucket.file(path).delete({ ignoreNotFound: true });
    } catch (error) {
      logger.warn("Failed to delete storage object for product", { rawUrl, error });
    }
  }
}

exports.createProductWithFee = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인 후 이용 가능합니다.");
    }

    const data = request.data || {};
    const title = asTrimmedString(data.title);
    const desc = asTrimmedString(data.desc);
    const category = asTrimmedString(data.category);
    const price = Number(data.price);
    const minBid = Number(data.minBid);
    const buyNowPrice = Number(data.buyNowPrice);
    const endDays = Number(data.endDays);
    const endMinutes = Number(data.endMinutes);
    const images = Array.isArray(data.images)
      ? data.images.map((v) => asTrimmedString(v)).filter(Boolean)
      : [];
    const thumbnailImages = Array.isArray(data.thumbnailImages)
      ? data.thumbnailImages.map((v) => asTrimmedString(v)).filter(Boolean)
      : [];

    if (!title || !desc || !category) {
      throw new HttpsError("invalid-argument", "상품명/설명/카테고리를 확인해주세요.");
    }
    if (!price || price < 1000 || price % 1000 !== 0) {
      throw new HttpsError("invalid-argument", "시작가는 1,000원 이상 1,000원 단위여야 합니다.");
    }
    if (!minBid || minBid < 1000 || minBid % 1000 !== 0) {
      throw new HttpsError(
        "invalid-argument",
        "입찰 단위는 1,000원 이상 1,000원 단위여야 합니다."
      );
    }
    if (
      !buyNowPrice ||
      buyNowPrice < 2000 ||
      buyNowPrice % 1000 !== 0 ||
      buyNowPrice < price + 1000
    ) {
      throw new HttpsError(
        "invalid-argument",
        "즉시구매가는 최소 2,000원이며 시작가보다 최소 1,000원 높아야 합니다."
      );
    }
    const hasMinuteEnd = Number.isFinite(endMinutes) && endMinutes > 0;
    const hasDayEnd = Number.isFinite(endDays) && endDays >= 1 && endDays <= 30;
    if (!hasMinuteEnd && !hasDayEnd) {
      throw new HttpsError("invalid-argument", "마감일은 1~30일 또는 테스트 1분이어야 합니다.");
    }
    if (hasMinuteEnd && endMinutes !== 1) {
      throw new HttpsError("invalid-argument", "테스트 분 단위 마감은 1분만 허용됩니다.");
    }
    if (images.length === 0) {
      throw new HttpsError("invalid-argument", "이미지는 최소 1개 이상 필요합니다.");
    }
    if (images.length > MAX_PRODUCT_IMAGES) {
      throw new HttpsError(
        "invalid-argument",
        `상품 이미지는 최대 ${MAX_PRODUCT_IMAGES}개까지 등록할 수 있습니다.`
      );
    }
    if (thumbnailImages.length > 0 && thumbnailImages.length !== images.length) {
      throw new HttpsError(
        "invalid-argument",
        "썸네일 이미지 수가 원본 이미지 수와 일치해야 합니다."
      );
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email || "";
    const now = Date.now();
    const endAt = hasMinuteEnd ? now + endMinutes * 60 * 1000 : now + endDays * DAY_MS;
    const expireAt = endAt + EXPIRE_AFTER_END_MS;
    const userRef = db.collection("users").doc(uid);
    const productRef = db.collection("products").doc();

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "회원 정보가 없습니다. 새로고침 후 다시 로그인해주세요."
        );
      }

      const userData = userSnap.data() || {};
      const currentPoint = Number(userData.point || 0);
      const phone = asTrimmedString(userData.phone);
      if (!phone) {
        throw new HttpsError("failed-precondition", "상품 등록 전 전화번호 등록이 필요합니다.");
      }
      if (currentPoint < REGISTER_FEE_POINT) {
        throw new HttpsError(
          "failed-precondition",
          `포인트가 부족합니다. 등록 수수료 ${REGISTER_FEE_POINT.toLocaleString()}P가 필요합니다.`
        );
      }

      tx.update(userRef, {
        point: currentPoint - REGISTER_FEE_POINT,
        updatedAt: now,
      });

      tx.set(productRef, {
        id: productRef.id,
        title,
        desc,
        price,
        buyNowPrice,
        seller: getMaskedNameFromEmail(email),
        sellerUid: uid,
        category,
        endText: "",
        endAt,
        expireAt,
        images,
        thumbnailImages: thumbnailImages.length > 0 ? thumbnailImages : images,
        minBid,
        highestBidder: "",
        bidCount: 0,
        likeCount: 0,
        viewCount: 0,
        editCount: 0,
        createdAt: now,
      });
    });

    return {
      ok: true,
      productId: productRef.id,
      chargedPoint: REGISTER_FEE_POINT,
    };
  }
);

exports.cleanupExpiredProducts = onSchedule(
  {
    schedule: "* * * * *",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
  },
  async () => {
    const now = Date.now();
    const expiredSnap = await db
      .collection("products")
      .where("expireAt", "<=", now)
      .limit(200)
      .get();

    if (expiredSnap.empty) {
      logger.info("No expired products to delete.");
      return;
    }

    for (const productDoc of expiredSnap.docs) {
      const productData = productDoc.data() || {};
      await deleteProductImagesByUrls([
        ...(productData.images || []),
        ...(productData.thumbnailImages || []),
      ]);

      const bidsSnap = await productDoc.ref.collection("bids").get();
      if (!bidsSnap.empty) {
        const bidBatch = db.batch();
        bidsSnap.docs.forEach((bidDoc) => bidBatch.delete(bidDoc.ref));
        await bidBatch.commit();
      }
      await productDoc.ref.delete();
    }

    logger.info("Expired products cleanup completed.", {
      deletedProducts: expiredSnap.size,
    });
  }
);
