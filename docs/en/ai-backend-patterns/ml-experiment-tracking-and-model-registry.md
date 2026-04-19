---
id: 30084
title: ML Experiment Tracking and Model Registry
state: draft
slug: ml-experiment-tracking-and-model-registry
---

# [BEE-586] ML Experiment Tracking and Model Registry

:::info
Experiment tracking records the hyperparameters, metrics, code version, and artifacts of every training run in a queryable log. A model registry provides a governance layer between training and deployment — versioning trained models, managing promotion through environments, and allowing serving code to reference models by stable alias rather than by specific version. Without these systems, reproducing a prior result or coordinating a model handoff from training to serving requires manual bookkeeping that breaks at team scale.
:::

## Context

Before dedicated experiment tracking, ML teams tracked results in spreadsheets, ad-hoc text logs, or nothing at all. The cost was high: teams regularly spent time reproducing results from weeks earlier because no one had recorded which hyperparameter combination produced a given model checkpoint, on which dataset version, with which code commit.

Matei Zaharia and the Databricks team announced MLflow on June 5, 2018 (https://www.databricks.com/blog/2018/06/05/introducing-mlflow-an-open-source-machine-learning-platform.html) as an open-source platform designed to address four pain points: tracking experiments, packaging models, deploying models, and managing the lifecycle. MLflow became the most widely adopted experiment tracking library and is now in its 3.x release.

Weights & Biases (W&B), founded in 2017 by Lukas Biewald, Chris Van Pelt, and Shawn Lewis — originally to help train models at OpenAI — grew into a commercial experiment tracking and collaboration platform. CoreWeave acquired W&B for approximately $1.7 billion in March 2025 (https://www.coreweave.com/blog/coreweave-completes-acquisition-of-weights-biases). Neptune.ai, purpose-built for foundation model training at scale with per-layer metric monitoring, was acquired by OpenAI in December 2025 (https://www.cnbc.com/2025/12/03/openai-to-acquire-neptune-an-ai-model-training-assistance-startup.html) and shut down as a standalone service in March 2026.

For hyperparameter search, Optuna (Akiba et al., KDD 2019, arXiv:1907.10902, https://dl.acm.org/doi/10.1145/3292500.3330701) introduced a define-by-run API — constructing the search space dynamically at runtime rather than declaring it up front — paired with Tree-structured Parzen Estimator (TPE) sampling and Hyperband pruning for early stopping of unpromising trials.

## The Experiment Data Model

An MLflow **Experiment** is a named collection of **Runs**. Each run captures:

| Component | Content |
|---|---|
| `params` | Hyperparameters (key → string value, logged once) |
| `metrics` | Time-series values (key → float, step-indexed) |
| `tags` | Mutable metadata (git commit SHA, framework version, user notes) |
| `artifacts` | Files: model weights, confusion matrices, feature importance plots |
| `dataset` | Input data reference with content hash and source URI |

A run has status (`RUNNING`, `FINISHED`, `FAILED`, `KILLED`) and timestamps. The artifact URI points to a storage backend (S3, GCS, or Azure Blob in production — not local disk, which breaks under concurrent writes and doesn't support cross-host access).

## Tracking Experiments with MLflow

The `mlflow.start_run()` context manager creates a run, logs everything within the block, and marks it finished on exit. `autolog()` instruments supported frameworks (PyTorch, scikit-learn, XGBoost, TensorFlow, LightGBM) to log params, metrics, and model artifacts automatically with no additional calls.

```python
import mlflow
import mlflow.sklearn
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split

mlflow.set_tracking_uri("http://mlflow-server:5000")
mlflow.set_experiment("churn-prediction")

# Enable auto-instrumentation — captures all sklearn params + metrics + model
mlflow.sklearn.autolog(log_datasets=True)

with mlflow.start_run(run_name="gbm-v3-lr0.05") as run:
    # Log additional params not captured by autolog
    mlflow.set_tag("team", "growth-ml")
    mlflow.set_tag("data_version", "2025-q1")

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2)
    model = GradientBoostingClassifier(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=4,
    )
    model.fit(X_train, y_train)

    # Autolog records val_accuracy, val_f1, confusion matrix, model artifact
    # run.info.run_id is the stable identifier for this training run
    print(f"Run ID: {run.info.run_id}")
```

**Dataset lineage** links a training run to its input data via a content hash:

```python
import mlflow
import pandas as pd

raw = pd.read_parquet("s3://ml-data/churn/train_2025_q1.parquet")

# Content hash computed automatically — ties the run to this exact data snapshot
dataset = mlflow.data.from_pandas(
    raw,
    source="s3://ml-data/churn/train_2025_q1.parquet",
    name="churn-training-2025-q1",
    targets="churned",
)

with mlflow.start_run():
    mlflow.log_input(dataset, context="training")
    # downstream: if data.digest changes, a new run on the "same" code is distinguishable
```

**Manual metric logging** is appropriate for custom training loops:

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
        registered_model_name="churn-classifier",  # auto-registers on log
    )
```

## Hyperparameter Search with Optuna

Optuna's define-by-run API constructs the search space dynamically inside the objective function, allowing conditional hyperparameters (e.g., dropout only if the model has a specific architecture). TPE with `multivariate=True` captures correlations between hyperparameters. `HyperbandPruner` stops unpromising trials early based on intermediate metric reports.

```python
import optuna
from optuna.samplers import TPESampler
from optuna.pruners import HyperbandPruner
import mlflow


def objective(trial: optuna.Trial) -> float:
    # Define-by-run: search space constructed at runtime
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

            # Report to pruner — allows early stopping of bad trials
            trial.report(val_loss, epoch)
            if trial.should_prune():
                raise optuna.exceptions.TrialPruned()

        return val_loss


mlflow.set_experiment("churn-hparam-search")

with mlflow.start_run(run_name="optuna-sweep"):
    study = optuna.create_study(
        study_name="churn-hparam-search",
        direction="minimize",
        sampler=TPESampler(multivariate=True),  # captures param correlations
        pruner=HyperbandPruner(),
        storage="postgresql://mlflow:password@db:5432/optuna",  # persistent
    )
    study.optimize(objective, n_trials=100, n_jobs=4)

    mlflow.log_params(study.best_params)
    mlflow.log_metric("best_val_loss", study.best_value)
```

W&B Sweeps implements Bayesian hyperparameter search as a coordinated multi-agent system. A sweep controller process manages a queue of configurations; agent processes consume configurations and report metrics. The `early_terminate` block implements Hyperband for pruning:

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
wandb sweep sweep.yaml           # Returns SWEEP_ID
wandb agent team/project/$SWEEP_ID  # Launch agent(s); multiple agents parallelize
```

## Model Registry and Alias-Based Promotion

MLflow 2.9 deprecated lifecycle Stages (Staging → Production) because they allowed only one version per stage and could not represent multi-environment workflows or champion/challenger patterns. The replacement is **mutable aliases**: arbitrary named pointers to specific versions.

```python
from mlflow.tracking import MlflowClient
import mlflow

MODEL_NAME = "churn-classifier"
client = MlflowClient()


def register_and_validate(run_id: str, val_auc: float) -> int:
    """Register a trained run as a model version and validate it."""
    mv = mlflow.register_model(
        f"runs:/{run_id}/model",
        MODEL_NAME,
    )
    version = int(mv.version)

    # Tag with evaluation results for audit trail
    client.set_model_version_tag(MODEL_NAME, str(version), "val_auc", f"{val_auc:.4f}")
    client.set_model_version_tag(MODEL_NAME, str(version), "validated_by", "ci-pipeline")

    if val_auc > 0.92:
        # Promote to challenger — serving code does not change
        client.set_registered_model_alias(MODEL_NAME, "challenger", version)
        print(f"Version {version} (AUC={val_auc:.4f}) promoted to challenger")
    else:
        print(f"Version {version} (AUC={val_auc:.4f}) below threshold, not promoted")

    return version


def promote_challenger_to_champion() -> None:
    """Swap challenger → champion atomically. Old champion becomes rollback."""
    challenger = client.get_model_version_by_alias(MODEL_NAME, "challenger")
    try:
        champion = client.get_model_version_by_alias(MODEL_NAME, "champion")
        # Retain previous champion for fast rollback
        client.set_registered_model_alias(MODEL_NAME, "rollback", int(champion.version))
    except Exception:
        pass  # No champion yet — first promotion

    client.set_registered_model_alias(MODEL_NAME, "champion", int(challenger.version))
    client.delete_registered_model_alias(MODEL_NAME, "challenger")
    print(f"Promoted version {challenger.version} to champion")


# Serving code never changes — it always loads the @champion alias
model = mlflow.pyfunc.load_model(f"models:/{MODEL_NAME}@champion")
```

```mermaid
stateDiagram-v2
    [*] --> Registered: mlflow.register_model()
    Registered --> Candidate: set_alias("candidate")
    Candidate --> Challenger: CI validates AUC > threshold
    Challenger --> Champion: Manual or automated approval
    Champion --> Rollback: when next champion is set
    Rollback --> Champion: set_alias("champion", rollback_version)

    style Candidate fill:#2563eb,color:#fff
    style Challenger fill:#d97706,color:#fff
    style Champion fill:#16a34a,color:#fff
    style Rollback fill:#7c3aed,color:#fff
```

## CI/CD Integration

A model promotion pipeline runs on every merged data or code change: pull the versioned data with DVC, train and log to MLflow, evaluate on the holdout set, and conditionally promote.

```yaml
# .github/workflows/train.yml
name: Train and promote
on:
  push:
    paths: ["data.dvc", "src/**", "params.yaml"]

jobs:
  train:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install mlflow dvc scikit-learn optuna
      - run: dvc pull                    # fetch versioned training data
      - name: Train
        env:
          MLFLOW_TRACKING_URI: ${{ secrets.MLFLOW_TRACKING_URI }}
        run: python src/train.py         # logs run, registers model version

  promote:
    needs: train
    runs-on: ubuntu-latest
    environment: staging                  # GitHub environment with approval gate
    steps:
      - name: Evaluate and promote
        env:
          MLFLOW_TRACKING_URI: ${{ secrets.MLFLOW_TRACKING_URI }}
        run: python src/promote.py        # evaluates latest version, sets aliases
```

## Infrastructure

**MLflow server** requires two backends:

- **Backend store** (run metadata, params, metrics): Use PostgreSQL in production — SQLite corrupts under concurrent writes. Connection string: `postgresql://user:pass@host:5432/mlflow`.
- **Artifact store** (model weights, plots, large files): Use S3, GCS, or Azure Blob. Local disk is unsuitable for multi-node training or cross-team access.

```bash
# Start MLflow server with PostgreSQL backend and S3 artifacts
mlflow server \
  --backend-store-uri postgresql://mlflow:password@db:5432/mlflow \
  --default-artifact-root s3://ml-artifacts/mlflow/ \
  --host 0.0.0.0 \
  --port 5000
```

For W&B, all data is stored in W&B's cloud (or self-hosted with W&B Server). For Optuna's distributed search, the `storage` parameter accepts a PostgreSQL or MySQL URL; parallel agents connect to the same study and coordinate via the database.

## Common Mistakes

**Not logging the data version.** A run logged without a reference to the exact dataset used is not reproducible. Always log either the dataset content hash (via `mlflow.log_input`) or a DVC data commit SHA as a tag.

**Using SQLite as the MLflow backend store in multi-user or multi-process environments.** SQLite is file-based and does not support concurrent writes. Under parallel training runs, it corrupts the metadata database. Use PostgreSQL.

**Using Stages instead of Aliases in MLflow 2.9+.** The Stage API still works but allows only one version per stage and is deprecated. Aliases are flexible — you can have `champion`, `challenger`, `canary`, and `shadow` pointing to different versions simultaneously.

**Treating the hyperparameter search as disposable.** When using Optuna with a persistent storage backend (`storage="postgresql://..."`), completed trials are reusable — if a run crashes mid-sweep, the study resumes from the last completed trial. Using in-memory storage (default) loses all trial history on crash.

**Autolog catching too much.** `mlflow.autolog()` may log intermediate model checkpoints, intermediate metrics at high frequency, and framework-internal parameters that are not meaningful hyperparameters. Configure selectively with `mlflow.sklearn.autolog(log_models=False)` if artifact storage costs are a concern or if too many logged files slow down the UI.

## Related BEEs

- [BEE-536 AI Experimentation and Model A/B Testing](536) — online A/B testing for live model versions in production
- [BEE-583 AI Feature Stores for ML Inference](583) — feature infrastructure consumed by training pipelines
- [BEE-584 Shadow Mode and Canary Deployment for ML Models](584) — deployment patterns that consume model registry versions
- [BEE-585 ML Monitoring and Drift Detection](585) — production monitoring after a model is promoted
- [BEE-126 Database Migrations](126) — PostgreSQL MLflow backend schema management

## References

- Databricks, "Introducing MLflow: An Open Source Machine Learning Platform," June 5, 2018. https://www.databricks.com/blog/2018/06/05/introducing-mlflow-an-open-source-machine-learning-platform.html
- MLflow, Model Registry documentation. https://mlflow.org/docs/latest/ml/model-registry/
- MLflow, Tracking API documentation. https://mlflow.org/docs/latest/ml/tracking/
- MLflow 3.0 launch announcement. https://mlflow.org/blog/mlflow-3-0-launch
- Akiba, T. et al. "Optuna: A Next-generation Hyperparameter Optimization Framework." KDD 2019. https://arxiv.org/abs/1907.10902
- CoreWeave, "CoreWeave Completes Acquisition of Weights & Biases," 2025. https://www.coreweave.com/blog/coreweave-completes-acquisition-of-weights-biases
- CNBC, "OpenAI to acquire Neptune," December 3, 2025. https://www.cnbc.com/2025/12/03/openai-to-acquire-neptune-an-ai-model-training-assistance-startup.html
- Weights & Biases, Experiment Tracking documentation. https://docs.wandb.ai/models/track
- Weights & Biases, Sweeps configuration reference. https://docs.wandb.ai/models/sweeps/sweep-config-keys
- Optuna documentation. https://optuna.readthedocs.io/en/stable/
- CML (Continuous Machine Learning) documentation. https://cml.dev/
