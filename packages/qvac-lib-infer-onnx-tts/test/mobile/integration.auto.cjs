'use strict'
require('./integration-runtime.cjs')

// AUTO-GENERATED FILE. Run `npm run test:mobile:generate` to update.
// Each function mirrors a single file under test/integration/.

/* global runIntegrationModule */

async function runAddonLongTest (options = {}) { // eslint-disable-line no-unused-vars
  return runIntegrationModule('../integration/addon.long.test.js', options)
}

async function runAddonShortTest (options = {}) { // eslint-disable-line no-unused-vars
  return runIntegrationModule('../integration/addon.short.test.js', options)
}
