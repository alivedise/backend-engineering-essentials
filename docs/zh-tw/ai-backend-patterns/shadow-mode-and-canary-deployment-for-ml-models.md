---
id: 30082
title: ML 模型的影子模式與金絲雀部署
state: draft
slug: shadow-mode-and-canary-deployment-for-ml-models
---

# [BEE-30082] ML 模型的影子模式與金絲雀部署

:::info
影子部署（Shadow Deployment）將線上生產流量複製到新版本模型，但不將其回應返回給用戶。金絲雀部署（Canary Deployment）將一小部分真實用戶路由到新版本，並在全面部署前比較結果。兩者共同構成兩階段閘控：影子驗證系統行為和預測品質且對用戶零風險；金絲雀在受控的用戶風險下驗證產品影響。關鍵的實作限制是影子基礎設施必須（MUST）只觀察而不變更狀態——它不能寫入生產資料庫或觸發下游副作用。
:::

## 背景

ML 模型更新在生產環境中失敗的原因，往往在離線評估中是不可見的。一個在持留資料集上表現優於前任的模型，在生產並發下可能產生更高的延遲，在訓練集中未出現的真實請求分佈上表現異常，或產生統計上更好但因系統耦合效應而惡化下游業務指標的預測。

傳統的軟體部署策略——藍綠切換、功能標誌——無法解決預測品質維度。它們驗證系統正確性（能否啟動？能否返回 200 狀態碼？），但不驗證模型正確性（預測準確嗎？）。ML 部署需要額外的一層：流量鏡像（Traffic Mirroring）和比較分析，以在影響任何用戶之前驗證模型品質。

Uber 的 ML 平台（Michelangelo）在峰值時每秒管理超過 1,500 萬次即時預測，涵蓋 400+ 個使用案例。他們的部署安全框架在訓練時計算離線分佈統計數據——百分位數、空值率、特徵平均值——並將其作為部署期間生產漂移測量的基準（https://www.uber.com/blog/raising-the-bar-on-ml-model-deployment-safety/）。LinkedIn 搜尋團隊將 10% 的排名查詢鏡像到影子候選模型，在進行任何金絲雀分配之前評估 NDCG@10。

## 架構選擇

ML 模型存在四種受控部署模式：

| 模式 | 用戶影響 | 增加延遲 | 驗證內容 | 最適用於 |
|---|---|---|---|---|
| 影子 | 無 | <2ms（非同步鏡像） | 系統 + 預測 | 延遲、快取預熱、預測比較 |
| 金絲雀 | 有限（5–20%） | 無 | 系統 + 預測 + 產品 | ML 模型、排名變更 |
| 藍綠 | 無（切換） | 無 | 僅系統 | Schema 遷移、原子發布 |
| 交叉對比 | 所有用戶，配對 | 無 | 預測（排名） | 搜尋、推薦 |

**影子對用戶是零風險的。** 鏡像請求是「發送後即忘記」（fire-and-forget）：生產模型返回回應，而影子模型的輸出被記錄但丟棄。影子適用於：(a) 在真實並發下驗證新模型版本是否在生產延遲預算內，(b) 在金絲雀之前預熱快取，(c) 累積可與延遲到達的真實標籤聯結以計算準確率指標的預測。

**金絲雀是產品影響的閘控。** 影子驗證系統就緒後，金絲雀將一定比例的真實用戶路由到新模型，並將結果——轉換率、點擊率、錯誤率——與生產對照組進行比較。可被檢測為統計顯著迴歸的不匹配會觸發自動回滾。

## 使用 Istio 的影子部署

Istio 透過 VirtualService 中的 `mirror` 欄位實現影子模式。鏡像請求到達影子服務時，`Host` 標頭後面附加 `-shadow`，使日誌可以與生產流量區分。生產回應路徑永遠不會被阻塞——鏡像是非同步的。

```yaml
# shadow-virtualservice.yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: recommendation-model
  namespace: ml-serving
spec:
  hosts:
  - recommendation-model
  http:
  - route:
    - destination:
        host: recommendation-model
        subset: v1          # 生產模型——100% 回應返回用戶
      weight: 100
    mirror:
      host: recommendation-model
      subset: v2            # 影子候選模型——回應被丟棄
    mirrorPercentage:
      value: 20.0           # 鏡像 20% 的生產流量
---
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: recommendation-model
  namespace: ml-serving
spec:
  host: recommendation-model
  subsets:
  - name: v1
    labels:
      version: "2024-q4"   # 當前生產版本
  - name: v2
    labels:
      version: "2025-q1"   # 影子候選版本
```

