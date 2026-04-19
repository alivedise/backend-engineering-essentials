---
id: 30083
title: ML Monitoring and Drift Detection
state: draft
slug: ml-monitoring-and-drift-detection
---

# [BEE-30083] ML Monitoring and Drift Detection

:::info
A deployed ML model's accuracy silently degrades when the world it was trained on diverges from the world it now predicts. Drift detection is the infrastructure that measures this gap — comparing feature distributions, prediction distributions, and estimated outcomes against a reference baseline. The central challenge is that ground truth labels often arrive hours or days after predictions, so production monitoring must work without them. The toolkit is a combination of statistical tests for data drift and probability calibration for label-free performance estimation.
:::

## Context

ML models fail in production in two modes: loudly (exceptions, null predictions, latency spikes) and silently (degraded accuracy with no error signal). The loud failures are caught by standard service monitoring — error rate alerts, latency dashboards. The silent failures require a separate monitoring layer that compares the statistical properties of what the model sees today against what it was trained on.

Chip Huyen's analysis of production ML failures (https://huyenchip.com/2022/02/07/data-distribution-shifts-and-monitoring.html) identifies an important practical finding: approximately 80% of detected "drifts" in production are actually data pipeline bugs — a column going null, an upstream schema change, a feature engineering error — rather than genuine world-change. The first response to a drift alert should be to check data pipelines, not to retrain.

Three primary drift categories exist with different detection strategies:

**Covariate shift** (data drift, input drift): P(X) changes while P(Y|X) stays constant. The input distribution shifts but the model's learned mapping remains valid — the model may now operate in feature-space regions where it was undertrained. Detectable by comparing input feature distributions between reference and production.

**Concept drift**: P(Y|X) changes while P(X) stays constant. The world changes — fraud patterns evolve, user behavior shifts after a product change — and the model's mapping becomes stale even when inputs look similar. Requires label-based or indirect detection (proxy metrics, business KPIs).

**Label shift** (prior probability shift): P(Y) changes while P(X|Y) stays constant. The class balance changes without the per-class input distributions changing. Common in medical diagnosis systems with seasonal disease prevalence.

## Statistical Detection Methods

