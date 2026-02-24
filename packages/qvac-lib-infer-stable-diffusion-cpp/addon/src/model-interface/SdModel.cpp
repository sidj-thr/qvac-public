#include "SdModel.hpp"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <sstream>
#include <stdexcept>

#define STB_IMAGE_IMPLEMENTATION
#include <stb_image.h>
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include <stb_image_write.h>

#include <picojson/picojson.h>
#include <qvac-lib-inference-addon-cpp/Errors.hpp>
#include <qvac-lib-inference-addon-cpp/Logger.hpp>

#include "utils/LoggingMacros.hpp"

using namespace qvac_lib_inference_addon_cpp;
using qvac_errors::general_error;
using qvac_errors::StatusError;

// ---------------------------------------------------------------------------
// Thread-local generation context used by the stable-diffusion.cpp progress
// callback (which is a C function pointer with a void* userdata).
// ---------------------------------------------------------------------------
namespace {

struct ProgressCtx {
  const SdModel::GenerationJob* job = nullptr;
  std::chrono::steady_clock::time_point startTime;
};

thread_local ProgressCtx tl_progressCtx;

void sdProgressCallback(int step, int steps, float /*time*/, void* /*data*/) {
  if (!tl_progressCtx.job || !tl_progressCtx.job->progressCallback) return;

  auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                     std::chrono::steady_clock::now() - tl_progressCtx.startTime)
                     .count();

  std::ostringstream oss;
  oss << R"({"step":)" << step
      << R"(,"total":)" << steps
      << R"(,"elapsed_ms":)" << elapsed << "}";

  tl_progressCtx.job->progressCallback(oss.str());
}

} // namespace

// ---------------------------------------------------------------------------
// Construction / destruction
// ---------------------------------------------------------------------------

SdModel::SdModel(
    std::string modelPath,
    std::string clipLPath,
    std::string clipGPath,
    std::string t5XxlPath,
    std::string vaePath,
    std::unordered_map<std::string, std::string> configMap)
    : modelPath_(std::move(modelPath)),
      clipLPath_(std::move(clipLPath)),
      clipGPath_(std::move(clipGPath)),
      t5XxlPath_(std::move(t5XxlPath)),
      vaePath_(std::move(vaePath)),
      sdCtx_(nullptr, &free_sd_ctx) {

  // --- Parse configMap ---
  if (auto it = configMap.find("threads"); it != configMap.end()) {
    nThreads_ = std::stoi(it->second);
  }
  if (auto it = configMap.find("clip_on_cpu"); it != configMap.end()) {
    clipOnCpu_ = (it->second == "1" || it->second == "true");
  }
  if (auto it = configMap.find("vae_on_cpu"); it != configMap.end()) {
    vaeOnCpu_ = (it->second == "1" || it->second == "true");
  }
  if (auto it = configMap.find("vae_tiling"); it != configMap.end()) {
    vaeTiling_ = (it->second == "1" || it->second == "true");
  }
  if (auto it = configMap.find("flash_attn"); it != configMap.end()) {
    flashAttn_ = (it->second == "1" || it->second == "true");
  }
  if (auto it = configMap.find("wtype"); it != configMap.end()) {
    wtype_ = parseWeightType(it->second);
  }
  if (auto it = configMap.find("rng"); it != configMap.end()) {
    rngType_ = (it->second == "cpu") ? STD_DEFAULT_RNG : CUDA_RNG;
  }
  if (auto it = configMap.find("schedule"); it != configMap.end()) {
    schedule_ = parseSchedule(it->second);
  }

  // Set log callback before creating the context
  sd_set_log_callback(SdModel::sdLogCallback, nullptr);

  sd_ctx_t* raw = new_sd_ctx(
      modelPath_.c_str(),
      clipLPath_.empty()  ? nullptr : clipLPath_.c_str(),
      clipGPath_.empty()  ? nullptr : clipGPath_.c_str(),
      t5XxlPath_.empty()  ? nullptr : t5XxlPath_.c_str(),
      nullptr,            // diffusion_model_path (split models – not yet supported)
      vaePath_.empty()    ? nullptr : vaePath_.c_str(),
      nullptr,            // taesd_path
      nullptr,            // controlnet_path
      nullptr,            // lora_model_dir
      nullptr,            // embed_dir
      nullptr,            // stacked_id_embed_dir
      /*vae_decode_only=*/false,
      vaeTiling_,
      /*free_params_immediately=*/true,
      nThreads_,
      wtype_,
      rngType_,
      schedule_,
      clipOnCpu_,
      /*control_net_cpu=*/false,
      vaeOnCpu_,
      flashAttn_);

  if (!raw) {
    throw StatusError(
        general_error::InternalError,
        "Failed to create stable-diffusion context. Check model path and format.");
  }

  sdCtx_.reset(raw);
}