影子服務必須（MUST）部署時隔離寫入路徑：不寫入共享資料庫、不向 Kafka 生產消息、不發送電子郵件。一個常見的模式是向影子部署注入環境變數 `SHADOW_MODE=true` 並保護所有副作用路徑：

```python
import os
import logging

SHADOW_MODE = os.getenv("SHADOW_MODE", "false").lower() == "true"

def record_prediction(user_id: str, prediction: float, model_version: str) -> None:
    """將預測寫入審計日誌。在影子模式下跳過。"""
    if SHADOW_MODE:
        logging.info(
            "shadow_prediction user_id=%s prediction=%.4f version=%s",
            user_id, prediction, model_version,
        )
        return  # 不寫入生產資料庫

    db.execute(
        "INSERT INTO predictions (user_id, prediction, model_version, ts) VALUES (?, ?, ?, NOW())",
        (user_id, prediction, model_version),
    )
```

## 影子評估的離線標籤聯結

影子預測必須與延遲到達的真實標籤聯結以計算準確率指標。真實標籤通常在預測後數小時才到達（例如，推薦後的購買事件，ETA 預測後的行程完成事件）。標籤聯結器作為批次作業運行：

```python
import pandas as pd
from datetime import datetime, timedelta


def join_shadow_predictions_with_labels(
    shadow_logs: pd.DataFrame,       # 欄位：request_id, user_id, prediction, ts
    ground_truth: pd.DataFrame,      # 欄位：user_id, label, event_ts
    max_label_delay_hours: int = 24,
) -> pd.DataFrame:
    """
    對於每個影子預測，找到在預測時間戳記之後
    max_label_delay_hours 小時內到達的真實標籤。
    使用 as-of 聯結避免標籤洩漏。
    """
    shadow_logs = shadow_logs.sort_values("ts")
    ground_truth = ground_truth.sort_values("event_ts")

    # 按 user_id 合併，取預測後的第一個標籤事件
    joined = pd.merge_asof(
        shadow_logs,
        ground_truth,
        left_on="ts",
        right_on="event_ts",
        by="user_id",
        direction="forward",         # 標籤必須在預測之後到達
        tolerance=pd.Timedelta(hours=max_label_delay_hours),
    )

    # 刪除在時間窗口內未到達標籤的行
    joined = joined.dropna(subset=["label"])
    return joined


def compute_shadow_metrics(joined: pd.DataFrame) -> dict[str, float]:
    from sklearn.metrics import roc_auc_score, average_precision_score
    return {
        "auc": roc_auc_score(joined["label"], joined["prediction"]),
        "avg_precision": average_precision_score(joined["label"], joined["prediction"]),
        "n_predictions": len(joined),
        "label_join_rate": len(joined) / len(joined),  # 獲得標籤的比例
    }
```

## 使用 KServe 的金絲雀部署

KServe 的 `canaryTrafficPercent` 欄位在最後穩定版本和當前規格之間分配流量。將該欄位設置為 10 會將 10% 的請求發送到新模型，90% 發送到最後收到 100% 流量的版本。晉升（Promotion）刪除該欄位；回滾（Rollback）將其設置為 0。

```yaml
# kserve-canary.yaml
apiVersion: "serving.kserve.io/v1beta1"
kind: "InferenceService"
metadata:
  name: "fraud-classifier"
  namespace: ml-production
  annotations:
    serving.kserve.io/enable-tag-routing: "true"
spec:
  predictor:
    canaryTrafficPercent: 10      # 10% 金絲雀，90% 到最後穩定版本
    minReplicas: 2
    maxReplicas: 8
    model:
      modelFormat:
        name: sklearn
      storageUri: "gs://ml-models/fraud/v2.1.0"
      resources:
        requests:
          cpu: "500m"
          memory: "1Gi"
        limits:
          cpu: "2"
          memory: "4Gi"
```

