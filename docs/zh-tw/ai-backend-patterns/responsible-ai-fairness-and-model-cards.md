---
id: 30090
title: 負責任的 AI、公平性與模型卡
state: draft
slug: responsible-ai-fairness-and-model-cards
---

# [BEE-30090] 負責任的 AI、公平性與模型卡

:::info
負責任的 AI 工程正式化了防止 ML 系統造成系統性危害的實踐——跨人口群體測量偏見、在部署前記錄模型限制，以及滿足將法律責任附加到影響人們生活的算法決策上的監管要求。
:::

## 背景

三起事件定義了從業者的負責任 AI 議程。ProPublica 2016 年對 COMPAS 累犯風險工具的調查發現，在相同觀察風險分數下，黑人被告被標記為未來暴力犯罪者的可能性比白人被告高 77%。亞馬遜的招聘算法基於十年提交的簡歷訓練，學會了懲罰「women's」這個詞，並降低了全女子學院畢業生的評分——該工具在 2018 年被廢棄。Obermeyer et al.（Science, 2019）解剖了美國衛生系統使用的商業醫療風險評分算法，發現它系統性地低估了黑人患者的疾病嚴重性，因為它預測的是*醫療費用*而非*疾病*，而由於結構性不平等，患同等疾病的黑人患者獲得的醫療服務更少。

這些不是邊緣案例。它們是在優化損失函數時未測量其在群體間分佈影響的可預測結果。一個善意系統和一個歧視性系統之間的差異，往往只是評估中缺少的一個 `groupby`。

該領域用三種工具作出回應：

- **公平性指標**（Hardt、Price、Srebro，NeurIPS 2016）在數學上形式化了「平等對待」的含義
- **模型卡**（Mitchell et al.，FAccT 2019）記錄了預期用途、跨人口群體的性能和已知限制
- **資料集資料表**（Gebru et al.，CACM 2021）記錄了訓練資料的來源和組成

監管框架現在要求這些文件。歐盟 AI 法案（附件 III）將影響信貸、就業、教育、執法和醫療保健的系統歸類為高風險，觸發第 9 條和第 13 條規定的強制性文件和風險管理。NIST AI 風險管理框架（AI RMF 1.0，2023 年 1 月）將義務組織為四個職能：治理（GOVERN）、映射（MAP）、測量（MEASURE）、管理（MANAGE）。

## 公平性指標

三個屬性為帶有受保護屬性 A（如種族、性別）和預測值 Ŷ 的二元分類器形式化了公平性：

**人口統計平等性**（Demographic Parity）要求各群體之間的正預測率相等：
```
P(Ŷ=1 | A=0) = P(Ŷ=1 | A=1)
```
一個貸款模型在滿足人口統計平等性時，無論種族如何批准相同比例的申請人。當群體成員資格與結果應具有零相關性時，這是適當的約束。

**機會均等**（Equalized Odds，Hardt et al. 2016）要求真陽性率*和*假陽性率均等：
```
P(Ŷ=1 | A=0, Y=1) = P(Ŷ=1 | A=1, Y=1)   ← 相等的真陽性率
P(Ŷ=1 | A=0, Y=0) = P(Ŷ=1 | A=1, Y=0)   ← 相等的假陽性率
```
一個詐騙模型在滿足機會均等時，對所有人口群體以相同速率捕捉詐騙，*並且*以相同速率錯誤標記合法交易。當預測在兩個方向都有重要影響時，這是適當的。

**個體公平性**（Individual Fairness）要求相似的個體獲得相似的預測。這在概念上很有吸引力，但需要定義特定任務的相似性指標——在實踐中，這通常是特定領域的，且難以在沒有專家意見的情況下實現。

### 同時滿足公平性的不可能性

Chouldechova（2017）和 Kleinberg et al.（arXiv:1609.05807）證明：當群體之間的基礎率不同時——A 群體比 B 群體具有更高的真實結果發生率——在數學上不可能同時滿足人口統計平等性、機會均等和校準。**必須**（MUST）選擇優化哪個約束；這個選擇應由危害模型驅動，而非技術便利性。

