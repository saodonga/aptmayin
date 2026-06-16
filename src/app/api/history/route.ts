import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Chưa xác thực!' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let jobs;
    if (session.user.role === Role.ADMIN) {
      // Admin xem tất cả các job in
      jobs = await db.printJob.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true } },
          printer: { select: { displayName: true } },
        },
      });
    } else {
      // User thường chỉ xem được job in của chính mình
      jobs = await db.printJob.findMany({
        where: { userId: session.user.id },
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          printer: { select: { displayName: true } },
        },
      });
    }

    return NextResponse.json(jobs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
