---
id: 30085
title: ML 資料驗證與管道品質閘控
state: draft
slug: ml-data-validation-and-pipeline-quality-gates
---

# [BEE-587] ML 資料驗證與管道品質閘控

:::info
資料驗證在資料進入訓練管道、特徵倉庫或模型之前，強制執行關於資料的明確斷言——結構描述、統計屬性、新鮮度、完整性。管道品質閘控是當驗證失敗時阻止或重新路由執行的決策點。若沒有這些閘控，問題資料會靜默地進入模型，產生難以診斷的低品質預測。
:::

## 背景

Dimensional Research 的調查發現，96% 的組織在訓練 AI 模型時遇到資料品質問題，而 VentureBeat 的分析報告稱 87% 的資料科學專案從未投入生產，主要原因是資料品質不足。Google 的 MLOps 參考架構將資料驗證作為模型訓練前的必要步驟，檢查兩種類型的異常：結構描述偏差（意外或缺失的特徵）和資料值偏差（表明模型需要重新訓練的顯著統計變化），並明確指導在發現問題時停止管道（https://docs.cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning）。

核心問題在於資料問題是靜默的。在關鍵特徵中含有 40% 空值的資料上訓練的模型不會崩潰——它會產生微妙的錯誤預測。偵測發生在下游業務指標下降時，此時根本原因分析的代價已經很高。

工具生態圍繞三個互補的層次匯聚：**Pandera** 用於在訓練程式碼中直接對 Python DataFrame 進行結構描述級別的驗證；**Great Expectations** 用於跨文件、資料庫和 DataFrame 的期望套件和可讀驗證報告；**Soda** 用於在管道邊界對 SQL 資料來源執行 YAML 定義的資料品質檢查。這些工具在資料生命週期的不同點運作，且通常組合使用。

## 資料品質的六個維度

六個維度定義了「良好資料」的含義。每條驗證規則至少映射到其中一個：

| 維度 | 定義 | 典型檢查 |
|---|---|---|
| **完整性** | 所需欄位和記錄都存在 | `missing_percent(feature) < 1%` |
| **有效性** | 值符合定義的格式、類型、域規則 | `invalid_percent(email) < 0.5%` |
| **唯一性** | 每個實體只記錄一次 | `duplicate_count(user_id) = 0` |
| **一致性** | 相關欄位和系統間的值一致 | 參照完整性、跨資料集匹配率 |
| **準確性** | 資料正確代表真實世界實體 | 與權威來源交叉參照 |
| **新鮮度** | 資料對使用場景足夠新近 | `freshness(updated_at) < 24h` |

完整性和有效性失敗是最常見且最容易自動偵測的。準確性通常需要特定域的交叉參照檢查或人工抽樣。

## Pandera：程序內 DataFrame 驗證

Pandera 在函式邊界驗證 DataFrame——資料進入或退出轉換步驟的地方。它支援 pandas、Polars、PySpark、Dask 和 Modin，並採用類似於 Pydantic 資料模型的結構描述聲明風格。

由 Niels Bantilan 於 2018 年創建，現為 Union.ai 旗下的開源專案。Pandera 提供兩種等效 API：基於物件的 `DataFrameSchema` 和基於類別的 `DataFrameModel`。

```python
import pandera.pandas as pa
from pandera.typing import Series

# 基於類別的結構描述——聲明式、自文檔化
class TrainingFeaturesSchema(pa.DataFrameModel):
    user_id: Series[str] = pa.Field(nullable=False, unique=True)
    age: Series[int] = pa.Field(ge=0, le=120)
    purchase_count_30d: Series[int] = pa.Field(ge=0)
    label: Series[int] = pa.Field(isin=[0, 1])

    @pa.check("purchase_count_30d")
    @classmethod
    def purchase_count_reasonable(cls, s: Series[int]) -> Series[bool]:
        # 自定義向量化檢查：單個用戶 30 天內的購買次數不能超過 10k
        return s <= 10_000

# 驗證——預設在第一個失敗時立即引發 SchemaError
validated_df = TrainingFeaturesSchema.validate(df)

# 惰性驗證——在引發之前收集所有失敗
try:
    TrainingFeaturesSchema.validate(df, lazy=True)
except pa.errors.SchemaErrors as e:
    # e.failure_cases 包含所有失敗行和檢查的 DataFrame
    print(e.failure_cases)
    raise
```

`@pa.check_input` 和 `@pa.check_output` 裝飾器在函式邊界應用驗證，無需修改函式主體——適用於驗證特徵工程函式而不改變其簽名：

