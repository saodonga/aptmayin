import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@prisma/client';

// 1. PATCH: Cập nhật thông tin máy in (chỉ dành cho ADMIN)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, displayName, connection, isColor, isDuplex, location } = body;

    const targetPrinter = await db.printer.findUnique({
      where: { id },
    });

    if (!targetPrinter) {
      return NextResponse.json({ error: 'Không tìm thấy máy in!' }, { status: 404 });
    }

    // Nếu tên máy in CUPS thay đổi, kiểm tra tính duy nhất
    if (name && name !== targetPrinter.name) {
      const duplicatePrinter = await db.printer.findUnique({
        where: { name },
      });
      if (duplicatePrinter) {
        return NextResponse.json({ error: 'Tên máy in CUPS đã tồn tại!' }, { status: 400 });
      }
    }

    const updatedPrinter = await db.printer.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(displayName && { displayName }),
        ...(connection && { connection }),
        ...(location !== undefined && { location }),
        ...(isColor !== undefined && { isColor: !!isColor }),
        ...(isDuplex !== undefined && { isDuplex: !!isDuplex }),
      },
    });

    return NextResponse.json({ success: true, printer: updatedPrinter });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}

// 2. DELETE: Xóa máy in (chỉ dành cho ADMIN)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    const { id } = await params;

    const targetPrinter = await db.printer.findUnique({
      where: { id },
    });

    if (!targetPrinter) {
      return NextResponse.json({ error: 'Không tìm thấy máy in!' }, { status: 404 });
    }

    // Xóa tất cả các print jobs liên quan trước để tránh lỗi ràng buộc khóa ngoại
    await db.printJob.deleteMany({
      where: { printerId: id },
    });

    // Thực hiện xóa máy in
    await db.printer.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Đã xóa máy in thành công.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
