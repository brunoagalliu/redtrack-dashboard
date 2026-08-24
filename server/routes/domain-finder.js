const express  = require('express');
const router    = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are a domain name branding expert. Given a business description, generate exactly 30 creative, brandable domain name ideas (without .com extension, all lowercase, no hyphens or dots).

Rules:
- Prefer short names (6-10 characters) — they're more memorable and valuable
- Ensure real variety across strategies, do not repeat the same pattern
- Every name must be pronounceable and spell naturally

Use a mix of these strategies:
1. Direct Compound: combine core concept with action/descriptor words (e.g. leadzap, routefire)
2. Prefix/Suffix Modifier: get___, try___, use___, go___, ___hq, ___ai, ___lab, ___hub
3. Portmanteau: hide key business word inside a larger made-up word that sounds natural (e.g. releadiant, leadgacy)
4. Creative Misspelling: alternate spellings, dropped letters (e.g. kwalify, qualifik)
5. Science/Element Style: sounds like a periodic element or scientific term (e.g. leadium, qualifium)
6. Character/Personality: brand persona (e.g. routerogue, leadmadam)
7. Double Meaning: words with dual context (e.g. hookup, matchivate)

Tier each name honestly:
- "top": exceptional — short, punchy, memorable, highly brandable
- "strong": solid choice — clear, catchy, works well
- "wildcard": creative/experimental — interesting but unconventional

Aim for roughly: 8 top, 12 strong, 10 wildcard.

Return ONLY a valid JSON array with no markdown or extra text. Each item must have:
- domain: the name (lowercase, no extension, no hyphens)
- strategy: the strategy name used
- rationale: one short sentence explaining the appeal
- tier: "top" | "strong" | "wildcard"

