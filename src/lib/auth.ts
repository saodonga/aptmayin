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
   * FIX: OAuthCallback error khi deploy sau reverse proxy.
   *
   * Root cause: Cookies OAuth flow (đặc biệt là next-auth.state) bị browser
   * drop khi đi qua HTTPS redirect nếu không cấu hình SameSite đúng.
   *
   * Giải pháp v4:
   *  - Không dùng __Secure- prefix (gây lỗi nếu nginx không set X-Forwarded-Proto)
   *  - SameSite=lax cho phép cookie đi qua cross-site redirect (OAuth flow)
   *  - NEXTAUTH_URL phải đặt đúng trong .env trên server
   */
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: false, // nginx handles SSL; container sees HTTP internally
      },
    },
    callbackUrl: {
      name: 'next-auth.callback-url',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: false,
      },
    },
    csrfToken: {
      name: 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: false,
      },
    },
    // State cookie: critical cho OAuth flow — nếu thiếu/sai sẽ gây OAuthCallback error
    state: {
      name: 'next-auth.state',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: false,
        maxAge: 900, // 15 phút — đủ thời gian hoàn thành OAuth flow
      },
    },
    // PKCE verifier cho Google OAuth (OpenID Connect)
    pkceCodeVerifier: {
      name: 'next-auth.pkce.code_verifier',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: false,
        maxAge: 900,
      },
    },
    nonce: {
      name: 'next-auth.nonce',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: false,
      },
    },
  },

  // Log lỗi auth chi tiết ra stderr để dễ debug qua docker logs
  logger: {
    error(code, metadata) {
      console.error('[NextAuth Error]', code, JSON.stringify(metadata));
    },
    warn(code) {
      console.warn('[NextAuth Warn]', code);
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
      } catch (error) {
        // DB lỗi tạm thời KHÔNG nên block login — Google đã xác thực thành công.
        // User vẫn có JWT hợp lệ. Log lỗi để debug, nhưng cho phép login tiếp.
        console.error('[Auth] DB upsert failed (non-blocking):', error);
      }
      return true; // Luôn cho phép login sau khi Google xác thực thành công
    },

    async jwt({ token, user }) {
      try {
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
      } catch (error) {
        // DB lỗi tạm thời → vẫn trả token (không có role/id).
        // Session vẫn được tạo, user đăng nhập được.
        console.error('[Auth] jwt DB lookup failed (non-blocking):', error);
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
