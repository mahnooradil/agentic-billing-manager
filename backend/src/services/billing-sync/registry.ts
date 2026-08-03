/**
 * Billing-sync adapter registry — the single lookup by Pipedream `nameSlug`.
 * Adding a platform is one adapter file + one entry here (mirrors the existing
 * native-provider registry at services/integrations/registry.ts).
 */
import type { BillingSyncAdapter } from "@/services/billing-sync/types";
import { bunnycdnBillingAdapter } from "@/services/billing-sync/adapters/bunnycdn.adapter";
import { digitaloceanBillingAdapter } from "@/services/billing-sync/adapters/digitalocean.adapter";
import { vonageBillingAdapter } from "@/services/billing-sync/adapters/vonage.adapter";
import { telnyxBillingAdapter } from "@/services/billing-sync/adapters/telnyx.adapter";
import { infobipBillingAdapter } from "@/services/billing-sync/adapters/infobip.adapter";
import { textmagicBillingAdapter } from "@/services/billing-sync/adapters/textmagic.adapter";
import { temiBillingAdapter } from "@/services/billing-sync/adapters/temi.adapter";
import { tremendousBillingAdapter } from "@/services/billing-sync/adapters/tremendous.adapter";
import { streamwishBillingAdapter } from "@/services/billing-sync/adapters/streamwish.adapter";
import { githubBillingAdapter } from "@/services/billing-sync/adapters/github.adapter";
import { twilioBillingAdapter } from "@/services/billing-sync/adapters/twilio.adapter";
import { vercelBillingAdapter } from "@/services/billing-sync/adapters/vercel.adapter";
import { printnodeBillingAdapter } from "@/services/billing-sync/adapters/printnode.adapter";
import { herokuBillingAdapter } from "@/services/billing-sync/adapters/heroku.adapter";
import { mongodbBillingAdapter } from "@/services/billing-sync/adapters/mongodb.adapter";
import { cloudflareBillingAdapter } from "@/services/billing-sync/adapters/cloudflare.adapter";
import { deepgramBillingAdapter } from "@/services/billing-sync/adapters/deepgram.adapter";
import { openrouterBillingAdapter } from "@/services/billing-sync/adapters/openrouter.adapter";
import { northflankBillingAdapter } from "@/services/billing-sync/adapters/northflank.adapter";
import { wiseBillingAdapter } from "@/services/billing-sync/adapters/wise.adapter";
import { runpodBillingAdapter } from "@/services/billing-sync/adapters/runpod.adapter";
import { grafanaBillingAdapter } from "@/services/billing-sync/adapters/grafana.adapter";
import { snapchatMarketingBillingAdapter } from "@/services/billing-sync/adapters/snapchat-marketing.adapter";
import { datadogBillingAdapter } from "@/services/billing-sync/adapters/datadog.adapter";
import { flutterwaveBillingAdapter } from "@/services/billing-sync/adapters/flutterwave.adapter";
import { messagebirdBillingAdapter } from "@/services/billing-sync/adapters/messagebird.adapter";
import { linodeBillingAdapter } from "@/services/billing-sync/adapters/linode.adapter";
import { vultrBillingAdapter } from "@/services/billing-sync/adapters/vultr.adapter";
import { stripeBillingAdapter } from "@/services/billing-sync/adapters/stripe.adapter";
import { paypalBillingAdapter } from "@/services/billing-sync/adapters/paypal.adapter";
import { upcloudBillingAdapter } from "@/services/billing-sync/adapters/upcloud.adapter";
import { airwallexBillingAdapter } from "@/services/billing-sync/adapters/airwallex.adapter";
import { mollieBillingAdapter } from "@/services/billing-sync/adapters/mollie.adapter";
import { revolutBusinessBillingAdapter } from "@/services/billing-sync/adapters/revolut-business.adapter";
import { coinbaseBillingAdapter } from "@/services/billing-sync/adapters/coinbase.adapter";
import { alpacaBillingAdapter } from "@/services/billing-sync/adapters/alpaca.adapter";
import { openaiBillingAdapter } from "@/services/billing-sync/adapters/openai.adapter";
import { anthropicBillingAdapter } from "@/services/billing-sync/adapters/anthropic.adapter";
import { clicksendBillingAdapter } from "@/services/billing-sync/adapters/clicksend.adapter";
import { gocardlessBillingAdapter } from "@/services/billing-sync/adapters/gocardless.adapter";
import { fortySixElksBillingAdapter } from "@/services/billing-sync/adapters/46elks.adapter";
import { telesignBillingAdapter } from "@/services/billing-sync/adapters/telesign.adapter";
import { zadarmaBillingAdapter } from "@/services/billing-sync/adapters/zadarma.adapter";
import { scalewayBillingAdapter } from "@/services/billing-sync/adapters/scaleway.adapter";
import { facebookAdsBillingAdapter } from "@/services/billing-sync/adapters/facebook-ads.adapter";
import { ebayBillingAdapter } from "@/services/billing-sync/adapters/ebay.adapter";
import { signalwireBillingAdapter } from "@/services/billing-sync/adapters/signalwire.adapter";
import { deepseekBillingAdapter } from "@/services/billing-sync/adapters/deepseek.adapter";
import { xaiBillingAdapter } from "@/services/billing-sync/adapters/xai.adapter";
import { d7networksBillingAdapter } from "@/services/billing-sync/adapters/d7networks.adapter";
import { moceanBillingAdapter } from "@/services/billing-sync/adapters/mocean.adapter";
import { labsmobileBillingAdapter } from "@/services/billing-sync/adapters/labsmobile.adapter";
import { octopushBillingAdapter } from "@/services/billing-sync/adapters/octopush.adapter";
import { sevenBillingAdapter } from "@/services/billing-sync/adapters/seven.adapter";
import { aimlApiBillingAdapter } from "@/services/billing-sync/adapters/aiml-api.adapter";
import { elevenlabsBillingAdapter } from "@/services/billing-sync/adapters/elevenlabs.adapter";
import { dreamstudioBillingAdapter } from "@/services/billing-sync/adapters/dreamstudio.adapter";
import { heygenBillingAdapter } from "@/services/billing-sync/adapters/heygen.adapter";
import { runwayBillingAdapter } from "@/services/billing-sync/adapters/runway.adapter";
import { straicoBillingAdapter } from "@/services/billing-sync/adapters/straico.adapter";
import { crawlbaseBillingAdapter } from "@/services/billing-sync/adapters/crawlbase.adapter";
import { scrapingbeeBillingAdapter } from "@/services/billing-sync/adapters/scrapingbee.adapter";
import { firecrawlBillingAdapter } from "@/services/billing-sync/adapters/firecrawl.adapter";
import { diffbotBillingAdapter } from "@/services/billing-sync/adapters/diffbot.adapter";
import { serpapiBillingAdapter } from "@/services/billing-sync/adapters/serpapi.adapter";
import { apifyBillingAdapter } from "@/services/billing-sync/adapters/apify.adapter";
import { scrapingantBillingAdapter } from "@/services/billing-sync/adapters/scrapingant.adapter";
import { scrapflyBillingAdapter } from "@/services/billing-sync/adapters/scrapfly.adapter";
import { scrapingdogBillingAdapter } from "@/services/billing-sync/adapters/scrapingdog.adapter";
import { webscrapingAiBillingAdapter } from "@/services/billing-sync/adapters/webscraping-ai.adapter";
import { hunterBillingAdapter } from "@/services/billing-sync/adapters/hunter.adapter";
import { zerobounceBillingAdapter } from "@/services/billing-sync/adapters/zerobounce.adapter";
import { verifaliaBillingAdapter } from "@/services/billing-sync/adapters/verifalia.adapter";
import { genderApiBillingAdapter } from "@/services/billing-sync/adapters/gender-api.adapter";
import { genderapiIoBillingAdapter } from "@/services/billing-sync/adapters/genderapi-io.adapter";
import { prospeoBillingAdapter } from "@/services/billing-sync/adapters/prospeo.adapter";
import { msg91BillingAdapter } from "@/services/billing-sync/adapters/msg91.adapter";
import { smsapiBillingAdapter } from "@/services/billing-sync/adapters/smsapi.adapter";
import { voodooSmsBillingAdapter } from "@/services/billing-sync/adapters/voodoo-sms.adapter";
import { stannpBillingAdapter } from "@/services/billing-sync/adapters/stannp.adapter";
import { ipinfoBillingAdapter } from "@/services/billing-sync/adapters/ipinfo.adapter";
import { viewdnsBillingAdapter } from "@/services/billing-sync/adapters/viewdns.adapter";
import { wappalyzerBillingAdapter } from "@/services/billing-sync/adapters/wappalyzer.adapter";
import { gtmetrixBillingAdapter } from "@/services/billing-sync/adapters/gtmetrix.adapter";
import { cloudconvertBillingAdapter } from "@/services/billing-sync/adapters/cloudconvert.adapter";
import { pdfCoBillingAdapter } from "@/services/billing-sync/adapters/pdf-co.adapter";
import { templatedBillingAdapter } from "@/services/billing-sync/adapters/templated.adapter";
import { lmntBillingAdapter } from "@/services/billing-sync/adapters/lmnt.adapter";
import { pushoverBillingAdapter } from "@/services/billing-sync/adapters/pushover.adapter";
import { hellosignBillingAdapter } from "@/services/billing-sync/adapters/hellosign.adapter";
import { eodhdBillingAdapter } from "@/services/billing-sync/adapters/eodhd.adapter";
import { rocketreachBillingAdapter } from "@/services/billing-sync/adapters/rocketreach.adapter";
import { phaxioBillingAdapter } from "@/services/billing-sync/adapters/phaxio.adapter";
import { removebgBillingAdapter } from "@/services/billing-sync/adapters/removebg.adapter";
import { mistralAiBillingAdapter } from "@/services/billing-sync/adapters/mistral-ai.adapter";
import { perplexityBillingAdapter } from "@/services/billing-sync/adapters/perplexity.adapter";
import { mobivateBillingAdapter } from "@/services/billing-sync/adapters/mobivate.adapter";
import { ones2uBillingAdapter } from "@/services/billing-sync/adapters/ones2u.adapter";
import { click2mailBillingAdapter } from "@/services/billing-sync/adapters/click2mail.adapter";
import { phantombusterBillingAdapter } from "@/services/billing-sync/adapters/phantombuster.adapter";
import { llmwhispererBillingAdapter } from "@/services/billing-sync/adapters/llmwhisperer.adapter";
import { sendgridBillingAdapter } from "@/services/billing-sync/adapters/sendgrid.adapter";
import { httpsmsBillingAdapter } from "@/services/billing-sync/adapters/httpsms.adapter";
import { ezTextingBillingAdapter } from "@/services/billing-sync/adapters/ez-texting.adapter";
import { fullenrichBillingAdapter } from "@/services/billing-sync/adapters/fullenrich.adapter";
import { findymailBillingAdapter } from "@/services/billing-sync/adapters/findymail.adapter";
import { linkupBillingAdapter } from "@/services/billing-sync/adapters/linkup.adapter";
import { spiderBillingAdapter } from "@/services/billing-sync/adapters/spider.adapter";
import { pcloudBillingAdapter } from "@/services/billing-sync/adapters/pcloud.adapter";
import { screenshotoneBillingAdapter } from "@/services/billing-sync/adapters/screenshotone.adapter";
import { textrazorBillingAdapter } from "@/services/billing-sync/adapters/textrazor.adapter";
import { tombaBillingAdapter } from "@/services/billing-sync/adapters/tomba.adapter";
import { twelvedataBillingAdapter } from "@/services/billing-sync/adapters/twelvedata.adapter";
import { scrapeopsBillingAdapter } from "@/services/billing-sync/adapters/scrapeops.adapter";
import { scrapelessBillingAdapter } from "@/services/billing-sync/adapters/scrapeless.adapter";
import { scrapecreatorsBillingAdapter } from "@/services/billing-sync/adapters/scrapecreators.adapter";
import { zyteBillingAdapter } from "@/services/billing-sync/adapters/zyte.adapter";
import { serpdogBillingAdapter } from "@/services/billing-sync/adapters/serpdog.adapter";
import { coingeckoBillingAdapter } from "@/services/billing-sync/adapters/coingecko.adapter";
import { coinmarketcapBillingAdapter } from "@/services/billing-sync/adapters/coinmarketcap.adapter";
import { etherscanBillingAdapter } from "@/services/billing-sync/adapters/etherscan.adapter";
import { currencyapiBillingAdapter } from "@/services/billing-sync/adapters/currencyapi.adapter";
import { openexchangeratesBillingAdapter } from "@/services/billing-sync/adapters/openexchangerates.adapter";
import { emailverifyIoBillingAdapter } from "@/services/billing-sync/adapters/emailverify-io.adapter";
import { interzoidBillingAdapter } from "@/services/billing-sync/adapters/interzoid.adapter";
import { cloudlayerBillingAdapter } from "@/services/billing-sync/adapters/cloudlayer.adapter";
import { convertapiBillingAdapter } from "@/services/billing-sync/adapters/convertapi.adapter";
import { rebrandlyBillingAdapter } from "@/services/billing-sync/adapters/rebrandly.adapter";
import { exaBillingAdapter } from "@/services/billing-sync/adapters/exa.adapter";

