---
id: 30069
title: LLM 上下文窗口擴展技術
state: draft
slug: context-window-extension-techniques-for-llms
---

# [BEE-30069] LLM 上下文窗口擴展技術

:::info
使用固定上下文窗口訓練的 LLM 在被要求處理更長序列時會災難性地退化，因為其位置嵌入會產生超出分布的旋轉角度。一系列技術——位置插值、NTK 感知縮放、YaRN、LongLoRA 和 ALiBi——可將可用上下文從 4K 擴展到 128K 以上 token，各自在計算成本、品質和是否需要微調之間做出不同的取捨。
:::

## 背景

**旋轉位置嵌入（RoPE，Rotary Position Embedding）** 由 Su 等人在《RoFormer: Enhanced Transformer with Rotary Position Embedding》（arXiv:2104.09864，2021）中提出，通過旋轉嵌入空間中的查詢和鍵向量來編碼 token 的位置。位置 p 在維度 d 上的旋轉角度使用頻率 `θ_d = 10000^(-2d/D)` 計算，從而在各嵌入維度上產生快速變化的高頻分量和緩慢變化的低頻分量。

問題在於每個 RoPE 維度都有一個「週期」——即它完成一個完整旋轉循環所需的上下文長度。一個在 4,096 個 token 上訓練的模型，從未觀察到位置 4,097 及以後的旋轉角度。當更長的輸入到來時，這些位置產生完全超出訓練分布的角度，自注意力分數變得任意——本質上是隨機的。結果是品質的災難性崩潰，而非緩慢退化。

這一問題在實際中至關重要，因為對長上下文 LLM 的需求日益增長：法律文件分析、代碼庫理解、多輪長對話和科學文獻摘要都需要 32K 到 1M token 的上下文長度。樸素的解決方案——以所需上下文長度從頭訓練——對大多數組織來說代價過高。擴展技術允許現有模型通過輕量級介入達到更長的上下文。

目前已出現四種截然不同的方法，各有不同的機制和取捨：

1. **位置插值（PI）**（Chen 等人，Meta，arXiv:2306.15595，2023）——對位置軸進行線性壓縮
2. **NTK 感知縮放**（/u/bloc97，2023）——無需微調的頻率選擇性縮放
3. **YaRN**（Peng 等人，arXiv:2309.00071，2023，ICLR 2025）——分段 NTK 插值配合注意力溫度縮放
4. **LongLoRA**（Chen 等人，arXiv:2309.12307，2023，ICLR 2024）——高效長上下文微調的移位稀疏注意力
5. **ALiBi**（Press 等人，arXiv:2108.12409，2021，ICLR 2022）——一種訓練時設計，完全消除位置嵌入並天然支持外推

## 各技術的工作原理

### 位置插值（PI）

PI 通過將所有位置索引除以擴展因子 s = 目標長度 / 訓練長度 來壓縮位置軸。要從 4K 擴展到 32K（s = 8），位置 32,000 會以位置 4,000 傳入 RoPE 函數。每個位置都保持在模型訓練的 [0, training_length] 範圍內。

缺點是高頻維度現在必須區分以前具有不同角度的位置——插值壓縮了它們的表示分辨率。這導致在原始短上下文（4K–8K）上出現輕微退化，因為以前分隔良好的位置現在更相似。輕量微調（1,000 步）可以恢復這一損失，該方法可在 8×A100 GPU 上將 LLaMA 模型擴展到 32,768 個 token。

### NTK 感知縮放

神經正切核（NTK）分析揭示，對所有 RoPE 維度進行統一縮放會在低頻分量上引入不必要的插值誤差——這些分量在不修改的情況下本可安全外推。NTK 感知縮放保留 RoPE 的基頻（θ = 10,000），但對其進行非線性增加：`θ_d_new = θ_d × s^(2D/(2D-2))`，其中 D 是嵌入維度。

實際效果是：高頻維度被積極縮放（保持在分布內），而低頻維度幾乎不變（自然外推）。**無需微調**，在 8K–16K 上下文下困惑度退化極小，使其成為無法負擔重新訓練的生產部署的首選。

### YaRN

YaRN（Yet another RoPE extensioN）在 NTK 感知縮放基礎上做了兩項改進。首先，它應用**分段 NTK** 插值：RoPE 維度被分為三組——低頻（插值）、中頻（NTK 混合）和高頻（不修改）——組間使用平滑過渡。其次，它對注意力 softmax 應用**溫度因子** `√1/t`，補償因擴展上下文導致的注意力熵變化。

YaRN 在 Llama-2 7B 和 13B 模型上實現了 128K 上下文的 >99% 密語檢索準確率，所需訓練 token 數比 PI 少 10 倍，僅需 400 步微調。在 64K 上訓練的模型無需額外訓練即可泛化到 128K。

```python
# 針對 128K 的 YaRN rope_scaling 配置，寫入 config.json
{
  "rope_scaling": {
    "rope_type": "yarn",
    "factor": 4.0,                            # 32K 訓練 → 128K 目標
    "original_max_position_embeddings": 32768,
    "attention_factor": 0.1,                  # 溫度縮放
    "beta_fast": 32,
    "beta_slow": 1
  }
}
```

