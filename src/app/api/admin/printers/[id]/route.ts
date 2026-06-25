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

async function deleteCupsPrinterQueue(name: string): Promise<boolean> {
  const mockMode = process.env.MOCK_PRINTING === 'true';
  if (mockMode) return true;

  const cupsUser = process.env.CUPS_SERVER_USER || 'admin';
  const cupsPassword = process.env.CUPS_SERVER_PASSWORD || 'admin_secret';
  const cupsHost = process.env.CUPS_SERVER_HOST || 'cups-server:631';
  const url = `http://${cupsUser}:${cupsPassword}@${cupsHost}/admin/`;

  const printer = ipp.Printer(url);
  const msg = {
    'operation-attributes-tag': {
      'requesting-user-name': cupsUser,
      'printer-uri': `ipp://${cupsHost}/printers/${name}`
    }
  };

  return new Promise<boolean>((resolve) => {
    printer.execute(0x4004 as any, msg, (err: any) => {
      if (err) {
        console.error(`Error deleting printer ${name} from CUPS:`, err);
        // Fallback root retry
        const rootUrl = `http://root:${cupsPassword}@${cupsHost}/admin/`;
        const rootPrinter = ipp.Printer(rootUrl);
        const rootMsg = {
          'operation-attributes-tag': {
            'requesting-user-name': 'root',
            'printer-uri': `ipp://${cupsHost}/printers/${name}`
          }
        };

        rootPrinter.execute(0x4004 as any, rootMsg, (err2: any) => {
          if (err2) {
            console.error(`Fallback root error deleting from CUPS:`, err2);
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
}

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

    // Automate CUPS queue update if name or connection changes
    let finalConnection = connection;
    if (connection || name) {
      const targetName = name || targetPrinter.name;
      const targetConn = connection || targetPrinter.connection;
      try {
        finalConnection = await ensureCupsPrinterQueue(targetName, targetConn);
        
        // If the printer name changed, delete the old queue in CUPS
        if (name && name !== targetPrinter.name) {
          await deleteCupsPrinterQueue(targetPrinter.name);
        }
      } catch (cupsErr: any) {
        return NextResponse.json({ error: cupsErr.message || 'Lỗi cấu hình CUPS!' }, { status: 500 });
      }
    }

    const updatedPrinter = await db.printer.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(displayName && { displayName }),
        ...(finalConnection && { connection: finalConnection }),
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

    // Automatically delete queue from CUPS server
    await deleteCupsPrinterQueue(targetPrinter.name);

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
