import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Role } from '@prisma/client';
import ipp from 'ipp';

export const dynamic = 'force-dynamic';

function inferDuplexAndColorFromModel(model: string): { duplex: boolean; color: boolean } {
  const modelLower = model.toLowerCase();
  let duplex = false;
  let color = false;

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

  if (
    modelLower.includes('color') ||
    modelLower.includes('colour') ||
    modelLower.includes('colorjet') ||
    modelLower.includes('inkjet') ||
    modelLower.includes('deskjet') ||
    modelLower.includes('pixma') ||
    modelLower.includes('smart tank') ||
    modelLower.includes('epson l') ||
    /\b[a-z0-9]*(c|cdw)\b/.test(modelLower)
  ) {
    color = true;
  }

  return { duplex, color };
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Không có quyền truy cập!' }, { status: 403 });
    }

    const mockMode = process.env.MOCK_PRINTING === 'true';

    if (mockMode) {
      // Simulate delay for realistic frontend scan experience
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const mockPrinters = [
        {
          uri: 'usb://HP/LaserJet%20Pro%20M404dn?serial=PH123456',
          displayName: 'HP LaserJet Pro M404dn (USB)',
          isColor: false,
          isDuplex: true,
        },
        {
          uri: 'usb://Canon/LBP2900?serial=CN987654',
          displayName: 'Canon LBP2900 (USB)',
          isColor: false,
          isDuplex: false,
        },
        {
          uri: 'usb://Epson/L3110?serial=EP771122',
          displayName: 'Epson L3110 Series (USB)',
          isColor: true,
          isDuplex: false,
        }
      ];

      return NextResponse.json({ success: true, printers: mockPrinters, mock: true });
    }

    // CUPS server configuration
    const cupsUser = process.env.CUPS_SERVER_USER || 'admin';
    const cupsPassword = process.env.CUPS_SERVER_PASSWORD || 'admin_secret';
    const cupsHost = process.env.CUPS_SERVER_HOST || 'cups-server:631';
    const url = `http://${cupsUser}:${cupsPassword}@${cupsHost}/`;

    const printer = ipp.Printer(url);
    const msg = {
      'operation-attributes-tag': {
        'requesting-user-name': cupsUser,
        'device-class': 'local' // local queries restrict CUPS to physical/USB connections
      }
    };

    const cupsResult = await new Promise<{ success: boolean; printers?: any[]; error?: string }>((resolve) => {
      // 0x400B is CUPS-Get-Devices
      printer.execute(0x400B as any, msg, (err: any, res: any) => {
        if (err) {
          resolve({ success: false, error: err.message || String(err) });
          return;
        }

        const printerTags = res['printer-attributes-tag'] || res['device-attributes-tag'] || [];
        const tagsArray = Array.isArray(printerTags) ? printerTags : [printerTags];
        const usbPrinters: any[] = [];

        for (const tag of tagsArray) {
          if (!tag) continue;

          const getVal = (field: string) => {
            const f = tag[field];
            if (f === undefined || f === null) return '';
            return typeof f === 'object' && 'value' in f ? f.value : f;
          };

          const uri = getVal('device-uri') || getVal('uri');
          const info = getVal('device-info') || getVal('info') || getVal('device-make-and-model') || 'Unknown USB Printer';
          const makeAndModel = getVal('device-make-and-model') || info;
          const deviceClass = getVal('device-class') || '';

          if (uri && (uri.startsWith('usb://') || deviceClass === 'local')) {
            const inferred = inferDuplexAndColorFromModel(makeAndModel);
            usbPrinters.push({
              uri,
              displayName: info,
              isColor: inferred.color,
              isDuplex: inferred.duplex
            });
          }
        }

        resolve({ success: true, printers: usbPrinters });
      });
    });

    if (!cupsResult.success) {
      // If error, try a secondary user context fallback ('root') just in case
      const rootUrl = `http://root:${cupsPassword}@${cupsHost}/`;
      const rootPrinter = ipp.Printer(rootUrl);
      const rootMsg = {
        'operation-attributes-tag': {
          'requesting-user-name': 'root',
          'device-class': 'local'
        }
      };

      const fallbackResult = await new Promise<{ success: boolean; printers?: any[]; error?: string }>((resolve) => {
        rootPrinter.execute(0x400B as any, rootMsg, (err: any, res: any) => {
          if (err) {
            resolve({ success: false, error: err.message || String(err) });
            return;
          }

          const printerTags = res['printer-attributes-tag'] || res['device-attributes-tag'] || [];
          const tagsArray = Array.isArray(printerTags) ? printerTags : [printerTags];
          const usbPrinters: any[] = [];

          for (const tag of tagsArray) {
            if (!tag) continue;

            const getVal = (field: string) => {
              const f = tag[field];
              if (f === undefined || f === null) return '';
              return typeof f === 'object' && 'value' in f ? f.value : f;
            };

            const uri = getVal('device-uri') || getVal('uri');
            const info = getVal('device-info') || getVal('info') || getVal('device-make-and-model') || 'Unknown USB Printer';
            const makeAndModel = getVal('device-make-and-model') || info;
            const deviceClass = getVal('device-class') || '';

            if (uri && (uri.startsWith('usb://') || deviceClass === 'local')) {
              const inferred = inferDuplexAndColorFromModel(makeAndModel);
              usbPrinters.push({
                uri,
                displayName: info,
                isColor: inferred.color,
                isDuplex: inferred.duplex
              });
            }
          }

          resolve({ success: true, printers: usbPrinters });
        });
      });

      if (fallbackResult.success) {
        return NextResponse.json(fallbackResult);
      }

      return NextResponse.json({ error: cupsResult.error || fallbackResult.error || 'Lỗi kết nối CUPS' }, { status: 500 });
    }

    return NextResponse.json(cupsResult);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
