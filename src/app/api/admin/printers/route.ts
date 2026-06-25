/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@prisma/client';
import ipp from 'ipp';

async function ensureCupsPrinterQueue(name: string, connection: string): Promise<string> {
  // If connection is already pointing to CUPS local queue, return it
  if (connection.includes('/printers/')) {
    return connection;
  }

  const mockMode = process.env.MOCK_PRINTING === 'true';
  const cupsHost = process.env.CUPS_SERVER_HOST || 'cups-server:631';
  const targetConnection = `ipp://${cupsHost}/printers/${name}`;

  if (mockMode) {
    return targetConnection;
  }

  const cupsUser = process.env.CUPS_SERVER_USER || 'admin';
  const cupsPassword = process.env.CUPS_SERVER_PASSWORD || 'admin_secret';
  const url = `http://${cupsUser}:${cupsPassword}@${cupsHost}/admin/`;

  const printer = ipp.Printer(url);
  const isIpp = connection.startsWith('ipp://') || connection.startsWith('ipps://') || connection.startsWith('http://') || connection.startsWith('https://');

  const msg = {
    'operation-attributes-tag': {
      'requesting-user-name': cupsUser,
      'printer-uri': targetConnection
    },
    'printer-attributes-tag': {
      'device-uri': connection,
      'printer-is-accepting-jobs': true,
      'printer-state': 3, // idle
      ...(isIpp ? { 'ppd-name': 'everywhere' } : { 'ppd-name': 'raw' })
    }
  };

  const success = await new Promise<boolean>((resolve) => {
    printer.execute(0x4003 as any, msg, (err: any) => {
      if (err) {
        console.error(`Error adding printer ${name} to CUPS:`, err);
        // Fallback root retry
        const rootUrl = `http://root:${cupsPassword}@${cupsHost}/admin/`;
        const rootPrinter = ipp.Printer(rootUrl);
        const rootMsg = {
          'operation-attributes-tag': {
            'requesting-user-name': 'root',
            'printer-uri': targetConnection
          },
          'printer-attributes-tag': {
            'device-uri': connection,
            'printer-is-accepting-jobs': true,
            'printer-state': 3,
            ...(isIpp ? { 'ppd-name': 'everywhere' } : { 'ppd-name': 'raw' })
          }
        };

        rootPrinter.execute(0x4003 as any, rootMsg, (err2: any) => {
          if (err2) {
            console.error(`Fallback root error:`, err2);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      } else {
        resolve(true);
      }
    });
  });

  if (!success) {
    throw new Error('Không thể tự động cấu hình máy in trên CUPS Server! Vui lòng cấu hình máy in CUPS thủ công.');
  }

  return targetConnection;
}

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
