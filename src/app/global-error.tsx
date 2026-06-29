'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global Error Boundary caught:', error);
  }, [error]);

  return (
    <html lang="vi">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100 p-8">
          <div className="bg-red-900/30 border border-red-500/50 p-6 rounded-xl max-w-2xl w-full">
            <h2 className="text-2xl font-bold text-red-400 mb-4">Lỗi Hệ Thống Nghiêm Trọng!</h2>
            <p className="mb-4 text-slate-300">
              Vui lòng chụp ảnh màn hình này và gửi cho kỹ thuật viên:
            </p>
            <div className="bg-black/50 p-4 rounded-lg overflow-auto text-xs font-mono text-red-200 mb-6">
              <p className="font-bold">{error.name}: {error.message}</p>
              <pre className="mt-2 opacity-80 whitespace-pre-wrap">{error.stack}</pre>
            </div>
            <button
              onClick={() => reset()}
              className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Thử tải lại trang
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
