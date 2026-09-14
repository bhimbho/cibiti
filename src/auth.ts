import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
          return null;
        }

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      } else if (token.id && !token.role) {
        // refresh from DB if token lacks role (e.g. first login)
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        let id = token.id as string | undefined;
        if (!id) {
          // Fallback: resolve the real user id from the email to avoid stale/invalid
          // JWT subjects that break foreign-key relations like exam_authorId_fkey.
          const real = await prisma.user.findUnique({
            where: { email: (session.user.email ?? "").toLowerCase() },
            select: { id: true },
          });
          id = real?.id ?? "";
        }
        session.user.id = id;
        session.user.role = token.role;
      }
      return session;
    },
  },
});
