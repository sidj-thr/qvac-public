'use strict'

const path = require('bare-path')
const fs = require('bare-fs')
const { pathToFileURL } = require('bare-url')

let _runCount = 0

async function runIntegrationModule (relativeModulePath, options = {}) {
  const modulePath = path.join(__dirname, relativeModulePath)

  if (!fs.existsSync(modulePath)) {
    console.warn(`[integration-runner] Missing module: ${relativeModulePath}`)
    return 'missing'
  }

  if (_runCount > 0) {
    if (typeof global.gc === 'function') {
      global.gc()
      console.log('[integration-runner] GC triggered between tests')
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  _runCount++

  const moduleUrl = pathToFileURL(modulePath).href
  await import(moduleUrl)
  return modulePath
}

global.runIntegrationModule = runIntegrationModule