```python
import pandera.pandas as pa

input_schema = pa.DataFrameSchema({
    "event_timestamp": pa.Column("datetime64[ns]", nullable=False),
    "user_id": pa.Column(str, nullable=False),
    "raw_score": pa.Column(float, pa.Check.between(0.0, 1.0)),
})

output_schema = pa.DataFrameSchema({
    "user_id": pa.Column(str, nullable=False),
    "normalized_score": pa.Column(float, pa.Check.between(0.0, 1.0)),
})

@pa.check_input(input_schema)
@pa.check_output(output_schema)
def compute_normalized_score(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["normalized_score"] = (df["raw_score"] - df["raw_score"].min()) / (
        df["raw_score"].max() - df["raw_score"].min()
    )
    return df[["user_id", "normalized_score"]]
```

## Great Expectations：期望套件與檢查點

Great Expectations（GX）在比 Pandera 更高的層次上運作——它管理命名的**期望套件**（規則集合），在生產中以**檢查點**形式運行它們，並生成**資料文件**（人類可讀的 HTML 報告），作為資料品質的活文件。GX v1.0 GA 於 2024 年 8 月 22 日發布；v1.x API 是完全取代基於 YAML 配置的 Python Fluent API。

**期望**（Expectation）是可驗證的斷言：「欄位 `user_id` 不含空值。」**期望套件**是一個命名集合，作為一個單元應用。**檢查點**執行一個或多個套件，並根據結果觸發動作——Slack 通知、資料文件更新、阻塞異常。

```python
import great_expectations as gx
import pandas as pd

# GX v1.x Fluent API
context = gx.get_context()

# 連接到 pandas 來源
data_source = context.data_sources.add_pandas("training_data")
data_asset = data_source.add_dataframe_asset("daily_features")
batch_definition = data_asset.add_batch_definition_whole_dataframe("batch")

# 定義期望套件
suite = context.suites.add(
    gx.ExpectationSuite(name="training_features_suite")
)
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToNotBeNull(column="user_id")
)
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeUnique(column="user_id")
)
suite.add_expectation(
    gx.expectations.ExpectTableRowCountToBeBetween(
        min_value=10_000, max_value=10_000_000
    )
)
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeBetween(
        column="age",
        min_value=0,
        max_value=120,
        mostly=0.99,  # 允許最多 1% 超出範圍（軟約束）
    )
)

# 驗證
df = pd.read_parquet("s3://ml-data/features/2025-04-15.parquet")
batch = batch_definition.get_batch(batch_parameters={"dataframe": df})
validation_result = batch.validate(suite)

if not validation_result["success"]:
    failing = [
        r for r in validation_result["results"] if not r["success"]
    ]
    raise RuntimeError(
        f"驗證失敗：{len(failing)} 個期望未滿足。"
        f"第一個失敗：{failing[0]['expectation_config']['type']}"
    )
```

`mostly` 參數（0.0 到 1.0）將絕對斷言轉換為部分通過閾值。`mostly=0.99` 意味著 99% 的行必須滿足檢查——適用於完美合規不切實際但極端違規仍必須捕獲的現實世界資料。

**帶動作的檢查點**使生產級驗證管道能夠在驗證結果觸發通知和文件更新時自動執行：

```python
validation_definition = context.validation_definitions.add(
    gx.ValidationDefinition(
        name="daily_feature_validation",
        data=batch_definition,
        suite=suite,
    )
)

checkpoint = context.checkpoints.add(
    gx.Checkpoint(
        name="daily_feature_checkpoint",
        validation_definitions=[validation_definition],
        actions=[
            gx.checkpoint.SlackNotificationAction(
                name="slack_alert",
                slack_webhook="${SLACK_WEBHOOK_URL}",
                notify_on="failure",   # "all" | "success" | "failure"
            ),
            gx.checkpoint.UpdateDataDocsAction(name="update_data_docs"),
        ],
        result_format={"result_format": "COMPLETE"},
    )
)

checkpoint_result = checkpoint.run()
```

## Soda：SQL 層品質閘控

Soda Core 在 YAML 中定義資料品質檢查（Soda Checks Language，SodaCL），並直接對 SQL 資料來源運行它們。2018 年在比利時布魯塞爾創立，支援 25+ 個內置指標，涵蓋所有六個品質維度。Soda 特別適用於驗證資料倉庫（Snowflake、BigQuery、Redshift）和 SQL 轉換後的 dbt 相鄰管道中的資料。

