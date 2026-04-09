'use strict'

const test = require('brittle')
const os = require('bare-os')
const path = require('bare-path')
const { loadChatterboxTTS, runChatterboxTTS } = require('../utils/runChatterboxTTS')
const { loadSupertonicTTS, runSupertonicTTS } = require('../utils/runSupertonicTTS')
const { ensureChatterboxModels, ensureSupertonicModels, ensureSupertonicModelsMultilingual, ensureWhisperModel } = require('../utils/downloadModel')
const { loadWhisper, runWhisper } = require('../utils/runWhisper')

const platform = os.platform()
const isMobile = platform === 'ios' || platform === 'android'

const CHATTERBOX_VARIANT = os.getEnv('CHATTERBOX_VARIANT') || 'fp32'
const VARIANT_SUFFIX = CHATTERBOX_VARIANT === 'fp32' ? '' : `_${CHATTERBOX_VARIANT}`

function chatterboxPath (modelDir, baseName, isMultilingual = false) {
  const suffix = isMultilingual ? '' : VARIANT_SUFFIX
  return path.join(modelDir, `${baseName}${suffix}.onnx`)
}

function chatterboxLmPath (modelDir) {
  return path.join(modelDir, `language_model${VARIANT_SUFFIX}.onnx`)
}

function getBaseDir () {
  return isMobile && global.testDir ? global.testDir : '.'
}

const CHATTERBOX_EXPECTATION = {
  minSamples: 5000,
  maxSamples: 5000000,
  minDurationMs: 200,
  maxDurationMs: 300000
}

// ---------------------------------------------------------------------------
// Chatterbox TTS: English synthesis with WER
// ---------------------------------------------------------------------------

test('Chatterbox TTS: English synthesis with WER', { timeout: 3600000 }, async (t) => {
  const baseDir = getBaseDir()
  const modelDir = path.join(baseDir, 'models', 'chatterbox')
  const whisperModelDir = path.join(baseDir, 'models', 'whisper')

  console.log('\n=== Ensuring Chatterbox English models ===')
  const download = await ensureChatterboxModels({ targetDir: modelDir, variant: CHATTERBOX_VARIANT })
  t.ok(download.success, 'Chatterbox English models should be downloaded')
  if (!download.success) return

  console.log('\n=== Ensuring Whisper model ===')
  const whisperDownload = await ensureWhisperModel(path.join(whisperModelDir, 'ggml-small.bin'))
  t.ok(whisperDownload.success, 'Whisper model should be downloaded')
  if (!whisperDownload.success) return

  console.log('\n=== Loading Chatterbox English model ===')
  const model = await loadChatterboxTTS({
    tokenizerPath: path.join(modelDir, 'tokenizer.json'),
    speechEncoderPath: chatterboxPath(modelDir, 'speech_encoder'),
    embedTokensPath: chatterboxPath(modelDir, 'embed_tokens'),
    conditionalDecoderPath: chatterboxPath(modelDir, 'conditional_decoder'),
    languageModelPath: chatterboxLmPath(modelDir),
    language: 'en'
  })
  t.ok(model, 'Chatterbox English model should be loaded')

  const text = 'The quick brown fox jumps over the lazy dog.'
  console.log(`\n=== Synthesizing: "${text}" ===`)
  const result = await runChatterboxTTS(model, { text }, CHATTERBOX_EXPECTATION)
  console.log(result.output)
  t.ok(result.passed, 'Chatterbox English synthesis should pass sample expectations')
  t.ok(result.data.sampleCount > 0, 'Chatterbox English should produce audio samples')

  await model.unload()
  t.pass('Chatterbox English model unloaded')

  const wavBuffer = result.data?.wavBuffer ? Buffer.from(result.data.wavBuffer) : null
  if (!wavBuffer) {
    t.fail('No WAV buffer produced for WER check')
    return
  }

  console.log('\n=== WER verification [en] ===')
  const whisperModel = await loadWhisper({
    modelName: 'ggml-small.bin',
    diskPath: whisperModelDir,
    language: 'en'
  })
  t.ok(whisperModel, 'Whisper model should be loaded')

  const { wer } = await runWhisper(whisperModel, text, wavBuffer)
  const werPct = (wer * 100).toFixed(1)
  console.log(`>>> [WHISPER] [en] WER: ${werPct}%`)
  t.ok(wer <= 0.4, `Chatterbox WER [en] should be <= 40% (got ${werPct}%)`)

  await whisperModel.unload()
  t.pass('Whisper model unloaded')

  console.log('\n' + '='.repeat(60))
  console.log('CHATTERBOX ENGLISH LONG TEST SUMMARY')
  console.log('='.repeat(60))
  console.log(`  [en] ${result.data.sampleCount} samples, ${result.data.durationMs?.toFixed(0) || 'N/A'}ms, WER: ${werPct}%`)
  console.log('='.repeat(60))
})

