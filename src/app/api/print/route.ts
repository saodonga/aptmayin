import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { PDFDocument } from 'pdf-lib';
import ipp from 'ipp';
import { JobStatus, User, Printer } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

const DATA_DIR = process.env.DATA_DIR || '/app/data';

// Hàm helper để tạo thư mục lưu file và trả về đường dẫn vật lý
function saveFileToDisk(fileBuffer: Buffer, originalName: string, jobId: string): string {
  const yyyymm = new Date().toISOString().substring(0, 7);
  const targetDir = path.join(DATA_DIR, yyyymm);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  // Tên file lưu sẽ có dạng: jobId_filename.ext để tránh trùng lặp
  const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const filePath = path.join(targetDir, `${jobId}_${safeName}`);
  fs.writeFileSync(filePath, fileBuffer);
  return filePath;
}

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
    const pageFromRaw = formData.get('pageFrom');
    const pageToRaw = formData.get('pageTo');
    const pageFrom = pageFromRaw ? parseInt(pageFromRaw as string, 10) : undefined;
    const pageTo = pageToRaw ? parseInt(pageToRaw as string, 10) : undefined;

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

    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Không tìm thấy thông tin người dùng!' }, { status: 404 });
    }

    const isZip = file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

    if (isZip) {
      // XỬ LÝ BACKGROUND CHO ZIP
      const arrayBuffer = await file.arrayBuffer();
      const zipBuffer = Buffer.from(arrayBuffer);
      
      // Khởi chạy ngầm quá trình giải nén và in
      processZipInBackground(zipBuffer, file.name, {
        printer,
        user,
        paperSize,
        duplex,
        colorMode,
        copies,
        pageFrom,
        pageTo
      });

      return NextResponse.json({ 
        success: true, 
        message: 'Đã nhận file ZIP. Hệ thống đang tiến hành giải nén và đẩy từ từ vào hàng đợi in.' 
      });
    } else {
      // XỬ LÝ ĐƠN FILE ĐỒNG BỘ
      const arrayBuffer = await file.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);
      
      const result = await processAndPrintSingleFile(
        fileBuffer, 
        file.name, 
        file.type,
        { printer, user, paperSize, duplex, colorMode, copies, pageFrom, pageTo }
      );

      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status || 500 });
      }

      return NextResponse.json({ success: true, jobId: result.jobId, mock: result.mock });
    }

  } catch (error: any) {
    console.error('Lỗi API in ấn:', error);
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}

