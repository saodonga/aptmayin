import { db } from './db';

/** Ngày 1 của tháng hiện tại lúc 00:00:00 UTC */
function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Kiểm tra và tự động reset quota nếu sang tháng mới.
 * Trả về user mới nhất từ DB (đã reset nếu cần).
 */
export async function checkAndResetQuota(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      pageQuota: true,
      pagesPrinted: true,
      totalPagesPrinted: true,
      quotaResetAt: true,
      skipNextReset: true,
    },
  });

  const now = new Date();
  const curYear  = now.getUTCFullYear();
  const curMonth = now.getUTCMonth() + 1; // 1-12

  const lastYear  = user.quotaResetAt?.getUTCFullYear() ?? null;
  const lastMonth = user.quotaResetAt ? user.quotaResetAt.getUTCMonth() + 1 : null;

  const isNewMonth =
    lastYear === null ||
    curYear > lastYear ||
    (curYear === lastYear && curMonth > lastMonth!);

  if (!isNewMonth) {
    // Return full user (consistent type with update branches)
    return db.user.findUniqueOrThrow({ where: { id: userId } });
  }

  // --- Tháng mới ---

  if (user.skipNextReset) {
    // Admin đã set flag giữ nguyên quota — bỏ qua reset lần này
    return db.user.update({
      where: { id: userId },
      data: { quotaResetAt: startOfCurrentMonth(), skipNextReset: false },
    });
  }

  // Lưu usage của tháng TRƯỚC vào QuotaHistory
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const prevYear  = curMonth === 1 ? curYear - 1 : curYear;

  await db.quotaHistory.upsert({
    where: { userId_year_month: { userId, year: prevYear, month: prevMonth } },
    create: {
      userId,
      year: prevYear,
      month: prevMonth,
      pagesPrinted: user.pagesPrinted,
      quota: user.pageQuota,
      resetAt: now,
    },
    update: {
      pagesPrinted: user.pagesPrinted,
      quota: user.pageQuota,
      resetAt: now,
    },
  });

  // Reset quota tháng này
  return db.user.update({
    where: { id: userId },
    data: { pagesPrinted: 0, quotaResetAt: startOfCurrentMonth() },
  });
}

/**
 * Admin reset thủ công cho một user.
 * Lưu usage hiện tại vào history trước khi reset.
 */
export async function manualResetQuota(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { pageQuota: true, pagesPrinted: true },
  });

  const now = new Date();
  const year  = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  await db.quotaHistory.upsert({
    where: { userId_year_month: { userId, year, month } },
    create: { userId, year, month, pagesPrinted: user.pagesPrinted, quota: user.pageQuota, resetAt: now },
    update: { pagesPrinted: user.pagesPrinted, quota: user.pageQuota, resetAt: now },
  });

  return db.user.update({
    where: { id: userId },
    data: { pagesPrinted: 0, quotaResetAt: now },
  });
}
