"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestMagicLink(formData: FormData) {
  const email = formData.get("email");

  if (typeof email !== "string" || !emailPattern.test(email)) {
    redirect("/?error=Enter%20a%20valid%20email%20address.");
  }

  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: new URL("/auth/confirm", origin).toString(),
      shouldCreateUser: true,
    },
  });

  if (error) {
    redirect("/?error=We%20could%20not%20send%20that%20link.%20Try%20again.");
  }

  redirect("/check-email");
}
