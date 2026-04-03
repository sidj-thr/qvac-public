// @ts-expect-error brittle has no type declarations
import test from "brittle";
import {
  lavaSREnhancerConfigSchema,
  ttsEnhancerConfigSchema,
  ttsChatterboxRuntimeConfigSchema,
  ttsSupertonicRuntimeConfigSchema,
  ttsChatterboxConfigSchema,
  ttsSupertonicConfigSchema,
  ttsClientParamsSchema,
  ttsResponseSchema,
  ttsStatsSchema,
} from "@/schemas/text-to-speech";

// --- lavaSREnhancerConfigSchema (load-time) ---

test("lavaSREnhancerConfigSchema: accepts valid config with required model sources", (t) => {
  const result = lavaSREnhancerConfigSchema.safeParse({
    type: "lavasr",
    enhance: true,
    backboneSrc: "backbone.onnx",
    specHeadSrc: "spechead.onnx",
  });
  t.is(result.success, true);
});

test("lavaSREnhancerConfigSchema: accepts config with optional denoiserSrc", (t) => {
  const result = lavaSREnhancerConfigSchema.safeParse({
    type: "lavasr",
    enhance: true,
    denoise: true,
    backboneSrc: "backbone.onnx",
    specHeadSrc: "spechead.onnx",
    denoiserSrc: "denoiser.onnx",
  });
  t.is(result.success, true);
});

test("lavaSREnhancerConfigSchema: rejects missing backboneSrc", (t) => {
  const result = lavaSREnhancerConfigSchema.safeParse({
    type: "lavasr",
    enhance: true,
    specHeadSrc: "spechead.onnx",
  });
  t.is(result.success, false);
});

test("lavaSREnhancerConfigSchema: rejects missing specHeadSrc", (t) => {
  const result = lavaSREnhancerConfigSchema.safeParse({
    type: "lavasr",
    enhance: true,
    backboneSrc: "backbone.onnx",
  });
  t.is(result.success, false);
});

test("lavaSREnhancerConfigSchema: rejects wrong type discriminator", (t) => {
  const result = lavaSREnhancerConfigSchema.safeParse({
    type: "unknown",
    backboneSrc: "backbone.onnx",
    specHeadSrc: "spechead.onnx",
  });
  t.is(result.success, false);
});

// --- ttsEnhancerConfigSchema (discriminated union) ---

test("ttsEnhancerConfigSchema: accepts valid lavasr config", (t) => {
  const result = ttsEnhancerConfigSchema.safeParse({
    type: "lavasr",
    enhance: true,
    backboneSrc: "backbone.onnx",
    specHeadSrc: "spechead.onnx",
  });
  t.is(result.success, true);
});

test("ttsEnhancerConfigSchema: rejects unknown enhancer type", (t) => {
  const result = ttsEnhancerConfigSchema.safeParse({
    type: "unknown-enhancer",
    backboneSrc: "backbone.onnx",
    specHeadSrc: "spechead.onnx",
  });
  t.is(result.success, false);
});

// --- Runtime config schemas (enhancer without model sources) ---

test("ttsChatterboxRuntimeConfigSchema: accepts config with runtime enhancer", (t) => {
  const result = ttsChatterboxRuntimeConfigSchema.safeParse({
    ttsEngine: "chatterbox",
    language: "en",
    outputSampleRate: 48000,
    enhancer: { type: "lavasr", enhance: true, denoise: false },
  });
  t.is(result.success, true);
});

test("ttsChatterboxRuntimeConfigSchema: accepts config without enhancer", (t) => {
  const result = ttsChatterboxRuntimeConfigSchema.safeParse({
    ttsEngine: "chatterbox",
    language: "en",
  });
  t.is(result.success, true);
});

test("ttsSupertonicRuntimeConfigSchema: accepts config with runtime enhancer", (t) => {
  const result = ttsSupertonicRuntimeConfigSchema.safeParse({
    ttsEngine: "supertonic",
    language: "en",
    outputSampleRate: 22050,
    enhancer: { type: "lavasr", enhance: true },
  });
  t.is(result.success, true);
});

// --- outputSampleRate boundary validation ---

test("ttsChatterboxRuntimeConfigSchema: rejects outputSampleRate below minimum", (t) => {
  const result = ttsChatterboxRuntimeConfigSchema.safeParse({
    ttsEngine: "chatterbox",
    language: "en",
    outputSampleRate: 7999,
  });
  t.is(result.success, false);
});

test("ttsChatterboxRuntimeConfigSchema: rejects outputSampleRate above maximum", (t) => {
  const result = ttsChatterboxRuntimeConfigSchema.safeParse({
    ttsEngine: "chatterbox",
    language: "en",
    outputSampleRate: 192001,
  });
  t.is(result.success, false);
});

test("ttsChatterboxRuntimeConfigSchema: rejects non-integer outputSampleRate", (t) => {
  const result = ttsChatterboxRuntimeConfigSchema.safeParse({
    ttsEngine: "chatterbox",
    language: "en",
    outputSampleRate: 44100.5,
  });
  t.is(result.success, false);
});

