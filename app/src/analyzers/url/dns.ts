/** DNS over HTTPS straight from the browser (cloudflare-dns.com allows CORS). */

const TYPES = { A: 1, AAAA: 28, CNAME: 5, MX: 15, TXT: 16, NS: 2 } as const;
type RecordType = keyof typeof TYPES;

export async function lookupDns(host: string, signal?: AbortSignal): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const apex = host.split('.').slice(-2).join('.');
  await Promise.all(
    (Object.keys(TYPES) as RecordType[]).map(async (type) => {
      // MX/TXT/NS live on the apex domain; A/AAAA/CNAME on the exact host
      const name = type === 'MX' || type === 'TXT' || type === 'NS' ? apex : host;
      try {
        const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
          headers: { Accept: 'application/dns-json' },
          signal,
        });
        const json = (await res.json()) as { Answer?: { type: number; data: string }[] };
        const values = (json.Answer ?? []).filter((a) => a.type === TYPES[type]).map((a) => a.data.replace(/^"|"$/g, '').replace(/"\s*"/g, ''));
        if (values.length) out[type] = values;
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
      }
    }),
  );
  return out;
}

export interface DnsFinding {
  name: string;
  category: string;
  record: string;
  value: string;
}

const MX_RULES: [RegExp, string][] = [
  [/google\.com|googlemail\.com/i, 'Google Workspace'],
  [/outlook\.com|protection\.outlook/i, 'Microsoft 365'],
  [/zoho\./i, 'Zoho Mail'],
  [/protonmail|proton\.me/i, 'Proton Mail'],
  [/mxrecord\.io|mimecast/i, 'Mimecast'],
  [/pphosted\.com/i, 'Proofpoint'],
  [/fastmail/i, 'Fastmail'],
  [/amazonaws\.com|awsapps/i, 'Amazon SES / WorkMail'],
];

const TXT_RULES: [RegExp, string, string][] = [
  [/^google-site-verification=/, 'Google Search Console', 'Verified SaaS'],
  [/^facebook-domain-verification=/, 'Meta Business', 'Verified SaaS'],
  [/^atlassian-domain-verification=/, 'Atlassian', 'Verified SaaS'],
  [/^stripe-verification=/, 'Stripe', 'Verified SaaS'],
  [/^docusign=/, 'DocuSign', 'Verified SaaS'],
  [/^MS=/, 'Microsoft 365', 'Verified SaaS'],
  [/^apple-domain-verification=/, 'Apple', 'Verified SaaS'],
  [/^hubspot-developer-verification=|hubspot/i, 'HubSpot', 'Verified SaaS'],
  [/^ZOOM_verify_/, 'Zoom', 'Verified SaaS'],
  [/^adobe-idp-site-verification=/, 'Adobe', 'Verified SaaS'],
  [/^slack-domain-verification=/, 'Slack', 'Verified SaaS'],
  [/^openai-domain-verification=/, 'OpenAI', 'Verified SaaS'],
  [/^anthropic-domain-verification/, 'Anthropic', 'Verified SaaS'],
  [/^notion-domain-verification/, 'Notion', 'Verified SaaS'],
  [/^figma-domain-verification/, 'Figma', 'Verified SaaS'],
  [/^miro-verification=/, 'Miro', 'Verified SaaS'],
  [/^canva-site-verification=/, 'Canva', 'Verified SaaS'],
  [/^cisco-ci-domain-verification=/, 'Cisco Webex', 'Verified SaaS'],
  [/^postman-domain-verification=/, 'Postman', 'Verified SaaS'],
  [/^vercel-domain-verification|_vercel/, 'Vercel', 'Verified SaaS'],
  [/^onetrust-domain-verification=/, 'OneTrust', 'Verified SaaS'],
  [/^github-verification|_github-challenge/, 'GitHub Organization', 'Verified SaaS'],
  [/^dropbox-domain-verification=/, 'Dropbox', 'Verified SaaS'],
  [/^intercom-domain-verification/, 'Intercom', 'Verified SaaS'],
  [/^segment-site-verification=/, 'Segment', 'Verified SaaS'],
];

