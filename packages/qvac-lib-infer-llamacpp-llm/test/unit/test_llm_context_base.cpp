#include <filesystem>
#include <memory>
#include <string>
#include <type_traits>
#include <unordered_map>
#include <variant>
#include <vector>

#include <gtest/gtest.h>
#include <qvac-lib-inference-addon-cpp/Errors.hpp>

#include "common/chat.h"
#include "model-interface/LlamaModel.hpp"
#include "model-interface/LlmContext.hpp"
#include "model-interface/MtmdLlmContext.hpp"
#include "model-interface/TextLlmContext.hpp"
#include "test_common.hpp"

namespace fs = std::filesystem;

namespace {
double getStatValue(
    const qvac_lib_inference_addon_cpp::RuntimeStats& stats,
    const std::string& key) {
  for (const auto& stat : stats) {
    if (stat.first == key) {
      return std::visit(
          [](const auto& value) -> double {
            if constexpr (std::is_same_v<
                              std::decay_t<decltype(value)>,
                              double>) {
              return value;
            } else {
              return static_cast<double>(value);
            }
          },
          stat.second);
    }
  }
  return 0.0;
}

std::string processPromptString(
    const std::unique_ptr<LlamaModel>& model, const std::string& input) {
  LlamaModel::Prompt prompt;
  prompt.input = input;
  return model->processPrompt(prompt);
}
} // namespace

class LlmContextBaseTest : public ::testing::Test {
protected:
  void SetUp() override {
    config_files["device"] = test_common::getTestDevice();
    config_files["ctx_size"] = "2048";
    config_files["gpu_layers"] = test_common::getTestGpuLayers();
    config_files["n_predict"] = "10";

    test_model_path = test_common::BaseTestModelPath::get();
    test_projection_path = "";

    config_files["backendsDir"] = test_common::getTestBackendsDir().string();
  }

  bool hasValidModel() { return fs::exists(test_model_path); }

  bool hasValidMultimodalModel() {
    std::string modelPath = test_common::BaseTestModelPath::get(
        "SmolVLM-500M-Instruct-Q8_0.gguf", "SmolVLM-500M-Instruct.gguf");
    std::string projectionPath = test_common::BaseTestModelPath::get(
        "mmproj-SmolVLM-500M-Instruct-Q8_0.gguf",
        "mmproj-SmolVLM-500M-Instruct.gguf");
    return fs::exists(modelPath) && fs::exists(projectionPath);
  }

  std::unique_ptr<LlamaModel> createModel() {
    if (!hasValidModel()) {
      return nullptr;
    }
    std::string modelPathCopy = test_model_path;
    std::string projectionPathCopy = test_projection_path;
    auto configCopy = config_files;
    auto model = std::make_unique<LlamaModel>(
        std::move(modelPathCopy),
        std::move(projectionPathCopy),
        std::move(configCopy));
    model->waitForLoadInitialization();
    if (!model->isLoaded()) {
      return nullptr;
    }
    return model;
  }

  std::unique_ptr<LlamaModel> createMultimodalModel() {
    if (!hasValidMultimodalModel()) {
      return nullptr;
    }

    std::string modelPathStr = test_common::BaseTestModelPath::get(
        "SmolVLM-500M-Instruct-Q8_0.gguf", "SmolVLM-500M-Instruct.gguf");
    std::string projectionPathStr = test_common::BaseTestModelPath::get(
        "mmproj-SmolVLM-500M-Instruct-Q8_0.gguf",
        "mmproj-SmolVLM-500M-Instruct.gguf");
    auto configCopy = config_files;
    auto model = std::make_unique<LlamaModel>(
        std::move(modelPathStr),
        std::move(projectionPathStr),
        std::move(configCopy));
    model->waitForLoadInitialization();
    if (!model->isLoaded()) {
      return nullptr;
    }
    return model;
  }

  std::unordered_map<std::string, std::string> config_files;
  std::string test_model_path;
  std::string test_projection_path;
};

