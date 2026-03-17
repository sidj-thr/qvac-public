'use strict'

const test = require('brittle')

let diagnostics
try { diagnostics = require('@qvac/diagnostics') } catch (e) { diagnostics = null }

// Minimal test class that replicates the ONNXOcr constructor fields and
// _getDiagnosticsJSON method without requiring native bindings.
// This mirrors the exact implementation in index.js.
class TestOCR {
  constructor ({ params, addon }) {
    this.params = params
    this.addon = addon || null
    this.state = {
      configLoaded: false,
      weightsLoaded: false,
      destroyed: false
    }
    this._packageName = '@qvac/ocr-onnx'
    this._packageVersion = require('../../package.json').version
  }

  _getDiagnosticsJSON () {
    const jsData = {
      status: this.state.destroyed ? 'destroyed' : (this.state.configLoaded ? 'loaded' : 'not_loaded'),
      params: this.params
    }

    if (this.addon) {
      try {
        const cppJson = this.addon.getDiagnostics()
        const cppData = JSON.parse(cppJson)
        return JSON.stringify(Object.assign({}, jsData, { native: cppData }))
      } catch (err) {
        // Fall back to JS-only data if C++ diagnostics fail
      }
    }

    return JSON.stringify(jsData)
  }
}

test('ONNXOcr constructor sets _packageName', t => {
  const ocr = new TestOCR({ params: { langList: ['en'] } })
  t.is(ocr._packageName, '@qvac/ocr-onnx', '_packageName should be @qvac/ocr-onnx')
})

test('ONNXOcr constructor sets _packageVersion from package.json', t => {
  const ocr = new TestOCR({ params: { langList: ['en'] } })
  const pkg = require('../../package.json')
  t.is(ocr._packageVersion, pkg.version, '_packageVersion should match package.json version')
  t.ok(typeof ocr._packageVersion === 'string', '_packageVersion should be a string')
  t.ok(ocr._packageVersion.length > 0, '_packageVersion should not be empty')
})

test('_getDiagnosticsJSON returns valid JSON string', t => {
  const ocr = new TestOCR({ params: { langList: ['en'] } })
  const result = ocr._getDiagnosticsJSON()
  t.ok(typeof result === 'string', '_getDiagnosticsJSON should return a string')
  let parsed
  try {
    parsed = JSON.parse(result)
  } catch (e) {
    t.fail('_getDiagnosticsJSON should return valid JSON')
    return
  }
  t.ok(parsed, 'parsed JSON should be truthy')
})

test('_getDiagnosticsJSON includes expected fields', t => {
  const params = {
    langList: ['en', 'fr'],
    useGPU: true,
    pipelineMode: 'doctr',
    timeout: 60
  }
  const ocr = new TestOCR({ params })
  const parsed = JSON.parse(ocr._getDiagnosticsJSON())
  t.ok('status' in parsed, 'should include status field')
  t.ok('params' in parsed, 'should include params field')
  t.alike(parsed.params.langList, ['en', 'fr'], 'langList should match params')
  t.is(parsed.params.useGPU, true, 'useGPU should match params')
  t.is(parsed.params.pipelineMode, 'doctr', 'pipelineMode should match params')
  t.is(parsed.params.timeout, 60, 'timeout should match params')
})

test('_getDiagnosticsJSON status reflects state correctly', t => {
  const ocr = new TestOCR({ params: { langList: ['en'] } })

  t.is(JSON.parse(ocr._getDiagnosticsJSON()).status, 'not_loaded', 'should be not_loaded initially')

  ocr.state.configLoaded = true
  t.is(JSON.parse(ocr._getDiagnosticsJSON()).status, 'loaded', 'should be loaded when configLoaded=true')

  ocr.state.destroyed = true
  t.is(JSON.parse(ocr._getDiagnosticsJSON()).status, 'destroyed', 'should be destroyed when destroyed=true')
})

test('_getDiagnosticsJSON passes through all params', t => {
  const ocr = new TestOCR({ params: { langList: ['en'], custom: 'value' } })
  const parsed = JSON.parse(ocr._getDiagnosticsJSON())
  t.alike(parsed.params.langList, ['en'], 'langList passed through')
  t.is(parsed.params.custom, 'value', 'custom params passed through')
})

