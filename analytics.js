// Shared GA4 property, matching Corbin's Triples. Never send SMS form data.
window.dataLayer = window.dataLayer || [];
window.gtag = function gtag() { window.dataLayer.push(arguments); };
window.gtag('js', new Date());

// Exclude query strings and fragments that could contain personal information.
function analyticsUrl(value) {
  try {
    const url = new URL(value);
    return url.origin + url.pathname;
  } catch {
    return '';
  }
}
window.gtag('config', 'G-S9QST2PH1W', {
  page_location: analyticsUrl(window.location.href),
  page_referrer: analyticsUrl(document.referrer),
});
