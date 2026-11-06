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
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Sua sessão expirou. Entre novamente." }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json();
    const action = String(body.action || "");
    const companyId = String(body.company_id || "");

    const { data: isPlatformOwner, error: ownerCheckError } = await authClient.rpc("is_platform_owner");
    if (ownerCheckError) throw ownerCheckError;
    let callerRole: string | null = isPlatformOwner ? "owner" : null;
    if (!isPlatformOwner && companyId) {
      const { data: caller, error: callerError } = await admin.from("company_members")
        .select("role").eq("company_id", companyId).eq("user_id", authData.user.id).maybeSingle();
      if (callerError) throw callerError;
      callerRole = caller?.role || null;
    }

    // Global account and company-link operations are isolated from company-scoped
    // employee actions and require the platform-owner database role.
    if (action.startsWith("platform_")) {
      if (!isPlatformOwner) return reply({ error: "Somente o proprietário global pode administrar toda a plataforma." }, 403);

      if (action === "platform_add_membership") {
        const targetUserId = String(body.user_id || "");
        const targetCompanyId = String(body.target_company_id || "");
        const role = String(body.role || "staff");
        if (!targetUserId || !targetCompanyId || !["staff", "manager", "admin", "owner"].includes(role)) {
          return reply({ error: "Informe uma conta, uma empresa e um perfil válidos." }, 400);
        }
        const [{ data: targetUser, error: userError }, { data: targetCompany, error: companyError }] = await Promise.all([
          admin.auth.admin.getUserById(targetUserId),
          admin.from("companies").select("id").eq("id", targetCompanyId).maybeSingle(),
        ]);
        if (userError || !targetUser.user) return reply({ error: "Conta não encontrada." }, 404);
        if (companyError) throw companyError;
        if (!targetCompany) return reply({ error: "Empresa não encontrada." }, 404);
        const { data: existing, error: existingError } = await admin.from("company_members")
          .select("id").eq("company_id", targetCompanyId).eq("user_id", targetUserId).maybeSingle();
        if (existingError) throw existingError;
        if (existing) return reply({ error: "Esta conta já possui vínculo com a empresa selecionada." }, 409);
        const { error: insertError } = await admin.from("company_members").insert({
          company_id: targetCompanyId, user_id: targetUserId, role,
        });
        if (insertError) throw insertError;
        return reply({ message: "Conta vinculada à empresa com sucesso." });
      }

      if (action === "platform_change_membership") {
        const membershipId = String(body.membership_id || "");
        const role = String(body.role || "");
        if (!membershipId || !["staff", "manager", "admin", "owner"].includes(role)) {
          return reply({ error: "Vínculo ou perfil inválido." }, 400);
        }
        const { data: membership, error: membershipError } = await admin.from("company_members")
          .select("id,role").eq("id", membershipId).maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) return reply({ error: "Vínculo não encontrado." }, 404);
        const { error: updateError } = await admin.from("company_members")
          .update({ role }).eq("id", membershipId);
        if (updateError) throw updateError;
        return reply({ message: "Perfil do usuário atualizado." });
      }

      if (action === "platform_remove_membership") {
        const membershipId = String(body.membership_id || "");
        if (!membershipId) return reply({ error: "Vínculo não informado." }, 400);
        const { data: membership, error: membershipError } = await admin.from("company_members")
          .select("id,role").eq("id", membershipId).maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) return reply({ error: "Vínculo não encontrado." }, 404);
        if (membership.role === "owner") return reply({ error: "Para proteger a empresa, altere o perfil de proprietário antes de remover este vínculo." }, 403);
        const { error: deleteError } = await admin.from("company_members").delete().eq("id", membershipId);
        if (deleteError) throw deleteError;
        return reply({ message: "Vínculo removido. A conta do usuário foi preservada." });
      }
    }

    // Only the global user directory may run without a company context.
    // All other employee actions remain strictly company-scoped.
    if (!companyId && action !== "list_users") {
      return reply({ error: "Empresa não identificada." }, 400);
    }

    if (!callerRole || !["owner", "admin"].includes(callerRole)) {
      return reply({ error: "Você não tem permissão para gerenciar funcionários." }, 403);
    }

    if (action === "list_users") {
      const { data: memberships, error: membershipsError } = isPlatformOwner
        ? await admin.from("company_members").select("id,user_id,role,company_id,created_at")
        : await admin.from("company_members").select("id,user_id,role,company_id,created_at").eq("company_id", companyId);
      if (membershipsError) throw membershipsError;

      const authUsers: Array<any> = [];
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        authUsers.push(...(data.users || []));
        if (!data.users || data.users.length < 1000) break;
      }
      const users = isPlatformOwner
        ? authUsers
        : authUsers.filter(user => (memberships || []).some(member => member.user_id === user.id));
      const userIds = users.map(user => user.id);
      const companyIds = [...new Set((memberships || []).map(member => member.company_id))];
      const profileResult = userIds.length
        ? await admin.from("profiles").select("id,full_name,phone").in("id", userIds)
        : { data: [], error: null };
      const companyResult = companyIds.length
        ? await admin.from("companies").select("id,name").in("id", companyIds)
        : { data: [], error: null };
      if (profileResult.error) throw profileResult.error;
      if (companyResult.error) throw companyResult.error;
      const profileById = new Map((profileResult.data || []).map(profile => [profile.id, profile]));
      const companyById = new Map((companyResult.data || []).map(company => [company.id, company.name]));
      return reply({ management_version: 2, users: users.map(user => {
        const userMemberships = (memberships || []).filter(member => member.user_id === user.id);
        const selectedMembership = userMemberships.find(member => member.company_id === companyId);
        const profile = profileById.get(user.id);
        const isCurrentPlatformOwner = isPlatformOwner && user.id === authData.user.id;
        return {
          id: user.id,
          name: profile?.full_name || user.user_metadata?.full_name || "",
          email: user.email || "",
          phone: profile?.phone || "",
          role: isCurrentPlatformOwner ? "owner" : selectedMembership?.role || "none",
          company: isCurrentPlatformOwner
            ? "Proprietário global"
            : userMemberships.map(member => companyById.get(member.company_id) || "Empresa").join(", "),
          registered_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at || null,
          email_confirmed_at: user.email_confirmed_at || null,
          phone_confirmed_at: user.phone_confirmed_at || null,
          memberships: userMemberships.map(member => ({
            id: member.id,
            company_id: member.company_id,
            company: companyById.get(member.company_id) || "Empresa",
            role: member.role,
          })),
        };
      }) });
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
      if (role === "admin" && callerRole !== "owner") return reply({ error: "Somente o proprietário pode cadastrar administradores." }, 403);

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
          app_name: "KidsLoc App",
        },
        redirectTo: "https://vbf1.github.io/kidsloc-app/",
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
      if (callerRole !== "owner" && (target.role !== "staff" || newRole !== "staff")) {
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
      if (callerRole !== "owner" && target.role !== "staff") return reply({ error: "Administradores só podem remover funcionários." }, 403);
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
