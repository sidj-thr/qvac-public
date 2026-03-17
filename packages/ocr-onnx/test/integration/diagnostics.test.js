'use strict'

const { ONNXOcr } = require('../..')
const test = require('brittle')
const { isMobile, ensureModelPath } = require('./utils')

const MOBILE_TIMEOUT = 600 * 1000
const DESKTOP_TIMEOUT = 120 * 1000
const TEST_TIMEOUT = isMobile ? MOBILE_TIMEOUT : DESKTOP_TIMEOUT

// Expected C++ diagnostic fields returned by getDiagnosticsJSON()
const EXPECTED_NATIVE_FIELDS = [
  'onnxRuntimeVersion',
  'executionProvider',
  'availableProviders',
  'modelLoaded',
  'modelPathDetector',
  'modelPathRecognizer',
  'pipelineMode',
  'timeout',
  'sessionOptions'
]

// EasyOCR-specific sessionOptions fields
const EASYOCR_SESSION_FIELDS = [
  'recognizerBatchSize',
  'magRatio',
  'contrastRetry',
  'lowConfidenceThreshold'
]

// DocTR-specific sessionOptions fields
const DOCTR_SESSION_FIELDS = [
  'recognizerBatchSize',
  'decodingMethod',
  'straightenPages'
]

async function createEasyOcrInstance () {
  const detectorPath = await ensureModelPath('detector_craft')
  const recognizerPath = await ensureModelPath('recognizer_latin')

  return new ONNXOcr({
    params: {
      pathDetector: detectorPath,
      pathRecognizer: recognizerPath,
      langList: ['en'],
      useGPU: false
    }
  })
}

test('getDiagnostics before model activation returns JS-only diagnostics', { timeout: TEST_TIMEOUT }, async function (t) {
  const onnxOcr = await createEasyOcrInstance()

  // Before load(), addon is null so we get JS-only data
  const json = onnxOcr._getDiagnosticsJSON()
  t.ok(typeof json === 'string', '_getDiagnosticsJSON should return a string')

  const parsed = JSON.parse(json)
  t.ok('status' in parsed, 'should include status field')
  t.ok('params' in parsed, 'should include params field')
  t.is(parsed.status, 'not_loaded', 'status should be not_loaded before activation')
  t.absent(parsed.native, 'should not include native field before addon is created')
})

