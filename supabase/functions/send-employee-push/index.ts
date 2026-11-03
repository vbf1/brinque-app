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

let firebaseAccessTokenCache: { token: string; expiresAt: number } | null = null;

function base64UrlEncode(value: Uint8Array | string): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function getFirebaseAccessToken(): Promise<{ token: string; projectId: string } | null> {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  const account = JSON.parse(raw);
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error("A credencial de serviço do Firebase está incompleta.");
  }
  if (firebaseAccessTokenCache && firebaseAccessTokenCache.expiresAt > Date.now() + 60000) {
    return { token: firebaseAccessTokenCache.token, projectId: account.project_id };
  }
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + "." + claim;
  const pem = String(account.private_key).replaceAll("-----BEGIN PRIVATE KEY-----", "").replaceAll("-----END PRIVATE KEY-----", "").replaceAll("\\n", "").replaceAll("\\r", "").replaceAll(" ", "").replaceAll("\\t", "");
  const keyBytes = Uint8Array.from(atob(pem), (character) => character.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + base64UrlEncode(new Uint8Array(signature));
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const tokenData = await response.json();
  if (!response.ok || !tokenData.access_token) {
    throw new Error("Não foi possível autenticar no Firebase para enviar notificações.");
  }
  firebaseAccessTokenCache = {
    token: tokenData.access_token,
    expiresAt: Date.now() + Number(tokenData.expires_in || 3600) * 1000,
  };
  return { token: tokenData.access_token, projectId: account.project_id };
}

async function sendFcmNotifications(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  title: string,
  body: string,
  targetUserId?: string,
) {
  const listQuery = admin.from("fcm_device_tokens").select("id,token").eq("company_id", companyId);
  const { data: deviceList, error: listError } = targetUserId
    ? await listQuery.eq("user_id", targetUserId)
    : await listQuery;
  if (listError) throw listError;
  const service = await getFirebaseAccessToken();
  if (!service) {
    return { sent: 0, total: deviceList?.length || 0, configured: false };
  }
  if (!deviceList?.length) return { sent: 0, total: 0, configured: true };
  const results = await Promise.all(deviceList.map(async (device) => {
    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${service.projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + service.token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title, body },
              data: { url: "https://vbf1.github.io/kidsloc-app/", tag: "kidsloc-notification" },
              android: {
                priority: "HIGH",
                notification: { channel_id: "kidsloc_notifications", sound: "default" },
              },
            },
          }),
        },
      );
      if (response.ok) return true;
      const failure = await response.text();
      if (response.status === 404 || failure.includes("UNREGISTERED") || failure.includes("registration-token-not-registered")) {
        await admin.from("fcm_device_tokens").delete().eq("id", device.id);
      }
      console.error("Falha FCM:", response.status, failure.slice(0, 400));
      return false;
    } catch (error) {
      console.error("Erro ao enviar FCM:", error);
      return false;
    }
  }));
  return { sent: results.filter(Boolean).length, total: deviceList.length, configured: true };
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
      const fcmResult = await sendFcmNotifications(
        admin, companyId, "Teste de notificação",
        "Tudo certo! Este aparelho receberá avisos importantes do KidsLoc App.",
        authData.user.id,
      );
      if (!subscriptions?.length && !fcmResult.total) return reply({ sent: 0, error: "Este aparelho ainda não está inscrito." }, 404);
      if (!fcmResult.configured && fcmResult.total) {
        return reply({ sent: 0, error: "O Firebase ainda não foi conectado ao servidor. Configure FIREBASE_SERVICE_ACCOUNT_JSON nos secrets do Supabase." }, 503);
      }
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
      return reply({ sent: sent + fcmResult.sent, webSent: sent, fcmSent: fcmResult.sent, total: subscriptions.length + fcmResult.total, fcmConfigured: fcmResult.configured });
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
    const { data: company } = await admin.from("companies").select("name").eq("id", record.company_id).maybeSingle();
    const title = "Novo membro na equipe";
    const bodyText = "Um novo funcionário foi adicionado à equipe de " + String(company?.name || "sua empresa") + ".";
    const fcmResult = await sendFcmNotifications(admin, record.company_id, title, bodyText);
    if (!subscriptions?.length && !fcmResult.total) return reply({ sent: 0, message: "Nenhum aparelho inscrito." });
    webpush.setVapidDetails("https://vbf1.github.io/kidsloc-app/", config.publicKey, config.privateKey);
    const notification = JSON.stringify({
      title,
      body: bodyText,
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
    const webSent = results.filter((result) => result.ok).length;
    return reply({ sent: webSent + fcmResult.sent, webSent, fcmSent: fcmResult.sent, total: results.length + fcmResult.total, fcmConfigured: fcmResult.configured });
  } catch (error) {
    console.error("send-employee-push:", error);
    return reply({ error: error instanceof Error ? error.message : "Falha no envio da notificação." }, 500);
  }
});