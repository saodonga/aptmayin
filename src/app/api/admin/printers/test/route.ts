/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@prisma/client';
import net from 'net';
import ipp from 'ipp';

export const dynamic = 'force-dynamic';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function checkPort(host: string, port: number, timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let opened = false;
    socket.setTimeout(timeout);
    socket.connect(port, host, () => { opened = true; socket.destroy(); });
    socket.on('timeout', () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.on('close', () => resolve(opened));
  });
}

interface TestResult {
  ok: boolean;
  latencyMs: number;
  protocol: string;
  status?: string;
  model?: string;
  error?: string;
}

/**
 * Test a printer connection by sending an IPP Get-Printer-Attributes request.
 * For socket:// (AppSocket) connections we do a raw TCP connect test.
 */
async function testConnection(connectionUri: string): Promise<TestResult> {
  const t0 = Date.now();
  const timeoutMs = 6000;

  try {
    // ── AppSocket / JetDirect ─────────────────────────────────────────────
    const socketMatch = connectionUri.match(/^socket:\/\/([^/:]+):?(\d+)?/);
    if (socketMatch) {
      const host = socketMatch[1];
      const port = parseInt(socketMatch[2] || '9100', 10);
      const ok = await checkPort(host, port, timeoutMs);
      return {
        ok,
        latencyMs: Date.now() - t0,
        protocol: 'AppSocket/JetDirect',
        status: ok ? 'Reachable' : 'Unreachable',
        error: ok ? undefined : `Cổng ${port} tại ${host} không phản hồi`,
      };
    }

    // ── LPD ───────────────────────────────────────────────────────────────
    const lpdMatch = connectionUri.match(/^lpd:\/\/([^/:]+):?(\d+)?/);
    if (lpdMatch) {
      const host = lpdMatch[1];
      const port = parseInt(lpdMatch[2] || '515', 10);
      const ok = await checkPort(host, port, timeoutMs);
      return {
        ok,
        latencyMs: Date.now() - t0,
        protocol: 'LPD',
        status: ok ? 'Reachable' : 'Unreachable',
        error: ok ? undefined : `Cổng LPD ${port} tại ${host} không phản hồi`,
      };
    }

    // ── USB (usb://) ──────────────────────────────────────────────────────
    if (connectionUri.startsWith('usb://')) {
      // USB connections can't be probed remotely; assume online if registered
      return {
        ok: true,
        latencyMs: Date.now() - t0,
        protocol: 'USB',
        status: 'Local (cannot probe)',
      };
    }

    // ── CUPS IPP queue (ipp://cups-server/printers/xxx) ──────────────────
    if (connectionUri.includes('/printers/')) {
      const cupsHost = process.env.CUPS_SERVER_HOST || 'cups-server:631';
      const [h, ps] = cupsHost.split(':');
      const ok = await checkPort(h, parseInt(ps || '631', 10), timeoutMs);
      if (!ok) {
        return { ok: false, latencyMs: Date.now() - t0, protocol: 'CUPS/IPP', error: 'CUPS server không phản hồi' };
      }
      return await ippGetAttributes(connectionUri, t0, timeoutMs);
    }

    // ── Generic IPP / IPPS ────────────────────────────────────────────────
    if (/^(ipp|ipps|http|https):\/\//.test(connectionUri)) {
      return await ippGetAttributes(connectionUri, t0, timeoutMs);
    }

    return { ok: false, latencyMs: Date.now() - t0, protocol: 'Unknown', error: 'Không nhận ra định dạng URI kết nối' };

  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - t0, protocol: 'Unknown', error: err.message || String(err) };
  }
}

function ippGetAttributes(uri: string, t0: number, timeoutMs: number): Promise<TestResult> {
  return new Promise<TestResult>((resolve) => {
    let settled = false;
    const done = (r: TestResult) => { if (!settled) { settled = true; resolve(r); } };

    const timer = setTimeout(() => {
      done({ ok: false, latencyMs: Date.now() - t0, protocol: 'IPP', error: `IPP request timeout (${timeoutMs}ms)` });
    }, timeoutMs);

    const printer = (ipp as any).Printer(uri);
    const msg = {
      'operation-attributes-tag': {
        'requesting-user-name': 'test',
        'requested-attributes': ['printer-name', 'printer-state', 'printer-make-and-model'],
      },
    };

    printer.execute('Get-Printer-Attributes', msg, (err: any, res: any) => {
      clearTimeout(timer);
      if (err) {
        done({ ok: false, latencyMs: Date.now() - t0, protocol: 'IPP', error: err.message || String(err) });
        return;
      }

      const attrs = res?.['printer-attributes-tag'] ?? {};
      const stateVal = attrs['printer-state'];
      const stateNum = typeof stateVal === 'number' ? stateVal
        : (typeof stateVal === 'object' && stateVal && 'value' in stateVal) ? Number((stateVal as any).value) : null;

      const stateMap: Record<number, string> = { 3: 'Idle', 4: 'Processing', 5: 'Stopped' };
      const statusStr = stateNum !== null ? (stateMap[stateNum] ?? `State ${stateNum}`) : 'Online';

      const modelRaw = attrs['printer-make-and-model'];
      const model = modelRaw
        ? (typeof modelRaw === 'string' ? modelRaw : (modelRaw as any).value || '')
        : undefined;

      done({ ok: true, latencyMs: Date.now() - t0, protocol: 'IPP', status: statusStr, model });
    });
  });
}

// ─── Route Handler ────────────────────────────────────────────────────────────

/**
 * POST /api/admin/printers/test
 * Body: { printerId: string }
 * Returns: TestResult with latency, protocol, printer state
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    const body = await req.json();
    const { printerId } = body;

    if (!printerId) {
      return NextResponse.json({ error: 'Thiếu printerId!' }, { status: 400 });
    }

    const printer = await db.printer.findUnique({ where: { id: printerId } });
    if (!printer) {
      return NextResponse.json({ error: 'Không tìm thấy máy in!' }, { status: 404 });
    }

    if (process.env.MOCK_PRINTING === 'true') {
      await new Promise(r => setTimeout(r, 800));
      return NextResponse.json({
        ok: true,
        latencyMs: 42,
        protocol: 'Mock',
        status: 'Idle',
        model: printer.displayName,
        mock: true,
      });
    }

    const result = await testConnection(printer.connection);
    return NextResponse.json(result);

  } catch (err: any) {
    console.error('[TEST CONNECTION]', err);
    return NextResponse.json({ error: err.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
