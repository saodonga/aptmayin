import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@prisma/client';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    const users = await db.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const adminEmails = process.env.ADMIN_EMAILS
      ? process.env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase())
      : [];

    const usersWithProtection = users.map((u) => ({
      ...u,
      isProtected: adminEmails.includes(u.email.toLowerCase()),
    }));

    return NextResponse.json(usersWithProtection);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}

// 2. POST: Thêm người dùng mới (chỉ dành cho ADMIN)
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    const { email, name, role, pageQuota } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email là bắt buộc!' }, { status: 400 });
    }

    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'Người dùng với email này đã tồn tại!' }, { status: 400 });
    }

    const newUser = await db.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || null,
        role: role || Role.USER,
        pageQuota: typeof pageQuota === 'number' ? pageQuota : 100,
        pagesPrinted: 0,
      },
    });

    return NextResponse.json({ success: true, user: newUser });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
