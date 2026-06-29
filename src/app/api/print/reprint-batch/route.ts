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

    const { batchId } = await req.json();
    if (!batchId) {
      return NextResponse.json({ error: 'Thiếu batchId' }, { status: 400 });
    }

    // 1. Lấy tất cả các Jobs trong batch
    const oldJobs = await db.printJob.findMany({
      where: { batchId: batchId, status: JobStatus.SUCCESS },
      include: { printer: true },
      orderBy: { createdAt: 'asc' }
    });

    if (oldJobs.length === 0) {
      return NextResponse.json({ error: 'Không tìm thấy file in thành công nào trong nhóm này!' }, { status: 404 });
    }

    // Tính tổng số trang cần thiết
    const totalPagesNeeded = oldJobs.reduce((sum, job) => sum + job.totalPages, 0);

    // 2. Kiểm tra người dùng và hạn mức
    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Không tìm thấy thông tin người dùng!' }, { status: 404 });
    }

    if (user.pagesPrinted + totalPagesNeeded > user.pageQuota) {
      return NextResponse.json(
        { error: `Vượt quá hạn mức in! Cần ${totalPagesNeeded} trang, nhưng hạn mức còn lại là ${user.pageQuota - user.pagesPrinted} trang.` },
        { status: 403 }
      );
    }

    // 3. Xử lý in lại tuần tự ở background
    reprintBatchInBackground(oldJobs, user.id, user.email || 'user@example.com');

    return NextResponse.json({ success: true, message: `Đã xếp hàng đợi in lại ${oldJobs.length} file.` });

  } catch (error: any) {
    console.error('Lỗi API reprint batch:', error);
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}

async function reprintBatchInBackground(oldJobs: any[], userId: string, userEmail: string) {
  const mockMode = process.env.MOCK_PRINTING === 'true';
  const crypto = require('crypto');
  const newBatchId = crypto.randomUUID();

  for (let i = 0; i < oldJobs.length; i++) {
    const oldJob = oldJobs[i];

    if (!oldJob.savedFilePath || !fs.existsSync(oldJob.savedFilePath)) {
      console.warn(`[Batch Reprint] File bị mất: ${oldJob.fileName}`);
      continue;
    }

    // Kiểm tra user có bị xóa/chặn không giữa chừng
    const userRefresh = await db.user.findUnique({ where: { id: userId } });
    if (!userRefresh) break; 
    
    if (userRefresh.pagesPrinted + oldJob.totalPages > userRefresh.pageQuota) {
      console.warn(`[Batch Reprint] Hết hạn mức giữa chừng cho user ${userId}`);
      break;
    }

    // Đọc file
    const fileBuffer = fs.readFileSync(oldJob.savedFilePath);

    // Tạo Job mới
    const newJob = await db.printJob.create({
      data: {
        userId: userId,
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
        savedFilePath: oldJob.savedFilePath, // Tái sử dụng file
        batchId: newBatchId, // Gán batch mới cho lượt in lại
        batchName: oldJob.batchName + ' (In lại)',
      },
    });

    if (mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await db.printJob.update({ where: { id: newJob.id }, data: { status: JobStatus.SUCCESS } });
      await db.user.update({ where: { id: userId }, data: { pagesPrinted: { increment: oldJob.totalPages } } });
      continue;
    }

    // Gửi lên CUPS
    try {
      const printer = oldJob.printer;
      const targetHost = process.env.CUPS_SERVER_HOST || 'cups-server:631';
      let connUri = printer.connection;
      
      if (connUri.includes('cups-server:631')) connUri = connUri.replace('cups-server:631', targetHost);
      else if (connUri.includes('localhost:631/')) connUri = connUri.replace('localhost:631', targetHost);
      else if (connUri.includes('localhost:6315/')) connUri = connUri.replace('localhost:6315', targetHost);
      else if (connUri.includes('127.0.0.1:6315/')) connUri = connUri.replace('127.0.0.1:6315', targetHost);

      const cupsPrinter = ipp.Printer(connUri);
      const ippMsg = {
        'operation-attributes-tag': {
          'requesting-user-name': userEmail,
          'document-format': 'application/pdf',
        },
        'job-attributes-tag': {
          'copies': oldJob.copies,
          'media': oldJob.paperSize,
          'sides': oldJob.duplex ? 'two-sided-long-edge' : 'one-sided',
          'print-color-mode': oldJob.colorMode === 'COLOR' ? 'color' : 'monochrome',
        },
        data: fileBuffer,
      };

      await new Promise((resolve, reject) => {
        cupsPrinter.execute('Print-Job', ippMsg, async function (err: any, res: any) {
          if (err) return reject(err);
          if (res.statusCode !== 'successful-ok') return reject(new Error(res.statusCode));
          
          await db.printJob.update({ where: { id: newJob.id }, data: { status: JobStatus.SUCCESS } });
          await db.user.update({ where: { id: userId }, data: { pagesPrinted: { increment: oldJob.totalPages } } });
          resolve(true);
        });
      });
      console.log(`[Batch Reprint] In thành công: ${oldJob.fileName}`);
    } catch (printErr: any) {
      console.error(`[Batch Reprint] Lỗi in file ${oldJob.fileName}:`, printErr);
      await db.printJob.update({
        where: { id: newJob.id },
        data: { status: JobStatus.FAILED, errorLog: printErr.message || 'Lỗi gửi tới máy in CUPS' },
      });
    }

    // Tạm dừng 3 giây trước khi in file tiếp theo trong batch
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
