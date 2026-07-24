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
   * next-auth v4 KHÔNG có trustHost/useSecureCookies (đó là v5 API).
   * Trong v4, proxy trust được xử lý bằng:
   *  1. NEXTAUTH_URL=https://mayin.kinhtesox.net  (set trong .env trên server)
   *  2. Cookie config bên dưới để đảm bảo SameSite=lax qua HTTPS redirect.
   *
   * Nếu chạy sau nginx, cần đảm bảo nginx forward header:
   *   proxy_set_header X-Forwarded-Proto https;
   */
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
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
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
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