```bash
# 晉升：100% 流量到新版本
kubectl patch isvc fraud-classifier -n ml-production \
  --type='json' \
  -p='[{"op":"remove","path":"/spec/predictor/canaryTrafficPercent"}]'

# 回滾：立即清空新版本
kubectl patch isvc fraud-classifier -n ml-production \
  --type='json' \
  -p='[{"op":"replace","path":"/spec/predictor/canaryTrafficPercent","value":0}]'

# 基於標籤的測試：直接呼叫金絲雀，不影響流量分配
curl -H "Host: latest-fraud-classifier-predictor-default.ml-production.example.com" \
  -H "Content-Type: application/json" \
  http://${INGRESS_HOST}:${INGRESS_PORT}/v1/models/fraud-classifier:predict \
  -d @test-payload.json
```

## 使用 Argo Rollouts 的自動回滾

Argo Rollouts 在每個金絲雀步驟運行 `AnalysisTemplate` 資源。當分析指標在 `failureLimit` 次後失敗時，Argo Rollouts 啟動自動回滾至前一個穩定版本。

```yaml
# analysis-template.yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: ml-model-quality-gate
  namespace: ml-production
spec:
  args:
  - name: service-name
  metrics:
  - name: prediction-success-rate
    interval: 60s
    successCondition: result[0] >= 0.95
    failureLimit: 3                # 連續 3 次失敗後回滾
    provider:
      prometheus:
        address: http://prometheus.monitoring.svc:9090
        query: |
          sum(rate(model_predictions_total{
            service="{{args.service-name}}",
            result="correct"
          }[5m])) /
          sum(rate(model_predictions_total{
            service="{{args.service-name}}"
          }[5m]))
  - name: p99-latency-ms
    interval: 60s
    thresholdRange:
      max: 200                     # 若 p99 延遲超過 200ms 則回滾
    provider:
      prometheus:
        address: http://prometheus.monitoring.svc:9090
        query: |
          histogram_quantile(0.99,
            sum(rate(model_inference_duration_seconds_bucket{
              service="{{args.service-name}}"
            }[5m])) by (le)
          ) * 1000
---
# rollout.yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: churn-predictor
  namespace: ml-production
spec:
  replicas: 4
  selector:
    matchLabels:
      app: churn-predictor
  template:
    metadata:
      labels:
        app: churn-predictor
    spec:
      containers:
      - name: model-server
        image: ml-registry/churn-predictor:v3.2.0
        ports:
        - containerPort: 8080
  strategy:
    canary:
      steps:
      - setWeight: 10
      - pause: {duration: 5m}       # 10% 下的烘烤時間
      - analysis:
          templates:
          - templateName: ml-model-quality-gate
          args:
          - name: service-name
            value: churn-predictor
      - setWeight: 25
      - pause: {duration: 10m}
      - setWeight: 50
      - pause: {duration: 10m}
      - setWeight: 100
```

## MLflow 冠軍/挑戰者別名

從 MLflow 2.9.0 開始，模型階段（Staging/Production）已棄用，改用可變別名（Mutable Alias）。別名支持任意名稱——`champion`（冠軍）、`challenger`（挑戰者）、`canary`（金絲雀）、`shadow`（影子）——並且多個別名可以指向同一版本。

```python
import mlflow
from mlflow import MlflowClient

MODEL_NAME = "fraud-classifier"
client = MlflowClient()

def register_challenger(run_id: str, metrics: dict) -> int:
    """將新模型版本註冊為挑戰者。"""
    model_uri = f"runs:/{run_id}/model"
    mv = mlflow.register_model(model_uri, MODEL_NAME)
    version = int(mv.version)

    # 用評估指標標記以供審計追蹤
    client.set_model_version_tag(MODEL_NAME, str(version), "auc", str(metrics["auc"]))
    client.set_model_version_tag(MODEL_NAME, str(version), "eval_date", metrics["date"])

    # 分配挑戰者別名——路由程式碼按別名載入
    client.set_registered_model_alias(MODEL_NAME, "challenger", version)
    return version


def promote_challenger_to_champion() -> None:
    """原子性地將挑戰者換為冠軍。"""
    challenger_mv = client.get_model_version_by_alias(MODEL_NAME, "challenger")
    champion_mv = client.get_model_version_by_alias(MODEL_NAME, "champion")

    # 晉升
    client.set_registered_model_alias(MODEL_NAME, "champion", int(challenger_mv.version))
    # 在舊冠軍上保留回滾別名
    client.set_registered_model_alias(MODEL_NAME, "rollback", int(champion_mv.version))
    client.delete_registered_model_alias(MODEL_NAME, "challenger")


# 在服務程式碼中按別名載入——別名解析為正確的版本
champion = mlflow.pyfunc.load_model(f"models:/{MODEL_NAME}@champion")
challenger = mlflow.pyfunc.load_model(f"models:/{MODEL_NAME}@challenger")
```

