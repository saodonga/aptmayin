import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@prisma/client';

// 1. PATCH: Cập nhật thông tin người dùng (chỉ dành cho ADMIN)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    const { id } = await params;
    const { role, pageQuota } = await req.json();

    const targetUser = await db.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'Không tìm thấy người dùng!' }, { status: 404 });
    }

    // Bảo vệ các email admin mặc định
    const protectedEmails = process.env.ADMIN_EMAILS
      ? process.env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase())
      : [];

    if (protectedEmails.includes(targetUser.email.toLowerCase())) {
      if (role && role !== Role.ADMIN) {
        return NextResponse.json(
          { error: 'Tài khoản quản trị viên hệ thống được bảo vệ và không thể hạ cấp vai trò!' },
          { status: 403 }
        );
      }
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: {
        ...(role && { role }),
        ...(typeof pageQuota === 'number' && { pageQuota }),
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}

// 2. DELETE: Xóa người dùng khỏi hệ thống (chỉ dành cho ADMIN)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    const { id } = await params;
    const targetUser = await db.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'Không tìm thấy người dùng!' }, { status: 404 });
    }

    // Bảo vệ các email admin mặc định không cho phép xóa
    const protectedEmails = process.env.ADMIN_EMAILS
      ? process.env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase())
      : [];

    if (protectedEmails.includes(targetUser.email.toLowerCase())) {
      return NextResponse.json(
        { error: 'Tài khoản quản trị viên hệ thống được bảo vệ và không thể bị xóa!' },
        { status: 403 }
      );
    }

    await db.user.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Đã xóa người dùng thành công.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
