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

module.exports = router;