## 常見錯誤

**從影子路徑寫入生產狀態。** 如果影子服務發送電子郵件、更新推薦快取或記錄曝光，用戶會收到重複的效果。影子部署中的每個寫入路徑必須被禁用或模擬（Mock）。服務層面的 `SHADOW_MODE` 保護不夠充分，如果下游服務是共享的——帶有隔離依賴項的單獨部署更安全。

**在不驗證延遲預算的情況下運行影子。** 影子的目的不僅僅是比較預測，還要確認新模型版本在真實並發下維持在生產延遲預算內。在進入金絲雀之前，以給影子 Pod 池施壓的流量比例運行影子——如果 Pod 是隔離的，100% 影子是可以接受的。

**將金絲雀窗口設置得過短。** 日夜流量模式意味著兩小時的金絲雀窗口可能只捕獲白天的流量。推薦模型的預測品質可能專門針對夜間或週末會話而下降。面向消費者的服務的金絲雀窗口應當（SHOULD）至少為 24 小時。

**對所有模型使用相同的回滾閾值。** 誤報率為 0.001% 的詐欺模型需要比測量點擊率的推薦模型更嚴格的回滾閾值。根據錯誤類型的業務成本，按模型類別定義閾值。

**回滾前忘記排空連接。** 突然的回滾讓正在處理的請求無法收到回應。在 Kubernetes 中使用 pre-stop 生命週期鉤子（Lifecycle Hook）在 Pod 終止前排空現有連接：

```yaml
lifecycle:
  preStop:
    exec:
      command: ["/bin/sh", "-c", "sleep 10"]   # 等待正在處理的請求完成
```

## 相關 BEE

- [BEE-30034 AI 實驗與模型 A/B 測試](536) — ML 的統計實驗設計和顯著性測試
- [BEE-30009 LLM 可觀測性與監控](511) — 模型服務的指標收集
- [BEE-16002 部署策略](361) — 一般軟體的藍綠、滾動和金絲雀模式
- [BEE-30081 AI 機器學習特徵倉庫](583) — 模型服務底層的特徵基礎設施
- [BEE-12007 速率限制與節流](266) — 服務層的流量控制

## 參考資料

- Istio，《Mirroring》，流量管理文件。https://istio.io/latest/docs/tasks/traffic-management/mirroring/
- KServe，《Canary Rollout》，InferenceService 文件。https://kserve.github.io/website/docs/model-serving/predictive-inference/rollout-strategies/canary-example
- Argo Rollouts 使用 Prometheus 的金絲雀分析。https://www.infracloud.io/blogs/progressive-delivery-argo-rollouts-canary-analysis/
- Flagger，《Metrics》，漸進式交付文件。https://docs.flagger.app/usage/metrics
- AWS，《Minimize the production impact of ML model updates with Amazon SageMaker shadow testing》，機器學習部落格。https://aws.amazon.com/blogs/machine-learning/minimize-the-production-impact-of-ml-model-updates-with-amazon-sagemaker-shadow-testing/
- Amazon SageMaker，《Shadow variants》，開發者指南。https://docs.aws.amazon.com/sagemaker/latest/dg/model-shadow-deployment.html
- Uber Engineering，《Raising the Bar on ML Model Deployment Safety》。https://www.uber.com/blog/raising-the-bar-on-ml-model-deployment-safety/
- Christopher Samiullah，《Deploying Machine Learning Applications in Shadow Mode》，2019。https://christophergs.com/machine%20learning/2019/03/30/deploying-machine-learning-applications-in-shadow-mode/
- MLflow，《Model Registry》，文件。https://mlflow.org/docs/latest/model-registry/
- Seldon Core，《Ambassador Shadow Deployments》。https://docs.seldon.io/projects/seldon-core/en/latest/examples/ambassador_shadow.html
