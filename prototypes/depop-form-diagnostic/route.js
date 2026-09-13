const DEPOP_ORIGIN = 'https://www.depop.com';

function isAllowedCreateUrl(url) {
  try {
    const page = new URL(url);
    return page.origin === DEPOP_ORIGIN &&
      (page.pathname === '/products/create' || page.pathname.startsWith('/products/create/'));
  } catch {
    return false;
  }
}

if (typeof module !== 'undefined') module.exports = { isAllowedCreateUrl };
