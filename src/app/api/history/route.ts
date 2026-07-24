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
    const page    = Math.max(1, parseInt(searchParams.get('page')  || '1',  10));
    const limit   = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const all     = searchParams.get('all') === 'true' && session.user.role === Role.ADMIN;
    const userId  = searchParams.get('userId'); // Admin filter by user

    const skip = all ? undefined : (page - 1) * limit;
    const take = all ? undefined : limit;

    const where = session.user.role === Role.ADMIN
      ? userId ? { userId } : {}          // Admin: lọc theo userId nếu có
      : { userId: session.user.id };       // User thường: chỉ thấy của mình

    const [jobs, total] = await Promise.all([
      db.printJob.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user:    { select: { name: true, email: true } },
          printer: { select: { displayName: true } },
        },
      }),
      db.printJob.count({ where }),
    ]);

    // Thêm flag hasFile để UI biết có thể view/download không
    const jobsWithFileFlag = jobs.map(job => ({
      ...job,
      hasFile: !!job.savedFilePath,
    }));

    if (all) {
      return NextResponse.json({ jobs: jobsWithFileFlag, total });
    }

    return NextResponse.json({
      jobs: jobsWithFileFlag,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
