---
id: 30083
title: ML 監控與漂移偵測
state: draft
slug: ml-monitoring-and-drift-detection
---

# [BEE-585] ML 監控與漂移偵測

:::info
已部署的 ML 模型在訓練環境與現實環境出現分歧時，準確率會靜默下降。漂移偵測（Drift Detection）是測量這種差距的基礎設施——將特徵分佈、預測分佈和估計結果與參考基準進行比較。核心挑戰在於真實標籤往往在預測後數小時或數天才到達，因此生產環境監控必須在沒有標籤的情況下運作。工具組合包括：用於資料漂移的統計測試，以及用於無標籤性能估計的概率校準。
:::

## 背景

ML 模型在生產環境中以兩種方式失敗：顯式失敗（異常、空預測、延遲峰值）和靜默失敗（準確率下降但沒有錯誤信號）。顯式失敗由標準服務監控捕獲——錯誤率告警、延遲儀表板。靜默失敗需要一個獨立的監控層，將模型今天看到的統計特性與訓練時的特性進行比較。

Chip Huyen 對生產 ML 失敗的分析（https://huyenchip.com/2022/02/07/data-distribution-shifts-and-monitoring.html）識別出一個重要的實務發現：生產環境中大約 80% 被偵測到的「漂移」實際上是資料管道錯誤——欄位變為空值、上游 Schema 變更、特徵工程錯誤——而非真正的世界變化。對漂移告警的第一反應應該是檢查資料管道，而不是觸發重新訓練。

三種主要漂移類別有不同的偵測策略：

**協變量偏移**（資料漂移、輸入漂移）：P(X) 改變而 P(Y|X) 保持不變。輸入分佈發生偏移，但模型學到的映射仍然有效——模型現在可能在訓練不足的特徵空間區域中運作。可透過比較參考與生產環境之間的輸入特徵分佈來偵測。

**概念漂移**（Concept Drift）：P(Y|X) 改變而 P(X) 保持不變。世界發生了變化——詐欺模式演變、產品更改後用戶行為轉變——即使輸入看起來相似，模型的映射也已過時。需要基於標籤或間接偵測（代理指標、業務 KPI）。

**標籤偏移**（先驗概率偏移）：P(Y) 改變而 P(X|Y) 保持不變。類別平衡發生變化，但每個類別的輸入分佈不變。在具有季節性疾病盛行率的醫學診斷系統中很常見。

## 統計偵測方法

五種統計測試用於漂移偵測，在生產規模下具有顯著不同的靈敏度特性（來源：Evidently AI，https://www.evidentlyai.com/blog/data-drift-detection-large-datasets）：

| 方法 | 靈敏度 | 尺度無關 | 最適用於 |
|---|---|---|---|
| 柯爾莫哥洛夫-斯米爾諾夫（KS） | 最高 | 否 | 小資料集（<10K），早期偵測 |
| 族群穩定性指數（PSI） | 低 | 是 | 金融和信用風險工作流程 |
| KL 散度 | 低 | 是 | 具有既定基準的大型資料集 |
| 詹森-夏農距離 | 中等 | 是 | 類別 + 連續型，有界 [0,1] |
| 瓦瑟斯坦距離 | 中等 | 是（需正規化） | 通用生產環境 |

KS 測試對大型資料集過於靈敏——在 N > 500K 時，對小至 0.5% 的分佈偏移也會產生誤報。PSI 和 KL 散度需要 10% 以上的整體分佈偏移才能告警，對於漸進漂移反應較慢。瓦瑟斯坦距離是推薦的通用方法，對正規化資料的閾值為 0.1 個標準差。

**PSI** 是金融服務信用風險的傳統標準。其公式：

```
PSI = Σ（生產佔比 − 參考佔比）× ln（生產佔比 / 參考佔比）
```

業界閾值：PSI < 0.1（無變化），0.1–0.25（中等變化，需調查），≥ 0.25（顯著變化，可能需要重新訓練）。

