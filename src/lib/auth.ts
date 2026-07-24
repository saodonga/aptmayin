import { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { db } from './db';
import { Role } from '@prisma/client';

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      // Increase timeout for openid-client discovery requests.
      // Default is 3500ms which times out in some network conditions.
      httpOptions: {
        timeout: 10000,
      },
    }),
  ],

  /**
   * FIX: OAuthCallback error khi deploy sau reverse proxy (nginx / Cloudflare).
   *
   * Vấn đề gốc:
   *  - NEXTAUTH_URL="http://localhost:3500" → NextAuth tạo callback URL sai,
   *    Google redirect về localhost thay vì mayin.kinhtesox.net → OAuthCallback error.
   *  - Cookie CSRF bị mất vì thiếu Secure/SameSite flags khi qua HTTPS proxy.
   *
   * Giải pháp:
   *  - trustHost: true  → NextAuth tự detect host từ X-Forwarded-Host header
   *    (nginx/Cloudflare tự set header này), không còn phụ thuộc NEXTAUTH_URL.
   *  - useSecureCookies → đặt Secure flag trên tất cả auth cookies khi HTTPS.
   *  - cookies config   → đặt SameSite=lax để CSRF token tồn tại qua redirect OAuth.
   */
  trustHost: true,

  useSecureCookies: process.env.NODE_ENV === 'production',

  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.callback-url'
        : 'next-auth.callback-url',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      // CSRF token KHÔNG dùng __Secure- prefix vì nó phải đọc được từ JS
      name: 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  session: {
    strategy: 'jwt',
    // Tăng maxAge để giảm tần suất re-auth (mặc định 30 ngày)
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      const adminEmails = process.env.ADMIN_EMAILS
        ? process.env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase())
        : [];

      const isSystemAdmin = adminEmails.includes(user.email.toLowerCase());

      try {
        await db.user.upsert({
          where: { email: user.email },
          update: {
            name: user.name,
            image: user.image,
            // If in ADMIN_EMAILS, enforce ADMIN role
            ...(isSystemAdmin && { role: Role.ADMIN }),
          },
          create: {
            email: user.email,
            name: user.name,
            image: user.image,
            role: isSystemAdmin ? Role.ADMIN : Role.USER,
            pageQuota: 100, // Default pages per month
          },
        });
        return true;
      } catch (error) {
        console.error('Error in JIT user provisioning:', error);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        const dbUser = await db.user.findUnique({
          where: { email: user.email! },
          select: { role: true, id: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.id = dbUser.id;
        }
      } else if (token.email) {
        const dbUser = await db.user.findUnique({
          where: { email: token.email },
          select: { role: true, id: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.id = dbUser.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        session.user.id = token.id;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};
