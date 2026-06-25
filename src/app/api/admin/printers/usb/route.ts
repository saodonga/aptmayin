/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Role } from '@prisma/client';
import { cupsGetDevices } from '@/lib/cups';

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
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return NextResponse.json({
        success: true,
        mock: true,
        printers: [
          { uri: 'usb://HP/LaserJet%20Pro%20M404dn?serial=PH123456', displayName: 'HP LaserJet Pro M404dn (USB)', isColor: false, isDuplex: true },
          { uri: 'usb://Canon/LBP2900?serial=CN987654',              displayName: 'Canon LBP2900 (USB)',           isColor: false, isDuplex: false },
          { uri: 'usb://Epson/L3110?serial=EP771122',                displayName: 'Epson L3110 Series (USB)',      isColor: true,  isDuplex: false },
        ],
      });
    }

    try {
      const tagsArray = await cupsGetDevices();
      const usbPrinters: any[] = [];

      for (const tag of tagsArray) {
        if (!tag) continue;

        const getVal = (field: string) => {
          const f = tag[field];
          if (f === undefined || f === null) return '';
          return typeof f === 'object' && 'value' in f ? f.value : f;
        };

        const uri          = getVal('device-uri') || getVal('uri');
        const info         = getVal('device-info') || getVal('info') || getVal('device-make-and-model') || 'Unknown USB Printer';
        const makeAndModel = getVal('device-make-and-model') || info;
        const deviceClass  = getVal('device-class') || '';

        if (uri && (uri.startsWith('usb://') || deviceClass === 'local')) {
          const inferred = inferDuplexAndColorFromModel(makeAndModel);
          usbPrinters.push({ uri, displayName: info, isColor: inferred.color, isDuplex: inferred.duplex });
        }
      }

      return NextResponse.json({ success: true, printers: usbPrinters });
    } catch (err: any) {
      console.error('[USB SCAN] CUPS scan error:', err);
      return NextResponse.json({ error: err.message || 'Lỗi kết nối CUPS' }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống!' }, { status: 500 });
  }
}
