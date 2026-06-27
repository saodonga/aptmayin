import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Role } from '@prisma/client';
import net from 'net';
import ipp from 'ipp';

export const dynamic = 'force-dynamic';

// ─── Constants ────────────────────────────────────────────────────────────────

/** IPP paths to probe in priority order. Different vendors use different paths. */
const IPP_PROBE_PATHS = [
  '/ipp/print',    // HP, Epson, most modern printers
  '/ipp/printer',  // Canon, some Kyocera models
  '/ipp/',         // Generic fallback
  '/printers/',    // Older CUPS-shared printers
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Test if a TCP port is open/reachable on the given host.
 * Returns true if the connection succeeds within the timeout.
 */
function checkPort(port: number, host: string, timeout = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isOpened = false;

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      isOpened = true;
      socket.destroy();
    });

    socket.on('timeout', () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.on('close', () => resolve(isOpened));
  });
}

interface IppProbeResult {
  success: boolean;
  path?: string;
  attributes?: Record<string, unknown>;
  error?: string;
}

/**
 * Probe an IP for IPP printer attributes.
 * Tries each path in IPP_PROBE_PATHS and returns on the first success.
 * Falls back from port 443 (ipps) → port 631 (ipp) automatically.
 * Enforces a hard timeout of IPP_TIMEOUT_MS per path to avoid hanging.
 */
function probeIppAttributes(ip: string, port: number): Promise<IppProbeResult> {
  const scheme = port === 443 ? 'ipps' : 'ipp';
  const timeoutMs = 5000;

  // Try each path sequentially, stop at first success
  const tryNext = (idx: number): Promise<IppProbeResult> => {
    if (idx >= IPP_PROBE_PATHS.length) {
      return Promise.resolve({ success: false, error: 'Không có path IPP nào phản hồi' });
    }

    const path = IPP_PROBE_PATHS[idx];
    const url  = `${scheme}://${ip}:${port}${path}`;
    const printer = (ipp as any).Printer(url);
    const msg = {
      'operation-attributes-tag': {
        'requesting-user-name': 'detect',
        'requested-attributes': [
          'printer-name',
          'printer-make-and-model',
          'color-supported',
          'sides-supported',
          'printer-state',
        ],
      },
    };

    return new Promise<IppProbeResult>((resolve) => {
      let settled = false;
      const done = (r: IppProbeResult) => { if (!settled) { settled = true; resolve(r); } };

      const timer = setTimeout(() => done({ success: false, error: `Timeout on ${path}` }), timeoutMs);

      printer.execute('Get-Printer-Attributes', msg, (err: any, res: any) => {
        clearTimeout(timer);
        if (err) {
          // Try next path
          tryNext(idx + 1).then(done);
        } else {
          const attrs = res?.['printer-attributes-tag'] ?? {};
          done({ success: true, path, attributes: attrs });
        }
      });
    });
  };

  return tryNext(0);
}

// ─── Attribute Parsers ────────────────────────────────────────────────────────

function extractString(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null && 'value' in val) {
    return String((val as any).value);
  }
  return String(val);
}

function extractBool(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'object' && 'value' in (val as any)) return Boolean((val as any).value);
  return val === 'true' || val === true;
}

function inferColorFromModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.includes('color') ||
    m.includes('colour') ||
    m.includes('colorjet') ||
    m.includes('inkjet') ||
    m.includes('deskjet') ||
    m.includes('pixma') ||
    m.includes('smart tank') ||
    /\bepson l\d/.test(m) ||
    /\b[a-z0-9]*(c|cdw)\b/.test(m)
  );
}

function inferDuplexFromModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.includes('duplex') ||
    /\bm40[2-9]\b/.test(m) ||
    /\bm5[01][0-9]\b/.test(m) ||
    /\b[a-z0-9]+(dn|dw|dtn|dx)\b/.test(m) ||
    /\b[a-z0-9]+-d[a-z]*\b/.test(m)
  );
}