test('round-trip: registerAddon with OCR callback, generateReport shows addon', { skip: !diagnostics }, t => {
  diagnostics.reset()

  const ocr = new TestOCR({
    params: {
      langList: ['en'],
      useGPU: false,
      pipelineMode: 'easyocr',
      timeout: 120
    }
  })

  diagnostics.registerAddon({
    name: ocr._packageName,
    version: ocr._packageVersion,
    getDiagnostics: () => ocr._getDiagnosticsJSON()
  })

  const report = diagnostics.generateReport({ app: { name: 'test-app', version: '1.0.0' } })

  t.is(report.addons.length, 1, 'report should have one addon')
  t.is(report.addons[0].name, '@qvac/ocr-onnx', 'addon name should be @qvac/ocr-onnx')
  t.is(report.addons[0].version, ocr._packageVersion, 'addon version should match package version')
  t.ok(typeof report.addons[0].diagnostics === 'string', 'diagnostics should be a string')

  const addonDiag = JSON.parse(report.addons[0].diagnostics)
  t.ok('status' in addonDiag, 'diagnostics should include status')
  t.ok('params' in addonDiag, 'diagnostics should include params')

  diagnostics.reset()
})

test('_getDiagnosticsJSON merges C++ native data when addon is available', t => {
  const mockCppData = {
    onnxRuntimeVersion: 18,
    executionProvider: 'CPU',
    availableProviders: ['CPUExecutionProvider'],
    modelLoaded: true,
    modelPathDetector: '/path/to/detector.onnx',
    modelPathRecognizer: '/path/to/recognizer.onnx',
    pipelineMode: 'EASYOCR',
    timeout: 120,
    sessionOptions: {
      recognizerBatchSize: 32,
      magRatio: 1.5,
      contrastRetry: false,
      lowConfidenceThreshold: 0.4
    }
  }

  const mockAddon = {
    getDiagnostics () {
      return JSON.stringify(mockCppData)
    }
  }

  const ocr = new TestOCR({
    params: { langList: ['en'], useGPU: false },
    addon: mockAddon
  })
  ocr.state.configLoaded = true

  const parsed = JSON.parse(ocr._getDiagnosticsJSON())
  t.ok('status' in parsed, 'should include JS status field')
  t.ok('params' in parsed, 'should include JS params field')
  t.ok('native' in parsed, 'should include native field with C++ data')
  t.is(parsed.native.executionProvider, 'CPU', 'native should contain executionProvider')
  t.is(parsed.native.modelLoaded, true, 'native should contain modelLoaded')
  t.is(parsed.native.pipelineMode, 'EASYOCR', 'native should contain pipelineMode')
  t.ok(typeof parsed.native.onnxRuntimeVersion === 'number', 'onnxRuntimeVersion should be a number')
  t.ok(Array.isArray(parsed.native.availableProviders), 'availableProviders should be an array')
  t.ok('sessionOptions' in parsed.native, 'native should contain sessionOptions')
})

test('_getDiagnosticsJSON falls back to JS-only when addon.getDiagnostics throws', t => {
  const mockAddon = {
    getDiagnostics () {
      throw new Error('native binding not available')
    }
  }

  const ocr = new TestOCR({
    params: { langList: ['en'] },
    addon: mockAddon
  })

  const parsed = JSON.parse(ocr._getDiagnosticsJSON())
  t.ok('status' in parsed, 'should include status field')
  t.ok('params' in parsed, 'should include params field')
  t.absent(parsed.native, 'should not include native field on error')
})

test('_getDiagnosticsJSON falls back to JS-only when addon is null', t => {
  const ocr = new TestOCR({
    params: { langList: ['en'] }
  })

  const parsed = JSON.parse(ocr._getDiagnosticsJSON())
  t.ok('status' in parsed, 'should include status field')
  t.ok('params' in parsed, 'should include params field')
  t.absent(parsed.native, 'should not include native field when addon is null')
})
