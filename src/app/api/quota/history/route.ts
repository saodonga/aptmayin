import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa xác thực!' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getUTCFullYear()), 10);

    // Admin có thể xem của bất kỳ user nào, user thường chỉ xem của mình
    let targetUserId = session.user.id;
    if (session.user.role === Role.ADMIN && searchParams.get('userId')) {
      targetUserId = searchParams.get('userId')!;
    }

    // Lấy user hiện tại để biết quota + usage tháng hiện tại
    const user = await db.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        email: true,
        pageQuota: true,
        pagesPrinted: true,
        totalPagesPrinted: true,
        quotaResetAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Không tìm thấy user!' }, { status: 404 });
    }

    // Lấy lịch sử quota theo năm
    const history = await db.quotaHistory.findMany({
      where: { userId: targetUserId, year },
      orderBy: { month: 'asc' },
    });

    // Build 12 tháng đầy đủ (null cho tháng chưa có data)
    const now = new Date();
    const currentYear  = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    const months = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const record = history.find(h => h.month === month);

      // Tháng hiện tại: dùng data từ user (chưa kết thúc tháng)
      if (year === currentYear && month === currentMonth) {
        return {
          month,
          year,
          pagesPrinted: user.pagesPrinted,
          quota: user.pageQuota,
          isCurrent: true,
          hasData: true,
        };
      }

      // Tháng trong tương lai
      if (year > currentYear || (year === currentYear && month > currentMonth)) {
        return { month, year, pagesPrinted: null, quota: null, isCurrent: false, hasData: false };
      }

      // Tháng quá khứ
      return {
        month,
        year,
        pagesPrinted: record?.pagesPrinted ?? null,
        quota: record?.quota ?? null,
        isCurrent: false,
        hasData: !!record,
      };
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        currentQuota: user.pageQuota,
        currentMonthPrinted: user.pagesPrinted,
        totalPagesPrinted: user.totalPagesPrinted,
      },
      year,
      months,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
