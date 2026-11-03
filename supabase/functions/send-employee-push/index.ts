import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function getPushConfig(admin: ReturnType<typeof createClient>) {
  const read = async (name: string) => {
    const { data, error } = await admin.rpc("get_brq_push_secret", { p_name: name });
    if (error) throw error;
    return typeof data === "string" ? data : null;
  };
  let [privateKey, publicKey, webhookSecret] = await Promise.all([
    read("brinque_push_vapid_private"),
    read("brinque_push_vapid_public"),
    read("brinque_push_webhook_secret"),
  ]);

  if (!privateKey || !publicKey || !webhookSecret) {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    if (!jwk.d || !jwk.x || !jwk.y) throw new Error("Não foi possível gerar as chaves de notificação.");
    const publicBytes = new Uint8Array([
      4,
      ...base64UrlToBytes(jwk.x),
      ...base64UrlToBytes(jwk.y),
    ]);
    const generatedPrivate = jwk.d;
    const generatedPublic = bytesToBase64Url(publicBytes);
    const generatedWebhook = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const { error } = await admin.rpc("initialize_brq_push_secrets", {
      p_vapid_private: generatedPrivate,
      p_vapid_public: generatedPublic,
      p_webhook_secret: generatedWebhook,
    });
    if (error) throw error;
    [privateKey, publicKey, webhookSecret] = await Promise.all([
      read("brinque_push_vapid_private"),
      read("brinque_push_vapid_public"),
      read("brinque_push_webhook_secret"),
    ]);
  }
  if (!privateKey || !publicKey || !webhookSecret) {
    throw new Error("As chaves seguras de notificação não foram inicializadas.");
  }
  return { privateKey, publicKey, webhookSecret };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const anonKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return reply({ error: "Configuração do servidor incompleta." }, 500);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json();

    if (body?.action === "public_key") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) return reply({ error: "Entre novamente no aplicativo." }, 401);
      const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: authData, error: authError } = await authClient.auth.getUser(token);
      if (authError || !authData.user) return reply({ error: "Sua sessão expirou. Entre novamente." }, 401);

      const companyId = String(body.company_id || "");
      if (!companyId) return reply({ error: "Empresa não identificada." }, 400);
      const { data: member, error: memberError } = await admin.from("company_members")
        .select("role").eq("company_id", companyId).eq("user_id", authData.user.id).maybeSingle();
      if (memberError || !member || !["owner", "admin"].includes(member.role)) {
        return reply({ error: "Somente proprietário e administradores podem ativar notificações." }, 403);
      }
      const config = await getPushConfig(admin);
      return reply({ publicKey: config.publicKey });
    }

    if (body?.action === "test") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) return reply({ error: "Entre novamente no aplicativo." }, 401);
      const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: authData, error: authError } = await authClient.auth.getUser(token);
      if (authError || !authData.user) return reply({ error: "Sua sessão expirou. Entre novamente." }, 401);
      const companyId = String(body.company_id || "");
      if (!companyId) return reply({ error: "Empresa não identificada." }, 400);
      const { data: member, error: memberError } = await admin.from("company_members")
        .select("role").eq("company_id", companyId).eq("user_id", authData.user.id).maybeSingle();
      if (memberError || !member || !["owner", "admin"].includes(member.role)) {
        return reply({ error: "Somente proprietário e administradores podem testar notificações." }, 403);
      }
      const config = await getPushConfig(admin);
      const { data: subscriptions, error: subscriptionsError } = await admin.from("push_subscriptions")
        .select("id,endpoint,p256dh,auth").eq("company_id", companyId).eq("user_id", authData.user.id);
      if (subscriptionsError) throw subscriptionsError;
      if (!subscriptions?.length) return reply({ sent: 0, error: "Este aparelho ainda não está inscrito." }, 404);
      webpush.setVapidDetails("https://vbf1.github.io/kidsloc-app/", config.publicKey, config.privateKey);
      const payload = JSON.stringify({
        title: "Teste de notificação",
        body: "Tudo certo! Este aparelho receberá avisos quando um novo funcionário for cadastrado.",
        url: "https://vbf1.github.io/kidsloc-app/",
        tag: "kidsloc-push-test",
      });
      let sent = 0;
      for (const subscription of subscriptions) {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, payload);
          sent++;
        } catch (error) {
          const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            await admin.from("push_subscriptions").delete().eq("id", subscription.id);
          }
          console.error("Falha no teste de push:", statusCode || String(error));
        }
      }
      return reply({ sent, total: subscriptions.length });
    }

    const suppliedSecret = req.headers.get("x-brinque-webhook-secret") || "";
    const { data: expectedSecret, error: secretError } = await admin.rpc("get_brq_push_secret", {
      p_name: "brinque_push_webhook_secret",
    });
    if (secretError) throw secretError;
    if (!suppliedSecret || !expectedSecret || suppliedSecret !== expectedSecret) {
      return reply({ error: "Webhook não autorizado." }, 401);
    }
    const config = await getPushConfig(admin);

    const record = body?.record;
    if (body?.type !== "INSERT" || body?.table !== "company_members" ||
        body?.schema !== "public" || !record?.company_id || !record?.role) {
      return reply({ received: true, ignored: true });
    }
    if (!["staff", "admin"].includes(record.role)) return reply({ received: true, ignored: true });

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("company_id", record.company_id);
    if (subscriptionsError) throw subscriptionsError;
    if (!subscriptions?.length) return reply({ sent: 0, message: "Nenhum aparelho inscrito." });

    const { data: company } = await admin.from("companies").select("name").eq("id", record.company_id).maybeSingle();
    webpush.setVapidDetails("https://vbf1.github.io/kidsloc-app/", config.publicKey, config.privateKey);
    const notification = JSON.stringify({
      title: "Novo membro na equipe",
      body: "Um novo funcionário foi adicionado à equipe de " + String(company?.name || "sua empresa") + ".",
      url: "https://vbf1.github.io/kidsloc-app/",
      tag: "kidsloc-new-team-member",
    });

    const results = await Promise.all((subscriptions || []).map(async (subscription) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, notification);
        return { ok: true };
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        }
        console.error("Falha ao enviar push:", statusCode || String(error));
        return { ok: false };
      }
    }));
    return reply({ sent: results.filter((result) => result.ok).length, total: results.length });
  } catch (error) {
    console.error("send-employee-push:", error);
    return reply({ error: error instanceof Error ? error.message : "Falha no envio da notificação." }, 500);
  }
});