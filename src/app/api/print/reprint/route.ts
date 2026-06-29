import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import ipp from 'ipp';
import { JobStatus } from '@prisma/client';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Chưa xác thực!' }, { status: 401 });
    }

    const { jobId } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: 'Thiếu jobId' }, { status: 400 });
    }

    // 1. Lấy thông tin Job cũ
    const oldJob = await db.printJob.findUnique({
      where: { id: jobId },
      include: { printer: true }
    });

    if (!oldJob) {
      return NextResponse.json({ error: 'Không tìm thấy lịch sử in này!' }, { status: 404 });
    }

    if (!oldJob.savedFilePath || !fs.existsSync(oldJob.savedFilePath)) {
      return NextResponse.json({ error: 'File lưu trữ của lịch sử in này không còn tồn tại hoặc đã bị xóa.' }, { status: 404 });
    }

    // 2. Kiểm tra người dùng và hạn mức
    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Không tìm thấy thông tin người dùng!' }, { status: 404 });
    }

    if (user.pagesPrinted + oldJob.totalPages > user.pageQuota) {
      return NextResponse.json(
        { error: `Vượt quá hạn mức in! Hạn mức còn lại của bạn là ${user.pageQuota - user.pagesPrinted} trang.` },
        { status: 403 }
      );
    }

    // 3. Đọc file từ ổ cứng
    const fileBuffer = fs.readFileSync(oldJob.savedFilePath);

    // 4. Tạo Job mới cho lần in lại này
    const newJob = await db.printJob.create({
      data: {
        userId: user.id,
        printerId: oldJob.printerId,
        fileName: oldJob.fileName.replace(' (In lại)', '') + ' (In lại)',
        fileSize: oldJob.fileSize,
        pageCount: oldJob.pageCount,
        copies: oldJob.copies,
        totalPages: oldJob.totalPages,
        paperSize: oldJob.paperSize,
        duplex: oldJob.duplex,
        colorMode: oldJob.colorMode,
        status: JobStatus.PROCESSING,
        savedFilePath: oldJob.savedFilePath, // Trỏ về cùng 1 file vật lý
      },
    });

    const mockMode = process.env.MOCK_PRINTING === 'true';
    if (mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await db.printJob.update({ where: { id: newJob.id }, data: { status: JobStatus.SUCCESS } });
      await db.user.update({ where: { id: user.id }, data: { pagesPrinted: { increment: oldJob.totalPages } } });
      return NextResponse.json({ success: true, jobId: newJob.id, mock: true });
    }

    // 5. Gửi lệnh lên CUPS
    const printer = oldJob.printer;
    console.log(`[API Reprint] Initiating Print-Job for printer ${printer.name}`);
    
    const targetHost = process.env.CUPS_SERVER_HOST || 'cups-server:631';
    let connUri = printer.connection;
    
    if (connUri.includes('cups-server:631')) connUri = connUri.replace('cups-server:631', targetHost);
    else if (connUri.includes('localhost:631/')) connUri = connUri.replace('localhost:631', targetHost);
    else if (connUri.includes('localhost:6315/')) connUri = connUri.replace('localhost:6315', targetHost);
    else if (connUri.includes('127.0.0.1:6315/')) connUri = connUri.replace('127.0.0.1:6315', targetHost);

    const cupsPrinter = ipp.Printer(connUri);
    const ippMsg = {
      'operation-attributes-tag': {
        'requesting-user-name': user.email,
        'document-format': 'application/pdf', // File đã lưu chắc chắn là PDF
      },
      'job-attributes-tag': {
        media: oldJob.paperSize === 'A3' ? 'iso_a3_297x420mm' : 'iso_a4_210x297mm',
        sides: oldJob.duplex ? 'two-sided-long-edge' : 'one-sided',
        'print-color-mode': oldJob.colorMode === 'COLOR' ? 'color' : 'monochrome',
        copies: oldJob.copies,
      },
      data: fileBuffer,
    };

    const printResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      cupsPrinter.execute('Print-Job', ippMsg, (err: any, res: any) => {
        if (err) {
          resolve({ success: false, error: err.message || String(err) });
        } else {
          resolve({ success: true });
        }
      });
    });

    if (printResult.success) {
      await db.printJob.update({ where: { id: newJob.id }, data: { status: JobStatus.SUCCESS } });
      await db.user.update({ where: { id: user.id }, data: { pagesPrinted: { increment: oldJob.totalPages } } });
      return NextResponse.json({ success: true, jobId: newJob.id });
    } else {
      await db.printJob.update({
        where: { id: newJob.id },
        data: { status: JobStatus.FAILED, errorLog: printResult.error },
      });
      return NextResponse.json({ error: `Lỗi in ấn từ CUPS: ${printResult.error}` }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Lỗi API in lại:', error);
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
