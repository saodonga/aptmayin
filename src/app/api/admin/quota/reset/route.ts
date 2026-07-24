import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@prisma/client';
import { manualResetQuota } from '@/lib/quota';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/quota/reset
 * Body: { userId: string } | { all: true }
 *
 * Reset quota cho 1 user hoặc tất cả user.
 * Lưu usage hiện tại vào QuotaHistory trước khi reset.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền Admin!' }, { status: 403 });
    }

    const body = await req.json();

    if (body.all === true) {
      // Reset tất cả user
      const users = await db.user.findMany({ select: { id: true } });
      const results = await Promise.allSettled(
        users.map(u => manualResetQuota(u.id))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      return NextResponse.json({
        success: true,
        message: `Đã reset quota cho ${users.length - failed}/${users.length} user.`,
        failed,
      });
    }

    if (body.userId) {
      await manualResetQuota(body.userId);
      return NextResponse.json({ success: true, message: 'Đã reset quota thành công!' });
    }

    return NextResponse.json({ error: 'Thiếu userId hoặc all:true' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/quota/reset
 * Body: { userId: string, skipNextReset: true }
 *
 * Đặt flag để bỏ qua auto-reset tháng tới cho user cụ thể.
 */
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền Admin!' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.userId) {
      return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 });
    }

    await db.user.update({
      where: { id: body.userId },
      data: { skipNextReset: body.skipNextReset === true },
    });

    return NextResponse.json({
      success: true,
      message: body.skipNextReset
        ? 'Đã đặt giữ quota — không tự reset tháng tới.'
        : 'Đã bỏ flag giữ quota.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