```yaml
# checks/feature_checks.yml
checks for training_features:
  - row_count > 10000
  - missing_count(user_id) = 0
  - duplicate_count(user_id) = 0
  - missing_percent(age) < 1 %
  - freshness(updated_at) < 24h
  - invalid_percent(email) < 0.5 %:
      valid format: email
  - schema:
      fail:
        when required column missing:
          - user_id
          - event_timestamp
          - label

# 兩級告警：先警告後失敗
checks for raw_events:
  - duplicate_count(event_id):
      warn: when > 5
      fail: when > 100
```

```bash
soda scan \
  -d snowflake_prod \
  -c soda/configuration.yml \
  checks/feature_checks.yml
# 退出碼：0=全部通過，1=僅警告，2=失敗
```

Python API 使程式化整合成為可能：

```python
from soda.scan import Scan


def run_soda_gate(data_source: str, checks_file: str) -> None:
    """運行 Soda 檢查，失敗時引發異常。記錄警告但不阻塞。"""
    scan = Scan()
    scan.set_data_source_name(data_source)
    scan.add_configuration_yaml_file("./soda/configuration.yml")
    scan.add_sodacl_yaml_file(checks_file)

    scan.execute()
    print(scan.get_logs_text())

    if scan.has_failures():
        raise RuntimeError(
            f"Soda 資料品質閘控對 '{data_source}' 失敗。"
            f"阻止管道執行。"
        )
    if scan.has_warnings():
        import logging
        logging.warning("Soda 檢查：偵測到警告，管道繼續執行。")
```

## 管道整合

### 嚴重性級別

品質閘控應當（SHOULD）至少實作三個嚴重性級別：

- **緊急（CRITICAL）**——阻止管道，通知值班人員。例如：主鍵為空值、行數為零、結構描述欄位缺失。
- **錯誤（ERROR）**——阻止管道，發送告警。例如：必要特徵的空值率超過 5%、資料新鮮度 > 48 小時。
- **警告（WARNING）**——繼續管道，記錄並告警。例如：空值率在可接受範圍內從 0.1% 增加到 0.5%。

### Airflow 整合

GX 和 Soda 都與 Airflow 原生整合。`GXValidateDataFrameOperator` 在驗證失敗時阻止下游任務。`ShortCircuitOperator` 為簡單的行數或新鮮度檢查提供輕量級閘控：

```python
from airflow.operators.python import ShortCircuitOperator, BranchPythonOperator
from great_expectations_provider.operators.great_expectations import (
    GXValidateDataFrameOperator,
)


def check_minimum_row_count() -> bool:
    """返回 False 以停止 DAG；返回 True 以繼續。"""
    count = query_db("SELECT COUNT(*) FROM feature_store_daily")
    return count > 10_000  # 返回 False → 所有下游任務被跳過


def route_on_quality() -> str:
    """BranchPythonOperator：路由到訓練或隔離區。"""
    if data_quality_score() >= 0.95:
        return "train_model"
    return "quarantine_data"


with dag:
    # 硬閘控：行數過低時停止 DAG
    row_count_gate = ShortCircuitOperator(
        task_id="row_count_gate",
        python_callable=check_minimum_row_count,
    )

    # GX 驗證：期望失敗時阻止下游
    gx_validation = GXValidateDataFrameOperator(
        task_id="validate_features",
        configure_dataframe=lambda: load_feature_df(),
        configure_expectations=lambda df: gx.ExpectationSuite(
            expectations=[
                gx.expectations.ExpectColumnValuesToNotBeNull(column="user_id"),
                gx.expectations.ExpectTableRowCountToBeBetween(
                    min_value=1_000, max_value=50_000_000
                ),
            ]
        ),
    )

    # 軟閘控：將問題資料路由到隔離區，而非讓 DAG 失敗
    quality_branch = BranchPythonOperator(
        task_id="quality_branch",
        python_callable=route_on_quality,
    )

    row_count_gate >> gx_validation >> quality_branch
```

`ShortCircuitOperator` 應當（SHOULD）僅用於不可妥協的條件。過度使用會在大型 DAG 中引起連鎖跳過。當問題資料應被隔離（路由到單獨的儲存路徑供人工審查）而非丟棄整個管道運行時，使用 `BranchPythonOperator`。

### 將驗證結果記錄到實驗追蹤

將驗證狀態連結到模型訓練運行，可以實現可重現性審計——如果模型降級，可以追溯訓練資料在訓練時是否通過了驗證：

