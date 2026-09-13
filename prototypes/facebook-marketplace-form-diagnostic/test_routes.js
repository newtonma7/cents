const assert = require('node:assert/strict');
const { isAllowedCreateUrl } = require('./route.js');

assert.equal(isAllowedCreateUrl('https://www.facebook.com/marketplace/create/item'), true);
assert.equal(isAllowedCreateUrl('https://www.facebook.com/marketplace/create/item/123'), true);
assert.equal(isAllowedCreateUrl('https://www.facebook.com/marketplace/create/itemevil'), false);
assert.equal(isAllowedCreateUrl('https://m.facebook.com/marketplace/create/item'), false);
assert.equal(isAllowedCreateUrl('https://evil.example/marketplace/create/item'), false);
console.log('route assertions: OK');
