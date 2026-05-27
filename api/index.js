'use strict';
// NestJS TypeScript compiler (nest build) tarafından üretilen dist/ kullanılıyor.
// esbuild değil tsc ile compile edildiği için emitDecoratorMetadata çalışır.
module.exports = require('../dist/main').default;
