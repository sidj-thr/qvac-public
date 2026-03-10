#!/usr/bin/env bash
# Pre-download GGUF models for integration tests using curl (faster than bare-https).
# Run before tests in CI to avoid download timeouts.
set -e

MODEL_DIR="$(cd "$(dirname "$0")/.." && pwd)/test/model"
mkdir -p "$MODEL_DIR"
cd "$MODEL_DIR"

download_if_missing () {
  local name="$1"
  local url="$2"
  if [ -f "$name" ]; then
    echo "✓ $name already present"
    return 0
  fi
  echo "Downloading $name..."
  curl -L -f -o "$name" "$url" || { echo "Failed to download $name"; return 1; }
  echo "✓ $name ready ($(du -h "$name" | cut -f1))"
}

# Core models used by most tests
download_if_missing "Qwen3-0.6B-Q8_0.gguf" \
  "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf"

download_if_missing "Llama-3.2-1B-Instruct-Q4_0.gguf" \
  "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_0.gguf"

# AfriqueGemma (skipped on mobile)
download_if_missing "AfriqueGemma-4B.Q4_K_M.gguf" \
  "https://huggingface.co/mradermacher/AfriqueGemma-4B-GGUF/resolve/main/AfriqueGemma-4B.Q4_K_M.gguf"

# MoE model
download_if_missing "dolphin-mixtral-2x7b-dop-Q2_K.gguf" \
  "https://huggingface.co/jmb95/laser-dolphin-mixtral-2x7b-dpo-GGUF/resolve/main/dolphin-mixtral-2x7b-dop-Q2_K.gguf"

# Vision models (image tests)
download_if_missing "SmolVLM2-500M-Video-Instruct-Q8_0.gguf" \
  "https://huggingface.co/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/resolve/main/SmolVLM2-500M-Video-Instruct-Q8_0.gguf"

download_if_missing "mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf" \
  "https://huggingface.co/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/resolve/main/mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf"

echo ""
echo "Model pre-download complete. Total size:"
du -sh . 2>/dev/null || true