COMPAS 案例說明了這一點：該工具是校準的（各群體之間準確率相等），但假陽性率不相等——黑人被告更頻繁地被錯誤標記為高風險。當累犯基礎率在群體之間不同時，相等的校準和相等的假陽性率無法同時存在。

## 使用 Fairlearn 測量偏見

Fairlearn（Weerts et al.，JMLR 2023，arXiv:2303.16626）提供了 `MetricFrame` 抽象：按敏感特徵分解評估任何 sklearn 兼容的指標函數。

```python
import pandas as pd
import numpy as np
from fairlearn.metrics import (
    MetricFrame,
    demographic_parity_difference,
    equalized_odds_difference,
    selection_rate,
)
from sklearn.metrics import accuracy_score, false_positive_rate

# y_true、y_pred：模型在保留集上的預測
# sensitive_features：受保護屬性（如種族、性別）
sensitive_features = test_df["race"]

mf = MetricFrame(
    metrics={
        "accuracy": accuracy_score,
        "selection_rate": selection_rate,
        "false_positive_rate": false_positive_rate,
    },
    y_true=y_true,
    y_pred=y_pred,
    sensitive_features=sensitive_features,
)

print(mf.by_group)
#             accuracy  selection_rate  false_positive_rate
# race
# Black           0.65           0.52                 0.38
# White           0.73           0.44                 0.21
# Hispanic        0.68           0.49                 0.30

# 標量差距指標
dpd = demographic_parity_difference(y_true, y_pred, sensitive_features=sensitive_features)
eod = equalized_odds_difference(y_true, y_pred, sensitive_features=sensitive_features)

print(f"人口統計平等性差異：{dpd:.3f}")   # 0 = 完美平等
print(f"機會均等差異：{eod:.3f}")          # 0 = 完美機會均等
```

Fairlearn 還提供**緩解**算法——後處理（`ThresholdOptimizer`）和處理中（`ExponentiatedGradient`）——以最小的準確率成本調整模型以滿足指定的公平性約束。

### 差別影響分析（4/5 規則）

EEOC《雇員選拔程序統一指南》在操作上定義了差別影響：如果受保護群體的選擇率低於最高評分群體的 80%，則推定存在不利影響。這個 4/5（80%）規則是美國雇用決策的監管閾值。

```python
def disparate_impact_analysis(
    y_pred: np.ndarray,
    sensitive_features: pd.Series,
) -> pd.DataFrame:
    """計算每個群體的選擇率和差別影響比率。"""
    groups = sensitive_features.unique()
    rates = {
        group: y_pred[sensitive_features == group].mean()
        for group in groups
    }
    max_rate = max(rates.values())

    return pd.DataFrame([
        {
            "group": group,
            "selection_rate": rate,
            "disparate_impact_ratio": rate / max_rate,
            "passes_4_5ths_rule": rate / max_rate >= 0.80,
        }
        for group, rate in rates.items()
    ]).sort_values("selection_rate", ascending=False)

result = disparate_impact_analysis(y_pred, test_df["race"])
```

4/5 規則是篩查測試，而非法律認定。通過它並不保證不存在歧視；未通過則需要調查，通常還需要補救。

## 模型卡

Mitchell et al.（FAccT 2019，arXiv:1810.03993）提出了隨模型製品一起傳播的結構化模型文件。模型卡**必須**（MUST）至少包含：

