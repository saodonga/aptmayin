import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@prisma/client';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa xác thực!' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') === 'download' ? 'download' : 'view';

    const job = await db.printJob.findUnique({
      where: { id },
      select: { userId: true, fileName: true, savedFilePath: true },
    });

    if (!job) {
      return NextResponse.json({ error: 'Không tìm thấy lệnh in!' }, { status: 404 });
    }

    // Kiểm tra quyền: user chỉ xem file của mình, admin xem tất cả
    if (session.user.role !== Role.ADMIN && job.userId !== session.user.id) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    if (!job.savedFilePath) {
      return NextResponse.json({ error: 'File không tồn tại trên server!' }, { status: 404 });
    }

    // Kiểm tra file vật lý có tồn tại không
    if (!fs.existsSync(job.savedFilePath)) {
      return NextResponse.json({ error: 'File đã bị xóa khỏi server!' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(job.savedFilePath);
    const ext = path.extname(job.savedFilePath).toLowerCase();
    const isPdf = ext === '.pdf';
    const contentType = isPdf ? 'application/pdf' : 'application/octet-stream';

    // Tên file sạch để tải về (bỏ jobId prefix: "jobId_originalname.pdf")
    const rawName = path.basename(job.savedFilePath);
    const cleanName = rawName.replace(/^[a-f0-9-]{36}_/, '') || job.fileName;

    const disposition = action === 'download'
      ? `attachment; filename="${encodeURIComponent(cleanName)}"`
      : `inline; filename="${encodeURIComponent(cleanName)}"`;

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Content-Length': String(fileBuffer.length),
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (error: any) {
    console.error('[API file] Error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