SdModel::~SdModel() = default;

// ---------------------------------------------------------------------------
// IModel::process
// ---------------------------------------------------------------------------

std::any SdModel::process(const std::any& input) {
  const auto& job = std::any_cast<const GenerationJob&>(input);

  cancelRequested_.store(false);

  // Install the progress callback for this generation
  tl_progressCtx.job       = &job;
  tl_progressCtx.startTime = std::chrono::steady_clock::now();
  sd_set_progress_callback(sdProgressCallback, nullptr);

  // --- Parse JSON params ---
  picojson::value v;
  const std::string parseErr = picojson::parse(v, job.paramsJson);
  if (!parseErr.empty()) {
    throw StatusError(
        general_error::InvalidArgument,
        "Failed to parse generation params JSON: " + parseErr);
  }

  if (!v.is<picojson::object>()) {
    throw StatusError(general_error::InvalidArgument, "Generation params must be a JSON object");
  }

  const auto& obj = v.get<picojson::object>();

  auto getStr = [&](const std::string& key, const std::string& def = "") -> std::string {
    auto it = obj.find(key);
    if (it == obj.end() || !it->second.is<std::string>()) return def;
    return it->second.get<std::string>();
  };

  auto getInt = [&](const std::string& key, int def) -> int {
    auto it = obj.find(key);
    if (it == obj.end() || !it->second.is<double>()) return def;
    return static_cast<int>(it->second.get<double>());
  };

  auto getFloat = [&](const std::string& key, float def) -> float {
    auto it = obj.find(key);
    if (it == obj.end() || !it->second.is<double>()) return def;
    return static_cast<float>(it->second.get<double>());
  };

  const std::string mode           = getStr("mode", "txt2img");
  const std::string prompt         = getStr("prompt");
  const std::string negativePrompt = getStr("negative_prompt");
  const int width                  = getInt("width", 512);
  const int height                 = getInt("height", 512);
  const int steps                  = getInt("steps", 20);
  const float cfgScale             = getFloat("cfg_scale", 7.0f);
  const int64_t seed               = static_cast<int64_t>(getInt("seed", -1));
  const int batchCount             = getInt("batch_count", 1);
  const sample_method_t sampler    = parseSampler(getStr("sampler", "euler_a"));

  auto t0 = std::chrono::steady_clock::now();
  bool success = false;

  if (mode == "txt2img") {
    success = runTxt2Img(
        prompt, negativePrompt, width, height, steps,
        cfgScale, sampler, seed, batchCount, job);
  } else if (mode == "img2img") {
    const float strength = getFloat("strength", 0.75f);

    // Decode base64-encoded init image or use raw bytes passed via separate field
    // For now, expect init_image_bytes as a JSON array of numbers (uint8)
    std::vector<uint8_t> initPng;
    if (auto it = obj.find("init_image_bytes"); it != obj.end() && it->second.is<picojson::array>()) {
      const auto& arr = it->second.get<picojson::array>();
      initPng.reserve(arr.size());
      for (const auto& el : arr) {
        initPng.push_back(static_cast<uint8_t>(el.get<double>()));
      }
    }

    success = runImg2Img(
        prompt, negativePrompt, initPng, width, height, steps,
        cfgScale, strength, sampler, seed, batchCount, job);
  } else {
    throw StatusError(
        general_error::InvalidArgument,
        "Unknown generation mode: " + mode + ". Supported: txt2img, img2img");
  }

  auto t1 = std::chrono::steady_clock::now();
  const double generationTimeMs =
      std::chrono::duration<double, std::milli>(t1 - t0).count();

  lastStats_["generation_time"] = generationTimeMs;
  lastStats_["steps"]           = static_cast<double>(steps);
  lastStats_["width"]           = static_cast<double>(width);
  lastStats_["height"]          = static_cast<double>(height);
  lastStats_["success"]         = success ? 1.0 : 0.0;

  tl_progressCtx.job = nullptr;

  return lastStats_;
}

