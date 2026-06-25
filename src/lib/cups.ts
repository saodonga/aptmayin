/* eslint-disable @typescript-eslint/no-explicit-any */
import ipp from 'ipp';

interface CupsOperationOptions {
  operation: number; // e.g. 0x4003 for Add-Printer, 0x4004 for Delete-Printer, 0x400B for Get-Devices
  isAdminPath?: boolean; // true for /admin/, false for /
  getMsg: (username: string) => any;
}

/**
 * Execute an IPP/CUPS administrative operation using a sequential fallback of administrative users.
 * Typically tries CUPS_SERVER_USER env first, then falls back to print, admin, and root.
 */
export async function executeCupsOperation(options: CupsOperationOptions): Promise<any> {
  const cupsHost = process.env.CUPS_SERVER_HOST || 'cups-server:631';
  const cupsPassword = process.env.CUPS_SERVER_PASSWORD || 'admin_secret';
  
  // List of usernames to try in order
  const usersToTry: string[] = [];
  if (process.env.CUPS_SERVER_USER) {
    usersToTry.push(process.env.CUPS_SERVER_USER);
  }
  
  // Try print first (standard for olbat/cupsd), then admin, then root
  const defaultUsers = ['print', 'admin', 'root'];
  for (const u of defaultUsers) {
    if (!usersToTry.includes(u)) {
      usersToTry.push(u);
    }
  }

  let lastError: any = null;
  const path = options.isAdminPath ? '/admin/' : '/';

  for (const user of usersToTry) {
    const url = `http://${user}:${cupsPassword}@${cupsHost}${path}`;
    console.log(`[CUPS-IPP] Attempting operation ${options.operation.toString(16)} with user: ${user} on host: ${cupsHost}`);
    const printer = ipp.Printer(url);
    const msg = options.getMsg(user);

    try {
      const result = await new Promise<any>((resolve, reject) => {
        printer.execute(options.operation as any, msg, (err: any, res: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
      });
      console.log(`[CUPS-IPP] Operation ${options.operation.toString(16)} succeeded using user: ${user}`);
      return result;
    } catch (err: any) {
      console.error(`[CUPS-IPP] Operation ${options.operation.toString(16)} failed using user ${user}:`, err.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error(`Tất cả người dùng CUPS đều thất bại khi thực hiện operation ${options.operation.toString(16)}`);
}

/**
 * Ensures that a printer queue with the given name exists in CUPS.
 * If the connection is a CUPS local queue, it returns it directly.
 * Otherwise, it adds/creates the printer queue in CUPS.
 */
export async function ensureCupsPrinterQueue(name: string, connection: string): Promise<string> {
  // If connection is already pointing to CUPS local queue, return it
  if (connection.includes('/printers/')) {
    return connection;
  }

  const mockMode = process.env.MOCK_PRINTING === 'true';
  const cupsHost = process.env.CUPS_SERVER_HOST || 'cups-server:631';
  const targetConnection = `ipp://${cupsHost}/printers/${name}`;

  if (mockMode) {
    return targetConnection;
  }

  const isIpp = connection.startsWith('ipp://') || connection.startsWith('ipps://') || connection.startsWith('http://') || connection.startsWith('https://');

  try {
    await executeCupsOperation({
      operation: 0x4003, // Add-Printer
      isAdminPath: true,
      getMsg: (username) => ({
        'operation-attributes-tag': {
          'requesting-user-name': username,
          'printer-uri': targetConnection
        },
        'printer-attributes-tag': {
          'device-uri': connection,
          'printer-is-accepting-jobs': true,
          'printer-state': 3, // idle
          ...(isIpp ? { 'ppd-name': 'everywhere' } : { 'ppd-name': 'raw' })
        }
      })
    });
  } catch (error: any) {
    console.error(`[CUPS] ensureCupsPrinterQueue failed for ${name}:`, error);
    throw new Error(`Không thể tự động cấu hình máy in trên CUPS Server! Chi tiết lỗi: ${error.message || String(error)}`);
  }

  return targetConnection;
}

/**
 * Deletes a printer queue from CUPS.
 */
export async function deleteCupsPrinterQueue(name: string): Promise<boolean> {
  const mockMode = process.env.MOCK_PRINTING === 'true';
  if (mockMode) return true;

  const cupsHost = process.env.CUPS_SERVER_HOST || 'cups-server:631';
  try {
    await executeCupsOperation({
      operation: 0x4004, // Delete-Printer
      isAdminPath: true,
      getMsg: (username) => ({
        'operation-attributes-tag': {
          'requesting-user-name': username,
          'printer-uri': `ipp://${cupsHost}/printers/${name}`
        }
      })
    });
    return true;
  } catch (error: any) {
    console.error(`[CUPS] deleteCupsPrinterQueue failed for ${name}:`, error);
    return false;
  }
}