```python
import numpy as np


def compute_psi(
    reference: np.ndarray,
    production: np.ndarray,
    bins: int | None = None,
) -> float:
    """
    計算參考分佈與生產分佈之間的族群穩定性指數（PSI）。

    PSI < 0.1: 無顯著偏移
    PSI 0.1-0.25: 中等偏移——先調查資料管道
    PSI >= 0.25: 顯著偏移——考慮重新訓練

    bins=None 時使用 Doane 公式進行自適應分箱。
    """
    combined = np.concatenate([reference, production])
    if bins is None:
        _, bin_edges = np.histogram(combined, bins="doane")
    else:
        lo = min(reference.min(), production.min())
        hi = max(reference.max(), production.max())
        bin_edges = np.linspace(lo, hi, bins + 1)

    ref_counts, _ = np.histogram(reference, bins=bin_edges)
    prod_counts, _ = np.histogram(production, bins=bin_edges)

    ref_pct = ref_counts / ref_counts.sum()
    prod_pct = prod_counts / prod_counts.sum()

    eps = 1e-6
    ref_pct = np.where(ref_pct == 0, eps, ref_pct)
    prod_pct = np.where(prod_pct == 0, eps, prod_pct)

    psi_per_bin = (prod_pct - ref_pct) * np.log(prod_pct / ref_pct)
    return float(np.sum(psi_per_bin))
```

## 參考窗口架構

所有漂移偵測都需要兩個窗口：

**參考窗口（Reference Window）：** 固定或定期刷新的基準。用訓練資料作為資料漂移檢查的參考；用驗證資料作為預測漂移檢查的參考。參考窗口應至少包含數千個樣本，以可靠地表示分佈。

**生產（測試）窗口：** 對近期生產資料的滑動或翻滾窗口。較小的窗口可以更快地偵測突發漂移，但會增加誤報；較大的窗口可以減少噪音，但會延遲對漸進漂移的偵測。

一個具體的失敗模式說明了為何滑動窗口很重要：三個月部署期間的累積準確率可能保持在 93.7%，而 7 天滑動窗口顯示 88.6%——累積指標掩蓋了正在發生的衰退。務必同時監控滑動窗口指標和累積指標（來源：Made With ML，https://madewithml.com/courses/mlops/monitoring/）。

僅對模型重要性較高的特徵發出漂移告警。監控所有特徵而不設優先順序會產生告警疲勞，使團隊對真正問題變得麻木。

## 使用 Evidently AI 的漂移偵測

Evidently 根據列類型和樣本大小自動為每列選擇統計測試，並在 ≥ 50% 的受監控列出現個別漂移時觸發資料集級別的漂移。

```python
import pandas as pd
from evidently import Report
from evidently.presets import DataDriftPreset
from prometheus_client import Gauge, CollectorRegistry, push_to_gateway


DRIFT_REGISTRY = CollectorRegistry()
feature_drift_gauge = Gauge(
    "ml_feature_drift_score",
    "每個特徵的統計漂移分數",
    labelnames=["feature", "model_name"],
    registry=DRIFT_REGISTRY,
)
dataset_drift_gauge = Gauge(
    "ml_dataset_drift_detected",
    "1 表示偵測到資料集級別漂移（>= 50% 特徵漂移），否則為 0",
    labelnames=["model_name"],
    registry=DRIFT_REGISTRY,
)


def run_drift_check(
    reference: pd.DataFrame,
    production: pd.DataFrame,
    model_name: str,
    pushgateway_url: str = "http://pushgateway:9091",
) -> dict:
    """
    使用 Evidently 計算資料漂移報告，並將每個特徵的分數推送到 Prometheus。

    資料集級別漂移在 >= 50% 的列出現漂移時觸發（可配置）。
    每個特徵的漂移分數被推送到 Prometheus Pushgateway 供 Grafana 告警使用。
    """
    report = Report([DataDriftPreset()])
    result = report.run(reference, production)
    report_dict = result.dict()

    drift_results = report_dict["metrics"][0]["result"]
    dataset_drifted = int(drift_results["dataset_drift"])
    dataset_drift_gauge.labels(model_name=model_name).set(dataset_drifted)

    per_feature = drift_results.get("drift_by_columns", {})
    summary = {
        "model": model_name,
        "dataset_drifted": bool(dataset_drifted),
        "features": {},
    }

    for feature_name, feature_data in per_feature.items():
        score = feature_data.get("drift_score", 0.0)
        is_drifted = feature_data.get("drift_detected", False)
        feature_drift_gauge.labels(
            feature=feature_name, model_name=model_name
        ).set(score)
        summary["features"][feature_name] = {"score": score, "drifted": is_drifted}

    push_to_gateway(
        pushgateway_url, job=f"drift_check_{model_name}", registry=DRIFT_REGISTRY
    )
    return summary


# 定時排程使用——由 Airflow、cron 或 SageMaker Pipelines 每日呼叫
if __name__ == "__main__":
    ref_df = pd.read_parquet("s3://ml-data/reference/churn_train_2024_q4.parquet")
    prod_df = pd.read_parquet("s3://ml-data/production/churn_logs_2025_04_14.parquet")

    result = run_drift_check(ref_df, prod_df, model_name="churn-predictor-v3")
    if result["dataset_drifted"]:
        drifted = [f for f, v in result["features"].items() if v["drifted"]]
        print(f"偵測到資料集漂移。漂移特徵：{drifted}")
        # 下一步：在觸發重新訓練之前驗證資料管道的完整性
```