### LongLoRA

LongLoRA 從訓練側而非推論側解決問題。在 32K 以上的 token 上進行標準全上下文微調代價極高——注意力複雜度關於序列長度是 O(N²)。LongLoRA 引入了**移位稀疏注意力（S²-Attn）**：上下文被分成 G 個 token 的組，每組計算局部注意力；在交替的注意力頭中，token 在分組前按 G/2 進行循環移位。這種移位在訓練時實現了跨組信息流動，而推論時可使用標準全注意力而無需 S²-Attn。

在單個 8×A100 節點上，LongLoRA 將 Llama-2 7B 擴展到 10 萬 token 上下文，將 Llama-2 70B 擴展到 32K token，計算量約為等效全上下文微調的 1/16。嵌入層和歸一化層設為可訓練，其餘所有權重使用 LoRA 適配器。

### ALiBi

ALiBi 完全移除了位置嵌入，代之以施加在原始注意力 logit 上的固定線性懲罰：`score(q, k) = q·k − m × |i − j|`，其中 |i − j| 是 token 位置間的距離，m 是每個頭特定的斜率。更近的 token 受到更小的懲罰；更遠的 token 受到更大的懲罰。

由於沒有位置嵌入可能超出分布，ALiBi 可以自然外推到任意序列長度。在 1,024 個 token 上訓練的模型在 2,048 個 token 上達到與在 2K 上訓練的模型相同的困惑度——無需任何微調。訓練比正弦嵌入快 11%，記憶體少 11%。BLOOM 和 MPT 模型系列使用 ALiBi。其限制在於這是一種訓練時的設計選擇，無法改造到現有 RoPE 模型上。

## 擴展上下文時的 KV 快取記憶體

序列中每個 token 都在 KV 快取中存儲一個鍵向量和一個值向量。快取隨序列長度線性增長：

```
KV 快取位元組數 =
  2                      # 鍵 + 值
  × 層數 (num_layers)
  × KV 頭數 (num_kv_heads)  # GQA 模型使用 KV 頭數而非查詢頭數
  × 頭維度 (head_dim)
  × 序列長度 (seq_len)
  × 每元素位元組數 (bytes_per_element)  # BF16/FP16 為 2

# 範例：Llama-3 8B（32 層，8 個 KV 頭，head_dim=128，BF16）
# seq_len=4K:   2 × 32 × 8 × 128 × 4096 × 2   =  536 MB / 請求
# seq_len=32K:  2 × 32 × 8 × 128 × 32768 × 2  =  4.3 GB / 請求
# seq_len=128K: 2 × 32 × 8 × 128 × 131072 × 2 = 17.2 GB / 請求
```

在 128K 上下文下，單個 Llama-3 8B 請求的 KV 快取單獨就消耗 17 GB——超過了 4 位元量化模型的全部權重。並發請求容量隨之等比例下降。滑動窗口注意力（固定 W）是唯一能夠無論序列長度多長都保持 KV 快取大小恆定的架構。

## 最佳實踐

### 零樣本上下文擴展至 16K 時使用 NTK 感知縮放

**SHOULD**（應該）在需要 2–4 倍上下文擴展且無法負擔微調時，應用 NTK 感知縮放。它無需訓練，在短上下文上退化極小，且只需修改配置即可透明生效：

```bash
# vLLM：NTK 感知「動態」縮放
vllm serve meta-llama/Llama-3-8B-Instruct \
  --max-model-len 16384 \
  --rope-scaling '{"type": "dynamic", "factor": 4.0}'
```

**SHOULD NOT**（不應該）在未進行評估的情況下，將 NTK 感知縮放用於超過訓練上下文 4 倍的場景（例如 4K 模型用於 16K 以上）。在 8 倍及以上時，困惑度退化明顯，需要 YaRN 或帶微調的 PI。

### 生產 32K–128K 擴展使用 YaRN 配合少量微調

**SHOULD**（應該）在需要 8–32 倍上下文擴展且可投入 400–1,000 步微調時，優先選擇 YaRN。YaRN 在長上下文上的表現持續優於 PI 和原始 NTK 縮放：

```python
# 128K 的 HuggingFace YaRN 模型配置
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained(
    "base-model-4K",
    rope_scaling={
        "rope_type": "yarn",
        "factor": 32.0,                            # 4K → 128K
        "original_max_position_embeddings": 4096,
    },
    torch_dtype=torch.bfloat16,
)
# 在部署前對長上下文數據進行 400–1000 步微調
```

### 在容量規劃中考慮 KV 快取增長

**MUST**（必須）在擴展上下文時重新計算並發請求容量。最大並發請求數與序列長度成反比：