TEST_F(LlmContextBaseTest, TextLlmContextProcessAndReset) {
  if (!hasValidModel()) {
    FAIL() << "Test model not found";
  }

  auto model = createModel();
  if (!model) {
    FAIL() << "Model failed to load";
  }

  auto stats = model->runtimeStats();
  EXPECT_GE(getStatValue(stats, "CacheTokens"), 0.0);

  EXPECT_NO_THROW({
    std::string output =
        processPromptString(model, R"([{"role": "user", "content": "Hello"}])");
    EXPECT_GE(output.length(), 0);
    auto statsAfter = model->runtimeStats();
    EXPECT_GE(statsAfter.size(), 0);
  });

  EXPECT_NO_THROW(model->reset());

  EXPECT_NO_THROW({
    std::string output2 = processPromptString(
        model, R"([{"role": "user", "content": "Another hello"}])");
    EXPECT_GE(output2.length(), 0);
    auto stats2 = model->runtimeStats();
    EXPECT_GE(stats2.size(), 0);
  });
}

TEST_F(LlmContextBaseTest, MtmdLlmContextProcessAndReset) {
  if (!hasValidMultimodalModel()) {
    FAIL() << "Multimodal model or projection file not found";
  }

  auto model = createMultimodalModel();
  if (!model) {
    FAIL() << "Model failed to load";
  }

  auto stats = model->runtimeStats();
  EXPECT_GE(getStatValue(stats, "CacheTokens"), 0.0);

  EXPECT_NO_THROW({
    std::string output =
        processPromptString(model, R"([{"role": "user", "content": "Hello"}])");
    EXPECT_GE(output.length(), 0);
    auto stats = model->runtimeStats();
    EXPECT_GE(stats.size(), 0);
  });

  EXPECT_NO_THROW(model->reset());

  EXPECT_NO_THROW({
    std::string output2 = processPromptString(
        model, R"([{"role": "user", "content": "Another hello"}])");
    EXPECT_GE(output2.length(), 0);
    auto stats2 = model->runtimeStats();
    EXPECT_GE(stats2.size(), 0);
  });
}

TEST_F(LlmContextBaseTest, ProcessAndGetRuntimeStats) {
  if (!hasValidModel()) {
    FAIL() << "Test model not found";
  }

  auto model = createModel();
  if (!model) {
    FAIL() << "Model failed to load";
  }

  EXPECT_NO_THROW({
    std::string output =
        processPromptString(model, R"([{"role": "user", "content": "Hello"}])");
    EXPECT_GE(output.length(), 0);
    auto stats = model->runtimeStats();
    EXPECT_GT(getStatValue(stats, "promptTokens"), 0.0);
  });
}

TEST_F(LlmContextBaseTest, ProcessWithCallback) {
  if (!hasValidModel()) {
    FAIL() << "Test model not found";
  }

  auto model = createModel();
  if (!model) {
    FAIL() << "Model failed to load";
  }

  std::vector<std::string> tokens;

  LlamaModel::Prompt prompt;
  prompt.input = R"([{"role": "user", "content": "Hello"}])";
  prompt.outputCallback = [&tokens](const std::string& token) {
    tokens.push_back(token);
  };

  EXPECT_NO_THROW({
    std::string output = model->processPrompt(prompt);
    EXPECT_GE(output.length(), 0);
    EXPECT_GT(tokens.size(), 0);
    auto stats = model->runtimeStats();
    EXPECT_GE(stats.size(), 0);
  });
}

TEST_F(LlmContextBaseTest, ResetStateClearsCache) {
  if (!hasValidModel()) {
    FAIL() << "Test model not found";
  }

  auto model = createModel();
  if (!model) {
    FAIL() << "Model failed to load";
  }

  EXPECT_NO_THROW({
    std::string output =
        processPromptString(model, R"([{"role": "user", "content": "Hello"}])");
    EXPECT_GE(output.length(), 0);
  });

  model->reset();

  EXPECT_NO_THROW({
    std::string output2 = processPromptString(
        model, R"([{"role": "user", "content": "Another hello"}])");
    EXPECT_GE(output2.length(), 0);
    auto statsAfterReset = model->runtimeStats();
    EXPECT_EQ(getStatValue(statsAfterReset, "CacheTokens"), 0.0);
  });
}

