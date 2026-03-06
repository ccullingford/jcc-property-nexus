/**
 * Microsoft Graph API client service.
 *
 * Authentication priority:
 * 1. Replit Outlook connector (delegated OAuth via REPLIT_CONNECTORS_HOSTNAME)
 * 2. Azure AD app-only (client credentials) when MICROSOFT_TENANT_ID + CLIENT_ID + CLIENT_SECRET are set
 *
 * Shared-mailbox reads use /users/{email}/messages.
 * The delegated path requires the authenticated user to have Full Access on the mailbox,
 * OR the connector account to have a delegated access grant.
 * The app-only path requires Mail.Read application permission with admin consent.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  from: { emailAddress: { name: string; address: string } };
  toRecipients: { emailAddress: { name: string; address: string } }[];
  body: { contentType: string; content: string };
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

// ── Replit Outlook connector token ───────────────────────────────────────────

interface ConnectorSettings {
  settings: {
    access_token?: string;
    expires_at?: string;
    oauth?: { credentials?: { access_token?: string } };
  };
}

let _connectorCache: ConnectorSettings | null = null;

async function getConnectorToken(): Promise<string | null> {
  // Check cached token is still valid (with 60-second buffer)
  if (
    _connectorCache?.settings?.expires_at &&
    new Date(_connectorCache.settings.expires_at).getTime() > Date.now() + 60_000
  ) {
    const cached =
      _connectorCache.settings.access_token ||
      _connectorCache.settings.oauth?.credentials?.access_token;
    if (cached) return cached;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  if (!hostname) return null;

  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) return null;

  try {
    const res = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=outlook`,
      {
        headers: {
          Accept: "application/json",
          "X-Replit-Token": xReplitToken,
        },
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    _connectorCache = data.items?.[0] ?? null;
    if (!_connectorCache) return null;

    const token =
      _connectorCache.settings.access_token ||
      _connectorCache.settings.oauth?.credentials?.access_token;

    return token ?? null;
  } catch {
    return null;
  }
}

// ── App-only (client credentials) token ─────────────────────────────────────

let _appOnlyTokenCache: { token: string; expiresAt: number } | null = null;

async function getAppOnlyToken(): Promise<string> {
  const { MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } =
    process.env;
  if (!MICROSOFT_TENANT_ID || !MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    throw new Error(
      "Microsoft Graph credentials not configured. Set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, or connect the Outlook integration."
    );
  }

  if (_appOnlyTokenCache && Date.now() < _appOnlyTokenCache.expiresAt - 60_000) {
    return _appOnlyTokenCache.token;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    { method: "POST", body: params }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed: ${text}`);
  }

  const data = await res.json();
  _appOnlyTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

/**
 * Get a token suitable for delegated Graph operations (e.g. send-as).
 * Tries Replit Outlook connector first, then falls back to app-only.
 */
export async function getAccessToken(): Promise<string> {
  const connectorToken = await getConnectorToken();
  if (connectorToken) return connectorToken;
  return getAppOnlyToken();
}

/**
 * Get a token for server-side mailbox sync.
 * Prefers app-only (client credentials) because:
 *   - Shared-mailbox access requires Mail.Read *application* permission.
 *   - Delegated / connector tokens are scoped to the signed-in user and
 *     typically don't have access to other mailboxes.
 * Falls back to the connector token only when no app credentials are set.
 */
export async function getSyncToken(): Promise<string> {
  const {
    MICROSOFT_TENANT_ID,
    MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET,
  } = process.env;

  if (MICROSOFT_TENANT_ID && MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET) {
    console.log("[getSyncToken] Using app-only (client_credentials) token");
    return getAppOnlyToken();
  }

  // No app-only credentials — try the connector as last resort
  console.log("[getSyncToken] App-only credentials not configured, trying Outlook connector");
  const connectorToken = await getConnectorToken();
  if (connectorToken) return connectorToken;

  throw new Error(
    "No Graph credentials available for mailbox sync. " +
    "Set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, and MICROSOFT_CLIENT_SECRET."
  );
}

// ── Graph HTTP helpers ───────────────────────────────────────────────────────

async function graphGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API error ${res.status} on ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Public Graph operations ──────────────────────────────────────────────────

/**
 * Fetch messages from a shared mailbox.
 * Tries /mailFolders/inbox/messages first (standard path); falls back to
 * /messages for shared mailboxes that don't expose the standard folder tree.
 *
 * Requires one of:
 *   - Mail.Read *application* permission (app-only / client credentials) with
 *     admin consent granted in Azure AD, OR
 *   - Mail.ReadShared delegated permission AND the connector account must have
 *     Full Access on the shared mailbox (granted by an Exchange/M365 admin).
 */
function buildMessageSelect(): string {
  return [
    "id",
    "conversationId",
    "subject",
    "bodyPreview",
    "receivedDateTime",
    "isRead",
    "hasAttachments",
    "from",
    "toRecipients",
    "body",
  ].join(",");
}

