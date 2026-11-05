import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !publishableKey || !serviceKey) {
      return reply({ error: "Configuração segura do servidor incompleta." }, 500);
    }

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Sessão não identificada. Entre novamente." }, 401);

    const authClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) {
      return reply({ error: "Sua sessão expirou. Entre novamente." }, 401);
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await req.json();
    const companyId = String(body.company_id || "");
    if (!companyId) return reply({ error: "Empresa não identificada." }, 400);

    const { data: caller, error: callerError } = await admin.from("company_members")
      .select("user_id")
      .eq("company_id", companyId)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (callerError) throw callerError;
    if (!caller) return reply({ error: "Você não faz parte desta equipe." }, 403);

    const { data: rows, error: membersError } = await admin.from("company_members")
      .select("user_id, role")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });
    if (membersError) throw membersError;

    const members = await Promise.all((rows || []).map(async (member) => {
      const [profileResult, userResult] = await Promise.all([
        admin.from("profiles").select("full_name").eq("id", member.user_id).maybeSingle(),
        admin.auth.admin.getUserById(member.user_id),
      ]);
      if (userResult.error) throw userResult.error;
      const profileName = String(profileResult.data?.full_name || "").trim();
      const metadataName = String(
        userResult.data.user?.user_metadata?.full_name ||
        userResult.data.user?.user_metadata?.name ||
        ""
      ).trim();
      const email = String(userResult.data.user?.email || "").trim();
      return {
        user_id: member.user_id,
        role: member.role,
        name: profileName || metadataName || email || `Usuário ${member.user_id.slice(0, 8)}`,
      };
    }));

    return reply({ members });
  } catch (error) {
    console.error("team-chat-members:", error);
    return reply({ error: "Não foi possível carregar os participantes da equipe." }, 500);
  }
});
