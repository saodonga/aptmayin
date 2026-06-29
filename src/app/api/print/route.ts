import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { PDFDocument } from 'pdf-lib';
import ipp from 'ipp';
import { JobStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

// 1. GET: Lấy danh sách máy in để hiển thị trên UI
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Chưa xác thực!' }, { status: 401 });
    }

    const printers = await db.printer.findMany({
      orderBy: { displayName: 'asc' },
    });
    return NextResponse.json(printers);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}

// 2. POST: Gửi file in và thông số cấu hình lên server
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Chưa xác thực!' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const printerId = formData.get('printerId') as string | null;
    const paperSize = (formData.get('paperSize') as string) || 'A4';
    const duplex = formData.get('duplex') === 'true';
    const colorMode = (formData.get('colorMode') as string) || 'GRAY';
    const copies = parseInt((formData.get('copies') as string) || '1', 10);

    if (!file || !printerId) {
      return NextResponse.json({ error: 'Thiếu thông tin file in hoặc máy in!' }, { status: 400 });
    }

    // Lấy thông tin máy in từ DB
    const printer = await db.printer.findUnique({
      where: { id: printerId },
    });

    if (!printer) {
      return NextResponse.json({ error: 'Không tìm thấy máy in được chọn!' }, { status: 404 });
    }

    // Đọc Buffer của file
    const arrayBuffer = await file.arrayBuffer();
    let fileBuffer = Buffer.from(arrayBuffer);
    let isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');

    // Chuyển đổi file nếu không phải PDF (dùng Gotenberg)
    if (!isPdf) {
      console.log(`[API Print] Converting ${file.name} to PDF via Gotenberg...`);
      const gotenbergUrl = process.env.GOTENBERG_URL || 'http://gotenberg:3000';
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      const convFormData = new FormData();
      // append the file as a Blob with the original name
      convFormData.append('files', new Blob([fileBuffer]), file.name);

      let endpoint = `${gotenbergUrl}/forms/libreoffice/convert/pdf`;
      // Nếu là html, markdown
      if (ext === 'html' || ext === 'md') {
        endpoint = `${gotenbergUrl}/forms/chromium/convert/html`;
        if (ext === 'md') endpoint = `${gotenbergUrl}/forms/chromium/convert/markdown`;
      }

      try {
        const convRes = await fetch(endpoint, {
          method: 'POST',
          body: convFormData,
        });

        if (!convRes.ok) {
          const errText = await convRes.text();
          console.error(`[API Print] Gotenberg error: ${errText}`);
          return NextResponse.json({ error: 'Lỗi khi chuyển đổi file sang PDF!' }, { status: 500 });
        }

        const pdfArrayBuffer = await convRes.arrayBuffer();
        fileBuffer = Buffer.from(pdfArrayBuffer);
        isPdf = true;
        console.log(`[API Print] Successfully converted ${file.name} to PDF (${fileBuffer.length} bytes)`);
      } catch (convErr) {
        console.error('[API Print] Gotenberg connection error:', convErr);
        return NextResponse.json({ error: 'Không thể kết nối đến máy chủ chuyển đổi file (Gotenberg)!' }, { status: 500 });
      }
    }

    // Tính toán số trang (Hỗ trợ PDF qua pdf-lib, các loại khác mặc định 1 trang)
    let pageCount = 1;
    if (isPdf) {
      try {
        const pdfDoc = await PDFDocument.load(fileBuffer);
        pageCount = pdfDoc.getPageCount();
      } catch (pdfError) {
        console.error('Lỗi đọc số trang PDF:', pdfError);
      }
    }

    const totalPages = pageCount * copies;

    // Lấy thông tin người dùng từ DB để kiểm tra hạn mức còn lại
    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Không tìm thấy thông tin người dùng!' }, { status: 404 });
    }

    if (user.pagesPrinted + totalPages > user.pageQuota) {
      return NextResponse.json(
        { error: `Vượt quá hạn mức in! Hạn mức còn lại trong tháng của bạn là ${user.pageQuota - user.pagesPrinted} trang.` },
        { status: 403 }
      );
    }

    // Tạo bản ghi log in ở trạng thái PROCESSING
    // Đối với file đã convert, lưu tên file gốc để lịch sử hiển thị đúng
    const job = await db.printJob.create({
      data: {
        userId: user.id,
        printerId: printer.id,
        fileName: file.name,
        fileSize: fileBuffer.length,
        pageCount: pageCount,
        copies: copies,
        totalPages: totalPages,
        paperSize: paperSize,
        duplex: duplex,
        colorMode: colorMode,
        status: JobStatus.PROCESSING,
      },
    });

    const mockMode = process.env.MOCK_PRINTING === 'true';

    // A. Chế độ Mock in ấn (Không cần máy in thật để phát triển/kiểm thử UI)
    if (mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Giả lập độ trễ

      await db.printJob.update({
        where: { id: job.id },
        data: { status: JobStatus.SUCCESS },
      });

      await db.user.update({
        where: { id: user.id },
        data: { pagesPrinted: { increment: totalPages } },
      });

      return NextResponse.json({ success: true, jobId: job.id, mock: true });
    }

    // B. Chế độ in CUPS thật qua cổng IPP
    console.log(`[API Print] Initiating Print-Job for printer ${printer.name}`);
    console.log(`[API Print] Connection string from DB: ${printer.connection}`);
    
    const targetHost = process.env.CUPS_SERVER_HOST || 'cups-server:631';
    let connUri = printer.connection;
    
    // Rewrite connection string dynamically based on environment config
    if (connUri.includes('cups-server:631')) {
      connUri = connUri.replace('cups-server:631', targetHost);
      console.log(`[API Print] Rewrote connection string to: ${connUri}`);
    } else if (connUri.includes('localhost:631/')) {
      connUri = connUri.replace('localhost:631', targetHost);
      console.log(`[API Print] Rewrote connection string to: ${connUri}`);
    } else if (connUri.includes('localhost:6315/')) {
      connUri = connUri.replace('localhost:6315', targetHost);
      console.log(`[API Print] Rewrote connection string to: ${connUri}`);
    } else if (connUri.includes('127.0.0.1:6315/')) {
      connUri = connUri.replace('127.0.0.1:6315', targetHost);
      console.log(`[API Print] Rewrote connection string to: ${connUri}`);
    }

    const cupsPrinter = ipp.Printer(connUri);
    const ippMsg = {
      'operation-attributes-tag': {
        'requesting-user-name': user.email,
        'document-format': 'application/pdf',
      },
      'job-attributes-tag': {
        media: paperSize === 'A3' ? 'iso_a3_297x420mm' : 'iso_a4_210x297mm',
        sides: duplex ? 'two-sided-long-edge' : 'one-sided',
        'print-color-mode': colorMode === 'COLOR' ? 'color' : 'monochrome',
        copies: copies,
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
      // Cập nhật trạng thái in thành công và số trang đã in của người dùng
      await db.printJob.update({
        where: { id: job.id },
        data: { status: JobStatus.SUCCESS },
      });

      await db.user.update({
        where: { id: user.id },
        data: { pagesPrinted: { increment: totalPages } },
      });

      return NextResponse.json({ success: true, jobId: job.id });
    } else {
      // Đánh dấu in lỗi và ghi log
      await db.printJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          errorLog: printResult.error,
        },
      });

      return NextResponse.json({ error: `Lỗi in ấn từ CUPS: ${printResult.error}` }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Lỗi API in ấn:', error);
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