test('getDiagnostics after model activation includes C++ native fields', { timeout: TEST_TIMEOUT }, async function (t) {
  const onnxOcr = await createEasyOcrInstance()

  await onnxOcr.load()

  try {
    const json = onnxOcr._getDiagnosticsJSON()
    t.ok(typeof json === 'string', '_getDiagnosticsJSON should return a string')

    let parsed
    try {
      parsed = JSON.parse(json)
    } catch (e) {
      t.fail('_getDiagnosticsJSON should return valid JSON: ' + e.message)
      return
    }

    t.ok('status' in parsed, 'should include JS status field')
    t.ok('params' in parsed, 'should include JS params field')
    t.ok('native' in parsed, 'should include native field after addon is loaded')

    const native = parsed.native
    for (const field of EXPECTED_NATIVE_FIELDS) {
      t.ok(field in native, 'native diagnostics should include field: ' + field)
    }

    t.comment('native diagnostics: ' + JSON.stringify(native))
  } finally {
    await onnxOcr.unload()
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
})

test('getDiagnostics native.modelLoaded is true after activation', { timeout: TEST_TIMEOUT }, async function (t) {
  const onnxOcr = await createEasyOcrInstance()

  await onnxOcr.load()

  try {
    const native = JSON.parse(onnxOcr._getDiagnosticsJSON()).native
    t.is(native.modelLoaded, true, 'modelLoaded should be true after load()')
  } finally {
    await onnxOcr.unload()
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
})

test('getDiagnostics native.modelLoaded changes between before and after load', { timeout: TEST_TIMEOUT }, async function (t) {
  const onnxOcr = await createEasyOcrInstance()

  // Before load: no native field
  const beforeParsed = JSON.parse(onnxOcr._getDiagnosticsJSON())
  t.absent(beforeParsed.native, 'native field absent before load')

  await onnxOcr.load()

  try {
    const afterParsed = JSON.parse(onnxOcr._getDiagnosticsJSON())
    t.ok('native' in afterParsed, 'native field present after load')
    t.is(afterParsed.native.modelLoaded, true, 'modelLoaded should be true after load')
  } finally {
    await onnxOcr.unload()
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
})

test('getDiagnostics native.executionProvider is CPU when useGPU is false', { timeout: TEST_TIMEOUT }, async function (t) {
  const onnxOcr = await createEasyOcrInstance()

  await onnxOcr.load()

  try {
    const native = JSON.parse(onnxOcr._getDiagnosticsJSON()).native
    t.ok(typeof native.executionProvider === 'string', 'executionProvider should be a string')
    t.is(native.executionProvider, 'CPU', 'executionProvider should be CPU when useGPU=false')
  } finally {
    await onnxOcr.unload()
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
})

test('getDiagnostics native.availableProviders is a non-empty array', { timeout: TEST_TIMEOUT }, async function (t) {
  const onnxOcr = await createEasyOcrInstance()

  await onnxOcr.load()

  try {
    const native = JSON.parse(onnxOcr._getDiagnosticsJSON()).native
    t.ok(Array.isArray(native.availableProviders), 'availableProviders should be an array')
    t.ok(native.availableProviders.length > 0, 'availableProviders should not be empty')
    t.comment('availableProviders: ' + JSON.stringify(native.availableProviders))
  } finally {
    await onnxOcr.unload()
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
})

test('getDiagnostics native.onnxRuntimeVersion is a number', { timeout: TEST_TIMEOUT }, async function (t) {
  const onnxOcr = await createEasyOcrInstance()

  await onnxOcr.load()

  try {
    const native = JSON.parse(onnxOcr._getDiagnosticsJSON()).native
    t.ok(typeof native.onnxRuntimeVersion === 'number', 'onnxRuntimeVersion should be a number')
    t.ok(native.onnxRuntimeVersion > 0, 'onnxRuntimeVersion should be positive')
    t.comment('onnxRuntimeVersion: ' + native.onnxRuntimeVersion)
  } finally {
    await onnxOcr.unload()
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
})

test('getDiagnostics native.pipelineMode is EASYOCR for default mode', { timeout: TEST_TIMEOUT }, async function (t) {
  const onnxOcr = await createEasyOcrInstance()

  await onnxOcr.load()

  try {
    const native = JSON.parse(onnxOcr._getDiagnosticsJSON()).native
    t.is(native.pipelineMode, 'EASYOCR', 'pipelineMode should be EASYOCR for default (EasyOCR) mode')
  } finally {
    await onnxOcr.unload()
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
})

test('getDiagnostics native.modelPathDetector and modelPathRecognizer reflect params', { timeout: TEST_TIMEOUT }, async function (t) {
  const detectorPath = await ensureModelPath('detector_craft')
  const recognizerPath = await ensureModelPath('recognizer_latin')

  const onnxOcr = new ONNXOcr({
    params: {
      pathDetector: detectorPath,
      pathRecognizer: recognizerPath,
      langList: ['en'],
      useGPU: false
    }
  })

  await onnxOcr.load()

  try {
    const native = JSON.parse(onnxOcr._getDiagnosticsJSON()).native
    t.ok(typeof native.modelPathDetector === 'string', 'modelPathDetector should be a string')
    t.ok(typeof native.modelPathRecognizer === 'string', 'modelPathRecognizer should be a string')
    t.ok(native.modelPathDetector.length > 0, 'modelPathDetector should not be empty')
    t.ok(native.modelPathRecognizer.length > 0, 'modelPathRecognizer should not be empty')
    t.comment('modelPathDetector: ' + native.modelPathDetector)
    t.comment('modelPathRecognizer: ' + native.modelPathRecognizer)
  } finally {
    await onnxOcr.unload()
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
})

test('getDiagnostics native.timeout reflects configured timeout', { timeout: TEST_TIMEOUT }, async function (t) {
  const detectorPath = await ensureModelPath('detector_craft')
  const recognizerPath = await ensureModelPath('recognizer_latin')
  const configuredTimeout = 90

  const onnxOcr = new ONNXOcr({
    params: {
      pathDetector: detectorPath,
      pathRecognizer: recognizerPath,
      langList: ['en'],
      useGPU: false,
      timeout: configuredTimeout
    }
  })

  await onnxOcr.load()

  try {
    const native = JSON.parse(onnxOcr._getDiagnosticsJSON()).native
    t.is(native.timeout, configuredTimeout, 'timeout in diagnostics should match configured value')
  } finally {
    await onnxOcr.unload()
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
})

test('getDiagnostics EasyOCR sessionOptions contains expected fields', { timeout: TEST_TIMEOUT }, async function (t) {
  const onnxOcr = await createEasyOcrInstance()

  await onnxOcr.load()

  try {
    const native = JSON.parse(onnxOcr._getDiagnosticsJSON()).native
    t.ok(typeof native.sessionOptions === 'object', 'sessionOptions should be an object')

    for (const field of EASYOCR_SESSION_FIELDS) {
      t.ok(field in native.sessionOptions, 'EasyOCR sessionOptions should include field: ' + field)
    }

    t.comment('sessionOptions: ' + JSON.stringify(native.sessionOptions))
  } finally {
    await onnxOcr.unload()
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
})

test('getDiagnostics DocTR sessionOptions contains expected fields', { timeout: TEST_TIMEOUT }, async function (t) {
  const detectorPath = await ensureModelPath('detector_craft')
  const recognizerPath = await ensureModelPath('recognizer_latin')

  const onnxOcr = new ONNXOcr({
    params: {
      pathDetector: detectorPath,
      pathRecognizer: recognizerPath,
      langList: ['en'],
      useGPU: false,
      pipelineMode: 'doctr'
    }
  })

  await onnxOcr.load()

  try {
    const native = JSON.parse(onnxOcr._getDiagnosticsJSON()).native
    t.is(native.pipelineMode, 'DOCTR', 'pipelineMode should be DOCTR')
    t.ok(typeof native.sessionOptions === 'object', 'sessionOptions should be an object')

    for (const field of DOCTR_SESSION_FIELDS) {
      t.ok(field in native.sessionOptions, 'DocTR sessionOptions should include field: ' + field)
    }

    t.comment('DocTR sessionOptions: ' + JSON.stringify(native.sessionOptions))
  } finally {
    await onnxOcr.unload()
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
})

test('_getDiagnosticsJSON returns valid JSON after unload (no addon)', { timeout: TEST_TIMEOUT }, async function (t) {
  const onnxOcr = await createEasyOcrInstance()

  await onnxOcr.load()
  await onnxOcr.unload()
  await new Promise(resolve => setTimeout(resolve, 1000))

  const json = onnxOcr._getDiagnosticsJSON()
  t.ok(typeof json === 'string', '_getDiagnosticsJSON should return a string after unload')

  let parsed
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    t.fail('_getDiagnosticsJSON should return valid JSON after unload: ' + e.message)
    return
  }

  t.ok('status' in parsed, 'should include status field after unload')
  t.absent(parsed.native, 'should not include native field after unload (addon is null)')
})
