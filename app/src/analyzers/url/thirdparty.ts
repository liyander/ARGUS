/** External domain → service and category. Matched as a suffix of the hostname. */
export const THIRD_PARTY: [string, string, string][] = [
  // Analytics
  ['google-analytics.com', 'Google Analytics', 'Analytics'], ['googletagmanager.com', 'Google Tag Manager', 'Analytics'],
  ['analytics.google.com', 'Google Analytics', 'Analytics'], ['plausible.io', 'Plausible', 'Analytics'],
  ['segment.com', 'Segment', 'Analytics'], ['segment.io', 'Segment', 'Analytics'], ['cdn.segment.com', 'Segment', 'Analytics'],
  ['mixpanel.com', 'Mixpanel', 'Analytics'], ['amplitude.com', 'Amplitude', 'Analytics'], ['heap.io', 'Heap', 'Analytics'], ['heapanalytics.com', 'Heap', 'Analytics'],
  ['posthog.com', 'PostHog', 'Analytics'], ['i.posthog.com', 'PostHog', 'Analytics'], ['hotjar.com', 'Hotjar', 'Analytics'], ['clarity.ms', 'Microsoft Clarity', 'Analytics'],
  ['fullstory.com', 'FullStory', 'Analytics'], ['vercel-insights.com', 'Vercel Analytics', 'Analytics'], ['va.vercel-scripts.com', 'Vercel Analytics', 'Analytics'],
  ['cloudflareinsights.com', 'Cloudflare Web Analytics', 'Analytics'], ['usefathom.com', 'Fathom', 'Analytics'], ['simpleanalyticscdn.com', 'Simple Analytics', 'Analytics'],
  ['matomo.cloud', 'Matomo', 'Analytics'], ['quantserve.com', 'Quantcast', 'Analytics'], ['newrelic.com', 'New Relic', 'Monitoring'], ['nr-data.net', 'New Relic', 'Monitoring'],
  ['datadoghq.com', 'Datadog', 'Monitoring'], ['browser-intake-datadoghq.com', 'Datadog RUM', 'Monitoring'], ['sentry.io', 'Sentry', 'Error tracking'],
  ['sentry-cdn.com', 'Sentry', 'Error tracking'], ['bugsnag.com', 'Bugsnag', 'Error tracking'], ['logrocket.com', 'LogRocket', 'Monitoring'], ['lr-ingest.io', 'LogRocket', 'Monitoring'],
  // Ads / marketing
  ['doubleclick.net', 'Google Ads (DoubleClick)', 'Advertising'], ['googlesyndication.com', 'Google AdSense', 'Advertising'], ['googleadservices.com', 'Google Ads', 'Advertising'],
  ['facebook.net', 'Meta Pixel', 'Advertising'], ['connect.facebook.net', 'Meta Pixel', 'Advertising'], ['ads-twitter.com', 'X Ads', 'Advertising'], ['static.ads-twitter.com', 'X Ads', 'Advertising'],
  ['snap.licdn.com', 'LinkedIn Insight', 'Advertising'], ['linkedin.com', 'LinkedIn', 'Advertising'], ['bing.com', 'Microsoft Ads', 'Advertising'], ['tiktok.com', 'TikTok Pixel', 'Advertising'],
  ['redditstatic.com', 'Reddit Pixel', 'Advertising'], ['criteo.com', 'Criteo', 'Advertising'], ['taboola.com', 'Taboola', 'Advertising'], ['outbrain.com', 'Outbrain', 'Advertising'],
  ['hubspot.com', 'HubSpot', 'Marketing'], ['hs-scripts.com', 'HubSpot', 'Marketing'], ['hsforms.net', 'HubSpot Forms', 'Marketing'], ['marketo.net', 'Marketo', 'Marketing'],
  ['mktoresp.com', 'Marketo', 'Marketing'], ['pardot.com', 'Salesforce Pardot', 'Marketing'], ['klaviyo.com', 'Klaviyo', 'Marketing'], ['mailchimp.com', 'Mailchimp', 'Marketing'],
  ['optimizely.com', 'Optimizely', 'Experimentation'], ['launchdarkly.com', 'LaunchDarkly', 'Feature flags'], ['statsig.com', 'Statsig', 'Experimentation'], ['growthbook.io', 'GrowthBook', 'Experimentation'],
  ['cookielaw.org', 'OneTrust', 'Consent'], ['onetrust.com', 'OneTrust', 'Consent'], ['cookiebot.com', 'Cookiebot', 'Consent'], ['termly.io', 'Termly', 'Consent'], ['usercentrics.eu', 'Usercentrics', 'Consent'],
  // Payments
  ['js.stripe.com', 'Stripe', 'Payments'], ['stripe.com', 'Stripe', 'Payments'], ['paypal.com', 'PayPal', 'Payments'], ['paypalobjects.com', 'PayPal', 'Payments'],
  ['checkout.razorpay.com', 'Razorpay', 'Payments'], ['paddle.com', 'Paddle', 'Payments'], ['lemonsqueezy.com', 'Lemon Squeezy', 'Payments'], ['braintreegateway.com', 'Braintree', 'Payments'],
  ['adyen.com', 'Adyen', 'Payments'], ['squareup.com', 'Square', 'Payments'], ['klarna.com', 'Klarna', 'Payments'],
  // Auth
  ['accounts.google.com', 'Google Sign-In', 'Auth'], ['apis.google.com', 'Google APIs', 'Auth'], ['auth0.com', 'Auth0', 'Auth'], ['clerk.com', 'Clerk', 'Auth'],
  ['clerk.accounts.dev', 'Clerk', 'Auth'], ['okta.com', 'Okta', 'Auth'], ['appleid.cdn-apple.com', 'Sign in with Apple', 'Auth'], ['firebaseapp.com', 'Firebase Auth', 'Auth'],
  ['stytch.com', 'Stytch', 'Auth'], ['workos.com', 'WorkOS', 'Auth'], ['magic.link', 'Magic', 'Auth'],
  // Fonts
  ['fonts.googleapis.com', 'Google Fonts', 'Fonts'], ['fonts.gstatic.com', 'Google Fonts', 'Fonts'], ['use.typekit.net', 'Adobe Fonts', 'Fonts'], ['p.typekit.net', 'Adobe Fonts', 'Fonts'],
  ['fonts.bunny.net', 'Bunny Fonts', 'Fonts'], ['use.fontawesome.com', 'Font Awesome', 'Fonts'], ['kit.fontawesome.com', 'Font Awesome', 'Fonts'], ['rsms.me', 'Inter (rsms.me)', 'Fonts'],
  // CDNs
  ['cdnjs.cloudflare.com', 'cdnjs', 'CDN'], ['cdn.jsdelivr.net', 'jsDelivr', 'CDN'], ['unpkg.com', 'unpkg', 'CDN'], ['esm.sh', 'esm.sh', 'CDN'], ['code.jquery.com', 'jQuery CDN', 'CDN'],
  ['ajax.googleapis.com', 'Google Hosted Libraries', 'CDN'], ['cloudfront.net', 'Amazon CloudFront', 'CDN'], ['akamaihd.net', 'Akamai', 'CDN'], ['fastly.net', 'Fastly', 'CDN'],
  ['b-cdn.net', 'Bunny CDN', 'CDN'], ['imgix.net', 'imgix', 'Media'], ['cloudinary.com', 'Cloudinary', 'Media'], ['res.cloudinary.com', 'Cloudinary', 'Media'],
  ['ytimg.com', 'YouTube', 'Media'], ['youtube.com', 'YouTube', 'Media'], ['youtube-nocookie.com', 'YouTube', 'Media'], ['vimeo.com', 'Vimeo', 'Media'], ['vimeocdn.com', 'Vimeo', 'Media'],
  ['wistia.com', 'Wistia', 'Media'], ['mux.com', 'Mux', 'Media'], ['unsplash.com', 'Unsplash', 'Media'], ['gravatar.com', 'Gravatar', 'Media'], ['githubusercontent.com', 'GitHub content', 'Media'],
  ['framerusercontent.com', 'Framer', 'Media'], ['ctfassets.net', 'Contentful', 'CMS'], ['cdn.sanity.io', 'Sanity', 'CMS'], ['prismic.io', 'Prismic', 'CMS'], ['storyblok.com', 'Storyblok', 'CMS'],
  ['datocms-assets.com', 'DatoCMS', 'CMS'], ['webflow.com', 'Webflow', 'CMS'], ['website-files.com', 'Webflow', 'CMS'],
  // Chat / support
  ['intercom.io', 'Intercom', 'Chat & support'], ['intercomcdn.com', 'Intercom', 'Chat & support'], ['crisp.chat', 'Crisp', 'Chat & support'], ['drift.com', 'Drift', 'Chat & support'],
  ['zdassets.com', 'Zendesk', 'Chat & support'], ['zendesk.com', 'Zendesk', 'Chat & support'], ['tawk.to', 'tawk.to', 'Chat & support'], ['livechatinc.com', 'LiveChat', 'Chat & support'],
  ['hs-banner.com', 'HubSpot', 'Chat & support'], ['freshworks.com', 'Freshworks', 'Chat & support'], ['olark.com', 'Olark', 'Chat & support'], ['front.com', 'Front', 'Chat & support'],
  ['calendly.com', 'Calendly', 'Scheduling'], ['typeform.com', 'Typeform', 'Forms'], ['tally.so', 'Tally', 'Forms'], ['jotform.com', 'Jotform', 'Forms'],
  // Maps, search, misc
  ['maps.googleapis.com', 'Google Maps', 'Maps'], ['api.mapbox.com', 'Mapbox', 'Maps'], ['algolia.net', 'Algolia', 'Search'], ['algolianet.com', 'Algolia', 'Search'],
  ['recaptcha.net', 'reCAPTCHA', 'Security'], ['gstatic.com', 'Google Static', 'CDN'], ['hcaptcha.com', 'hCaptcha', 'Security'], ['challenges.cloudflare.com', 'Cloudflare Turnstile', 'Security'],
  ['supabase.co', 'Supabase', 'Backend'], ['firebaseio.com', 'Firebase', 'Backend'], ['googleapis.com', 'Google APIs', 'Backend'], ['amazonaws.com', 'AWS', 'Backend'],
  ['twitter.com', 'X (Twitter)', 'Social'], ['x.com', 'X (Twitter)', 'Social'], ['platform.twitter.com', 'X embeds', 'Social'], ['instagram.com', 'Instagram', 'Social'],
  ['disqus.com', 'Disqus', 'Social'], ['giscus.app', 'giscus', 'Social'], ['discord.com', 'Discord', 'Social'], ['github.com', 'GitHub', 'Developer'],
  ['npmjs.com', 'npm', 'Developer'], ['codesandbox.io', 'CodeSandbox', 'Developer'], ['stackblitz.com', 'StackBlitz', 'Developer'], ['openai.com', 'OpenAI', 'AI'],
];

export const CATEGORY_ORDER = [
  'Analytics', 'Monitoring', 'Error tracking', 'Advertising', 'Marketing', 'Experimentation', 'Feature flags', 'Consent', 'Payments', 'Auth',
  'Backend', 'CMS', 'Fonts', 'CDN', 'Media', 'Chat & support', 'Scheduling', 'Forms', 'Maps', 'Search', 'Security', 'Social', 'Developer', 'AI', 'Other',
];

export function classifyDomain(host: string): { name: string; category: string } | null {
  let best: [string, string, string] | null = null;
  for (const entry of THIRD_PARTY) {
    if (host === entry[0] || host.endsWith('.' + entry[0])) {
      if (!best || entry[0].length > best[0].length) best = entry;
    }
  }
  return best ? { name: best[1], category: best[2] } : null;
}