const SPF_RULES: [RegExp, string][] = [
  [/_spf\.google\.com/, 'Google Workspace'], [/spf\.protection\.outlook\.com/, 'Microsoft 365'], [/sendgrid\.net/, 'SendGrid'],
  [/mailgun\.org/, 'Mailgun'], [/amazonses\.com/, 'Amazon SES'], [/servers\.mcsv\.net|mailchimp/, 'Mailchimp'], [/_spf\.salesforce\.com/, 'Salesforce'],
  [/mail\.zendesk\.com/, 'Zendesk'], [/spf\.mandrillapp\.com/, 'Mandrill'], [/_spf\.resend\.com|amazonses.*resend/, 'Resend'], [/spf\.postmarkapp\.com|mtasv\.net/, 'Postmark'],
  [/hubspotemail\.net/, 'HubSpot'], [/_spf\.intercom\.io|intercom\.io/, 'Intercom'], [/customer\.io/, 'Customer.io'], [/sparkpostmail\.com/, 'SparkPost'],
];

const NS_RULES: [RegExp, string][] = [
  [/cloudflare\.com/, 'Cloudflare DNS'], [/awsdns/, 'Amazon Route 53'], [/azure-dns/, 'Azure DNS'], [/googledomains\.com|google\.com/, 'Google Cloud DNS'],
  [/nsone\.net/, 'NS1'], [/vercel-dns\.com/, 'Vercel DNS'], [/dnsimple/, 'DNSimple'], [/domaincontrol\.com/, 'GoDaddy DNS'], [/akam\.net|akamaiedge/, 'Akamai DNS'],
  [/ultradns/, 'UltraDNS'], [/dynect\.net/, 'Oracle Dyn'], [/netlify/, 'Netlify DNS'], [/digitalocean\.com/, 'DigitalOcean DNS'],
];

const CNAME_RULES: [RegExp, string][] = [
  [/vercel-dns\.com|vercel\.app|cname\.vercel/, 'Vercel'], [/netlify\.(app|com)/, 'Netlify'], [/herokudns\.com|herokuapp/, 'Heroku'],
  [/cloudfront\.net/, 'Amazon CloudFront'], [/azurewebsites\.net|azureedge|azurefd/, 'Azure'], [/github\.io/, 'GitHub Pages'], [/fly\.dev/, 'Fly.io'],
  [/pages\.dev|workers\.dev/, 'Cloudflare Pages'], [/fastly\.net/, 'Fastly'], [/akamaiedge|edgekey|edgesuite/, 'Akamai'], [/shopify/, 'Shopify'],
  [/onrender\.com/, 'Render'], [/railway\.app/, 'Railway'], [/ghs\.googlehosted|appspot/, 'Google Cloud'], [/webflow/, 'Webflow'], [/squarespace/, 'Squarespace'],
];

export function interpretDns(dns: Record<string, string[]>): DnsFinding[] {
  const out: DnsFinding[] = [];
  const push = (name: string, category: string, record: string, value: string) => {
    if (!out.some((f) => f.name === name && f.category === category)) out.push({ name, category, record, value });
  };
  for (const v of dns.MX ?? []) for (const [re, name] of MX_RULES) if (re.test(v)) push(name, 'Email provider', 'MX', v);
  for (const v of dns.TXT ?? []) {
    for (const [re, name, cat] of TXT_RULES) if (re.test(v)) push(name, cat, 'TXT', v.slice(0, 80));
    if (v.startsWith('v=spf1')) for (const [re, name] of SPF_RULES) if (re.test(v)) push(name, 'Email sending', 'TXT (SPF)', v.slice(0, 120));
  }
  for (const v of dns.NS ?? []) for (const [re, name] of NS_RULES) if (re.test(v)) push(name, 'DNS provider', 'NS', v);
  for (const v of dns.CNAME ?? []) for (const [re, name] of CNAME_RULES) if (re.test(v)) push(name, 'Hosting', 'CNAME', v);
  return out;
}