// ---------------------------------------------------------------------------
// Chatterbox TTS: Spanish synthesis with WER
// ---------------------------------------------------------------------------

test('Chatterbox TTS: Spanish synthesis with WER', { timeout: 3600000 }, async (t) => {
  const baseDir = getBaseDir()
  const modelDir = path.join(baseDir, 'models', 'chatterbox-multilingual')
  const whisperModelDir = path.join(baseDir, 'models', 'whisper')

  console.log('\n=== Ensuring Chatterbox multilingual models ===')
  const download = await ensureChatterboxModels({ targetDir: modelDir, language: 'multilingual', variant: CHATTERBOX_VARIANT })
  t.ok(download.success, 'Chatterbox multilingual models should be downloaded')
  if (!download.success) return

  console.log('\n=== Ensuring Whisper model ===')
  const whisperDownload = await ensureWhisperModel(path.join(whisperModelDir, 'ggml-small.bin'))
  t.ok(whisperDownload.success, 'Whisper model should be downloaded')
  if (!whisperDownload.success) return

  console.log('\n=== Loading Chatterbox multilingual model (es) ===')
  const model = await loadChatterboxTTS({
    tokenizerPath: path.join(modelDir, 'tokenizer.json'),
    speechEncoderPath: chatterboxPath(modelDir, 'speech_encoder', true),
    embedTokensPath: chatterboxPath(modelDir, 'embed_tokens', true),
    conditionalDecoderPath: chatterboxPath(modelDir, 'conditional_decoder', true),
    languageModelPath: chatterboxLmPath(modelDir),
    language: 'es'
  })
  t.ok(model, 'Chatterbox multilingual model should be loaded')

  const text = 'Hola mundo. Esta es una prueba del sistema de texto a voz.'
  console.log(`\n=== Synthesizing: "${text}" ===`)
  const result = await runChatterboxTTS(model, { text }, CHATTERBOX_EXPECTATION)
  console.log(result.output)
  t.ok(result.passed, 'Chatterbox Spanish synthesis should pass sample expectations')
  t.ok(result.data.sampleCount > 0, 'Chatterbox Spanish should produce audio samples')

  await model.unload()
  t.pass('Chatterbox multilingual model unloaded')

  const wavBuffer = result.data?.wavBuffer ? Buffer.from(result.data.wavBuffer) : null
  if (!wavBuffer) {
    t.fail('No WAV buffer produced for WER check')
    return
  }

  console.log('\n=== WER verification [es] ===')
  const whisperModel = await loadWhisper({
    modelName: 'ggml-small.bin',
    diskPath: whisperModelDir,
    language: 'en'
  })
  t.ok(whisperModel, 'Whisper model should be loaded')

  await whisperModel.reload({ whisperConfig: { language: 'es', translate: false } })

  const { wer } = await runWhisper(whisperModel, text, wavBuffer)
  const werPct = (wer * 100).toFixed(1)
  console.log(`>>> [WHISPER] [es] WER: ${werPct}%`)
  t.ok(wer <= 0.5, `Chatterbox WER [es] should be <= 50% (got ${werPct}%)`)

  await whisperModel.unload()
  t.pass('Whisper model unloaded')

  console.log('\n' + '='.repeat(60))
  console.log('CHATTERBOX SPANISH LONG TEST SUMMARY')
  console.log('='.repeat(60))
  console.log(`  [es] ${result.data.sampleCount} samples, ${result.data.durationMs?.toFixed(0) || 'N/A'}ms, WER: ${werPct}%`)
  console.log('='.repeat(60))
})

// ---------------------------------------------------------------------------
// Supertonic TTS: English synthesis with WER
// ---------------------------------------------------------------------------

