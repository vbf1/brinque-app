import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const anonKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return reply({ error: "Configuração segura do servidor incompleta. Verifique as chaves do Supabase." }, 500);

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Sessão não identificada. Entre novamente." }, 401);
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Sua sessão expirou. Entre novamente." }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json();
    const action = String(body.action || "");
    const companyId = String(body.company_id || "");
    if (!companyId) return reply({ error: "Empresa não identificada." }, 400);

    const { data: caller, error: callerError } = await admin.from("company_members")
      .select("role").eq("company_id", companyId).eq("user_id", authData.user.id).maybeSingle();
    if (callerError || !caller || !["owner", "admin"].includes(caller.role)) {
      return reply({ error: "Você não tem permissão para gerenciar funcionários." }, 403);
    }

    if (action === "list") {
      const { data: members, error } = await admin.from("company_members")
        .select("id,user_id,role,created_at").eq("company_id", companyId).order("created_at", { ascending: true });
      if (error) throw error;
      const rows = await Promise.all((members || []).map(async (member) => {
        const [userResult, profileResult] = await Promise.all([
          admin.auth.admin.getUserById(member.user_id),
          admin.from("profiles").select("full_name,phone").eq("id", member.user_id).maybeSingle(),
        ]);
        return {
          id: member.id, user_id: member.user_id, role: member.role, created_at: member.created_at,
          email: userResult.data.user?.email || "",
          full_name: profileResult.data?.full_name || userResult.data.user?.user_metadata?.full_name || "",
        };
      }));
      return reply({ members: rows });
    }

    if (action === "invite") {
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const role = String(body.role || "staff");
      if (name.length < 2 || name.length > 100) return reply({ error: "Informe um nome entre 2 e 100 caracteres." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Informe um e-mail válido." }, 400);
      if (!["staff", "admin"].includes(role)) return reply({ error: "Perfil solicitado inválido." }, 400);
      if (role === "admin" && caller.role !== "owner") return reply({ error: "Somente o proprietário pode cadastrar administradores." }, 403);

      const [{ data: company, error: companyError }, { data: inviterProfile }] = await Promise.all([
        admin.from("companies").select("name").eq("id", companyId).maybeSingle(),
        admin.from("profiles").select("full_name").eq("id", authData.user.id).maybeSingle(),
      ]);
      if (companyError) throw companyError;
      const companyName = String(company?.name || "Sua empresa").trim();
      const inviterName = String(
        inviterProfile?.full_name ||
        authData.user.user_metadata?.full_name ||
        authData.user.email ||
        "Equipe da empresa"
      ).trim();
      const roleLabel = role === "admin" ? "Administrador" : "Funcionário";

      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name: name,
          company_name: companyName,
          invited_by_name: inviterName,
          invited_by_email: authData.user.email || "",
          invited_role: roleLabel,
          app_name: "Brinque App",
        },
        redirectTo: "https://vbf1.github.io/brinque-app/",
      });
      if (inviteError) {
        const lower = inviteError.message.toLowerCase();
        let message = "Falha no envio do convite: " + inviteError.message;
        if (lower.includes("already") || lower.includes("registered")) {
          message = "Este e-mail já possui uma conta no Supabase. Use outro e-mail ou solicite a recuperação de acesso.";
        } else if (lower.includes("rate limit") || lower.includes("too many")) {
          message = "O Supabase limitou o envio de e-mails. Aguarde alguns minutos e tente novamente.";
        } else if (lower.includes("smtp") || lower.includes("email provider") || lower.includes("email rate")) {
          message = "O serviço de e-mail do Supabase recusou o convite. Verifique a configuração SMTP e os limites de envio em Authentication > SMTP Settings.";
        }
        console.error("manage-employees inviteUserByEmail:", inviteError);
        return reply({ error: message });
      }
      if (!invited.user) return reply({ error: "O convite não retornou um usuário válido." }, 500);
      const { error: profileError } = await admin.from("profiles").upsert({
        id: invited.user.id, full_name: name, updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (profileError) return reply({ error: "Convite enviado, mas não foi possível salvar o perfil. Verifique a equipe antes de reenviar." }, 500);
      const { error: memberError } = await admin.from("company_members").insert({
        company_id: companyId, user_id: invited.user.id, role,
      });
      if (memberError) return reply({ error: "Convite enviado, mas o vínculo com a empresa não foi concluído. Verifique a equipe antes de reenviar." }, 500);
      return reply({ message: "Convite enviado com sucesso." });
    }

    if (action === "change_role") {
      const targetId = String(body.user_id || "");
      const newRole = String(body.role || "");
      if (!targetId || !["staff", "admin"].includes(newRole)) return reply({ error: "Dados de alteração inválidos." }, 400);
      if (targetId === authData.user.id) return reply({ error: "Você não pode alterar seu próprio perfil." }, 403);
      const { data: target, error } = await admin.from("company_members").select("id,role")
        .eq("company_id", companyId).eq("user_id", targetId).maybeSingle();
      if (error || !target) return reply({ error: "Funcionário não encontrado nesta empresa." }, 404);
      if (target.role === "owner") return reply({ error: "O perfil do proprietário não pode ser alterado." }, 403);
      if (caller.role !== "owner" && (target.role !== "staff" || newRole !== "staff")) {
        return reply({ error: "Administradores só podem gerenciar funcionários." }, 403);
      }
      const { error: updateError } = await admin.from("company_members").update({ role: newRole }).eq("id", target.id);
      if (updateError) throw updateError;
      return reply({ message: "Permissão atualizada." });
    }

    if (action === "remove") {
      const targetId = String(body.user_id || "");
      if (!targetId || targetId === authData.user.id) return reply({ error: "Não é possível remover sua própria conta por esta tela." }, 400);
      const { data: target, error } = await admin.from("company_members").select("id,role")
        .eq("company_id", companyId).eq("user_id", targetId).maybeSingle();
      if (error || !target) return reply({ error: "Funcionário não encontrado nesta empresa." }, 404);
      if (target.role === "owner") return reply({ error: "O proprietário não pode ser removido por esta tela." }, 403);
      if (caller.role !== "owner" && target.role !== "staff") return reply({ error: "Administradores só podem remover funcionários." }, 403);
      const { error: deleteError } = await admin.from("company_members").delete().eq("id", target.id);
      if (deleteError) throw deleteError;
      return reply({ message: "Acesso removido desta empresa." });
    }
    return reply({ error: "Ação não reconhecida." }, 400);
  } catch (error) {
    console.error("manage-employees:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return reply({ error: "Falha ao processar a solicitação: " + detail });
  }
});