// ------------------------------------------------------------------------------------------
// BACKGROUND WORKER PROCESS (Dùng cho ZIP)
// ------------------------------------------------------------------------------------------
async function processZipInBackground(zipBuffer: Buffer, zipName: string, config: any) {
  try {
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();
    
    // Lọc ra các file hợp lệ (bỏ qua thư mục và file ẩn như .DS_Store)
    const validEntries = zipEntries.filter(entry => !entry.isDirectory && !entry.entryName.includes('__MACOSX') && !entry.name.startsWith('.'));

    const crypto = require('crypto');
    const batchId = crypto.randomUUID();
    config.batchId = batchId;
    config.batchName = zipName;

    console.log(`[ZIP Process] Bắt đầu xử lý ${validEntries.length} file từ ${zipName} (Batch: ${batchId})`);

    for (let i = 0; i < validEntries.length; i++) {
      const entry = validEntries[i];
      const fileBuffer = entry.getData();
      
      // Suy luận mimetype cơ bản từ đuôi file
      const ext = entry.name.split('.').pop()?.toLowerCase();
      let mimeType = 'application/octet-stream';
      if (ext === 'pdf') mimeType = 'application/pdf';
      else if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else if (ext === 'md' || ext === 'html') mimeType = 'text/html';

      console.log(`[ZIP Process] Đang in file ${i + 1}/${validEntries.length}: ${entry.name}`);
      
      const userRefresh = await db.user.findUnique({ where: { id: config.user.id } });
      if (!userRefresh) break; // User bị xóa giữa chừng
      
      // Update config user to latest quota stats
      config.user = userRefresh;

      await processAndPrintSingleFile(fileBuffer, entry.name, mimeType, config);

      // Tạm dừng 3 giây trước khi gửi file tiếp theo để hệ thống CUPS/Gotenberg không bị nghẽn
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log(`[ZIP Process] Hoàn tất xử lý file ZIP ${zipName}`);
  } catch (e) {
    console.error(`[ZIP Process] Lỗi xử lý ZIP ${zipName}:`, e);
  }
}

// ------------------------------------------------------------------------------------------
// SINGLE FILE PRINT LOGIC
// ------------------------------------------------------------------------------------------
async function processAndPrintSingleFile(
  originalBuffer: Buffer, 
  fileName: string, 
  mimeType: string, 
  config: { printer: Printer; user: User; paperSize: string; duplex: boolean; colorMode: string; copies: number; pageFrom?: number; pageTo?: number; batchId?: string; batchName?: string }
): Promise<{ success: boolean; jobId?: string; error?: string; status?: number; mock?: boolean }> {
  let fileBuffer = originalBuffer;
  let isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  const { printer, user, paperSize, duplex, colorMode, copies, pageFrom, pageTo } = config;

  // 1. Chuyển đổi file qua Gotenberg nếu không phải PDF
  if (!isPdf) {
    console.log(`[API Print] Converting ${fileName} to PDF via Gotenberg...`);
    const gotenbergUrl = process.env.GOTENBERG_URL || 'http://gotenberg:3000';
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    const convFormData = new FormData();
    convFormData.append('files', new Blob([new Uint8Array(fileBuffer)]), fileName);

    let endpoint = `${gotenbergUrl}/forms/libreoffice/convert`;
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
        return { success: false, error: 'Lỗi khi chuyển đổi file sang PDF!', status: 500 };
      }

      const pdfArrayBuffer = await convRes.arrayBuffer();
      fileBuffer = Buffer.from(pdfArrayBuffer);
      isPdf = true;
      console.log(`[API Print] Successfully converted ${fileName} to PDF (${fileBuffer.length} bytes)`);
    } catch (convErr) {
      console.error('[API Print] Gotenberg connection error:', convErr);
      return { success: false, error: 'Không thể kết nối đến máy chủ chuyển đổi file (Gotenberg)!', status: 500 };
    }
  }

  // 2. Tính toán số trang (bây giờ fileBuffer chắc chắn là PDF)
  let pageCount = 1;
  let originalPageCount = 1;
  if (isPdf) {
    try {
      const pdfDoc = await PDFDocument.load(fileBuffer);
      originalPageCount = pdfDoc.getPageCount();
      pageCount = originalPageCount;
    } catch (pdfError) {
      console.error('Lỗi đọc số trang PDF:', pdfError);
    }
  }

  let pageRangeString = null;
  if (pageFrom && pageTo) {
    const pFrom = Math.max(1, pageFrom);
    const pTo = Math.min(originalPageCount, pageTo);
    if (pTo >= pFrom) {
      pageCount = pTo - pFrom + 1;
      pageRangeString = `${pFrom}-${pTo}`;
    }
  }

  const totalPages = pageCount * copies;

  // 3. Kiểm tra Hạn mức (Quota)
  if (user.pagesPrinted + totalPages > user.pageQuota) {
    return { 
      success: false,
      error: `File ${fileName} vượt quá hạn mức in! (Cần ${totalPages} trang, còn ${user.pageQuota - user.pagesPrinted} trang)`, 
      status: 403 
    };
  }

  // 4. Khởi tạo Job trong DB
  // Tạm sinh jobId trước để dùng làm tiền tố lưu file
  const jobId = uuidv4();
  
  // 5. Lưu trữ file vật lý (fileBuffer lúc này là PDF hoàn thiện, hoặc file gốc nếu đã là PDF)
  let savedFilePath = null;
  try {
    savedFilePath = saveFileToDisk(fileBuffer, fileName, jobId);
  } catch (e) {
    console.error(`[API Print] Không thể lưu file đính kèm:`, e);
  }

  const job = await db.printJob.create({
    data: {
      id: jobId,
      userId: user.id,
      printerId: printer.id,
      fileName: fileName,
      fileSize: fileBuffer.length,
      pageCount: pageCount,
      copies: copies,
      totalPages: totalPages,
      paperSize: paperSize,
      duplex: duplex,
      colorMode: colorMode,
      status: JobStatus.PROCESSING,
      savedFilePath: savedFilePath,
      batchId: config.batchId || null,
      batchName: config.batchName || null,
      pageRange: pageRangeString,
    },
  });

  const mockMode = process.env.MOCK_PRINTING === 'true';

  // 6A. Chế độ Mock
  if (mockMode) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await db.printJob.update({ where: { id: job.id }, data: { status: JobStatus.SUCCESS } });
    await db.user.update({ where: { id: user.id }, data: { pagesPrinted: { increment: totalPages } } });
    return { success: true, jobId: job.id, mock: true };
  }

  // 6B. Chế độ in CUPS thật
  console.log(`[API Print] Initiating Print-Job for printer ${printer.name}`);
  
  const targetHost = process.env.CUPS_SERVER_HOST || 'cups-server:631';
  let connUri = printer.connection;
  
  if (connUri.includes('cups-server:631')) connUri = connUri.replace('cups-server:631', targetHost);
  else if (connUri.includes('localhost:631/')) connUri = connUri.replace('localhost:631', targetHost);
  else if (connUri.includes('localhost:6315/')) connUri = connUri.replace('localhost:6315', targetHost);
  else if (connUri.includes('127.0.0.1:6315/')) connUri = connUri.replace('127.0.0.1:6315', targetHost);

  const cupsPrinter = ipp.Printer(connUri);
  const ippMsg: any = {
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

  if (pageRangeString) {
    const parts = pageRangeString.split('-');
    ippMsg['job-attributes-tag']['page-ranges'] = [[parseInt(parts[0], 10), parseInt(parts[1], 10)]];
  }

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
    await db.printJob.update({ where: { id: job.id }, data: { status: JobStatus.SUCCESS } });
    await db.user.update({ where: { id: user.id }, data: { pagesPrinted: { increment: totalPages } } });
    return { success: true, jobId: job.id };
  } else {
    await db.printJob.update({
      where: { id: job.id },
      data: { status: JobStatus.FAILED, errorLog: printResult.error },
    });
    return { success: false, error: `Lỗi in ấn từ CUPS: ${printResult.error}`, status: 500 };
  }
}