## 無標籤性能估計

真實標籤通常在預測後數小時或數天才到達——推薦後的購買事件、風險評分後的理賠結果。NannyML 的基於置信度的性能估計（Confidence-Based Performance Estimation，CBPE）透過利用校準的預測概率，在沒有標籤的情況下估計模型性能。

機制：使用等溫迴歸（Isotonic Regression）對參考資料集上的預測概率進行校準，使得 0.9 的分數真正意味著 90% 的預測是正確的。對於每個生產預測，將校準後的概率視為正確的概率。估計準確率是這些每樣本值的均值。

CBPE 在 arXiv:2401.08348（《We Don't Need No Labels: Estimating Post-Deployment Performance》，v5，2025 年 10 月）中有所描述，該論文在 900+ 個資料集-模型組合上評估了 CBPE 及其後繼者 PAPE（概率自適應性能估計）。

```python
import nannyml as nml
import pandas as pd


def setup_performance_estimator(reference_df: pd.DataFrame) -> nml.CBPE:
    """
    在參考資料上訓練基於置信度的性能估計器（CBPE）。

    reference_df 必須包含：
      - y_pred_proba: float，模型的預測概率
      - y_pred: int（0 或 1），閾值後的預測結果
      - y_true: int（0 或 1），真實標籤
      - 加上任何特徵欄位
    """
    estimator = nml.CBPE(
        problem_type="classification_binary",
        y_pred_proba="y_pred_proba",
        y_pred="y_pred",
        y_true="y_true",
        metrics=["roc_auc", "f1", "average_precision"],
        chunk_size=5_000,   # 以 5K 行為窗口評估；根據每日量調整
    )
    estimator.fit(reference_df)
    return estimator


def estimate_production_performance(
    estimator: nml.CBPE,
    production_df: pd.DataFrame,
    alert_threshold_roc_auc: float = 0.85,
) -> None:
    """
    在 y_true 可能尚不存在的生產資料上估計模型性能。

    production_df 需要 y_pred_proba 和 y_pred；y_true 可以為 NaN。
    當估計的 ROC-AUC 低於 alert_threshold_roc_auc 時發出告警。
    """
    results = estimator.estimate(production_df)
    results_df = results.to_df()

    for _, row in results_df.iterrows():
        estimated_auc = row[("roc_auc", "value")]
        lower_bound = row[("roc_auc", "lower_threshold")]
        chunk_key = row[("chunk", "key")]

        print(
            f"區塊 {chunk_key}：估計 ROC-AUC = {estimated_auc:.4f} "
            f"（閾值 = {alert_threshold_roc_auc:.4f}）"
        )

        if estimated_auc < alert_threshold_roc_auc:
            print(f"  警告：性能低於閾值——請檢查資料管道。")
        if estimated_auc < lower_bound:
            print(f"  告警：低於置信區間——需要立即調查。")
```

## 重新訓練觸發策略

**固定排程：** 高頻域（即時競價、詐欺）每天一次；大多數生產系統每週一次；緩慢變化的域每月一次。操作簡單；在無漂移時可能會不必要地觸發重新訓練。

**漂移觸發：** 當漂移指標在 N 個連續評估窗口中超過閾值時啟動重新訓練。避免不必要的重新訓練，但需要一個能夠自動觸發、訓練和驗證新模型的完整管道。

無論採用哪種觸發策略，都建議使用**兩級告警**：

