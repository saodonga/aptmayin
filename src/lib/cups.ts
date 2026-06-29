/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CUPS/IPP helper module.
 *
 * WHY NOT USE THE `ipp` LIBRARY FOR SERIALIZATION?
 * The `ipp` npm package only knows RFC-2911 standard attributes and throws
 * "Unknown attribute: <name>" for any CUPS-specific extension attribute
 * (device-uri, ppd-name, device-class, etc.) when serializing.
 * To avoid this, all IPP packets are constructed manually here, following
 * RFC 2910 (IPP/1.1 Encoding and Transport) wire format rules.
 * The `ipp` library is still used ONLY for parsing binary responses,
 * because the parser reads bytes as-is without a registry check.
 */
import http from 'http';
import ipp from 'ipp';

// ─── IPP value-tag constants (RFC 2910 §3.5.2) ───────────────────────────────
const T_CHARSET  = 0x47; // charset
const T_LANG     = 0x48; // naturalLanguage
const T_NAME     = 0x42; // nameWithoutLanguage
const T_KEYWORD  = 0x44; // keyword
const T_URI      = 0x45; // uri
const T_BOOL     = 0x22; // boolean
const T_ENUM     = 0x23; // enum (4-byte integer)

// ─── IPP attribute-group tags (RFC 2910 §3.5.1) ──────────────────────────────
const GRP_OPERATION = Buffer.from([0x01]); // operation-attributes-tag
const GRP_PRINTER   = Buffer.from([0x04]); // printer-attributes-tag
const GRP_END       = Buffer.from([0x03]); // end-of-attributes-tag

// ─── Low-level binary helpers ─────────────────────────────────────────────────

/** Encode an IPP attribute with a string-typed value (uri, keyword, name, charset, naturalLanguage). */
function attrStr(tag: number, name: string, value: string): Buffer {
  const nb = Buffer.from(name, 'utf8');
  const vb = Buffer.from(value, 'utf8');
  const out = Buffer.allocUnsafe(1 + 2 + nb.length + 2 + vb.length);
  let o = 0;
  out[o++] = tag;
  out.writeUInt16BE(nb.length, o); o += 2;
  nb.copy(out, o); o += nb.length;
  out.writeUInt16BE(vb.length, o); o += 2;
  vb.copy(out, o);
  return out;
}

/** Encode an IPP boolean attribute. */
function attrBool(name: string, value: boolean): Buffer {
  const nb = Buffer.from(name, 'utf8');
  const out = Buffer.allocUnsafe(1 + 2 + nb.length + 2 + 1);
  let o = 0;
  out[o++] = T_BOOL;
  out.writeUInt16BE(nb.length, o); o += 2;
  nb.copy(out, o); o += nb.length;
  out.writeUInt16BE(1, o); o += 2;
  out[o] = value ? 0x01 : 0x00;
  return out;
}

/** Encode an IPP enum attribute (4-byte big-endian integer). */
function attrEnum(name: string, value: number): Buffer {
  const nb = Buffer.from(name, 'utf8');
  const out = Buffer.allocUnsafe(1 + 2 + nb.length + 2 + 4);
  let o = 0;
  out[o++] = T_ENUM;
  out.writeUInt16BE(nb.length, o); o += 2;
  nb.copy(out, o); o += nb.length;
  out.writeUInt16BE(4, o); o += 2;
  out.writeInt32BE(value, o);
  return out;
}

/** Build the mandatory IPP header (8 bytes) + operation-attributes preamble. */
function opAttrsHeader(opId: number, reqId: number, username: string, printerUri?: string): Buffer {
  const hdr = Buffer.allocUnsafe(8);
  hdr.writeUInt16BE(0x0200, 0); // IPP/2.0
  hdr.writeUInt16BE(opId, 2);
  hdr.writeInt32BE(reqId, 4);

  const parts: Buffer[] = [
    hdr,
    GRP_OPERATION,
    attrStr(T_CHARSET,  'attributes-charset',          'utf-8'),
    attrStr(T_LANG,     'attributes-natural-language', 'en-us'),
    attrStr(T_NAME,     'requesting-user-name',        username),
  ];
  if (printerUri) parts.push(attrStr(T_URI, 'printer-uri', printerUri));
  return Buffer.concat(parts);
}

