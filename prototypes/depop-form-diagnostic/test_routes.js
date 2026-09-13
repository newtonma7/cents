const assert = require('node:assert/strict');
const { isAllowedCreateUrl } = require('./route.js');

assert.equal(isAllowedCreateUrl('https://www.depop.com/products/create'), true);
assert.equal(isAllowedCreateUrl('https://www.depop.com/products/create/123'), true);
assert.equal(isAllowedCreateUrl('https://www.depop.com/products/createevil'), false);
assert.equal(isAllowedCreateUrl('https://www.depop.com/products/create-other'), false);
assert.equal(isAllowedCreateUrl('https://evil.example/products/create'), false);
console.log('route assertions: OK');