function buildDateFilter(since?: Date): string {
  if (!since) return "";
  return `&$filter=receivedDateTime ge ${since.toISOString()}`;
}

export async function fetchMailboxMessages(
  mailboxAddress: string,
  options: { top?: number; skip?: number; token?: string; since?: Date } = {}
): Promise<GraphMessage[]> {
  const token = options.token ?? await getSyncToken();
  const top = options.top ?? 50;
  const skip = options.skip ?? 0;
  const select = buildMessageSelect();
  const dateFilter = buildDateFilter(options.since);

  const encoded = encodeURIComponent(mailboxAddress);
  const query = `?$top=${top}&$skip=${skip}&$select=${select}&$orderby=receivedDateTime desc${dateFilter}`;

  // Try the inbox folder path first, then fall back to the flat messages endpoint.
  // Some shared-mailbox configurations (e.g. room/resource mailboxes) 403 on
  // mailFolders/inbox but succeed on /messages.
  const paths = [
    `/users/${encoded}/mailFolders/inbox/messages${query}`,
    `/users/${encoded}/messages${query}`,
  ];

  let lastErr: Error | null = null;
  for (const path of paths) {
    try {
      const data = await graphGet<{ value: GraphMessage[] }>(path, token);
      return data.value;
    } catch (err: any) {
      lastErr = err;
      // Only fall through on 403/404 — other errors (network, 500) should surface immediately
      if (!err.message?.includes("403") && !err.message?.includes("404")) throw err;
    }
  }

  // Both paths failed — surface the original Graph error detail so we can diagnose
  const base = lastErr?.message ?? "Unknown Graph error";
  if (base.includes("403")) {
    throw new Error(
      `Access denied (403) to mailbox "${mailboxAddress}". ` +
      `Microsoft Graph said: ${base}`
    );
  }
  throw new Error(base);
}

/**
 * Fetch messages from the Sent Items folder.
 */
export async function fetchSentMessages(
  mailboxAddress: string,
  options: { top?: number; token?: string; since?: Date } = {}
): Promise<GraphMessage[]> {
  const token = options.token ?? await getSyncToken();
  const top = options.top ?? 50;
  const select = buildMessageSelect();
  const dateFilter = buildDateFilter(options.since);
  const encoded = encodeURIComponent(mailboxAddress);
  const query = `?$top=${top}&$select=${select}&$orderby=receivedDateTime desc${dateFilter}`;
  const path = `/users/${encoded}/mailFolders/sentitems/messages${query}`;
  try {
    const data = await graphGet<{ value: GraphMessage[] }>(path, token);
    return data.value;
  } catch (err: any) {
    if (err.message?.includes("403") || err.message?.includes("404")) return [];
    throw err;
  }
}

export interface SendMailPayload {
  subject: string;
  body: { contentType: "HTML" | "Text"; content: string };
  toRecipients: Array<{ emailAddress: { address: string; name?: string } }>;
  ccRecipients?: Array<{ emailAddress: { address: string; name?: string } }>;
  replyTo?: Array<{ emailAddress: { address: string; name?: string } }>;
  conversationId?: string;
}

/**
 * Send an email from a mailbox via Microsoft Graph.
 * POST /users/{mailbox}/sendMail
 */
export async function sendMail(
  mailboxAddress: string,
  payload: SendMailPayload,
  token?: string
): Promise<void> {
  const resolvedToken = token ?? await getSyncToken();
  const path = `/users/${encodeURIComponent(mailboxAddress)}/sendMail`;
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolvedToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: payload, saveToSentItems: true }),
  });
  if (res.status === 202) return;
  const err = await res.json().catch(() => ({ error: { message: "Send failed" } }));
  throw new Error(err?.error?.message ?? `sendMail failed with status ${res.status}`);
}

/**
 * Fetch attachment metadata for a specific message.
 */
export async function fetchMessageAttachments(
  mailboxAddress: string,
  messageId: string,
  token?: string
): Promise<GraphAttachment[]> {
  const resolvedToken = token ?? await getSyncToken();
  const path =
    `/users/${encodeURIComponent(mailboxAddress)}/messages/${messageId}/attachments` +
    `?$select=id,name,contentType,size`;
  const data = await graphGet<{ value: GraphAttachment[] }>(path, resolvedToken);
  return data.value;
}

/**
 * Test connectivity to a mailbox.
 */
export async function testMailboxAccess(mailboxAddress: string): Promise<boolean> {
  try {
    const token = await getSyncToken();
    await graphGet(`/users/${encodeURIComponent(mailboxAddress)}`, token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true if any form of Graph auth is available.
 * Connector availability is determined at runtime; app-only requires env vars.
 */
export function isGraphConfigured(): boolean {
  const hasConnector = !!(
    process.env.REPLIT_CONNECTORS_HOSTNAME &&
    (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL)
  );
  const hasAppOnly = !!(
    process.env.MICROSOFT_TENANT_ID &&
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET
  );
  return hasConnector || hasAppOnly;
}