TEST_F(LlmContextBaseTest, TextContextRejectsBinaryInput) {
  if (!hasValidModel()) {
    FAIL() << "Test model not found";
  }

  auto model = createModel();
  if (!model) {
    FAIL() << "Model failed to load";
  }

  std::vector<uint8_t> media = {0x48, 0x65, 0x6c, 0x6c, 0x6f};

  if (test_projection_path.empty()) {
    LlamaModel::Prompt prompt;
    prompt.input = R"([{"role": "user", "content": "Hello"}])";
    prompt.media.push_back(std::move(media));
    EXPECT_THROW({ model->processPrompt(prompt); }, qvac_errors::StatusError);
  }
}

TEST_F(LlmContextBaseTest, MultipleProcessCalls) {
  if (!hasValidModel()) {
    FAIL() << "Test model not found";
  }

  auto model = createModel();
  if (!model) {
    FAIL() << "Model failed to load";
  }

  EXPECT_NO_THROW({
    std::string output =
        processPromptString(model, R"([{"role": "user", "content": "Hello"}])");
    EXPECT_GE(output.length(), 0);
    auto stats = model->runtimeStats();
    EXPECT_GE(stats.size(), 0);
  });

  EXPECT_NO_THROW({
    std::string output2 = processPromptString(
        model, R"([{"role": "user", "content": "Another hello"}])");
    EXPECT_GE(output2.length(), 0);
    auto stats2 = model->runtimeStats();
    EXPECT_GE(stats2.size(), 0);
  });
}

TEST_F(LlmContextBaseTest, VirtualDestructor) {
  if (!hasValidModel()) {
    FAIL() << "Test model not found";
  }

  {
    auto model = createModel();
    if (!model) {
      FAIL() << "Model failed to load";
    }

    EXPECT_NO_THROW({
      std::string output = processPromptString(
          model, R"([{"role": "user", "content": "Hello"}])");
      EXPECT_GE(output.length(), 0);
      auto stats = model->runtimeStats();
      EXPECT_GE(stats.size(), 0);
    });
  }

  {
    auto model2 = createModel();
    if (model2) {
      EXPECT_NO_THROW({
        std::string output = processPromptString(
            model2, R"([{"role": "user", "content": "Test 2"}])");
        EXPECT_GE(output.length(), 0);
      });
    }
  }
}

TEST_F(LlmContextBaseTest, RuntimeStatsAccuracy) {
  if (!hasValidModel()) {
    FAIL() << "Test model not found";
  }

  auto model = createModel();
  if (!model) {
    FAIL() << "Model failed to load";
  }

  std::string input = R"([{"role": "user", "content": "Hello"}])";
  processPromptString(model, input);

  auto stats = model->runtimeStats();
  double promptTokens = getStatValue(stats, "promptTokens");
  double generatedTokens = getStatValue(stats, "generatedTokens");
  double cacheTokens = getStatValue(stats, "CacheTokens");

  EXPECT_GT(promptTokens, 0.0);
  EXPECT_GE(generatedTokens, 0.0);
  EXPECT_GE(cacheTokens, 0.0);
  EXPECT_GE(promptTokens, 1.0);
}

TEST_F(LlmContextBaseTest, RuntimeStatsConsistency) {
  if (!hasValidModel()) {
    FAIL() << "Test model not found";
  }

  auto model = createModel();
  if (!model) {
    FAIL() << "Model failed to load";
  }

  std::string input = R"([{"role": "user", "content": "Hello"}])";

  for (int i = 0; i < 3; ++i) {
    processPromptString(model, input);
    auto stats = model->runtimeStats();

    double promptTokens = getStatValue(stats, "promptTokens");
    double generatedTokens = getStatValue(stats, "generatedTokens");
    double cacheTokens = getStatValue(stats, "CacheTokens");

    EXPECT_GE(promptTokens, 0.0);
    EXPECT_GE(generatedTokens, 0.0);
    EXPECT_GE(cacheTokens, 0.0);
  }
}

