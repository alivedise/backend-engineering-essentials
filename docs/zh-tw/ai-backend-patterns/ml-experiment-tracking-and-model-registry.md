---
id: 30084
title: ML 實驗追蹤與模型登錄庫
state: draft
slug: ml-experiment-tracking-and-model-registry
---

# [BEE-30084] ML 實驗追蹤與模型登錄庫

:::info
實驗追蹤（Experiment Tracking）將每次訓練執行的超參數、指標、程式碼版本和製品記錄在可查詢的日誌中。模型登錄庫（Model Registry）在訓練與部署之間提供治理層——對訓練好的模型進行版本控制、管理跨環境的晉升，並允許服務程式碼透過穩定別名而非特定版本號來引用模型。若沒有這些系統，在團隊規模下重現先前的結果或協調從訓練到服務的模型交接，就需要手動記錄簿——而這必然會在某處失敗。
:::

## 背景

在有專用實驗追蹤工具之前，ML 團隊在試算表、臨時文字日誌中追蹤結果，或者根本沒有記錄。代價很高：團隊經常花費大量時間重現幾週前的結果，因為沒有人記錄是哪種超參數組合在哪個資料集版本上、使用哪個程式碼提交產生了某個模型檢查點。

Matei Zaharia 和 Databricks 團隊於 2018 年 6 月 5 日宣布了 MLflow（https://www.databricks.com/blog/2018/06/05/introducing-mlflow-an-open-source-machine-learning-platform.html），作為一個開源平台，旨在解決四個痛點：追蹤實驗、打包模型、部署模型和管理生命週期。MLflow 成為最廣泛採用的實驗追蹤庫，現已進入 3.x 版本。

Weights & Biases（W&B）由 Lukas Biewald、Chris Van Pelt 和 Shawn Lewis 於 2017 年創立——最初是為了幫助在 OpenAI 訓練模型——並發展成為商業實驗追蹤和協作平台。CoreWeave 於 2025 年 3 月以約 17 億美元收購了 W&B（https://www.coreweave.com/blog/coreweave-completes-acquisition-of-weights-biases）。Neptune.ai 專為大規模基礎模型訓練構建，具有逐層指標監控功能，於 2025 年 12 月被 OpenAI 收購（https://www.cnbc.com/2025/12/03/openai-to-acquire-neptune-an-ai-model-training-assistance-startup.html），並於 2026 年 3 月作為獨立服務關閉。

對於超參數搜尋，Optuna（Akiba 等人，KDD 2019，arXiv:1907.10902，https://dl.acm.org/doi/10.1145/3292500.3330701）引入了定義即運行（Define-by-Run）API——在運行時動態構建搜尋空間而非預先聲明——配合樹形結構化 Parzen 估計器（TPE）採樣和 Hyperband 剪枝（Pruning）以提前停止不佳的試驗。

## 實驗資料模型

MLflow **實驗**（Experiment）是**運行**（Run）的命名集合。每次運行捕獲：

| 元件 | 內容 |
|---|---|
| `params` | 超參數（鍵 → 字串值，記錄一次） |
| `metrics` | 時序值（鍵 → 浮點數，按步驟索引） |
| `tags` | 可變元數據（git 提交 SHA、框架版本、用戶備註） |
| `artifacts` | 檔案：模型權重、混淆矩陣、特徵重要性圖表 |
| `dataset` | 帶有內容哈希和來源 URI 的輸入資料引用 |

一次運行有狀態（`RUNNING`、`FINISHED`、`FAILED`、`KILLED`）和時間戳記。製品 URI 指向一個儲存後端（生產環境使用 S3、GCS 或 Azure Blob——不能使用本地磁碟，因為它在並發寫入下會損壞，且不支援跨主機訪問）。

## 使用 MLflow 追蹤實驗

`mlflow.start_run()` 上下文管理器建立一次運行，記錄塊內的所有內容，並在退出時將其標記為完成。`autolog()` 對支援的框架（PyTorch、scikit-learn、XGBoost、TensorFlow、LightGBM）進行插樁，無需額外呼叫即可自動記錄參數、指標和模型製品。

