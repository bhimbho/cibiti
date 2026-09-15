import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  // Email for staff; email or matric/registration number for candidates.
  identifier: z.string().trim().min(2).max(160),
  password: z.string().min(6).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  trustHost: true,
  pages: { signIn: "/sign-in" },
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Email or matric number" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { identifier, password } = parsed.data;

        const user = identifier.includes("@")
          ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } })
          : await prisma.user.findFirst({ where: { regNumber: { equals: identifier, mode: "insensitive" } } });

        if (!user || !user.isActive || !(await compare(password, user.passwordHash))) return null;
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      // Roles are deliberately not stored in the session; see src/server/authz.ts.
      if (session.user && typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