Five statistical tests are used for drift detection, with meaningfully different sensitivity characteristics at production scale (source: Evidently AI, https://www.evidentlyai.com/blog/data-drift-detection-large-datasets):

| Method | Sensitivity | Scale-invariant | Best For |
|---|---|---|---|
| Kolmogorov-Smirnov (KS) | Highest | No | Small datasets (<10K), early detection |
| Population Stability Index (PSI) | Low | Yes | Finance and credit risk workflows |
| KL Divergence | Low | Yes | Large datasets with established baselines |
| Jensen-Shannon Distance | Moderate | Yes | Categorical + continuous, bounded [0,1] |
| Wasserstein Distance | Moderate | Yes (with normalization) | Production general-purpose |

KS is too sensitive for large datasets — at N > 500K, it generates false alarms for shifts as small as 0.5% of the distribution. PSI and KL divergence require 10%+ whole-distribution shift to alert, which is slow on gradual drift. Wasserstein distance is the recommended general-purpose method, with a threshold of 0.1 standard deviations for normalized data.

**PSI** is the legacy standard from financial services credit risk. Its formula:

```
PSI = Σ (% production in bin − % reference in bin) × ln(% production / % reference)
```

Industry thresholds: PSI < 0.1 (no change), 0.1–0.25 (moderate change, investigate), ≥ 0.25 (significant change, retraining likely needed).

```python
import numpy as np


def compute_psi(
    reference: np.ndarray,
    production: np.ndarray,
    bins: int | None = None,
) -> float:
    """
    Compute Population Stability Index between reference and production distributions.

    PSI < 0.1: no significant shift
    PSI 0.1-0.25: moderate shift — investigate data pipeline first
    PSI >= 0.25: significant shift — consider retraining

    Uses Doane's formula for adaptive binning when bins=None.
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

## Reference Window Architecture

All drift detection requires two windows:

**Reference window:** A fixed or periodically refreshed baseline. Use training data as reference for data drift checks. Use validation data as reference for prediction drift checks. The reference window should contain at least several thousand samples to represent the distribution reliably.

**Production (test) window:** A sliding or tumbling window over recent production data. Smaller windows detect sudden drift faster but increase false positives; larger windows reduce noise but delay detection of gradual drift.

A concrete failure mode illustrates why sliding windows matter: cumulative accuracy over a three-month deployment may remain at 93.7% while a sliding 7-day window shows 88.6% — the cumulative metric masks active decay. Always monitor sliding window metrics alongside cumulative ones (source: Made With ML, https://madewithml.com/courses/mlops/monitoring/).

Alert only on drift in features with high model importance. Monitoring all features without prioritization generates alert fatigue and desensitizes the team to genuine issues.

## Drift Detection with Evidently AI

Evidently auto-selects the statistical test per column based on type and sample size, and triggers dataset-level drift when ≥ 50% of monitored columns show individual drift.

```python
import pandas as pd
from evidently import Report
from evidently.presets import DataDriftPreset
from prometheus_client import Gauge, CollectorRegistry, push_to_gateway


DRIFT_REGISTRY = CollectorRegistry()
feature_drift_gauge = Gauge(
    "ml_feature_drift_score",
    "Statistical drift score per feature",
    labelnames=["feature", "model_name"],
    registry=DRIFT_REGISTRY,
)
dataset_drift_gauge = Gauge(
    "ml_dataset_drift_detected",
    "1 if dataset-level drift detected (>= 50% of features drifted), else 0",
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
    Compute data drift report using Evidently and push per-feature scores to Prometheus.

    Dataset-level drift triggers when >= 50% of columns show drift (configurable).
    Per-feature drift scores are pushed to Prometheus Pushgateway for Grafana alerting.
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


# Scheduled usage — called by Airflow, cron, or SageMaker Pipelines daily
if __name__ == "__main__":
    ref_df = pd.read_parquet("s3://ml-data/reference/churn_train_2024_q4.parquet")
    prod_df = pd.read_parquet("s3://ml-data/production/churn_logs_2025_04_14.parquet")

    result = run_drift_check(ref_df, prod_df, model_name="churn-predictor-v3")
    if result["dataset_drifted"]:
        drifted = [f for f, v in result["features"].items() if v["drifted"]]
        print(f"Dataset drift detected. Drifted features: {drifted}")
        # Next: verify data pipeline integrity before triggering retraining
```

## Label-Free Performance Estimation

Ground truth labels often arrive hours or days after predictions — a purchase event after a recommendation, a claim outcome after a risk score. NannyML's Confidence-Based Performance Estimation (CBPE) estimates model performance without labels by leveraging calibrated prediction probabilities.

The mechanism: calibrate prediction probabilities on the reference dataset using isotonic regression so that a score of 0.9 truly means 90% of those predictions are correct. For each production prediction, treat the calibrated probability as the probability of being correct. Estimated accuracy is the mean of these per-sample values.

CBPE is described in arXiv:2401.08348 ("We Don't Need No Labels: Estimating Post-Deployment Performance," v5, October 2025), which evaluates CBPE and its successor PAPE (Probabilistic Adaptive Performance Estimation) across 900+ dataset-model combinations.

```python
import nannyml as nml
import pandas as pd


def setup_performance_estimator(reference_df: pd.DataFrame) -> nml.CBPE:
    """
    Fit a Confidence-Based Performance Estimator on reference data.

    reference_df must contain:
      - y_pred_proba: float, model's predicted probability
      - y_pred: int (0 or 1), threshold-applied prediction
      - y_true: int (0 or 1), ground truth label
      - plus any feature columns
    """
    estimator = nml.CBPE(
        problem_type="classification_binary",
        y_pred_proba="y_pred_proba",
        y_pred="y_pred",
        y_true="y_true",
        metrics=["roc_auc", "f1", "average_precision"],
        chunk_size=5_000,   # evaluate in 5K-row windows; adjust to daily volume
    )
    estimator.fit(reference_df)
    return estimator


def estimate_production_performance(
    estimator: nml.CBPE,
    production_df: pd.DataFrame,
    alert_threshold_roc_auc: float = 0.85,
) -> None:
    """
    Estimate model performance on production data where y_true may not exist yet.

    production_df requires y_pred_proba and y_pred; y_true can be NaN.
    Alerts when estimated ROC-AUC drops below alert_threshold_roc_auc.
    """
    results = estimator.estimate(production_df)
    results_df = results.to_df()

    for _, row in results_df.iterrows():
        estimated_auc = row[("roc_auc", "value")]
        lower_bound = row[("roc_auc", "lower_threshold")]
        chunk_key = row[("chunk", "key")]

        print(
            f"Chunk {chunk_key}: estimated ROC-AUC = {estimated_auc:.4f} "
            f"(threshold = {alert_threshold_roc_auc:.4f})"
        )

        if estimated_auc < alert_threshold_roc_auc:
            print(f"  WARNING: Performance below threshold — check data pipeline.")
        if estimated_auc < lower_bound:
            print(f"  ALERT: Below confidence interval — immediate investigation needed.")
```

## Retraining Trigger Strategies

**Fixed schedule:** Daily for high-frequency domains (real-time bidding, fraud). Weekly for most production systems. Monthly for slow-changing domains. Simple to operate; may retrain unnecessarily when no drift is present.

**Drift-triggered:** Retraining initiates when drift metrics exceed thresholds for N consecutive evaluation windows. Avoids unnecessary retraining but requires a validated pipeline that can trigger, train, and validate a new model automatically.

**Two-tier alerting** is recommended regardless of trigger strategy:

- **Warning level** (PSI 0.1–0.25, Wasserstein 0.05–0.1): investigate data pipeline integrity first. Do not trigger retraining until the data source is confirmed clean.
- **Critical level** (PSI ≥ 0.25, Wasserstein > 0.1): trigger retraining pipeline if data pipeline is confirmed healthy.

AWS SageMaker Model Monitor runs on a configurable schedule and emits metrics to CloudWatch. An EventBridge rule fires a SageMaker Pipelines retraining job when a CloudWatch alarm breaches (https://aws.amazon.com/blogs/machine-learning/automate-model-retraining-with-amazon-sagemaker-pipelines-when-drift-is-detected/).

## Common Mistakes

**Treating every drift alert as a retraining trigger.** Approximately 80% of production drift alerts trace to data pipeline bugs — a null-producing upstream change, a schema migration, a feature engineering error — rather than genuine world-change (source: Chip Huyen, https://huyenchip.com/2022/02/07/data-distribution-shifts-and-monitoring.html). The workflow MUST be: detect drift → verify data pipeline → confirm clean data → evaluate retraining.

**Using KS test on large datasets.** KS flags shifts of under 1% as statistically significant at N > 100K. This generates continuous false alarms. For N > 50K, use Wasserstein or Jensen-Shannon with magnitude thresholds rather than p-value thresholds.

**Using cumulative metrics as the primary signal.** Cumulative metrics over a long deployment window mask active decay. A model that performed at 93% for the first three months will show 93% cumulative accuracy even if it has dropped to 85% this week. Sliding window metrics MUST be the primary performance signal.

**Monitoring all features equally.** Monitoring 200 features with the same threshold generates 200 alert channels. Monitor features proportional to their importance to the model: top 10 features by SHAP value, plus any feature with known data quality risk.

**Missing the reference window expiry problem.** A reference window computed at training time becomes outdated as gradual drift accumulates over months. Refresh the reference window periodically — quarterly is a common default — even if no retraining has occurred.

## Related BEEs

- [BEE-30009 LLM Observability and Monitoring](511) — LLM-specific observability: token counts, latency, output quality
- [BEE-30034 AI Experimentation and Model A/B Testing](536) — statistical experiment design for ML
- [BEE-30081 AI Feature Stores for ML Inference](583) — feature infrastructure; feature drift often originates here
- [BEE-30082 Shadow Mode and Canary Deployment for ML Models](584) — deployment gates that precede ongoing monitoring
- [BEE-14001 The Three Pillars: Logs, Metrics, Traces](320) — observability foundations

## References

- Chip Huyen, "Data Distribution Shifts and Monitoring," 2022. https://huyenchip.com/2022/02/07/data-distribution-shifts-and-monitoring.html
- Evidently AI, "Which test is the best? We compared 5 methods for large datasets." https://www.evidentlyai.com/blog/data-drift-detection-large-datasets
- Evidently AI, "What is data drift in ML, and how to detect and handle it." https://www.evidentlyai.com/ml-in-production/data-drift
- Evidently AI, DataDriftPreset documentation. https://docs.evidentlyai.com/metrics/preset_data_drift
- Evidently AI GitHub. https://github.com/evidentlyai/evidently
- NannyML, "Population Stability Index." https://www.nannyml.com/blog/population-stability-index-psi
- NannyML, CBPE documentation. https://nannyml.readthedocs.io/en/v0.4.1/how_it_works/performance_estimation.html
- arXiv:2401.08348, "We Don't Need No Labels: Estimating Post-Deployment Performance." https://arxiv.org/abs/2401.08348
- Fiddler AI, "Measuring Data Drift with PSI." https://www.fiddler.ai/blog/measuring-data-drift-population-stability-index
- Made With ML, "Monitoring." https://madewithml.com/courses/mlops/monitoring/
- AWS, "Automate model retraining with Amazon SageMaker Pipelines when drift is detected." https://aws.amazon.com/blogs/machine-learning/automate-model-retraining-with-amazon-sagemaker-pipelines-when-drift-is-detected/
- arXiv:2208.06868, Frouros: A Python library for drift detection. https://arxiv.org/abs/2208.06868