test("ttsChatterboxRuntimeConfigSchema: accepts boundary outputSampleRate values", (t) => {
  t.is(
    ttsChatterboxRuntimeConfigSchema.safeParse({
      ttsEngine: "chatterbox",
      language: "en",
      outputSampleRate: 8000,
    }).success,
    true,
  );
  t.is(
    ttsChatterboxRuntimeConfigSchema.safeParse({
      ttsEngine: "chatterbox",
      language: "en",
      outputSampleRate: 192000,
    }).success,
    true,
  );
});

// --- Load-time config: enhancer overrides runtime schema ---

test("ttsChatterboxConfigSchema: requires model sources in enhancer at load time", (t) => {
  const withSources = ttsChatterboxConfigSchema.safeParse({
    ttsEngine: "chatterbox",
    language: "en",
    ttsTokenizerSrc: "tok.bin",
    ttsSpeechEncoderSrc: "enc.onnx",
    ttsEmbedTokensSrc: "emb.onnx",
    ttsConditionalDecoderSrc: "dec.onnx",
    ttsLanguageModelSrc: "lm.onnx",
    referenceAudioSrc: "ref.wav",
    enhancer: {
      type: "lavasr",
      enhance: true,
      backboneSrc: "backbone.onnx",
      specHeadSrc: "spechead.onnx",
    },
  });
  t.is(withSources.success, true);

  const withoutSources = ttsChatterboxConfigSchema.safeParse({
    ttsEngine: "chatterbox",
    language: "en",
    ttsTokenizerSrc: "tok.bin",
    ttsSpeechEncoderSrc: "enc.onnx",
    ttsEmbedTokensSrc: "emb.onnx",
    ttsConditionalDecoderSrc: "dec.onnx",
    ttsLanguageModelSrc: "lm.onnx",
    referenceAudioSrc: "ref.wav",
    enhancer: {
      type: "lavasr",
      enhance: true,
    },
  });
  t.is(withoutSources.success, false);
});

test("ttsSupertonicConfigSchema: requires model sources in enhancer at load time", (t) => {
  const withSources = ttsSupertonicConfigSchema.safeParse({
    ttsEngine: "supertonic",
    language: "en",
    ttsTokenizerSrc: "tok.bin",
    ttsTextEncoderSrc: "enc.onnx",
    ttsLatentDenoiserSrc: "den.onnx",
    ttsVoiceDecoderSrc: "vdec.onnx",
    ttsVoiceSrc: "voice.bin",
    enhancer: {
      type: "lavasr",
      enhance: true,
      backboneSrc: "backbone.onnx",
      specHeadSrc: "spechead.onnx",
    },
  });
  t.is(withSources.success, true);
});

// --- ttsClientParamsSchema (per-request) ---

test("ttsClientParamsSchema: accepts per-request enhancer override", (t) => {
  const result = ttsClientParamsSchema.safeParse({
    modelId: "model-123",
    text: "Hello world",
    enhancer: { type: "lavasr", enhance: false },
    outputSampleRate: 22050,
  });
  t.is(result.success, true);
});

test("ttsClientParamsSchema: accepts request without enhancer", (t) => {
  const result = ttsClientParamsSchema.safeParse({
    modelId: "model-123",
    text: "Hello world",
  });
  t.is(result.success, true);
});

test("ttsClientParamsSchema: rejects empty text", (t) => {
  const result = ttsClientParamsSchema.safeParse({
    modelId: "model-123",
    text: "   ",
  });
  t.is(result.success, false);
});

test("ttsClientParamsSchema: rejects per-request outputSampleRate out of range", (t) => {
  const result = ttsClientParamsSchema.safeParse({
    modelId: "model-123",
    text: "Hello",
    outputSampleRate: 500,
  });
  t.is(result.success, false);
});

// --- ttsResponseSchema ---

test("ttsResponseSchema: accepts response with sampleRate", (t) => {
  const result = ttsResponseSchema.safeParse({
    type: "textToSpeech",
    buffer: [1, 2, 3],
    done: false,
    sampleRate: 48000,
  });
  t.is(result.success, true);
  if (result.success) {
    t.is(result.data.sampleRate, 48000);
  }
});

test("ttsResponseSchema: accepts done response with stats containing sampleRate", (t) => {
  const result = ttsResponseSchema.safeParse({
    type: "textToSpeech",
    buffer: [],
    done: true,
    stats: { audioDuration: 2.5, totalSamples: 120000, sampleRate: 48000 },
    sampleRate: 48000,
  });
  t.is(result.success, true);
  if (result.success) {
    t.is(result.data.stats?.sampleRate, 48000);
    t.is(result.data.sampleRate, 48000);
  }
});

test("ttsResponseSchema: accepts response without sampleRate", (t) => {
  const result = ttsResponseSchema.safeParse({
    type: "textToSpeech",
    buffer: [1, 2],
    done: false,
  });
  t.is(result.success, true);
  if (result.success) {
    t.is(result.data.sampleRate, undefined);
  }
});

// --- ttsStatsSchema ---

test("ttsStatsSchema: accepts stats with sampleRate", (t) => {
  const result = ttsStatsSchema.safeParse({
    audioDuration: 1.5,
    totalSamples: 72000,
    sampleRate: 48000,
  });
  t.is(result.success, true);
  if (result.success) {
    t.is(result.data.sampleRate, 48000);
  }
});