function parsePrinterAttributes(attrs: Record<string, unknown>) {
  const model = extractString(attrs['printer-make-and-model']) || 'Unknown Printer';

  // Color
  let isColor = extractBool(attrs['color-supported']);
  if (!isColor) isColor = inferColorFromModel(model);

  // Duplex
  let isDuplex = false;
  const sides = attrs['sides-supported'];
  if (sides !== undefined) {
    const list = Array.isArray(sides) ? sides : [sides];
    const strings = list.map(s => extractString(s));
    isDuplex = strings.some(s => s.includes('two-sided-long-edge') || s.includes('two-sided-short-edge'));
  }
  if (!isDuplex) isDuplex = inferDuplexFromModel(model);

  return { model, isColor, isDuplex };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    const { ip } = await req.json();
    if (!ip || typeof ip !== 'string') {
      return NextResponse.json({ error: 'Địa chỉ IP không hợp lệ!' }, { status: 400 });
    }

    // Normalize: strip protocol prefix, port, and path
    const cleanedIp = ip
      .replace(/^(https?:\/\/|ipp:\/\/|ipps?:\/\/|socket:\/\/)/, '')
      .split('/')[0]
      .split(':')[0]
      .trim();

    if (!cleanedIp) {
      return NextResponse.json({ error: 'Không thể parse địa chỉ IP!' }, { status: 400 });
    }

    // ── 1. Port scanning ────────────────────────────────────────────────────
    const ports = [9100, 631, 515, 80, 443];
    const portResults: Record<number, boolean> = {};

    await Promise.all(
      ports.map(async (port) => {
        portResults[port] = await checkPort(port, cleanedIp);
      })
    );

    const openPorts = ports.filter(p => portResults[p]);

    if (openPorts.length === 0) {
      return NextResponse.json({
        online: false,
        openPorts: [],
        message: `Không thể kết nối đến thiết bị tại IP ${cleanedIp}. Hãy đảm bảo thiết bị đang bật và kết nối cùng mạng LAN.`,
      });
    }

    // ── 2. IPP probing ──────────────────────────────────────────────────────
    // Try IPP on port 631, fallback to 443 (ipps) if 631 not open
    let ippProbeResult: IppProbeResult | null = null;

    if (portResults[631]) {
      ippProbeResult = await probeIppAttributes(cleanedIp, 631);
    }

    // If IPP 631 failed or not open, try IPPS on 443
    if ((!ippProbeResult || !ippProbeResult.success) && portResults[443]) {
      ippProbeResult = await probeIppAttributes(cleanedIp, 443);
    }

    let printerInfo: { displayName: string; isColor: boolean; isDuplex: boolean } | null = null;
    let successfulIppPath: string | null = null;

    if (ippProbeResult?.success && ippProbeResult.attributes) {
      const parsed = parsePrinterAttributes(ippProbeResult.attributes);
      printerInfo = {
        displayName: parsed.model,
        isColor: parsed.isColor,
        isDuplex: parsed.isDuplex,
      };
      successfulIppPath = ippProbeResult.path ?? null;
    }

    // ── 3. Protocol recommendation ─────────────────────────────────────────
    // Priority: IPP (if responded) > AppSocket/9100 > LPD/515 > HTTP/80
    let recommendedProtocol = 'Unknown';
    let recommendedConnection = '';

    if (ippProbeResult?.success && (portResults[631] || portResults[443])) {
      // IPP responded successfully – use the confirmed working path
      const ippPort = portResults[631] ? 631 : 443;
      const ippScheme = ippPort === 443 ? 'ipps' : 'ipp';
      const ippPath = successfulIppPath ?? '/ipp/print';
      recommendedProtocol = 'IPP (Internet Printing Protocol)';
      recommendedConnection = `${ippScheme}://${cleanedIp}:${ippPort}${ippPath}`;
    } else if (portResults[9100]) {
      // AppSocket: fastest for raw/PostScript printing, no IPP overhead
      recommendedProtocol = 'AppSocket/HP JetDirect';
      recommendedConnection = `socket://${cleanedIp}:9100`;
    } else if (portResults[631]) {
      // IPP port open but did not respond to Get-Printer-Attributes – use default path
      recommendedProtocol = 'IPP (Internet Printing Protocol)';
      recommendedConnection = `ipp://${cleanedIp}:631/ipp/print`;
    } else if (portResults[515]) {
      recommendedProtocol = 'LPD (Line Printer Daemon)';
      recommendedConnection = `lpd://${cleanedIp}/queue`;
    } else if (portResults[80]) {
      recommendedProtocol = 'HTTP (Generic)';
      recommendedConnection = `http://${cleanedIp}`;
    } else if (portResults[443]) {
      recommendedProtocol = 'HTTPS / IPPS';
      recommendedConnection = `ipps://${cleanedIp}:443/ipp/print`;
    }

    return NextResponse.json({
      online: true,
      openPorts,
      detectedProtocol: recommendedProtocol,
      recommendedConnection,
      successfulIppPath,
      printerInfo,
    });

  } catch (error: any) {
    console.error('[DETECT]', error);
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