- **警告級別**（PSI 0.1–0.25，Wasserstein 0.05–0.1）：先調查資料管道完整性。在確認資料來源清潔之前，不要觸發重新訓練。
- **緊急級別**（PSI ≥ 0.25，Wasserstein > 0.1）：如果資料管道確認健康，則觸發重新訓練管道。

AWS SageMaker Model Monitor 按可配置的排程運行，並將指標發送到 CloudWatch。EventBridge 規則在 CloudWatch 告警觸發時啟動 SageMaker Pipelines 重新訓練作業（https://aws.amazon.com/blogs/machine-learning/automate-model-retraining-with-amazon-sagemaker-pipelines-when-drift-is-detected/）。

## 常見錯誤

**將每個漂移告警都視為重新訓練觸發器。** 生產環境中大約 80% 的漂移告警源於資料管道錯誤——上游造成空值的更改、Schema 遷移、特徵工程錯誤——而非真正的世界變化（來源：Chip Huyen，https://huyenchip.com/2022/02/07/data-distribution-shifts-and-monitoring.html）。工作流程必須（MUST）是：偵測漂移 → 驗證資料管道 → 確認資料清潔 → 評估是否重新訓練。

**在大型資料集上使用 KS 測試。** KS 在 N > 100K 時將不到 1% 的偏移標記為統計顯著。這會產生持續的誤報。對於 N > 50K，使用具有幅度閾值（而非 p 值閾值）的 Wasserstein 或 Jensen-Shannon 方法。

**將累積指標作為主要信號。** 長期部署窗口上的累積指標掩蓋了正在發生的衰退。一個在前三個月保持 93% 性能的模型，即使本週已下降到 85%，仍然會顯示 93% 的累積準確率。滑動窗口指標必須（MUST）是主要性能信號。

**平等監控所有特徵。** 使用相同閾值監控 200 個特徵會產生 200 個告警通道。按特徵對模型的重要性比例進行監控：按 SHAP 值排列前 10 個特徵，加上任何具有已知資料品質風險的特徵。

**忽視參考窗口的過期問題。** 在訓練時計算的參考窗口會隨著數月的漸進漂移而過時。定期刷新參考窗口——季度刷新是常見的預設值——即使沒有發生重新訓練。

## 相關 BEE

- [BEE-511 LLM 可觀測性與監控](511) — LLM 特有的可觀測性：Token 計數、延遲、輸出品質
- [BEE-536 AI 實驗與模型 A/B 測試](536) — ML 的統計實驗設計
- [BEE-583 AI 機器學習特徵倉庫](583) — 特徵基礎設施；特徵漂移通常源於此處
- [BEE-584 ML 模型的影子模式與金絲雀部署](584) — 持續監控之前的部署閘控
- [BEE-320 三大支柱：日誌、指標、追蹤](320) — 可觀測性基礎

## 參考資料

- Chip Huyen，《Data Distribution Shifts and Monitoring》，2022。https://huyenchip.com/2022/02/07/data-distribution-shifts-and-monitoring.html
- Evidently AI，《Which test is the best? We compared 5 methods for large datasets》。https://www.evidentlyai.com/blog/data-drift-detection-large-datasets
- Evidently AI，《What is data drift in ML, and how to detect and handle it》。https://www.evidentlyai.com/ml-in-production/data-drift
- Evidently AI，DataDriftPreset 文件。https://docs.evidentlyai.com/metrics/preset_data_drift
- Evidently AI GitHub。https://github.com/evidentlyai/evidently
- NannyML，《Population Stability Index》。https://www.nannyml.com/blog/population-stability-index-psi
- NannyML，CBPE 文件。https://nannyml.readthedocs.io/en/v0.4.1/how_it_works/performance_estimation.html
- arXiv:2401.08348，《We Don't Need No Labels: Estimating Post-Deployment Performance》。https://arxiv.org/abs/2401.08348
- Fiddler AI，《Measuring Data Drift with PSI》。https://www.fiddler.ai/blog/measuring-data-drift-population-stability-index
- Made With ML，《Monitoring》。https://madewithml.com/courses/mlops/monitoring/
- AWS，《Automate model retraining with Amazon SageMaker Pipelines when drift is detected》。https://aws.amazon.com/blogs/machine-learning/automate-model-retraining-with-amazon-sagemaker-pipelines-when-drift-is-detected/
- arXiv:2208.06868，Frouros: A Python library for drift detection。https://arxiv.org/abs/2208.06868
