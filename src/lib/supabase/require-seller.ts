import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireSeller() {
  const supabase = await createClient();
  const {
    data: { user: seller },
  } = await supabase.auth.getUser();

  if (!seller) {
    redirect("/");
  }

  return seller;
}
