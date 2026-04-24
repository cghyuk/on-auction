const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

exports.cleanupExpiredProducts = onSchedule(
  {
    schedule: "every day 03:00",
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
