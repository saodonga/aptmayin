/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@prisma/client';
import { ensureCupsPrinterQueue } from '@/lib/cups';

// 1. GET: Lấy danh sách máy in đầy đủ cho quản trị
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    const printers = await db.printer.findMany({
      orderBy: { displayName: 'asc' },
    });
    return NextResponse.json(printers);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}

// 2. POST: Thêm máy in mới vào hệ thống
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    const { name, displayName, connection, isColor, isDuplex, location } = await req.json();

    if (!name || !displayName || !connection) {
      return NextResponse.json({ error: 'Thiếu thông tin máy in bắt buộc!' }, { status: 400 });
    }

    // Automate CUPS setup
    let finalConnection = connection;
    try {
      finalConnection = await ensureCupsPrinterQueue(name, connection);
    } catch (cupsErr: any) {
      return NextResponse.json({ error: cupsErr.message || 'Lỗi cấu hình CUPS!' }, { status: 500 });
    }

    const printer = await db.printer.create({
      data: {
        name,
        displayName,
        connection: finalConnection,
        isColor: !!isColor,
        isDuplex: !!isDuplex,
        location,
      },
    });

    return NextResponse.json({ success: true, printer });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