```python
import mlflow

with mlflow.start_run():
    # 運行 Soda 驗證並記錄結果
    scan = Scan()
    scan.set_data_source_name("snowflake_prod")
    scan.add_sodacl_yaml_file("./checks/features.yml")
    scan.execute()

    mlflow.log_param("data_validation_tool", "soda-core")
    mlflow.log_metric("soda_checks_passed", scan.get_checks_count() - scan.get_checks_failing_count())
    mlflow.log_metric("soda_checks_failed", scan.get_checks_failing_count())
    mlflow.set_tag("data_validation_status", "passed" if not scan.has_failures() else "failed")

    if scan.has_failures():
        raise RuntimeError("資料品質閘控失敗——訓練被阻止。")

    # 僅在驗證通過後才繼續訓練
    train_model(...)
```

## 常見錯誤

**只針對已知問題編寫驗證規則。** 反應性地編寫的驗證套件——在資料問題導致模型失敗之後——會錯過未來未知的失敗模式。應當（SHOULD）在管道設計時就為完整的結構描述和所有統計屬性編寫斷言，而非在事故發生後補充。

**只使用阻塞閘控而沒有警告。** 在第一個異常時阻塞的二元通過/失敗閘控，在資料自然波動期間會導致不必要的管道失敗。兩級告警（空值率 1% 時警告，5% 時失敗）在仍然捕獲嚴重異常的同時避免告警疲勞。

**跳過新鮮度檢查。** 在不偵測的情況下處理過時資料的管道，將在認為使用今天資料的同時實際上用昨天的資料訓練模型。`freshness(updated_at) < 24h` 是一行 SodaCL 檢查；遺漏它是一個常見的疏忽，後果嚴重。

**只驗證訓練資料，不驗證服務資料。** 訓練資料驗證在模型構建時捕獲問題。服務資料驗證在預測時捕獲問題——當提供給模型的特徵值偏離訓練資料的面貌時。兩者都必須（MUST）進行驗證；服務驗證發生在線上服務路徑中，必須快速（大多數情況下 < 5ms 預算）。

**在生產管道中使用 lazy=False（預設）的 Pandera。** 使用 `lazy=False` 時，Pandera 在第一個失敗時引發，隱藏同一批次中的所有其他失敗。在管道上下文中務必（MUST）使用 `lazy=True`，以在停止執行前收集完整的失敗情況。

## 相關 BEE

- [BEE-583 AI 機器學習特徵倉庫](583) — 在物化之前應用驗證閘控的特徵基礎設施
- [BEE-585 ML 監控與漂移偵測](585) — 生產環境中分佈變化的反應性監控（與主動驗證不同）
- [BEE-586 ML 實驗追蹤與模型登錄庫](586) — 透過 MLflow 標籤將驗證結果連結到訓練運行
- [BEE-126 資料庫遷移](126) — 必須與驗證套件更新配對的結構描述演化
- [BEE-529 AI 工作流程編排](529) — 嵌入品質閘控的編排框架

## 參考資料

- Great Expectations，GX Core 概覽。https://docs.greatexpectations.io/docs/core/introduction/gx_overview
- Great Expectations，v1.0 GA 公告，2024 年 8 月。https://greatexpectations.io/blog/the-next-step-for-gx-oss-1-0/
- Pandera 文件。https://pandera.readthedocs.io/
- Pandera，惰性驗證。https://pandera.readthedocs.io/en/stable/lazy_validation.html
- Soda，SodaCL 概覽。https://docs.soda.io/soda-v3/soda-cl-overview
- Soda，SodaCL 指標與檢查。https://docs.soda.io/soda-v3/sodacl-reference/metrics-and-checks
- Astronomer，《Data quality and Airflow》。https://www.astronomer.io/docs/learn/data-quality
- Astronomer，《Orchestrate GX with Airflow》。https://www.astronomer.io/docs/learn/airflow-great-expectations
- Google Cloud，《MLOps: Continuous delivery and automation pipelines in machine learning》。https://docs.cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning
- dbt Labs，《Add data tests to your DAG》。https://docs.getdbt.com/docs/build/data-tests
- Collibra，《The 6 Dimensions of Data Quality》。https://www.collibra.com/blog/the-6-dimensions-of-data-quality
- arXiv:2207.14529，《Effects of Data Quality Problems on ML Model Performance》。https://arxiv.org/abs/2207.14529
- TensorFlow Data Validation 指南。https://www.tensorflow.org/tfx/guide/tfdv
