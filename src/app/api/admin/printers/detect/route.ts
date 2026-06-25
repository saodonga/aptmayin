import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Role } from '@prisma/client';
import net from 'net';
import ipp from 'ipp';

export const dynamic = 'force-dynamic';

function checkPort(port: number, host: string, timeout = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isOpened = false;

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      isOpened = true;
      socket.destroy();
    });

    socket.on('timeout', () => {
      socket.destroy();
    });

    socket.on('error', () => {
      socket.destroy();
    });

    socket.on('close', () => {
      resolve(isOpened);
    });
  });
}

function getIppAttributes(ip: string): Promise<any> {
  return new Promise((resolve) => {
    // Try standard IPP printer paths
    const url = `ipp://${ip}/ipp/print`;
    const printer = ipp.Printer(url);
    const msg = {
      'operation-attributes-tag': {
        'requesting-user-name': 'admin',
        'requested-attributes': ['printer-make-and-model', 'color-supported', 'sides-supported'],
      },
    };

    printer.execute('Get-Printer-Attributes', msg, (err: any, res: any) => {
      if (err) {
        // Try fallback port 631 path
        const fallbackUrl = `ipp://${ip}:631/ipp/print`;
        const fallbackPrinter = ipp.Printer(fallbackUrl);
        fallbackPrinter.execute('Get-Printer-Attributes', msg, (err2: any, res2: any) => {
          if (err2) {
            resolve({ success: false, error: err2.message || String(err2) });
          } else {
            resolve({ success: true, attributes: res2['printer-attributes-tag'] });
          }
        });
      } else {
        resolve({ success: true, attributes: res['printer-attributes-tag'] });
      }
    });
  });
}

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

    // Clean IP string (remove http://, ipp://, sockets://, spaces)
    const cleanedIp = ip.replace(/^(https?:\/\/|ipp:\/\/|socket:\/\/)/, '').split('/')[0].split(':')[0].trim();

    // 1. Quét các cổng mạng
    const ports = [9100, 631, 515, 80, 443];
    const portResults: Record<number, boolean> = {};

    for (const port of ports) {
      portResults[port] = await checkPort(port, cleanedIp);
    }

    const isAnyPortOpen = Object.values(portResults).some((isOpen) => isOpen);

    if (!isAnyPortOpen) {
      return NextResponse.json({
        online: false,
        openPorts: [],
        message: `Không thể kết nối đến thiết bị tại IP ${cleanedIp}. Hãy đảm bảo thiết bị đang bật và kết nối cùng mạng LAN.`,
      });
    }

    // 2. Dò thông tin qua IPP nếu cổng 631 mở
    let ippDetails = null;
    if (portResults[631]) {
      const ippRes = await getIppAttributes(cleanedIp);
      if (ippRes.success && ippRes.attributes) {
        const attrs = ippRes.attributes;
        
        // Extract Model Name
        let model = 'Unknown Printer';
        if (attrs['printer-make-and-model']) {
          model = typeof attrs['printer-make-and-model'] === 'string'
            ? attrs['printer-make-and-model']
            : attrs['printer-make-and-model'].value || 'Unknown Printer';
        }

        // Extract Color support
        let color = false;
        if (attrs['color-supported'] !== undefined) {
          color = typeof attrs['color-supported'] === 'boolean'
            ? attrs['color-supported']
            : attrs['color-supported'].value === true || attrs['color-supported'] === 'true';
        }

        // Fallback color inference based on model name
        if (!color) {
          const modelLower = model.toLowerCase();
          if (
            modelLower.includes('color') ||
            modelLower.includes('colour') ||
            modelLower.includes('colorjet') ||
            /\b[a-z0-9]*(c|cdw)\b/.test(modelLower)
          ) {
            color = true;
          }
        }

        // Extract Duplex support
        let duplex = false;
        if (attrs['sides-supported']) {
          const sides = Array.isArray(attrs['sides-supported'])
            ? attrs['sides-supported']
            : [attrs['sides-supported']];
          
          const sidesStrings = sides.map(s => typeof s === 'string' ? s : s.value || String(s));
          duplex = sidesStrings.some(s => s.includes('two-sided-long-edge') || s.includes('two-sided-short-edge'));
        }

        // Fallback duplex inference based on model name
        if (!duplex) {
          const modelLower = model.toLowerCase();
          if (
            modelLower.includes('duplex') ||
            modelLower.includes('m404') ||
            modelLower.includes('m405') ||
            modelLower.includes('m402') ||
            modelLower.includes('m403') ||
            modelLower.includes('m506') ||
            modelLower.includes('m507') ||
            /\b[a-z0-9]+(dn|dw|dtn|dx)\b/.test(modelLower) ||
            /\b[a-z0-9]+-d[a-z]*\b/.test(modelLower)
          ) {
            duplex = true;
          }
        }

        ippDetails = { model, color, duplex };
      }
    }

    // 3. Đưa ra khuyến nghị
    let recommendedProtocol = 'Unknown';
    let recommendedUri = '';

    if (portResults[9100]) {
      recommendedProtocol = 'AppSocket/HP JetDirect';
      recommendedUri = `socket://${cleanedIp}:9100`;
    } else if (portResults[631]) {
      recommendedProtocol = 'IPP (Internet Printing Protocol)';
      recommendedUri = `ipp://${cleanedIp}/ipp/print`;
    } else if (portResults[515]) {
      recommendedProtocol = 'LPD (Line Printer Daemon)';
      recommendedUri = `lpd://${cleanedIp}/queue`;
    } else {
      recommendedProtocol = 'Generic HTTP';
      recommendedUri = `http://${cleanedIp}`;
    }

    return NextResponse.json({
      online: true,
      openPorts: Object.keys(portResults).filter(k => portResults[Number(k)]).map(Number),
      detectedProtocol: recommendedProtocol,
      recommendedConnection: recommendedUri,
      printerInfo: ippDetails ? {
        displayName: ippDetails.model,
        isColor: ippDetails.color,
        isDuplex: ippDetails.duplex
      } : null
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