TEST_F(LlmContextBaseTest, OverflowWithSmallContextAndToolsAtEnd) {
  // This test requires a Qwen3 model because tools_at_end is only supported for Qwen3.
  std::string qwenModel = test_common::BaseTestModelPath::get(
      "Qwen3-0.6B-Q8_0.gguf", "Qwen3-1.7B-Q4_0.gguf");
  if (!fs::exists(qwenModel)) {
    FAIL() << "Qwen3 model not found at " << qwenModel;
  }

  // Override configuration for this test
  config_files["ctx_size"] = "512";
  config_files["n_discarded"] = "400"; // large value to test cap
  config_files["tools_at_end"] = "true";
  test_model_path = qwenModel;
  test_projection_path = "";

  // Cleanup any existing session file from previous runs
  const std::string sessionFile = "overflow_test_session.bin";
  if (fs::exists(sessionFile)) {
    fs::remove(sessionFile);
  }

  auto model = createModel();
  if (!model) {
    FAIL() << "Failed to load model";
  }

  // Helper to get a runtime stat value
  auto getStat = [&](const std::string& key) -> double {
    auto stats = model->runtimeStats();
    for (const auto& stat : stats) {
      if (stat.first == key) {
        return std::visit(
            [](const auto& value) -> double {
              if constexpr (std::is_same_v<
                                std::decay_t<decltype(value)>,
                                double>) {
                return value;
              } else {
                return static_cast<double>(value);
              }
            },
            stat.second);
      }
    }
    return 0.0;
  };

  // First turn: include a session message to enable cache, plus a tool and user message
  std::string firstTurn = R"([{"role":"session","content":")" + sessionFile + R"("},{"type":"function","name":"test_tool","description":"A test tool","parameters":{"type":"object","properties":{}}},{"role":"user","content":"Hello, can you assist me?"}])";

  EXPECT_NO_THROW({
    std::string output = processPromptString(model, firstTurn);
    EXPECT_GE(output.length(), 0);
  });

  // After first turn, no context slides yet
  EXPECT_EQ(getStat("contextSlides"), 0.0);

  // Build a moderately long user message (approx 150 tokens)
  std::string longContent;
  for (int i = 0; i < 150; ++i) {
    longContent += "word ";
  }

  // Process several turns with the same session to accumulate context and cause overflow
  const int numTurns = 10;
  for (int turn = 0; turn < numTurns; ++turn) {
    // Each turn includes the session message to keep cache active
    std::string turnMsg = R"([{"role":"session","content":")" + sessionFile + R"("},{"role":"user","content":")" + longContent + R"("}])";
    EXPECT_NO_THROW({
      std::string output = processPromptString(model, turnMsg);
      EXPECT_GE(output.length(), 0);
    }) << "Turn " << turn << " failed";

    double cacheTokens = getStat("CacheTokens");
    EXPECT_LE(cacheTokens, 512.0) << "CacheTokens exceeded context limit at turn " << turn;
    // Note: We don't check slides per turn because not every turn triggers overflow.
    // The final check after the loop ensures that at least one slide occurred.
  }

  // Verify that slides have occurred
  EXPECT_GT(getStat("contextSlides"), 0);

  // Final check: model still functional after overflows (with session to avoid reset)
  EXPECT_NO_THROW({
    std::string output = processPromptString(model, R"([{"role":"session","content":")" + sessionFile + R"("},{"role":"user","content":"Hi"}])");
    EXPECT_GE(output.length(), 0);
  });

  // Cache tokens should still be within the context limit
  EXPECT_LE(getStat("CacheTokens"), 512.0);

  // Cleanup session file
  if (fs::exists(sessionFile)) {
    fs::remove(sessionFile);
  }
}