Example:
[{"domain":"leadzap","strategy":"Direct Compound","rationale":"Punchy, memorable, conveys instant lead capture.","tier":"top"}]`;

let cachedIp = null;
async function getOutboundIp() {
  if (process.env.NAMECHEAP_CLIENT_IP) return process.env.NAMECHEAP_CLIENT_IP;
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const { ip } = await res.json();
    cachedIp = ip;
    return cachedIp;
  } catch {
    return '127.0.0.1';
  }
}

router.post('/brainstorm', async (req, res) => {
  const { description } = req.body;
  if (!description?.trim()) return res.status(400).json({ error: 'description is required' });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Business description: ${description}` }],
    });

    const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
    let suggestions;
    try {
      suggestions = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return res.status(500).json({ error: 'Failed to parse suggestions from AI' });
      suggestions = JSON.parse(match[0]);
    }
    res.json({ suggestions });
  } catch (err) {
    console.error('[domain-finder] brainstorm error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/check-domains', async (req, res) => {
  const { domains } = req.body;
  if (!Array.isArray(domains) || !domains.length) return res.status(400).json({ error: 'domains array required' });

  const { NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_USERNAME } = process.env;
  if (!NAMECHEAP_API_USER || !NAMECHEAP_API_KEY || !NAMECHEAP_USERNAME) {
    return res.status(500).json({ error: 'Namecheap API credentials not configured (NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_USERNAME)' });
  }

  try {
    const clientIp  = await getOutboundIp();
    const domainList = domains.map(d => d.includes('.') ? d : `${d}.com`).join(',');

    const params = new URLSearchParams({
      ApiUser:    NAMECHEAP_API_USER,
      ApiKey:     NAMECHEAP_API_KEY,
      UserName:   NAMECHEAP_USERNAME,
      ClientIp:   clientIp,
      Command:    'namecheap.domains.check',
      DomainList: domainList,
    });

    const response = await fetch(`https://api.namecheap.com/xml.response?${params}`);
    const xml = await response.text();

    if (xml.includes('Status="ERROR"')) {
      const m = xml.match(/<Error[^>]*>([^<]+)<\/Error>/);
      return res.status(502).json({ error: m ? m[1] : 'Namecheap API error' });
    }

    const results = [];
    const re = /<DomainCheckResult\s+Domain="([^"]+)"\s+Available="([^"]+)"(?:\s+IsPremiumName="([^"]+)")?(?:\s+PremiumRegistrationPrice="([^"]+)")?/g;
    let match;
    while ((match = re.exec(xml)) !== null) {
      results.push({
        domain:    match[1],
        available: match[2] === 'true',
        isPremium: match[3] === 'true',
        price:     match[4] || null,
      });
    }

    res.json({ results });
  } catch (err) {
    console.error('[domain-finder] check-domains error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Namecheap helpers ────────────────────────────────────────────────────────

function ncBase() {
  const { NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_USERNAME } = process.env;
  if (!NAMECHEAP_API_USER || !NAMECHEAP_API_KEY || !NAMECHEAP_USERNAME) return null;
  return { ApiUser: NAMECHEAP_API_USER, ApiKey: NAMECHEAP_API_KEY, UserName: NAMECHEAP_USERNAME };
}

function parseDomainsFromXml(xml) {
  const tags = [...xml.matchAll(/<Domain\s[\s\S]*?\/>/g)];
  return tags.map(m => {
    const tag = m[0];
    const get = (key) => (tag.match(new RegExp(`${key}="([^"]*)"`)))?.[1] ?? '';
    return { name: get('Name').toLowerCase(), isOurDNS: get('IsOurDNS') === 'true', expires: get('Expires'), created: get('Created') };
  }).filter(d => d.name);
}

// GET /domains — list all Namecheap domains
router.get('/domains', async (req, res) => {
  const base = ncBase();
  if (!base) return res.status(500).json({ error: 'Namecheap credentials not configured' });
  try {
    const clientIp = await getOutboundIp();
    const all = [];
    let page = 1;
    let total = Infinity;
    while (all.length < total) {
      const params = new URLSearchParams({ ...base, ClientIp: clientIp, Command: 'namecheap.domains.getList', PageSize: '100', Page: String(page) });
      const r = await fetch(`https://api.namecheap.com/xml.response?${params}`);
      const xml = await r.text();
      if (xml.includes('Status="ERROR"')) {
        const m = xml.match(/<Error[^>]*>([^<]+)<\/Error>/);
        return res.status(502).json({ error: m?.[1]?.trim() ?? 'Namecheap error' });
      }
      const tm = xml.match(/<TotalItems>(\d+)<\/TotalItems>/);
      if (tm) total = parseInt(tm[1]);
      const domains = parseDomainsFromXml(xml);
      if (!domains.length) break;
      all.push(...domains);
      page++;
    }
    res.json({ domains: all, total: all.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cloudflare helpers ───────────────────────────────────────────────────────

const CF_ACCOUNTS = {
  adam:     { token: () => process.env.CLOUDFLARE_API_TOKEN,          accountId: () => process.env.CLOUDFLARE_ACCOUNT_ID },
  superior: { token: () => process.env.CLOUDFLARE_API_TOKEN_SUPERIOR, accountId: () => process.env.CLOUDFLARE_ACCOUNT_ID_SUPERIOR },
};

function cfetch(path, method = 'GET', body, token) {
  const t = token ?? process.env.CLOUDFLARE_API_TOKEN;
  return fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(r => r.json()).catch(() => ({ success: false, errors: [{ message: 'Parse error' }] }));
}

// GET /cloudflare-accounts — list configured accounts for UI
router.get('/cloudflare-accounts', (_req, res) => {
  const accounts = [
    { id: 'adam',     name: 'Adam',     configured: !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) },
    { id: 'superior', name: 'Superior', configured: !!(process.env.CLOUDFLARE_API_TOKEN_SUPERIOR && process.env.CLOUDFLARE_ACCOUNT_ID_SUPERIOR) },
  ];
  res.json({ accounts });
});

// POST /provision — add domain to Cloudflare, set DNS records, update Namecheap/GoDaddy NS
router.post('/provision', async (req, res) => {
  const { domain, security = {}, network = { proxy: false, sslMode: 'none' }, records = [], cloudflareAccount = 'adam', registrar = 'namecheap', godaddyAccount = 'adam' } = req.body;
  const steps = [];

  try {
    const cfAccount = CF_ACCOUNTS[cloudflareAccount] ?? CF_ACCOUNTS.adam;
    const cfToken = cfAccount.token();
    const cfAccountId = cfAccount.accountId();
    const cf = (path, method, body) => cfetch(path, method, body, cfToken);

    const gdAcc = GD_ACCOUNTS[godaddyAccount] ?? GD_ACCOUNTS.adam;
    const gdKey = gdAcc.key(); const gdSecret = gdAcc.secret();

    const base = registrar === 'namecheap' ? ncBase() : null;
    const clientIp = registrar === 'namecheap' ? await getOutboundIp() : null;
    let zoneId, nameservers;

    // 1. Add zone to Cloudflare
    const zoneRes = await cf('/zones', 'POST', { name: domain, type: 'full', account: { id: cfAccountId } });
    if (zoneRes.success) {
      zoneId = zoneRes.result.id;
      nameservers = zoneRes.result.name_servers;
      steps.push({ name: 'Add to Cloudflare', status: 'ok' });
    } else {
      const alreadyExists = zoneRes.errors?.some(e => e.code === 1049 || e.code === 1061 || e.code === 1097 || e.message?.toLowerCase().includes('already'));
      if (alreadyExists) {
        const existing = await cf(`/zones?name=${domain}`);
        if (!existing.success || !existing.result?.[0]) {
          steps.push({ name: 'Add to Cloudflare', status: 'error', detail: 'Zone exists but could not be fetched' });
          return res.json({ steps });
        }
        zoneId = existing.result[0].id;
        const zoneDetail = await cf(`/zones/${zoneId}`);
        nameservers = zoneDetail.result?.name_servers ?? existing.result[0].name_servers ?? [];
        steps.push({ name: 'Add to Cloudflare', status: 'ok', detail: 'Zone already existed' });
      } else {
        steps.push({ name: 'Add to Cloudflare', status: 'error', detail: zoneRes.errors?.[0]?.message });
        return res.json({ steps });
      }
    }

    // 2. DNS records
    for (const rec of records) {
      const cfName = rec.name === '@' ? domain : rec.name;
      const r = await cf(`/zones/${zoneId}/dns_records`, 'POST', { type: rec.type, name: cfName, content: rec.content, ttl: 1, proxied: !!network.proxy });
      if (!r.success) {
        const dup = r.errors?.some(e => e.code === 81057 || e.message?.toLowerCase().includes('already'));
        if (dup) {
          const qName = rec.name === '*' ? `*.${domain}` : rec.name === '@' ? domain : `${rec.name}.${domain}`;
          const existing = await cf(`/zones/${zoneId}/dns_records?type=${rec.type}&name=${qName}`);
          const recId = existing.result?.[0]?.id;
          if (recId) {
            const patch = await cf(`/zones/${zoneId}/dns_records/${recId}`, 'PATCH', { content: rec.content, proxied: !!network.proxy, ttl: 1 });
            if (!patch.success) { steps.push({ name: 'Add DNS records', status: 'error', detail: patch.errors?.[0]?.message }); return res.json({ steps }); }
          }
        } else {
          steps.push({ name: 'Add DNS records', status: 'error', detail: r.errors?.[0]?.message });
          return res.json({ steps });
        }
      }
    }
    steps.push({ name: 'Add DNS records', status: 'ok', detail: records.map(r => `${r.type} ${r.name}`).join(', ') });

    // 3. Security
    const anySecurityEnabled = security.botFightMode || security.aiLabyrinth || security.aiBotsProtection;
    if (anySecurityEnabled) {
      const body = {
        ...(security.botFightMode     ? { fight_mode: true, enable_js: true }     : {}),
        ...(security.aiLabyrinth      ? { crawler_protection: 'enabled' }         : {}),
        ...(security.aiBotsProtection ? { ai_bots_protection: 'block' }           : {}),
      };
      const r = await cf(`/zones/${zoneId}/bot_management`, 'PUT', body);
      steps.push({ name: 'Enable security', status: r.success ? 'ok' : 'error', detail: r.success
        ? [security.botFightMode && 'Bot Fight Mode', security.aiLabyrinth && 'AI Labyrinth', security.aiBotsProtection && 'AI Bots Protection'].filter(Boolean).join(', ')
        : r.errors?.[0]?.message });
    }

    // 4. SSL/TLS
    if (network.sslMode && network.sslMode !== 'none') {
      const r = await cf(`/zones/${zoneId}/settings/ssl`, 'PATCH', { value: network.sslMode });
      steps.push({ name: 'Set SSL/TLS', status: r.success ? 'ok' : 'error', detail: r.success ? network.sslMode : r.errors?.[0]?.message });
    }

    // 5. Update nameservers at registrar
    if (registrar === 'godaddy') {
      const data = await gdfetch(`/domains/${domain}`, 'PATCH', { nameServers: nameservers }, gdKey, gdSecret);
      const ok = data._ok === true;
      steps.push({ name: 'Set nameservers', status: ok ? 'ok' : 'error', detail: ok ? nameservers.join(', ') : (data.message ?? JSON.stringify(data)) });
      if (ok) {
        const arData = await gdfetch(`/domains/${domain}`, 'PATCH', { renewAuto: false }, gdKey, gdSecret);
        const arOk = arData._ok === true;
        steps.push({ name: 'Disable auto-renew', status: arOk ? 'ok' : 'error', detail: arOk ? 'auto-renew disabled' : (arData.message ?? JSON.stringify(arData)) });
      }
    } else if (base) {
      const parts = domain.split('.');
      const params = new URLSearchParams({ ...base, ClientIp: clientIp, Command: 'namecheap.domains.dns.setCustom', SLD: parts[0], TLD: parts.slice(1).join('.'), Nameservers: nameservers.join(',') });
      const nsRes = await fetch(`https://api.namecheap.com/xml.response?${params}`);
      const nsXml = await nsRes.text();
      const nsOk = nsXml.includes('Update="true"') || (nsXml.includes('Status="OK"') && !nsXml.includes('Status="ERROR"'));
      const nsErr = nsXml.match(/<Error[^>]*>([^<]+)<\/Error>/)?.[1]?.trim() ?? nsXml.slice(0, 200);
      steps.push({ name: 'Set nameservers', status: nsOk ? 'ok' : 'error', detail: nsOk ? nameservers.join(', ') : nsErr });
    }

    res.json({ nameservers, steps });
  } catch (err) {
    steps.push({ name: 'Unexpected error', status: 'error', detail: err.message });
    res.json({ steps });
  }
});

// ─── GoDaddy helpers ─────────────────────────────────────────────────────────

const GD_ACCOUNTS = {
  adam:        { key: () => process.env.GODADDY_API_KEY,             secret: () => process.env.GODADDY_API_SECRET },
  superiorsms: { key: () => process.env.GODADDY_API_KEY_SUPERIORSMS, secret: () => process.env.GODADDY_API_SECRET_SUPERIORSMS },
};

async function gdfetch(path, method = 'GET', body, gdKey, gdSecret) {
  const key    = gdKey    ?? process.env.GODADDY_API_KEY;
  const secret = gdSecret ?? process.env.GODADDY_API_SECRET;
  const shopperId = gdKey ? null : process.env.GODADDY_SHOPPER_ID;
  const r = await fetch(`https://api.godaddy.com/v1${path}`, {
    method,
    headers: {
      Authorization: `sso-key ${key}:${secret}`,
      'Content-Type': 'application/json',
      ...(shopperId ? { 'X-Shopper-Id': shopperId } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  console.log(`[gdfetch] ${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
  if (r.status === 204 || !text.trim()) return { _ok: true };
  try {
    return { ...JSON.parse(text), _ok: r.status >= 200 && r.status < 300 };
  } catch {
    return { _ok: false, message: text.slice(0, 200) };
  }
}

router.get('/godaddy-accounts', (_req, res) => {
  const accounts = [
    { id: 'adam',        name: 'Adam',        configured: !!(process.env.GODADDY_API_KEY && process.env.GODADDY_API_SECRET) },
    { id: 'superiorsms', name: 'SuperiorSMS', configured: !!(process.env.GODADDY_API_KEY_SUPERIORSMS && process.env.GODADDY_API_SECRET_SUPERIORSMS) },
  ];
  res.json({ accounts });
});

router.get('/godaddy-domains', async (req, res) => {
  const account = req.query.account ?? 'adam';
  const gdAcc = GD_ACCOUNTS[account] ?? GD_ACCOUNTS.adam;
  const gdKey = gdAcc.key(); const gdSecret = gdAcc.secret();
  if (!gdKey || !gdSecret) return res.status(500).json({ error: `GoDaddy credentials not configured for account "${account}"` });
  try {
    let all = []; let marker = null;
    do {
      const qs = new URLSearchParams({ limit: '500', statuses: 'ACTIVE', ...(marker ? { marker } : {}) });
      const data = await gdfetch(`/domains?${qs}`, 'GET', null, gdKey, gdSecret);
      if (data.code) return res.status(502).json({ error: data.message ?? 'GoDaddy API error' });
      const page = Array.isArray(data) ? data : [];
      all.push(...page.map(d => ({ name: d.domain.toLowerCase(), expires: d.expires, created: d.createdAt })));
      marker = page.length === 500 ? page[page.length - 1].domain : null;
    } while (marker);
    res.json({ domains: all, total: all.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Vercel helpers ───────────────────────────────────────────────────────────

async function vfetch(path, method = 'GET', body) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

function parseHostsFromXml(xml) {
  const hosts = [];
  const regex = /<host[^>]+>/gi;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const tag = m[0];
    const get = (k) => tag.match(new RegExp(`${k}="([^"]*)"`, 'i'))?.[1] ?? '';
    const name = get('Name'); const type = get('Type');
    if (!name || !type) continue;
    hosts.push({ name, type, address: get('Address'), mxPref: get('MXPref') || '10', ttl: get('TTL') || '1800' });
  }
  return hosts;
}

// POST /vercel-provision
router.post('/vercel-provision', async (req, res) => {
  const { domains, mode = 'nameservers', dnsProvider = 'namecheap', godaddyAccount = 'adam' } = req.body;
  const VERCEL_NS = ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'];
  const VERCEL_A_FALLBACK = '216.150.1.1';
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!projectId || !process.env.VERCEL_TOKEN) return res.status(500).json({ error: 'VERCEL_TOKEN and VERCEL_PROJECT_ID must be set' });

  const isGodaddy = dnsProvider === 'godaddy';
  const base = isGodaddy ? null : ncBase();
  if (!isGodaddy && !base) return res.status(500).json({ error: 'Namecheap credentials not configured' });

  const gdAcc = GD_ACCOUNTS[godaddyAccount] ?? GD_ACCOUNTS.adam;
  const gdKey = gdAcc.key(); const gdSecret = gdAcc.secret();
  if (isGodaddy && (!gdKey || !gdSecret)) {
    return res.status(500).json({ error: `GoDaddy credentials not configured for account "${godaddyAccount}"` });
  }

  const clientIp = isGodaddy ? null : await getOutboundIp();
  const results = [];

  for (const domain of domains) {
    const steps = [];
    const parts = domain.split('.');
    const sld = parts[0]; const tld = parts.slice(1).join('.');

    // 1. Add to Vercel
    const vercelRes = await vfetch(`/v9/projects/${projectId}/domains`, 'POST', { name: domain });
    if (vercelRes.error) {
      const msg = vercelRes.error.message ?? '';
      const alreadyExists = vercelRes.error.code === 'domain_already_in_project' || msg.toLowerCase().includes('already');
      if (alreadyExists) steps.push({ name: 'Add to Vercel', status: 'ok', detail: 'Already in project' });
      else { steps.push({ name: 'Add to Vercel', status: 'error', detail: msg }); results.push({ domain, steps }); continue; }
    } else {
      steps.push({ name: 'Add to Vercel', status: 'ok' });
    }

    // 2. DNS — GoDaddy branch
    if (isGodaddy) {
      if (mode === 'nameservers') {
        const data = await gdfetch(`/domains/${domain}`, 'PATCH', { nameServers: VERCEL_NS }, gdKey, gdSecret);
        const ok = data._ok === true;
        steps.push({ name: 'Set nameservers', status: ok ? 'ok' : 'error', detail: ok ? VERCEL_NS.join(', ') : (data.message ?? JSON.stringify(data)) });
        if (ok) {
          const arData = await gdfetch(`/domains/${domain}`, 'PATCH', { renewAuto: false }, gdKey, gdSecret);
          const arOk = arData._ok === true;
          steps.push({ name: 'Disable auto-renew', status: arOk ? 'ok' : 'error', detail: arOk ? 'auto-renew disabled' : (arData.message ?? JSON.stringify(arData)) });
        }
      } else {
        let aIp = VERCEL_A_FALLBACK;
        try {
          const cfg = await vfetch(`/v9/projects/${projectId}/domains/${domain}`);
          const aRecord = cfg.verification?.find(v => v.type === 'A');
          if (aRecord?.value) aIp = aRecord.value;
        } catch {}
        const data = await gdfetch(`/domains/${domain}/records/A/@`, 'PUT', [{ data: aIp, ttl: 600 }], gdKey, gdSecret);
        const ok = data._ok === true;
        steps.push({ name: 'Set A record', status: ok ? 'ok' : 'error', detail: ok ? `@ → ${aIp}` : (data.message ?? JSON.stringify(data)) });
      }

    // 2. DNS — Namecheap branch
    } else if (mode === 'nameservers') {
      const params = new URLSearchParams({ ...base, ClientIp: clientIp, Command: 'namecheap.domains.dns.setCustom', SLD: sld, TLD: tld, Nameservers: VERCEL_NS.join(',') });
      const nsRes = await fetch(`https://api.namecheap.com/xml.response?${params}`);
      const nsXml = await nsRes.text();
      const nsOk = nsXml.includes('Update="true"') || (nsXml.includes('Status="OK"') && !nsXml.includes('Status="ERROR"'));
      const nsErr = nsXml.match(/<Error[^>]*>([^<]+)<\/Error>/)?.[1]?.trim() ?? nsXml.slice(0, 200);
      steps.push({ name: 'Set nameservers', status: nsOk ? 'ok' : 'error', detail: nsOk ? VERCEL_NS.join(', ') : nsErr });
    } else {
      // Namecheap A record mode
      let aIp = VERCEL_A_FALLBACK;
      try {
        const cfg = await vfetch(`/v9/projects/${projectId}/domains/${domain}`);
        const aRecord = cfg.verification?.find(v => v.type === 'A');
        if (aRecord?.value) aIp = aRecord.value;
      } catch {}

      const getParams = new URLSearchParams({ ...base, ClientIp: clientIp, Command: 'namecheap.domains.dns.getHosts', SLD: sld, TLD: tld });
      let getXml = await (await fetch(`https://api.namecheap.com/xml.response?${getParams}`)).text();

      if (getXml.includes('Status="ERROR"')) {
        const errMsg = getXml.match(/<Error[^>]*>([^<]+)<\/Error>/)?.[1]?.trim() ?? '';
        const isCustomNs = /custom|nameserver|dns server|proper dns|not using/i.test(errMsg);
        if (!isCustomNs) { steps.push({ name: 'Set A record', status: 'error', detail: errMsg }); results.push({ domain, steps }); continue; }
        const resetParams = new URLSearchParams({ ...base, ClientIp: clientIp, Command: 'namecheap.domains.dns.setDefault', SLD: sld, TLD: tld });
        const resetXml = await (await fetch(`https://api.namecheap.com/xml.response?${resetParams}`)).text();
        const resetOk = resetXml.includes('Update="true"') || (resetXml.includes('Status="OK"') && !resetXml.includes('Status="ERROR"'));
        steps.push({ name: 'Reset to Namecheap DNS', status: resetOk ? 'ok' : 'error' });
        if (!resetOk) { results.push({ domain, steps }); continue; }
        getXml = await (await fetch(`https://api.namecheap.com/xml.response?${getParams}`)).text();
      }

      const existing = parseHostsFromXml(getXml).filter(h => !(h.name === '@' && h.type === 'A'));
      const newHosts = [...existing, { name: '@', type: 'A', address: aIp, mxPref: '10', ttl: '1800' }];
      const setParams = new URLSearchParams({ ...base, ClientIp: clientIp, Command: 'namecheap.domains.dns.setHosts', SLD: sld, TLD: tld });
      newHosts.forEach((h, i) => {
        const n = i + 1;
        setParams.set(`HostName${n}`, h.name); setParams.set(`RecordType${n}`, h.type);
        setParams.set(`Address${n}`, h.address); setParams.set(`MXPref${n}`, h.mxPref); setParams.set(`TTL${n}`, h.ttl);
      });
      const setXml = await (await fetch(`https://api.namecheap.com/xml.response?${setParams}`)).text();
      const setOk = setXml.includes('IsSuccess="true"');
      const setErr = setXml.match(/<Error[^>]*>([^<]+)<\/Error>/)?.[1]?.trim();
      steps.push({ name: 'Set A record', status: setOk ? 'ok' : 'error', detail: setOk ? `@ → ${aIp}` : setErr ?? 'Failed' });
    }

    results.push({ domain, steps });
    await new Promise(r => setTimeout(r, 500));
  }

  res.json({ results });
});

module.exports = router;
