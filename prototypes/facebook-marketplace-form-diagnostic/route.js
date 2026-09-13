const FACEBOOK_ORIGIN = 'https://www.facebook.com';

function isAllowedCreateUrl(url) {
  try {
    const page = new URL(url);
    return page.origin === FACEBOOK_ORIGIN &&
      (page.pathname === '/marketplace/create/item' || page.pathname.startsWith('/marketplace/create/item/'));
  } catch {
    return false;
  }
}

if (typeof module !== 'undefined') module.exports = { isAllowedCreateUrl };
