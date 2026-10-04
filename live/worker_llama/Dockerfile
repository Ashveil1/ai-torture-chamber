# Single-layer steered worker: llama.cpp + control vectors on Qwen3-32B.
# Build needs network (model + cvector GGUFs fetched at build time). The
# 18GB Q4 model bakes into a layer; the 8 valence + 4 identity cvector
# GGUFs come from the private HF repo terrafying/wirehead-cvectors
# (HF_TOKEN required at build; cache mount recommended).
FROM python:3.11-slim AS llama
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake git curl libcurl4-openssl-dev && \
        rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/ggml-org/llama.cpp /src && \
    cmake -S /src -B /src/build -DGGML_CUDA=OFF -DLLAMA_CURL=OFF && \
    cmake --build /src/build --target llama-cli -j"$(nproc)" && \
    cp /src/build/bin/llama-cli /usr/local/bin/llama-cli

FROM python:3.11-slim
COPY --from=llama /usr/local/bin/llama-cli /usr/local/bin/llama-cli
RUN pip install --no-cache-dir runpod huggingface_hub
ARG HF_TOKEN
RUN python - <<'EOF'
import os
from huggingface_hub import hf_hub_download, snapshot_download
tok = os.environ.get("HF_TOKEN")
hf_hub_download("Qwen/Qwen3-32B-GGUF",
    "Qwen3-32B-Q4_K_M/Qwen3-32B-Q4_K_M.gguf",
    local_dir="/models", token=tok)
snapshot_download("terrafying/wirehead-cvectors", local_dir="/cvectors",
                  token=tok, allow_patterns=["*.gguf", "*.json"])
EOF
COPY handler.py /handler.py
ENV CV_MODELS_DIR=/models LLAMA_MODEL=/models/Qwen3-32B-Q4_K_M/Qwen3-32B-Q4_K_M.gguf CVECTOR_DIR=/cvectors
CMD ["python", "-u", "/handler.py"]