let _reqId = 1;
const nextId = () => _reqId++;

// ─── IPP Packet Builders ──────────────────────────────────────────────────────

/** CUPS-Add-Modify-Printer (0x4003) */
function buildAddPrinter(
  username: string,
  printerUri: string,
  deviceUri: string,
  ppdName: string
): Buffer {
  return Buffer.concat([
    opAttrsHeader(0x4003, nextId(), username, printerUri),
    GRP_PRINTER,
    attrStr(T_URI,     'device-uri',               deviceUri),
    attrStr(T_KEYWORD, 'ppd-name',                 ppdName),
    attrBool('printer-is-accepting-jobs', true),
    attrEnum('printer-state', 3), // 3 = idle
    GRP_END,
  ]);
}

/** CUPS-Delete-Printer (0x4004) */
function buildDeletePrinter(username: string, printerUri: string): Buffer {
  return Buffer.concat([
    opAttrsHeader(0x4004, nextId(), username, printerUri),
    GRP_END,
  ]);
}

/**
 * CUPS-Get-Devices (0x400B).
 * NOTE: We intentionally do NOT include a device-class filter here because
 * some CUPS versions reject the device-class operation attribute with
 * client-error-bad-request (0x0400). Returning all devices and filtering
 * in application code is safer.
 */
function buildGetDevices(username: string): Buffer {
  return Buffer.concat([
    opAttrsHeader(0x400B, nextId(), username),
    GRP_END,
  ]);
}

// ─── HTTP Transport ───────────────────────────────────────────────────────────

interface IppResult {
  httpStatus: number;
  ippStatus: number;  // 0x0000–0x00FF = success
  body: any;
}

/**
 * POST an IPP packet to CUPS via HTTP and return parsed response.
 * Timeout is controlled by the CUPS_TIMEOUT_MS environment variable (default 8000ms).
 */
