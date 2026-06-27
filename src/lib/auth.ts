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
  session: {
    strategy: 'jwt',
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
