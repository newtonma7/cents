import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfiguration } from "@/lib/supabase/config";

export async function createClient() {
  const cookieStore = await cookies();
  const { key, url } = supabaseConfiguration();

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, options, value }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot set cookies. The proxy refreshes them.
        }
      },
    },
  });
}