/** Normalizes a Pipedream nameSlug for comparison (case/dash/underscore-insensitive). */
function normalize(slug: string): string {
  return slug.trim().toLowerCase().replace(/[-_]/g, "");
}

const adapters: Record<string, BillingSyncAdapter> = {};
for (const adapter of [
  bunnycdnBillingAdapter,
  digitaloceanBillingAdapter,
  vonageBillingAdapter,
  telnyxBillingAdapter,
  infobipBillingAdapter,
  textmagicBillingAdapter,
  temiBillingAdapter,
  tremendousBillingAdapter,
  streamwishBillingAdapter,
  githubBillingAdapter,
  twilioBillingAdapter,
  vercelBillingAdapter,
  printnodeBillingAdapter,
  herokuBillingAdapter,
  mongodbBillingAdapter,
  cloudflareBillingAdapter,
  deepgramBillingAdapter,
  openrouterBillingAdapter,
  northflankBillingAdapter,
  wiseBillingAdapter,
  runpodBillingAdapter,
  grafanaBillingAdapter,
  snapchatMarketingBillingAdapter,
  datadogBillingAdapter,
  flutterwaveBillingAdapter,
  messagebirdBillingAdapter,
  linodeBillingAdapter,
  vultrBillingAdapter,
  stripeBillingAdapter,
  paypalBillingAdapter,
  upcloudBillingAdapter,
  airwallexBillingAdapter,
  mollieBillingAdapter,
  revolutBusinessBillingAdapter,
  coinbaseBillingAdapter,
  alpacaBillingAdapter,
  openaiBillingAdapter,
  anthropicBillingAdapter,
  clicksendBillingAdapter,
  gocardlessBillingAdapter,
  fortySixElksBillingAdapter,
  telesignBillingAdapter,
  zadarmaBillingAdapter,
  scalewayBillingAdapter,
  facebookAdsBillingAdapter,
  ebayBillingAdapter,
  signalwireBillingAdapter,
  deepseekBillingAdapter,
  xaiBillingAdapter,
  d7networksBillingAdapter,
  moceanBillingAdapter,
  labsmobileBillingAdapter,
  octopushBillingAdapter,
  sevenBillingAdapter,
  aimlApiBillingAdapter,
  elevenlabsBillingAdapter,
  dreamstudioBillingAdapter,
  heygenBillingAdapter,
  runwayBillingAdapter,
  straicoBillingAdapter,
  crawlbaseBillingAdapter,
  scrapingbeeBillingAdapter,
  firecrawlBillingAdapter,
  diffbotBillingAdapter,
  serpapiBillingAdapter,
  apifyBillingAdapter,
  scrapingantBillingAdapter,
  scrapflyBillingAdapter,
  scrapingdogBillingAdapter,
  webscrapingAiBillingAdapter,
  hunterBillingAdapter,
  zerobounceBillingAdapter,
  verifaliaBillingAdapter,
  genderApiBillingAdapter,
  genderapiIoBillingAdapter,
  prospeoBillingAdapter,
  msg91BillingAdapter,
  smsapiBillingAdapter,
  voodooSmsBillingAdapter,
  stannpBillingAdapter,
  ipinfoBillingAdapter,
  viewdnsBillingAdapter,
  wappalyzerBillingAdapter,
  gtmetrixBillingAdapter,
  cloudconvertBillingAdapter,
  pdfCoBillingAdapter,
  templatedBillingAdapter,
  lmntBillingAdapter,
  pushoverBillingAdapter,
  hellosignBillingAdapter,
  eodhdBillingAdapter,
  rocketreachBillingAdapter,
  phaxioBillingAdapter,
  removebgBillingAdapter,
  mistralAiBillingAdapter,
  perplexityBillingAdapter,
  mobivateBillingAdapter,
  ones2uBillingAdapter,
  click2mailBillingAdapter,
  phantombusterBillingAdapter,
  llmwhispererBillingAdapter,
  sendgridBillingAdapter,
  httpsmsBillingAdapter,
  ezTextingBillingAdapter,
  fullenrichBillingAdapter,
  findymailBillingAdapter,
  linkupBillingAdapter,
  spiderBillingAdapter,
  pcloudBillingAdapter,
  screenshotoneBillingAdapter,
  textrazorBillingAdapter,
  tombaBillingAdapter,
  twelvedataBillingAdapter,
  scrapeopsBillingAdapter,
  scrapelessBillingAdapter,
  scrapecreatorsBillingAdapter,
  zyteBillingAdapter,
  serpdogBillingAdapter,
  coingeckoBillingAdapter,
  coinmarketcapBillingAdapter,
  etherscanBillingAdapter,
  currencyapiBillingAdapter,
  openexchangeratesBillingAdapter,
  emailverifyIoBillingAdapter,
  interzoidBillingAdapter,
  cloudlayerBillingAdapter,
  convertapiBillingAdapter,
  rebrandlyBillingAdapter,
  exaBillingAdapter,
]) {
  adapters[normalize(adapter.platform)] = adapter;
}

/** The billing-sync adapter for a platform (by Pipedream nameSlug), if any. */
export function getBillingSyncAdapter(platform: string): BillingSyncAdapter | undefined {
  return adapters[normalize(platform)];
}

/** True when auto-sync is available for this platform at all. */
export function hasBillingSyncAdapter(platform: string): boolean {
  return Boolean(getBillingSyncAdapter(platform));
}