```markdown
# 模型卡：詐騙分類器 v3.2

## 模型詳情
- 架構：梯度提升樹（XGBoost 2.0.3）
- 輸入：30 個交易特徵
- 輸出：P(詐騙) ∈ [0, 1]，二元決策閾值 0.5
- 訓練日期：2026-03-15

## 預期用途
- 主要用途：支付交易的即時詐騙偵測
- 超出範圍：未針對非支付場景（保險、身份詐騙）進行驗證

## 訓練資料
- 來源：內部交易日誌，2024-01-01 至 2026-02-28
- 規模：4200 萬筆交易（陽性率 1.2%）

## 公平性評估
| 群體 | 選擇率 | 假陽性率 | 差別影響 |
|---|---|---|---|
| 全部 | 0.48 | 0.06 | 1.00 |
| 美國 | 0.51 | 0.05 | 1.06 |
| 歐盟 | 0.44 | 0.08 | 0.92 |
| 拉丁美洲 | 0.38 | 0.09 | 0.79 ← 低於 0.80 閾值 |

## 已知限制
- 拉丁美洲選擇率觸發 4/5 規則；正由公平性委員會審查
- 每季度重新訓練；90 天後 AUC 下降 2-3%
```

將模型卡發佈到與模型權重相同的製品存儲。在 MLflow 中作為製品附加：

```python
import mlflow

with mlflow.start_run(run_id=run_id):
    mlflow.log_artifact("model_card.md", artifact_path="documentation")
    mlflow.log_dict(fairness_metrics, "fairness/metrics.json")
```

Hugging Face 的模型卡格式（https://huggingface.co/docs/hub/model-cards）使用 YAML 前言擴展了這一格式，提供機器可讀的元資料，實現按許可證、任務和語言自動發現和過濾。

## 資料集資料表

Gebru et al.（CACM 2021，arXiv:1803.09010）為資料集提出了類似的文件。資料表**必須**（MUST）回答的關鍵問題：

- **動機**：誰創建了資料集，為什麼？它適用於哪些任務？
- **組成**：有哪些類型的實例？有標籤嗎？人口分佈是什麼？
- **收集**：如何收集資料？使用了哪些機制、來源、時間框架？
- **預處理**：應用了哪些清理？標籤是如何完成的？標注者間一致性如何？
- **用途**：適合哪些任務？**不得**（MUST NOT）用於哪些任務？
- **分佈**：在什麼許可證下？在哪裡可以獲取？如何更新？
- **維護**：誰維護它？是否有勘誤程序？

對公平性最關鍵的部分是**組成**：模型的公平程度只能達到訓練資料所允許的程度。如果訓練資料系統性地低代表某個人口群體，或者如果標記反映了歷史性歧視（如 Obermeyer et al. 的案例——醫療費用被用作醫療需求的代理），則事後的任何緩解措施都無法完全糾正由此產生的模型。

## 監管整合

對於在歐盟 AI 法案附件 III 下被歸類為高風險的系統（信貸、就業、基本公共服務、執法、移民），第 9 條要求持續的風險管理流程，第 10 條規定了特定的資料治理要求。模型卡和資料表是滿足這些要求的文件製品。

NIST AI RMF 1.0 將負責任的 AI 實踐映射到四個操作職能：

| 職能 | 活動 |
|---|---|
| 治理（GOVERN） | 建立問責制、分配角色、定義政策 |
| 映射（MAP） | 識別受影響群體、分類風險級別、記錄上下文 |
| 測量（MEASURE） | 運行公平性審計、計算 MetricFrame、應用 4/5 規則 |
| 管理（MANAGE） | 緩解偏見、監控公平性指標漂移、升級失敗情況 |

## 常見錯誤

**僅評估整體指標的公平性。** 整體準確率為 90% 的模型可能對多數群體準確率為 95%，對少數群體為 70%。整體準確率完全掩蓋了這一點。公平性評估**必須**（MUST）對敏感屬性使用 `groupby`，而非聚合指標。

**在不考慮危害模型的情況下選擇公平性約束。** 人口統計平等性要求相等的陽性率；機會均等要求相等的錯誤率。當基礎率不同時，這兩者不能同時成立。選擇最小化最嚴重危害的約束：在刑事司法中，假陽性（錯誤標記某人為危險）比假陰性更有害；在醫學篩查中，假陰性（遺漏患病患者）更有害。這個選擇是倫理性的，而非技術性的。