test('Supertonic TTS: English synthesis with WER', { timeout: 3600000 }, async (t) => {
  const baseDir = getBaseDir()
  const modelDir = path.join(baseDir, 'models', 'supertonic')
  const whisperModelDir = path.join(baseDir, 'models', 'whisper')

  console.log('\n=== Ensuring Supertonic English models ===')
  const download = await ensureSupertonicModels({ targetDir: modelDir })
  t.ok(download.success, 'Supertonic English models should be downloaded')
  if (!download.success) return

  console.log('\n=== Ensuring Whisper model ===')
  const whisperDownload = await ensureWhisperModel(path.join(whisperModelDir, 'ggml-small.bin'))
  t.ok(whisperDownload.success, 'Whisper model should be downloaded')
  if (!whisperDownload.success) return

  const expectation = {
    minSamples: 10000,
    maxSamples: 500000,
    minDurationMs: 400,
    maxDurationMs: 20000
  }

  console.log('\n=== Loading Supertonic English model ===')
  const model = await loadSupertonicTTS({
    modelDir,
    voiceName: 'F1',
    language: 'en',
    supertonicMultilingual: false
  })
  t.ok(model, 'Supertonic English model should be loaded')
  t.ok(model.addon, 'Supertonic English addon should be created')

  const text = 'The quick brown fox jumps over the lazy dog.'
  console.log(`\n=== Synthesizing: "${text}" ===`)
  const result = await runSupertonicTTS(model, { text }, expectation)
  console.log(result.output)
  t.ok(result.passed, 'Supertonic English synthesis should pass sample expectations')
  t.ok(result.data.sampleCount > 0, 'Supertonic English should produce audio samples')

  await model.unload()
  t.pass('Supertonic English model unloaded')

  const wavBuffer = result.data?.wavBuffer ? Buffer.from(result.data.wavBuffer) : null
  if (!wavBuffer) {
    t.fail('No WAV buffer produced for WER check')
    return
  }

  console.log('\n=== WER verification [en] ===')
  const whisperModel = await loadWhisper({
    modelName: 'ggml-small.bin',
    diskPath: whisperModelDir,
    language: 'en'
  })
  t.ok(whisperModel, 'Whisper model should be loaded')

  const { wer } = await runWhisper(whisperModel, text, wavBuffer)
  const werPct = (wer * 100).toFixed(1)
  console.log(`>>> [WHISPER] [en] WER: ${werPct}%`)
  t.ok(wer <= 0.3, `Supertonic WER [en] should be <= 30% (got ${werPct}%)`)

  await whisperModel.unload()
  t.pass('Whisper model unloaded')

  console.log('\n' + '='.repeat(60))
  console.log('SUPERTONIC ENGLISH LONG TEST SUMMARY')
  console.log('='.repeat(60))
  console.log(`  [en] ${result.data.sampleCount} samples, ${result.data.durationMs?.toFixed(0) || 'N/A'}ms, WER: ${werPct}%`)
  console.log('='.repeat(60))
})

// ---------------------------------------------------------------------------
// Supertonic TTS: Spanish synthesis with WER
// ---------------------------------------------------------------------------

test('Supertonic TTS: Spanish synthesis with WER', { timeout: 3600000 }, async (t) => {
  const baseDir = getBaseDir()
  const modelDir = path.join(baseDir, 'models', 'supertonic-multilingual')
  const whisperModelDir = path.join(baseDir, 'models', 'whisper')

  console.log('\n=== Ensuring Supertonic multilingual models ===')
  const download = await ensureSupertonicModelsMultilingual({ targetDir: modelDir })
  t.ok(download.success, 'Supertonic multilingual models should be downloaded')
  if (!download.success) return

  console.log('\n=== Ensuring Whisper model ===')
  const whisperDownload = await ensureWhisperModel(path.join(whisperModelDir, 'ggml-small.bin'))
  t.ok(whisperDownload.success, 'Whisper model should be downloaded')
  if (!whisperDownload.success) return

  const expectation = {
    minSamples: 8000,
    maxSamples: 800000,
    minDurationMs: 400,
    maxDurationMs: 30000
  }

  console.log('\n=== Loading Supertonic multilingual model (es) ===')
  const model = await loadSupertonicTTS({
    modelDir,
    voiceName: 'F1',
    language: 'es',
    supertonicMultilingual: true
  })
  t.ok(model, 'Supertonic multilingual model should be loaded')

  const text = 'Hola mundo. Esta es una prueba del sistema Supertonic de síntesis de voz en español.'
  console.log(`\n=== Synthesizing: "${text}" ===`)
  const result = await runSupertonicTTS(model, { text }, expectation)
  console.log(result.output)
  t.ok(result.passed, 'Supertonic Spanish synthesis should pass sample expectations')
  t.ok(result.data.sampleCount > 0, 'Supertonic Spanish should produce audio samples')

  await model.unload()
  t.pass('Supertonic multilingual model unloaded')

  const wavBuffer = result.data?.wavBuffer ? Buffer.from(result.data.wavBuffer) : null
  if (!wavBuffer) {
    t.fail('No WAV buffer produced for WER check')
    return
  }

  console.log('\n=== WER verification [es] ===')
  const whisperModel = await loadWhisper({
    modelName: 'ggml-small.bin',
    diskPath: whisperModelDir,
    language: 'en'
  })
  t.ok(whisperModel, 'Whisper model should be loaded')

  await whisperModel.reload({ whisperConfig: { language: 'es', translate: false } })

  const { wer } = await runWhisper(whisperModel, text, wavBuffer)
  const werPct = (wer * 100).toFixed(1)
  console.log(`>>> [WHISPER] [es] WER: ${werPct}%`)
  t.ok(wer <= 0.5, `Supertonic WER [es] should be <= 50% (got ${werPct}%)`)

  await whisperModel.unload()
  t.pass('Whisper model unloaded')

  console.log('\n' + '='.repeat(60))
  console.log('SUPERTONIC SPANISH LONG TEST SUMMARY')
  console.log('='.repeat(60))
  console.log(`  [es] ${result.data.sampleCount} samples, ${result.data.durationMs?.toFixed(0) || 'N/A'}ms, WER: ${werPct}%`)
  console.log('='.repeat(60))
})