```python
def max_concurrent_requests(
    gpu_hbm_gb: float,
    model_weight_gb: float,
    num_layers: int,
    num_kv_heads: int,
    head_dim: int,
    seq_len: int,
    bytes_per_element: int = 2,  # BF16
) -> int:
    available_for_kv = (gpu_hbm_gb - model_weight_gb) * 1e9
    kv_per_request = (
        2 * num_layers * num_kv_heads * head_dim * seq_len * bytes_per_element
    )
    return int(available_for_kv / kv_per_request)

# H100 80GB，Llama-3 8B（16GB 權重），32 層，8 個 KV 頭，head_dim=128
print(max_concurrent_requests(80, 16, 32, 8, 128, 4096))    # → ~120 個請求
print(max_concurrent_requests(80, 16, 32, 8, 128, 32768))   # → ~15 個請求
print(max_concurrent_requests(80, 16, 32, 8, 128, 131072))  # → ~3 個請求
```

**MUST**（必須）在服務長上下文請求時啟用分塊預填充——單個 128K token 的預填充請求若不分塊，在整個預填充期間會佔用整個批次槽位，違反其他請求的 TTFT SLO。

### 部署前通過長上下文召回基準驗證品質

**MUST**（必須）在部署任何上下文擴展模型前，運行「草堆中的針」（Needle-in-a-Haystack）或密語檢索測試。這些測試將一個事實插入長填充文檔的特定位置，然後要求模型檢索它——這是對聲稱的上下文長度上的注意力覆蓋範圍的直接測試：

```python
def passkey_test(model, tokenizer, needle: str, context_len: int, needle_depth: float) -> bool:
    """
    needle_depth：0.0 = 開頭，0.5 = 中間，1.0 = 結尾
    返回 True 表示模型正確檢索到密語。
    """
    filler_tokens = context_len - 100  # 為密語和問題留出空間
    insert_position = int(filler_tokens * needle_depth)

    # 構建上下文：在指定深度插入密語的填充文本
    filler = "陽光明媚。" * (filler_tokens // 5)
    context = (
        filler[:insert_position]
        + f"\n\n秘密密語是：{needle}\n\n"
        + filler[insert_position:]
        + f"\n\n秘密密語是什麼？回答："
    )
    # 模型應精確輸出密語
    ...
```

一個聲稱支持 128K 上下文但在 64K 位置密語檢索失敗的模型，無論困惑度指標如何，均不適合在 128K 上下文下投入生產。

## 比較表

| 方法 | 最大上下文 | 需要微調 | 計算成本 | 短上下文品質 | 外推能力 |
|---|---|---|---|---|---|
| PI（線性插值） | 32K | 需要（~1K 步） | 1× | 輕度退化 | 微調後可用 |
| NTK 感知 | 16K | 不需要 | 0× | 極小退化 | 部分（8-16K） |
| YaRN | 128K+ | 極少（~400 步） | 0.1× PI | 幾乎無退化 | 可外推 |
| LongLoRA | 100K | 需要 | 0.0625× 全量 | 幾乎無退化 | 微調後可用 |
| ALiBi | 任意長度 | 僅訓練時 | −11% vs RoPE | 優秀 | 天然外推 |
| 滑動窗口（Mistral） | 任意長度 | 僅訓練時 | O(W×N) | 優秀 | 通過層疊 |

## 相關 BEE

- [BEE-30063](prefix-caching-and-kv-cache-reuse.md) -- 前綴快取與 KV 快取複用：擴展上下文會分散共享前綴塊，降低前綴快取命中率
- [BEE-30065](continuous-batching-and-iteration-level-scheduling.md) -- 連續批次處理與迭代層級排程：服務 128K token 請求時必須啟用分塊預填充以避免阻塞批次
- [BEE-30066](tensor-parallelism-and-pipeline-parallelism-for-llm-inference.md) -- LLM 推論的張量平行與流水線平行：長上下文的 KV 快取壓力改變了所需的 TP/PP 平衡
- [BEE-30010](llm-context-window-management.md) -- LLM 上下文窗口管理：在上下文限制內保持的應用層策略

## 參考資料

- [Su 等人. RoFormer: Enhanced Transformer with Rotary Position Embedding — arXiv:2104.09864, 2021](https://arxiv.org/abs/2104.09864)
- [Chen 等人. Extending Context Window of Large Language Models via Positional Interpolation — arXiv:2306.15595, Meta 2023](https://arxiv.org/abs/2306.15595)
- [Peng 等人. YaRN: Efficient Context Window Extension of Large Language Models — arXiv:2309.00071, ICLR 2025](https://arxiv.org/abs/2309.00071)
- [Chen 等人. LongLoRA: Efficient Fine-tuning of Long-Context Large Language Models — arXiv:2309.12307, ICLR 2024](https://arxiv.org/abs/2309.12307)
- [Press, Smith, Lewis. Train Short, Test Long: Attention with Linear Biases Enables Input Length Extrapolation — arXiv:2108.12409, ICLR 2022](https://arxiv.org/abs/2108.12409)
- [Jiang 等人. Mistral 7B — arXiv:2310.06825, 2023](https://arxiv.org/abs/2310.06825)
- [EleutherAI. YaRN Blog — blog.eleuther.ai](https://blog.eleuther.ai/yarn/)
