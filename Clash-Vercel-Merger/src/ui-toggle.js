/**
 * ENABLE_WEB_UI defaults to off. Turn it on explicitly in Vercel environment variables.
 */
export function isWebUiEnabled(raw = process.env.ENABLE_WEB_UI) {
  return typeof raw === 'string' && ['true', '1'].includes(raw.trim().toLowerCase());
}