```python
import mlflow
import mlflow.sklearn
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split

mlflow.set_tracking_uri("http://mlflow-server:5000")
mlflow.set_experiment("churn-prediction")

# 啟用自動插樁——捕獲所有 sklearn 參數 + 指標 + 模型
mlflow.sklearn.autolog(log_datasets=True)

with mlflow.start_run(run_name="gbm-v3-lr0.05") as run:
    # 記錄 autolog 未捕獲的額外參數
    mlflow.set_tag("team", "growth-ml")
    mlflow.set_tag("data_version", "2025-q1")

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2)
    model = GradientBoostingClassifier(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=4,
    )
    model.fit(X_train, y_train)

    # autolog 記錄 val_accuracy、val_f1、混淆矩陣、模型製品
    # run.info.run_id 是此訓練運行的穩定識別符
    print(f"Run ID: {run.info.run_id}")
```

**資料集溯源**（Dataset Lineage）透過內容哈希將訓練運行與其輸入資料連結：

```python
import mlflow
import pandas as pd

raw = pd.read_parquet("s3://ml-data/churn/train_2025_q1.parquet")

# 自動計算內容哈希——將運行與此精確資料快照綁定
dataset = mlflow.data.from_pandas(
    raw,
    source="s3://ml-data/churn/train_2025_q1.parquet",
    name="churn-training-2025-q1",
    targets="churned",
)

with mlflow.start_run():
    mlflow.log_input(dataset, context="training")
    # 如果 data.digest 改變，即使程式碼相同也可以區分「相同」程式碼上的新運行
```

**手動指標記錄**適用於自定義訓練迴圈：

```python
with mlflow.start_run():
    mlflow.log_params({"learning_rate": lr, "batch_size": bs, "optimizer": "adamw"})

    for epoch in range(max_epochs):
        train_loss = train_one_epoch(model, loader)
        val_auc = evaluate(model, val_loader)

        mlflow.log_metric("train_loss", train_loss, step=epoch)
        mlflow.log_metric("val_auc", val_auc, step=epoch)

    mlflow.log_artifact("feature_importance.png")
    mlflow.pytorch.log_model(
        model,
        name="model",
        registered_model_name="churn-classifier",  # 記錄時自動註冊
    )
```

## 使用 Optuna 進行超參數搜尋

Optuna 的定義即運行 API 在目標函式內動態構建搜尋空間，允許條件超參數（例如，只有在模型具有特定架構時才有 dropout）。帶有 `multivariate=True` 的 TPE 捕獲超參數之間的相關性。`HyperbandPruner` 根據中間指標報告提前停止不佳的試驗。

```python
import optuna
from optuna.samplers import TPESampler
from optuna.pruners import HyperbandPruner
import mlflow


def objective(trial: optuna.Trial) -> float:
    # 定義即運行：搜尋空間在運行時構建
    lr = trial.suggest_float("learning_rate", 1e-5, 1e-1, log=True)
    batch_size = trial.suggest_categorical("batch_size", [32, 64, 128, 256])
    dropout = trial.suggest_float("dropout", 0.0, 0.5)
    n_layers = trial.suggest_int("n_layers", 2, 8)

    with mlflow.start_run(nested=True):
        mlflow.log_params(trial.params)

        model = build_model(lr=lr, batch_size=batch_size,
                           dropout=dropout, n_layers=n_layers)

        for epoch in range(50):
            val_loss = train_one_epoch(model)
            mlflow.log_metric("val_loss", val_loss, step=epoch)

            # 向剪枝器報告——允許提前停止不佳的試驗
            trial.report(val_loss, epoch)
            if trial.should_prune():
                raise optuna.exceptions.TrialPruned()

        return val_loss


mlflow.set_experiment("churn-hparam-search")

with mlflow.start_run(run_name="optuna-sweep"):
    study = optuna.create_study(
        study_name="churn-hparam-search",
        direction="minimize",
        sampler=TPESampler(multivariate=True),  # 捕獲參數相關性
        pruner=HyperbandPruner(),
        storage="postgresql://mlflow:password@db:5432/optuna",  # 持久化儲存
    )
    study.optimize(objective, n_trials=100, n_jobs=4)

    mlflow.log_params(study.best_params)
    mlflow.log_metric("best_val_loss", study.best_value)
```

W&B Sweeps 將貝葉斯超參數搜尋實作為協調的多智能體系統。一個掃描控制器進程管理配置佇列；智能體進程消費配置並報告指標。`early_terminate` 區塊實作 Hyperband 以進行剪枝：

```yaml
# sweep.yaml
program: train.py
method: bayes
metric:
  name: val_loss
  goal: minimize
parameters:
  learning_rate:
    distribution: log_uniform_values
    min: 0.00001
    max: 0.1
  batch_size:
    values: [32, 64, 128, 256]
  dropout:
    distribution: uniform
    min: 0.0
    max: 0.5
early_terminate:
  type: hyperband
  s: 2
  eta: 3
  max_iter: 27
run_cap: 50
```

