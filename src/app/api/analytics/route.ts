import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa xác thực!' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from'); // ISO: "2026-01-01"
    const to   = searchParams.get('to');   // ISO: "2026-12-31"

    const isAdmin = session.user.role === Role.ADMIN;

    // Build date range filter
    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from + 'T00:00:00.000Z');
    if (to)   dateFilter.lte = new Date(to   + 'T23:59:59.999Z');

    const where: any = {
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      ...(!isAdmin ? { userId: session.user.id } : {}),
    };

    // Fetch all matching jobs (no pagination for analytics)
    const jobs = await db.printJob.findMany({
      where,
      select: {
        id: true,
        userId: true,
        printerId: true,
        totalPages: true,
        pageCount: true,
        copies: true,
        duplex: true,
        colorMode: true,
        status: true,
        paperSize: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        printer: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const successJobs = jobs.filter(j => j.status === 'SUCCESS');

    // --- Summary metrics ---
    const totalJobs        = jobs.length;
    const totalPages       = successJobs.reduce((s, j) => s + j.totalPages, 0);
    const failedJobs       = jobs.filter(j => j.status === 'FAILED').length;
    const duplexRate       = successJobs.length > 0
      ? Math.round((successJobs.filter(j => j.duplex).length / successJobs.length) * 100)
      : 0;
    const colorRate        = successJobs.length > 0
      ? Math.round((successJobs.filter(j => j.colorMode === 'COLOR').length / successJobs.length) * 100)
      : 0;
    const avgPagesPerJob   = successJobs.length > 0
      ? Math.round(totalPages / successJobs.length)
      : 0;

    // --- Per-user breakdown (admin only) ---
    const userMap: Record<string, {
      userId: string; name: string; email: string;
      jobCount: number; pageCount: number; failCount: number;
    }> = {};

    if (isAdmin) {
      for (const job of jobs) {
        if (!job.user) continue;
        const uid = job.user.id;
        if (!userMap[uid]) {
          userMap[uid] = {
            userId: uid,
            name: job.user.name ?? '(Vô danh)',
            email: job.user.email,
            jobCount: 0,
            pageCount: 0,
            failCount: 0,
          };
        }
        userMap[uid].jobCount++;
        if (job.status === 'SUCCESS') userMap[uid].pageCount += job.totalPages;
        if (job.status === 'FAILED')  userMap[uid].failCount++;
      }
    }

    const byUser = Object.values(userMap).sort((a, b) => b.pageCount - a.pageCount);

    // --- Per-printer breakdown ---
    const printerMap: Record<string, {
      printerId: string; displayName: string;
      jobCount: number; pageCount: number;
    }> = {};

    for (const job of successJobs) {
      if (!job.printer) continue;
      const pid = job.printer.id;
      if (!printerMap[pid]) {
        printerMap[pid] = { printerId: pid, displayName: job.printer.displayName, jobCount: 0, pageCount: 0 };
      }
      printerMap[pid].jobCount++;
      printerMap[pid].pageCount += job.totalPages;
    }

    const byPrinter = Object.values(printerMap).sort((a, b) => b.pageCount - a.pageCount);

    // --- By day (for chart, max 90 data points) ---
    const dayMap: Record<string, number> = {};
    for (const job of successJobs) {
      const day = job.createdAt.toISOString().substring(0, 10); // "2026-07-24"
      dayMap[day] = (dayMap[day] ?? 0) + job.totalPages;
    }

    // --- By month (for chart) ---
    const monthMap: Record<string, number> = {};
    for (const job of successJobs) {
      const ym = job.createdAt.toISOString().substring(0, 7); // "2026-07"
      monthMap[ym] = (monthMap[ym] ?? 0) + job.totalPages;
    }

    const byDay   = Object.entries(dayMap).sort(([a],[b]) => a.localeCompare(b))
      .map(([date, pages]) => ({ date, pages }));
    const byMonth = Object.entries(monthMap).sort(([a],[b]) => a.localeCompare(b))
      .map(([month, pages]) => ({ month, pages }));

    return NextResponse.json({
      summary: { totalJobs, totalPages, failedJobs, duplexRate, colorRate, avgPagesPerJob },
      byUser,
      byPrinter,
      byDay,
      byMonth,
      dateRange: { from: from ?? null, to: to ?? null },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
