'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Printer } from 'lucide-react';

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 p-10 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl">
        <div className="flex flex-col items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner mb-4">
            <Printer className="h-9 w-9 animate-pulse" />
          </div>
          <h2 className="mt-2 text-center text-3xl font-extrabold tracking-tight text-white">
            Remote Print Server
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            Hệ thống máy in máy chủ nội bộ & từ xa
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="group relative flex w-full justify-center items-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all duration-300 shadow-lg shadow-indigo-600/30 hover:scale-[1.02]"
          >
            {/* SVG Logo Google */}
            <svg className="mr-3 h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.478 0-6.3-2.823-6.3-6.3 0-3.478 2.822-6.3 6.3-6.3 1.54 0 2.94.55 4.03 1.458l3.11-3.11C19.046 2.012 15.86 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.262 0 11.36-4.992 11.36-11.24 0-.696-.088-1.355-.22-1.955H12.24z" />
            </svg>
            Đăng nhập bằng Google
          </button>

          <div className="text-center">
            <span className="text-xs text-slate-500">
              Chỉ chấp nhận các tài khoản Google được ủy quyền để truy cập máy in.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