// ---------------------------------------------------------------------------
// txt2img / img2img
// ---------------------------------------------------------------------------

bool SdModel::runTxt2Img(
    const std::string& prompt,
    const std::string& negativePrompt,
    int width, int height,
    int steps, float cfgScale,
    sample_method_t sampler,
    int64_t seed, int batchCount,
    const GenerationJob& job) {

  sd_image_t* results = txt2img(
      sdCtx_.get(),
      prompt.c_str(),
      negativePrompt.c_str(),
      /*clip_skip=*/-1,
      cfgScale,
      /*guidance=*/3.5f,
      /*eta=*/0.0f,
      width, height,
      sampler,
      steps,
      seed,
      batchCount,
      /*control_cond=*/nullptr,
      /*control_strength=*/0.9f,
      /*style_strength=*/0.2f,
      /*normalize_input=*/false,
      /*input_id_images_path=*/"",
      /*skip_layers=*/nullptr,
      /*skip_layers_count=*/0,
      /*slg_scale=*/0.0f,
      /*skip_layer_start=*/0.01f,
      /*skip_layer_end=*/0.2f);

  if (!results) return false;

  for (int i = 0; i < batchCount; ++i) {
    if (results[i].data && !cancelRequested_.load()) {
      auto png = encodeToPng(results[i]);
      if (!png.empty() && job.outputCallback) {
        job.outputCallback(png);
      }
      free(results[i].data);
    }
  }
  free(results);
  return true;
}

bool SdModel::runImg2Img(
    const std::string& prompt,
    const std::string& negativePrompt,
    const std::vector<uint8_t>& initImagePng,
    int width, int height,
    int steps, float cfgScale, float strength,
    sample_method_t sampler,
    int64_t seed, int batchCount,
    const GenerationJob& job) {

  sd_image_t initImg = decodePng(initImagePng, width, height);
  if (!initImg.data && !initImagePng.empty()) {
    throw StatusError(general_error::InvalidArgument, "Failed to decode init_image PNG");
  }

  sd_image_t maskImg{};

  sd_image_t* results = img2img(
      sdCtx_.get(),
      initImg,
      maskImg,
      prompt.c_str(),
      negativePrompt.c_str(),
      /*clip_skip=*/-1,
      cfgScale,
      /*guidance=*/3.5f,
      width, height,
      sampler,
      steps,
      strength,
      seed,
      batchCount,
      /*control_cond=*/nullptr,
      /*control_strength=*/0.9f,
      /*style_strength=*/0.2f,
      /*normalize_input=*/false,
      /*input_id_images_path=*/"");

  free(initImg.data);

  if (!results) return false;

  for (int i = 0; i < batchCount; ++i) {
    if (results[i].data && !cancelRequested_.load()) {
      auto png = encodeToPng(results[i]);
      if (!png.empty() && job.outputCallback) {
        job.outputCallback(png);
      }
      free(results[i].data);
    }
  }
  free(results);
  return true;
}

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

void SdModel::cancel() const {
  cancelRequested_.store(true);
}

// ---------------------------------------------------------------------------
// runtimeStats
// ---------------------------------------------------------------------------

