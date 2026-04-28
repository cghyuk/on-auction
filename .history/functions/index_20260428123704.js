const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const REGISTER_FEE_POINT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRE_AFTER_END_MS = 5 * 60 * 1000;

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

function getTossSecretKey() {
  const secretKey = asTrimmedString(process.env.TOSS_SECRET_KEY);
  if (!secretKey) {
    throw new HttpsError(
      "failed-precondition",
      "서버에 TOSS_SECRET_KEY가 설정되지 않았습니다."
    );
  }
  return secretKey;
}

exports.createOrder = onCall({ region: "asia-northeast3" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "로그인 후 이용 가능합니다.");
  }

  const productId = asTrimmedString(request.data?.productId);
  if (!productId) {
    throw new HttpsError("invalid-argument", "상품 정보가 올바르지 않습니다.");
  }

  const productRef = db.collection("products").doc(productId);
  const productSnap = await productRef.get();
  if (!productSnap.exists) {
    throw new HttpsError("not-found", "상품이 존재하지 않습니다.");
  }

  const product = productSnap.data() || {};
  const buyNowPrice = Number(product.buyNowPrice || 0);
  const endAt = Number(product.endAt || 0);

  if (!buyNowPrice || buyNowPrice < 1000) {
    throw new HttpsError("failed-precondition", "즉시구매가가 없는 상품입니다.");
  }
  if (endAt && endAt <= Date.now()) {
    throw new HttpsError("failed-precondition", "이미 마감된 상품입니다.");
  }
  if (product.sellerUid && product.sellerUid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "본인 상품은 결제할 수 없습니다.");
  }

  const now = Date.now();
  const orderRef = db.collection("orders").doc();
  const orderName = `${asTrimmedString(product.title) || "경매 상품"} 즉시구매`;

  await orderRef.set({
    id: orderRef.id,
    uid: request.auth.uid,
    productId,
    amount: buyNowPrice,
    orderName,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  return {
    orderId: orderRef.id,
    amount: buyNowPrice,
    orderName,
  };
});

exports.confirmPayment = onCall({ region: "asia-northeast3" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "로그인 후 이용 가능합니다.");
  }

  const paymentKey = asTrimmedString(request.data?.paymentKey);
  const orderId = asTrimmedString(request.data?.orderId);
  const amount = Number(request.data?.amount);

  if (!paymentKey || !orderId || !amount) {
    throw new HttpsError("invalid-argument", "결제 승인 요청 값이 올바르지 않습니다.");
  }

  const orderRef = db.collection("orders").doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "주문 정보를 찾을 수 없습니다.");
  }

  const order = orderSnap.data() || {};
  if (order.uid !== request.auth.uid) {
    throw new HttpsError("permission-denied", "해당 주문에 대한 권한이 없습니다.");
  }
  if (Number(order.amount) !== amount) {
    throw new HttpsError("failed-precondition", "결제 금액 검증에 실패했습니다.");
  }
  if (order.status === "paid") {
    return { ok: true, alreadyPaid: true };
  }

  const secretKey = getTossSecretKey();
  const encodedSecret = Buffer.from(`${secretKey}:`).toString("base64");

  const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: `Basic ${encodedSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });

  const tossData = await tossRes.json();
  if (!tossRes.ok) {
    await orderRef.set(
      {
        status: "failed",
        failure: {
          code: asTrimmedString(tossData?.code),
          message: asTrimmedString(tossData?.message),
        },
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    throw new HttpsError(
      "failed-precondition",
      asTrimmedString(tossData?.message) || "토스 결제 승인에 실패했습니다."
    );
  }

  const now = Date.now();
  const paymentRef = db.collection("payments").doc(paymentKey);

  await db.runTransaction(async (tx) => {
    const freshOrderSnap = await tx.get(orderRef);
    if (!freshOrderSnap.exists) {
      throw new HttpsError("not-found", "주문 정보를 찾을 수 없습니다.");
    }
    const freshOrder = freshOrderSnap.data() || {};
    if (freshOrder.status === "paid") return;
    if (freshOrder.uid !== request.auth.uid) {
      throw new HttpsError("permission-denied", "해당 주문에 대한 권한이 없습니다.");
    }
    if (Number(freshOrder.amount) !== amount) {
      throw new HttpsError("failed-precondition", "결제 금액 검증에 실패했습니다.");
    }

    tx.set(
      orderRef,
      {
        status: "paid",
        paymentKey,
        method: asTrimmedString(tossData.method),
        approvedAt: asTrimmedString(tossData.approvedAt),
        updatedAt: now,
      },
      { merge: true }
    );

    tx.set(paymentRef, {
      paymentKey,
      orderId,
      uid: request.auth.uid,
      amount,
      method: asTrimmedString(tossData.method),
      approvedAt: asTrimmedString(tossData.approvedAt),
      rawResponse: tossData,
      createdAt: now,
    });
  });

  return {
    ok: true,
    orderId,
    paymentKey,
    approvedAt: asTrimmedString(tossData.approvedAt),
  };
});

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
    const images = Array.isArray(data.images)
      ? data.images.map((v) => asTrimmedString(v)).filter(Boolean)
      : [];

    if (!title || !desc || !category) {
      throw new HttpsError("invalid-argument", "상품명/설명/카테고리를 확인해주세요.");
    }
    if (!price || price < 1000 || price % 1000 !== 0) {
      throw new HttpsError("invalid-argument", "시작가는 1,000원 이상 1,000원 단위여야 합니다.");
    }
    if (!minBid || minBid < 500 || minBid % 500 !== 0) {
      throw new HttpsError("invalid-argument", "입찰 단위는 500원 이상 500원 단위여야 합니다.");
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
    if (!endDays || endDays < 1 || endDays > 30) {
      throw new HttpsError("invalid-argument", "마감일은 1~30일 사이여야 합니다.");
    }
    if (images.length === 0) {
      throw new HttpsError("invalid-argument", "이미지는 최소 1개 이상 필요합니다.");
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email || "";
    const now = Date.now();
    const endAt = now + endDays * DAY_MS;
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