async function cupsRequest(
  cupsHost: string,
  path: string,
  packet: Buffer
): Promise<IppResult> {
  const [hostname, portStr] = cupsHost.split(':');
  const port = portStr ? parseInt(portStr, 10) : 631;
  const timeoutMs = parseInt(process.env.CUPS_TIMEOUT_MS || '8000', 10);

  return new Promise<IppResult>((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname, port, path, method: 'POST',
      family: 4, // Force IPv4 to prevent AggregateError in Node 18+ (IPv6 try first)
      headers: {
        'Content-Type': 'application/ipp',
        'Content-Length': packet.length,
      },
    };

    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) { settled = true; fn(); }
    };

    const req = http.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        const data = Buffer.concat(chunks);
        let ippStatus = -1;
        let body: any = {};
        if (data.length >= 4) {
          ippStatus = data.readUInt16BE(2);
          try { body = (ipp as any).parse(data); } catch { /* ignore parse errors */ }
        }
        settle(() => resolve({ httpStatus: res.statusCode ?? 0, ippStatus, body }));
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      settle(() => reject(err));
    });

    const timer = setTimeout(() => {
      req.destroy(new Error(`CUPS request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    req.write(packet);
    req.end();
  });
}

// ─── Config ───────────────────────────────────────────────────────────────────

/** CUPS host (default: service name inside Docker network) */
function getCupsHost(): string {
  return process.env.CUPS_SERVER_HOST || 'cups-server:631';
}

/** IPP caller name embedded in packet for CUPS audit log */
const CUPS_CALLER = 'cups-app';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ensure the printer queue exists in CUPS and return the final ipp:// URI.
 * If connection already points to a /printers/ path, returns it unchanged.
 */
export async function ensureCupsPrinterQueue(name: string, connection: string): Promise<string> {
  if (connection.includes('/printers/')) return connection;

  const cupsHost = process.env.CUPS_SERVER_HOST || 'cups-server:631';
  const targetUri = `ipp://${cupsHost}/printers/${name}`;

  if (process.env.MOCK_PRINTING === 'true') return targetUri;

  const isIppProto = /^(ipp|ipps|http|https):\/\//.test(connection);
  let ppdName = 'raw';

  if (isIppProto) {
    ppdName = 'everywhere'; // Driverless IPP
  } else {
    // Tự động suy luận driver cho USB / Socket (không dùng raw vì raw không xử lý được file PDF)
    const lowerName = (name + connection).toLowerCase();
    if (lowerName.includes('laserjet') || lowerName.includes('hp')) {
      ppdName = 'drv:///sample.drv/laserjet.ppd'; // Generic PCL cho HP
    } else {
      ppdName = 'drv:///sample.drv/generic.ppd';  // Generic PostScript
    }
  }

  try {
    const host = getCupsHost();
    console.log(`[CUPS] Add-Printer "${name}" device-uri="${connection}" ppd="${ppdName}"`);
    const packet = buildAddPrinter(CUPS_CALLER, targetUri, connection, ppdName);
    const res    = await cupsRequest(host, '/admin/', packet);
    console.log(`[CUPS] Add-Printer response: HTTP ${res.httpStatus}, IPP 0x${res.ippStatus.toString(16)}`);
    if (res.httpStatus >= 400) {
      throw new Error(`HTTP ${res.httpStatus} từ CUPS server`);
    }
    if (res.ippStatus > 0x00FF) {
      throw new Error(`IPP lỗi 0x${res.ippStatus.toString(16)}`);
    }
  } catch (err: any) {
    console.error(`[CUPS] ensureCupsPrinterQueue failed for "${name}":`, err);
    throw new Error(
      `Không thể tự động cấu hình máy in trên CUPS Server! Chi tiết lỗi: ${err.message ?? String(err)}`
    );
  }

  return targetUri;
}

/**
 * Delete a printer queue from CUPS. Returns true on success or mock mode.
 */
export async function deleteCupsPrinterQueue(name: string): Promise<boolean> {
  if (process.env.MOCK_PRINTING === 'true') return true;

  const cupsHost  = process.env.CUPS_SERVER_HOST || 'cups-server:631';
  const printerUri = `ipp://${cupsHost}/printers/${name}`;

  try {
    const host = getCupsHost();
    console.log(`[CUPS] Delete-Printer "${name}"`);
    const packet = buildDeletePrinter(CUPS_CALLER, printerUri);
    const res    = await cupsRequest(host, '/admin/', packet);
    console.log(`[CUPS] Delete-Printer response: HTTP ${res.httpStatus}, IPP 0x${res.ippStatus.toString(16)}`);
    if (res.httpStatus >= 400) {
      throw new Error(`HTTP ${res.httpStatus} từ CUPS server`);
    }
    return true;
  } catch (err: any) {
    console.error(`[CUPS] deleteCupsPrinterQueue failed for "${name}":`, err);
    return false;
  }
}

/**
 * Discover local USB / physical devices from CUPS (CUPS-Get-Devices 0x400B).
 * Returns the raw printer-attributes-tag / device-attributes-tag array from the IPP response.
 *
 * FIX: Previously called '/' (root) – corrected to '/admin/' which is the
 * required CUPS administration endpoint for CUPS-Get-Devices.
 */
export async function cupsGetDevices(): Promise<any[]> {
  if (process.env.MOCK_PRINTING === 'true') return [];

  const host = getCupsHost();
  console.log(`[CUPS] Get-Devices`);
  const packet = buildGetDevices(CUPS_CALLER);
  // FIXED: was '/', must be '/admin/' for CUPS administration operations
  const res    = await cupsRequest(host, '/admin/', packet);
  console.log(`[CUPS] Get-Devices response: HTTP ${res.httpStatus}, IPP 0x${res.ippStatus.toString(16)}`);
  if (res.httpStatus >= 400) {
    throw new Error(`HTTP ${res.httpStatus} từ CUPS server`);
  }
  const tags = res.body?.['printer-attributes-tag'] ?? res.body?.['device-attributes-tag'] ?? [];
  return Array.isArray(tags) ? tags : [tags];
}