**一次撰寫模型卡後永不更新。** 模型卡是特定模型版本的文件。當模型重新訓練時，公平性指標改變，訓練資料截止日期改變，已知限制也可能改變。在製品存儲中將模型卡與模型版本掛鉤，並作為 CI/CD 管道的一部分在每次重新訓練時重新生成。

**將 4/5 規則視為合規核查表。** 通過 4/5 規則意味著選擇率差異低於閾值，並不代表模型公平。差別影響率為 80% 的模型就是定義上的閾值邊緣。真正的公平性工作需要理解差異*存在的原因*，而非僅僅確認差異是否超過某條線。

**使用有偏見的訓練資料並期望事後緩解能修復它。** Fairlearn 的 `ExponentiatedGradient` 和 `ThresholdOptimizer` 可以減少測量到的差異，但它們無法恢復資料中從未存在的信號。如果訓練標籤反映了歷史性歧視（如醫療費用代理），緩解措施調整的是模型輸出，而不會改變底層的歧視性信號。基於資料表的資料品質審查位於模型訓練的上游，而非下游。

## 相關 BEE

- [BEE-30086 生產環境中的模型可解釋性](/zh-tw/ai-backend-patterns/model-explainability-in-production) — SHAP 歸因分數通過解釋個別決策來補充公平性指標
- [BEE-30085 ML 資料驗證與管道品質閘控](/zh-tw/ai-backend-patterns/ml-data-validation-and-pipeline-quality-gates) — 資料驗證強制執行模式和完整性；公平性審計將其擴展到分佈屬性
- [BEE-30084 ML 實驗追蹤與模型登錄庫](/zh-tw/ai-backend-patterns/ml-experiment-tracking-and-model-registry) — 模型卡附加到 MLflow 運行和模型版本
- [BEE-30079 AI 合規與治理工程](/zh-tw/ai-backend-patterns/ai-compliance-and-governance-engineering) — 模型卡所服務的更廣泛 AI 治理框架

## 參考資料

- Mitchell, M., et al. (2019). Model cards for model reporting. FAccT 2019. arXiv:1810.03993. https://dl.acm.org/doi/10.1145/3287560.3287596
- Gebru, T., et al. (2021). Datasheets for datasets. Communications of the ACM, 64(12), 86–92. arXiv:1803.09010. https://cacm.acm.org/research/datasheets-for-datasets/
- Hardt, M., Price, E., & Srebro, N. (2016). Equality of opportunity in supervised learning. NeurIPS 2016. arXiv:1610.02413. https://papers.nips.cc/paper/6374-equality-of-opportunity-in-supervised-learning
- Weerts, H., et al. (2023). Fairlearn: Assessing and improving fairness of AI systems. JMLR 24(1). arXiv:2303.16626. https://www.jmlr.org/papers/v24/23-0389.html
- Kleinberg, J., Mullainathan, S., & Raghavan, M. (2016). Inherent trade-offs in the fair determination of risk scores. arXiv:1609.05807. https://arxiv.org/abs/1609.05807
- Obermeyer, Z., et al. (2019). Dissecting racial bias in an algorithm used to manage the health of populations. Science, 366, 447–453. https://www.science.org/doi/10.1126/science.aax2342
- ProPublica,「Machine Bias」，2016. https://www.propublica.org/article/machine-bias-risk-assessments-in-criminal-sentencing
- NIST AI Risk Management Framework 1.0 (2023). https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-1.pdf
- EU AI Act, Article 9 (Risk management system). https://artificialintelligenceact.eu/article/9/
- EU AI Act, Annex III (High-risk AI systems). https://artificialintelligenceact.eu/annex/3/
- Fairlearn 文件. https://fairlearn.org/
- Hugging Face, Model Cards 文件. https://huggingface.co/docs/hub/model-cards
- EEOC, Uniform Guidelines on Employee Selection Procedures. https://www.eeoc.gov/laws/guidance/questions-and-answers-clarify-and-provide-common-interpretation-uniform-guidelines