qvac_lib_inference_addon_cpp::RuntimeStats SdModel::runtimeStats() const {
  return lastStats_;
}

// ---------------------------------------------------------------------------
// PNG encode / decode
// ---------------------------------------------------------------------------

std::vector<uint8_t> SdModel::encodeToPng(const sd_image_t& img) {
  std::vector<uint8_t> out;

  auto writeCallback = [](void* ctx, void* data, int size) {
    auto* vec = static_cast<std::vector<uint8_t>*>(ctx);
    const auto* bytes = static_cast<const uint8_t*>(data);
    vec->insert(vec->end(), bytes, bytes + size);
  };

  const int stride = static_cast<int>(img.width * img.channel);
  stbi_write_png_to_func(
      writeCallback, &out,
      static_cast<int>(img.width),
      static_cast<int>(img.height),
      static_cast<int>(img.channel),
      img.data,
      stride);

  return out;
}

sd_image_t SdModel::decodePng(
    const std::vector<uint8_t>& pngBytes, int targetWidth, int targetHeight) {
  if (pngBytes.empty()) return sd_image_t{};

  int w = 0, h = 0, c = 0;
  uint8_t* data = stbi_load_from_memory(
      pngBytes.data(),
      static_cast<int>(pngBytes.size()),
      &w, &h, &c, 3);

  if (!data) return sd_image_t{};

  sd_image_t img{};
  img.width   = static_cast<uint32_t>(w);
  img.height  = static_cast<uint32_t>(h);
  img.channel = 3;
  img.data    = data;

  (void)targetWidth;
  (void)targetHeight;
  return img;
}

// ---------------------------------------------------------------------------
// Enum parsers
// ---------------------------------------------------------------------------

sample_method_t SdModel::parseSampler(const std::string& name) {
  if (name == "euler_a")    return EULER_A;
  if (name == "euler")      return EULER;
  if (name == "heun")       return HEUN;
  if (name == "dpm2")       return DPM2;
  if (name == "dpm++_2m")   return DPMPP2M;
  if (name == "dpm++_2m_v2") return DPMPP2Mv2;
  if (name == "dpm++_2s_a") return DPMPP2SA;
  if (name == "lcm")        return LCM;
  return EULER_A; // safe default
}

sd_type_t SdModel::parseWeightType(const std::string& name) {
  if (name == "f32")  return SD_TYPE_F32;
  if (name == "f16")  return SD_TYPE_F16;
  if (name == "q4_0") return SD_TYPE_Q4_0;
  if (name == "q4_1") return SD_TYPE_Q4_1;
  if (name == "q5_0") return SD_TYPE_Q5_0;
  if (name == "q5_1") return SD_TYPE_Q5_1;
  if (name == "q8_0") return SD_TYPE_Q8_0;
  return SD_TYPE_COUNT; // auto
}

schedule_t SdModel::parseSchedule(const std::string& name) {
  if (name == "discrete")    return DISCRETE;
  if (name == "karras")      return KARRAS;
  if (name == "exponential") return EXPONENTIAL;
  if (name == "ays")         return AYS;
  if (name == "gits")        return GITS;
  return DEFAULT;
}

// ---------------------------------------------------------------------------
// Log callback
// ---------------------------------------------------------------------------

void SdModel::sdLogCallback(
    sd_log_level_t level, const char* text, void* /*userData*/) {
  namespace logging = qvac_lib_inference_addon_cpp::logger;

  logging::Priority priority;
  switch (level) {
  case SD_LOG_DEBUG: priority = logging::Priority::DEBUG;   break;
  case SD_LOG_INFO:  priority = logging::Priority::INFO;    break;
  case SD_LOG_WARN:  priority = logging::Priority::WARNING; break;
  case SD_LOG_ERROR: priority = logging::Priority::ERROR;   break;
  default:           priority = logging::Priority::ERROR;   break;
  }

  QLOG_IF(priority, std::string(text));
}
