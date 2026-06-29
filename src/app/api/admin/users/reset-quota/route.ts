import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    // Reset pagesPrinted to 0 for all users
    const result = await db.user.updateMany({
      data: {
        pagesPrinted: 0,
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: `Đã reset hạn mức thành công cho ${result.count} người dùng.` 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
