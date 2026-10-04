import NextAuth from "next-auth";
import { buildAuthConfig } from "@/lib/auth/config";

// Configuração lazy: nada de banco/env em tempo de import (build do Next).
export const { handlers, auth, signIn, signOut } = NextAuth(() => buildAuthConfig());