```bash
wandb sweep sweep.yaml             # 返回 SWEEP_ID
wandb agent team/project/$SWEEP_ID  # 啟動智能體；多個智能體並行化搜尋
```

## 模型登錄庫與基於別名的晉升

MLflow 2.9 廢棄了生命週期階段（Staging → Production），因為它們每個階段只允許一個版本，無法表示多環境工作流程或冠軍/挑戰者模式。替代方案是**可變別名**（Mutable Alias）：指向特定版本的任意命名指標。

```python
from mlflow.tracking import MlflowClient
import mlflow

MODEL_NAME = "churn-classifier"
client = MlflowClient()


def register_and_validate(run_id: str, val_auc: float) -> int:
    """將訓練運行註冊為模型版本並驗證它。"""
    mv = mlflow.register_model(
        f"runs:/{run_id}/model",
        MODEL_NAME,
    )
    version = int(mv.version)

    # 用評估結果標記以供審計追蹤
    client.set_model_version_tag(MODEL_NAME, str(version), "val_auc", f"{val_auc:.4f}")
    client.set_model_version_tag(MODEL_NAME, str(version), "validated_by", "ci-pipeline")

    if val_auc > 0.92:
        # 晉升為挑戰者——服務程式碼不需要改變
        client.set_registered_model_alias(MODEL_NAME, "challenger", version)
        print(f"版本 {version}（AUC={val_auc:.4f}）晉升為挑戰者")
    else:
        print(f"版本 {version}（AUC={val_auc:.4f}）低於閾值，不晉升")

    return version


def promote_challenger_to_champion() -> None:
    """原子性地將挑戰者換為冠軍。舊冠軍成為回滾版本。"""
    challenger = client.get_model_version_by_alias(MODEL_NAME, "challenger")
    try:
        champion = client.get_model_version_by_alias(MODEL_NAME, "champion")
        # 保留前一個冠軍以快速回滾
        client.set_registered_model_alias(MODEL_NAME, "rollback", int(champion.version))
    except Exception:
        pass  # 尚無冠軍——第一次晉升

    client.set_registered_model_alias(MODEL_NAME, "champion", int(challenger.version))
    client.delete_registered_model_alias(MODEL_NAME, "challenger")
    print(f"版本 {challenger.version} 晉升為冠軍")


# 服務程式碼永遠不會改變——始終載入 @champion 別名
model = mlflow.pyfunc.load_model(f"models:/{MODEL_NAME}@champion")
```

```mermaid
stateDiagram-v2
    [*] --> Registered: mlflow.register_model()
    Registered --> Candidate: set_alias("candidate")
    Candidate --> Challenger: CI 驗證 AUC > 閾值
    Challenger --> Champion: 手動或自動批准
    Champion --> Rollback: 設置下一個冠軍時
    Rollback --> Champion: set_alias("champion", rollback_version)

    style Candidate fill:#2563eb,color:#fff
    style Challenger fill:#d97706,color:#fff
    style Champion fill:#16a34a,color:#fff
    style Rollback fill:#7c3aed,color:#fff
```

## CI/CD 整合

模型晉升管道在每次資料或程式碼變更合併時運行：用 DVC 提取版本化的資料，訓練並記錄到 MLflow，在持留集上評估，並有條件地晉升。

```yaml
# .github/workflows/train.yml
name: 訓練與晉升
on:
  push:
    paths: ["data.dvc", "src/**", "params.yaml"]

jobs:
  train:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install mlflow dvc scikit-learn optuna
      - run: dvc pull                    # 提取版本化的訓練資料
      - name: 訓練
        env:
          MLFLOW_TRACKING_URI: ${{ secrets.MLFLOW_TRACKING_URI }}
        run: python src/train.py         # 記錄運行，註冊模型版本

  promote:
    needs: train
    runs-on: ubuntu-latest
    environment: staging                  # 帶有審批閘控的 GitHub 環境
    steps:
      - name: 評估並晉升
        env:
          MLFLOW_TRACKING_URI: ${{ secrets.MLFLOW_TRACKING_URI }}
        run: python src/promote.py        # 評估最新版本，設置別名
```

## 基礎設施

**MLflow 伺服器**需要兩個後端：

