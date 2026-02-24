#pragma once

#include <any>
#include <atomic>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include <stable-diffusion.h>

#include <qvac-lib-inference-addon-cpp/ModelInterfaces.hpp>
#include <qvac-lib-inference-addon-cpp/RuntimeStats.hpp>

using namespace qvac_lib_inference_addon_cpp::model;

/**
 * Core stable-diffusion.cpp model wrapper.
 *
 * Manages the sd_ctx lifetime and exposes IModel/IModelCancel interfaces
 * expected by the qvac-lib-inference-addon-cpp framework.
 */
class SdModel : public IModel, public IModelCancel {
public:
  SdModel(const SdModel&)            = delete;
  SdModel& operator=(const SdModel&) = delete;
  SdModel(SdModel&&)                 = delete;
  SdModel& operator=(SdModel&&)      = delete;

  /**
   * @param modelPath   Path to the main model weights file (.gguf, .safetensors, .ckpt)
   * @param clipLPath   Optional path to a separate CLIP-L text encoder
   * @param clipGPath   Optional path to a separate CLIP-G text encoder
   * @param t5XxlPath   Optional path to a separate T5-XXL text encoder (FLUX/SD3)
   * @param vaePath     Optional path to a separate VAE
   * @param configMap   Configuration key/value pairs (threads, device, wtype, etc.)
   */
  SdModel(
      std::string modelPath,
      std::string clipLPath,
      std::string clipGPath,
      std::string t5XxlPath,
      std::string vaePath,
      std::unordered_map<std::string, std::string> configMap);

  ~SdModel() override;

  std::string getName() const final { return "SdModel"; }

  /**
   * Input structure for a single generation job.
   * Passed as std::any through the addon-cpp framework.
   */
  struct GenerationJob {
    std::string paramsJson;

    /** Called each diffusion step with a JSON string: {"step":N,"total":M,"elapsed_ms":T} */
    std::function<void(const std::string&)> progressCallback;

    /** Called once per image/frame with the PNG-encoded bytes */
    std::function<void(const std::vector<uint8_t>&)> outputCallback;
  };

  /** Implements IModel::process() – runs the generation job synchronously on the worker thread. */
  std::any process(const std::any& input) final;

  /** Implements IModelCancel::cancel() – signals the running generation to stop. */
  void cancel() const final;

  qvac_lib_inference_addon_cpp::RuntimeStats runtimeStats() const final;

  /** Static log callback forwarded to the qvac logger. */
  static void sdLogCallback(
      sd_log_level_t level, const char* text, void* userData);

private:
  /** Parse JSON params and run txt2img. Returns true on success. */
  bool runTxt2Img(
      const std::string& prompt,
      const std::string& negativePrompt,
      int width, int height,
      int steps,
      float cfgScale,
      sample_method_t sampler,
      int64_t seed,
      int batchCount,
      const GenerationJob& job);

  /** Parse JSON params and run img2img. Returns true on success. */
  bool runImg2Img(
      const std::string& prompt,
      const std::string& negativePrompt,
      const std::vector<uint8_t>& initImagePng,
      int width, int height,
      int steps,
      float cfgScale,
      float strength,
      sample_method_t sampler,
      int64_t seed,
      int batchCount,
      const GenerationJob& job);

  /** Encode an sd_image_t as PNG bytes using stb_image_write. */
  static std::vector<uint8_t> encodeToPng(const sd_image_t& img);

  /** Decode PNG bytes into an sd_image_t (caller owns .data). */
  static sd_image_t decodePng(
      const std::vector<uint8_t>& pngBytes, int targetWidth, int targetHeight);

  /** Parse a sampler name string into the stable-diffusion.cpp enum. */
  static sample_method_t parseSampler(const std::string& name);

  /** Parse a weight-type string into the sd_type_t enum. */
  static sd_type_t parseWeightType(const std::string& name);

  /** Parse a schedule string into the schedule_t enum. */
  static schedule_t parseSchedule(const std::string& name);

  const std::string modelPath_;
  const std::string clipLPath_;
  const std::string clipGPath_;
  const std::string t5XxlPath_;
  const std::string vaePath_;

  // Configuration parsed from configMap
  int nThreads_       = -1;
  bool clipOnCpu_     = false;
  bool vaeOnCpu_      = false;
  bool vaeTiling_     = false;
  bool flashAttn_     = false;
  sd_type_t wtype_    = SD_TYPE_COUNT; // SD_TYPE_COUNT = auto/default
  rng_type_t rngType_ = CUDA_RNG;
  schedule_t schedule_ = DEFAULT;

  std::unique_ptr<sd_ctx_t, decltype(&free_sd_ctx)> sdCtx_;
  mutable std::atomic<bool> cancelRequested_{ false };

  // Runtime stats updated after each job
  mutable qvac_lib_inference_addon_cpp::RuntimeStats lastStats_;
};
