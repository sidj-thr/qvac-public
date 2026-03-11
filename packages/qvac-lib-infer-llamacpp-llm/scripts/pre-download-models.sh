#!/usr/bin/env bash
# Pre-download GGUF models for integration tests using curl.
# Downloads all models in parallel for speed.
set -e

MODEL_DIR="$(cd "$(dirname "$0")/.." && pwd)/test/model"
mkdir -p "$MODEL_DIR"

download_model () {
  local name="$1"
  local url="$2"
  local dest="$MODEL_DIR/$name"
  if [ -f "$dest" ] && [ -s "$dest" ]; then
    echo "[ok] $name already present ($(du -h "$dest" | cut -f1))"
    return 0
  fi
  rm -f "$dest"
  echo "Downloading $name..."
  if curl -L -f --connect-timeout 60 --max-time 3600 --retry 2 -o "$dest" "$url"; then
    echo "[ok] $name ready ($(du -h "$dest" | cut -f1))"
  else
    echo "FAILED: $name"
    rm -f "$dest"
    return 1
  fi
}

declare -a PIDS=()

download_model "Qwen3-0.6B-Q8_0.gguf" \
  "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf" &
PIDS+=($!)

download_model "Llama-3.2-1B-Instruct-Q4_0.gguf" \
  "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_0.gguf" &
PIDS+=($!)

download_model "AfriqueGemma-4B.Q4_K_M.gguf" \
  "https://huggingface.co/mradermacher/AfriqueGemma-4B-GGUF/resolve/main/AfriqueGemma-4B.Q4_K_M.gguf" &
PIDS+=($!)

download_model "dolphin-mixtral-2x7b-dop-Q2_K.gguf" \
  "https://huggingface.co/jmb95/laser-dolphin-mixtral-2x7b-dpo-GGUF/resolve/main/dolphin-mixtral-2x7b-dop-Q2_K.gguf" &
PIDS+=($!)

download_model "SmolVLM2-500M-Video-Instruct-Q8_0.gguf" \
  "https://huggingface.co/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/resolve/main/SmolVLM2-500M-Video-Instruct-Q8_0.gguf" &
PIDS+=($!)

download_model "mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf" \
  "https://huggingface.co/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/resolve/main/mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf" &
PIDS+=($!)

echo "Downloading ${#PIDS[@]} models in parallel..."

FAILED=0
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    FAILED=1
  fi
done

echo ""
if [ $FAILED -ne 0 ]; then
  echo "Some model downloads failed!"
  ls -lh "$MODEL_DIR/" 2>/dev/null || true
  exit 1
fi

echo "All models downloaded successfully."
du -sh "$MODEL_DIR" 2>/dev/null || true