- **後端儲存**（運行元數據、參數、指標）：生產環境使用 PostgreSQL——SQLite 在並發寫入下會損壞。連接字串：`postgresql://user:pass@host:5432/mlflow`。
- **製品儲存**（模型權重、圖表、大型檔案）：使用 S3、GCS 或 Azure Blob。本地磁碟不適合多節點訓練或跨團隊訪問。

```bash
# 使用 PostgreSQL 後端和 S3 製品儲存啟動 MLflow 伺服器
mlflow server \
  --backend-store-uri postgresql://mlflow:password@db:5432/mlflow \
  --default-artifact-root s3://ml-artifacts/mlflow/ \
  --host 0.0.0.0 \
  --port 5000
```

對於 W&B，所有資料儲存在 W&B 雲端（或使用 W&B Server 自行託管）。對於 Optuna 的分散式搜尋，`storage` 參數接受 PostgreSQL 或 MySQL URL；並行智能體連接到同一個研究（Study），並透過資料庫協調。

## 常見錯誤

**不記錄資料版本。** 未引用所使用的精確資料集的運行是不可重現的。務必（MUST）透過 `mlflow.log_input` 記錄資料集內容哈希，或將 DVC 資料提交 SHA 記錄為標籤。

**在多用戶或多進程環境中使用 SQLite 作為 MLflow 後端儲存。** SQLite 是基於文件的，不支援並發寫入。在並行訓練運行下，它會損壞元數據資料庫。請使用 PostgreSQL。

**在 MLflow 2.9+ 中繼續使用 Stages 而非 Aliases。** Stage API 仍然有效，但每個階段只允許一個版本且已被棄用。別名更靈活——你可以同時讓 `champion`、`challenger`、`canary` 和 `shadow` 指向不同的版本。

**將超參數搜尋視為一次性的。** 使用持久化儲存後端（`storage="postgresql://..."`）的 Optuna 時，已完成的試驗是可重用的——如果運行在掃描中途崩潰，研究從最後完成的試驗恢復。使用記憶體內儲存（預設）在崩潰時會遺失所有試驗歷史記錄。

**Autolog 捕獲過多。** `mlflow.autolog()` 可能記錄中間模型檢查點、高頻率的中間指標以及不是有意義超參數的框架內部參數。如果製品儲存成本是個問題，或者過多的記錄檔案拖慢了 UI，可以有選擇性地配置：`mlflow.sklearn.autolog(log_models=False)`。

## 相關 BEE

- [BEE-30034 AI 實驗與模型 A/B 測試](536) — 生產中已上線模型版本的線上 A/B 測試
- [BEE-30081 AI 機器學習特徵倉庫](583) — 訓練管道所使用的特徵基礎設施
- [BEE-30082 ML 模型的影子模式與金絲雀部署](584) — 使用模型登錄庫版本的部署模式
- [BEE-30083 ML 監控與漂移偵測](585) — 模型晉升後的生產監控
- [BEE-6007 資料庫遷移](126) — PostgreSQL MLflow 後端 Schema 管理

## 參考資料

- Databricks，《Introducing MLflow: An Open Source Machine Learning Platform》，2018 年 6 月 5 日。https://www.databricks.com/blog/2018/06/05/introducing-mlflow-an-open-source-machine-learning-platform.html
- MLflow，模型登錄庫文件。https://mlflow.org/docs/latest/ml/model-registry/
- MLflow，追蹤 API 文件。https://mlflow.org/docs/latest/ml/tracking/
- MLflow 3.0 發布公告。https://mlflow.org/blog/mlflow-3-0-launch
- Akiba, T. 等人，《Optuna: A Next-generation Hyperparameter Optimization Framework》，KDD 2019。https://arxiv.org/abs/1907.10902
- CoreWeave，《CoreWeave Completes Acquisition of Weights & Biases》，2025。https://www.coreweave.com/blog/coreweave-completes-acquisition-of-weights-biases
- CNBC，《OpenAI to acquire Neptune》，2025 年 12 月 3 日。https://www.cnbc.com/2025/12/03/openai-to-acquire-neptune-an-ai-model-training-assistance-startup.html
- Weights & Biases，實驗追蹤文件。https://docs.wandb.ai/models/track
- Weights & Biases，Sweeps 配置參考。https://docs.wandb.ai/models/sweeps/sweep-config-keys
- Optuna 文件。https://optuna.readthedocs.io/en/stable/
- CML（持續機器學習）文件。https://cml.dev/
