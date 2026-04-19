---
id: 30089
title: Testing Machine Learning Pipelines
state: draft
slug: testing-machine-learning-pipelines
---

# [BEE-30089] Testing Machine Learning Pipelines

:::info
ML pipeline testing applies software engineering test discipline to the unique failure modes of data-dependent, probabilistic systems. Unlike conventional software, ML code can silently produce wrong outputs without raising exceptions — a feature transformer that clips values at the wrong percentile, a training loop with a detached tensor, or a serving function that applies feature scaling in a different order than training. Tests catch these failures at development time instead of in production predictions.
:::

## Context

Breck et al.'s "The ML Test Score: A Rubric for ML Production Readiness and Technical Debt Reduction" (Google, IEEE Big Data 2017) surveyed real production ML systems and found that most teams tested only a fraction of the failure modes they faced. The rubric organizes ML tests into four categories: data tests, model tests, ML infrastructure tests, and monitoring tests — assigning one point per passing test type, targeting a score of 5+ for a production-ready system. Systems scoring below 2 were considered high-risk to deploy.

The core difficulty is that ML code has three properties that make testing hard: **non-determinism** (random initialization, shuffled batches, GPU floating-point variance), **data dependency** (bugs are data-conditional — the same code that passes unit tests fails on a specific data distribution), and **silent failure** (training completes without exceptions even when model quality is zero). Conventional test discipline solves for 0% of these; ML-specific practices solve for all three.

## Hermetic Test Setup

A hermetic test is isolated, reproducible, and deterministic. In ML, this requires explicit seed control across all random sources:

```python
import random
import numpy as np
import torch
import os

SEED = 42

def make_hermetic() -> None:
    """Call at the top of any test that involves randomness."""
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    torch.cuda.manual_seed_all(SEED)
    # Force deterministic CUDA ops — slower but reproducible
    os.environ["CUBLAS_WORKSPACE_CONFIG"] = ":16:8"
    torch.use_deterministic_algorithms(True)
```

Use as a pytest fixture to apply automatically:

```python
import pytest

@pytest.fixture(autouse=True)
def hermetic_seed():
    make_hermetic()
    yield
    # No teardown needed — seeds are per-process state
```

`torch.use_deterministic_algorithms(True)` forces deterministic CUDA kernels at a performance cost. Use it in test environments; disable in production. Note: even with identical seeds, results differ between CPU and GPU execution — always run comparison tests on the same device.

## Feature Transformation Tests

Feature engineering code MUST be tested with property-based tests, not just example-based tests. Property-based testing (Hypothesis library) generates hundreds of random inputs and finds the edge case that breaks an invariant — often an out-of-range value, empty input, or NaN that example-based tests miss.

```python
import pytest
import numpy as np
import pandas as pd
from hypothesis import given, settings, HealthCheck
from hypothesis import strategies as st
from hypothesis.extra.pandas import column, data_frames

from mypackage.features import log_transform, clip_outliers

# Example-based: verify known behavior
def test_log_transform_known_input():
    result = log_transform(pd.Series([1.0, np.e, np.e**2]))
    expected = pd.Series([0.0, 1.0, 2.0])
    pd.testing.assert_series_equal(result, expected, atol=1e-9)

# Property-based: verify invariants hold for any valid input
@given(
    st.lists(
        st.floats(min_value=0.01, max_value=1e9, allow_nan=False, allow_infinity=False),
        min_size=1,
        max_size=1000,
    )
)
@settings(suppress_health_check=[HealthCheck.too_slow])
def test_log_transform_invariants(values):
    series = pd.Series(values, dtype=float)
    result = log_transform(series)

    # Invariant: output has same length as input
    assert len(result) == len(series)
    # Invariant: log of positive inputs is finite
    assert result.notna().all()
    # Invariant: monotonicity — larger input → larger output
    if len(series) >= 2:
        paired = pd.DataFrame({"x": series, "y": result}).sort_values("x")
        assert (paired["y"].diff().dropna() >= 0).all()

# sklearn transformer contract compliance
from sklearn.utils.estimator_checks import check_estimator
from mypackage.features import ClipOutliersTransformer

def test_clip_outliers_transformer_sklearn_contract():
    """Verify the custom transformer satisfies the full sklearn estimator API."""
    check_estimator(ClipOutliersTransformer())
```

`check_estimator` runs sklearn's internal test suite — ~100 checks covering fit/transform contract, clone behavior, serialization, and edge cases. Any custom sklearn transformer MUST pass this before being deployed in a Pipeline.

## Training Pipeline Smoke Tests

A smoke test runs the full training pipeline on a minimal dataset (1 000 rows, 1 epoch) to verify the code path completes without error. It catches: data loading bugs, incompatible tensor shapes, missing features, incorrect loss function setup.

```python
import torch
import torch.nn as nn
from mypackage.train import build_model, build_dataloader, train_one_epoch

def test_training_pipeline_smoke(tmp_path):
    """Full training pipeline completes on 1000 rows, 1 epoch."""
    make_hermetic()

    # Use CPU for CI — GPU tests reserved for integration stage
    device = torch.device("cpu")
    dataloader = build_dataloader(
        data_path="tests/fixtures/sample_1000.parquet",
        batch_size=32,
        device=device,
    )
    model = build_model(input_dim=30, hidden_dim=64, output_dim=1).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.BCEWithLogitsLoss()

    loss = train_one_epoch(model, dataloader, optimizer, criterion, device)

    # Loss must be finite and positive
    assert torch.isfinite(torch.tensor(loss)), f"Loss is not finite: {loss}"
    assert loss > 0, f"Loss is non-positive: {loss}"

def test_initial_loss_sanity():
    """For N-class cross-entropy with random init, loss ≈ ln(N)."""
    make_hermetic()
    N_CLASSES = 10
    model = build_classifier(input_dim=30, n_classes=N_CLASSES)
    X = torch.randn(256, 30)
    y = torch.randint(0, N_CLASSES, (256,))

    logits = model(X)
    loss = nn.CrossEntropyLoss()(logits, y).item()

    expected = np.log(N_CLASSES)  # ≈ 2.303
    assert abs(loss - expected) < 0.5, (
        f"Initial loss {loss:.3f} deviates too far from ln({N_CLASSES})={expected:.3f}. "
        f"Check label encoding or loss function setup."
    )

def test_gradients_flow_to_all_parameters():
    """Every trainable parameter receives a gradient after one backward pass."""
    make_hermetic()
    model = build_model(input_dim=30, hidden_dim=64, output_dim=1)
    X = torch.randn(32, 30)
    y = torch.randn(32, 1)

    output = model(X)
    loss = nn.MSELoss()(output, y)
    loss.backward()

    for name, param in model.named_parameters():
        if param.requires_grad:
            assert param.grad is not None, f"No gradient for parameter: {name}"
            assert not torch.all(param.grad == 0), f"Zero gradient for parameter: {name}"
```

The initial loss sanity check is particularly high-leverage: a model with a one-hot encoding bug or wrong loss function will produce an initial loss far from ln(N), failing the test immediately before any training happens.

## Behavioral Tests

Behavioral testing (Ribeiro et al., "Beyond Accuracy: Behavioral Testing of NLP Models with CheckList," ACL 2020 Best Paper) organizes tests by the type of invariant they verify, not by code unit:

```python
# MFT (Minimum Functionality Test): model handles canonical inputs correctly
def test_mft_high_risk_user_predicted_positive():
    """A user with all high-risk features MUST receive a positive fraud prediction."""
    high_risk_features = {
        "transaction_amount": 9999.0,
        "is_new_card": 1,
        "country_mismatch": 1,
        "time_since_last_txn_minutes": 2,
        # ... all features set to high-risk values
    }
    prediction = model.predict_proba([high_risk_features])[0, 1]
    assert prediction > 0.8, f"High-risk user should score >0.8, got {prediction:.3f}"

# INV (Invariance Test): prediction should NOT change when irrelevant features change
def test_inv_user_name_does_not_affect_prediction():
    """Changing user name should not change fraud prediction (name is not a feature)."""
    base = {"transaction_amount": 500.0, "is_new_card": 0, ...}
    perturbed = {**base, "user_name": "different_name"}  # not a model feature
    assert model.predict_proba([base])[0, 1] == model.predict_proba([perturbed])[0, 1]

# DIR (Directional Expectation Test): prediction changes in the expected direction
def test_dir_higher_amount_increases_fraud_score():
    """Doubling transaction amount SHOULD increase fraud probability."""
    base = {"transaction_amount": 200.0, "is_new_card": 0, "country_mismatch": 0, ...}
    high_amount = {**base, "transaction_amount": 400.0}

    score_base = model.predict_proba([base])[0, 1]
    score_high = model.predict_proba([high_amount])[0, 1]
    assert score_high > score_base, (
        f"Higher amount should increase fraud score: "
        f"base={score_base:.3f}, doubled={score_high:.3f}"
    )
```

## Model Regression Tests

Regression tests verify that a newly trained model does not silently degrade from a known baseline. Store baseline predictions as a fixture and compare with tolerance:

```python
import pytest
import numpy as np

BASELINE_PREDICTIONS_PATH = "tests/fixtures/baseline_predictions.npy"

def test_model_predictions_match_baseline():
    """Model output must match baseline within 1% relative tolerance."""
    X_test = np.load("tests/fixtures/X_test_100.npy")
    baseline = np.load(BASELINE_PREDICTIONS_PATH)

    predictions = model.predict_proba(X_test)[:, 1]

    # pytest.approx supports array comparison with tolerances
    assert predictions == pytest.approx(baseline, rel=0.01), (
        "Model predictions deviate >1% from baseline. "
        "Retrain baseline or investigate model change."
    )

def test_model_calibration_within_tolerance():
    """Predicted probabilities should be calibrated: mean(pred) ≈ mean(actual)."""
    X_test = np.load("tests/fixtures/X_test_10k.npy")
    y_test = np.load("tests/fixtures/y_test_10k.npy")

    proba = model.predict_proba(X_test)[:, 1]
    predicted_rate = proba.mean()
    actual_rate = y_test.mean()

    assert abs(predicted_rate - actual_rate) < 0.05, (
        f"Model is miscalibrated: predicted={predicted_rate:.3f}, actual={actual_rate:.3f}"
    )
```

## CI Integration

ML pipeline tests MUST run on every pull request targeting main. Use DVC to cache expensive data artifacts and run only affected pipeline steps:

```yaml
# .github/workflows/ml-tests.yml
name: ML Pipeline Tests

on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install -e ".[test]"

      - name: Cache DVC artifacts
        uses: actions/cache@v4
        with:
          path: .dvc/cache
          key: dvc-${{ hashFiles('dvc.lock') }}

      - name: Pull test fixtures
        run: dvc pull tests/fixtures

      - name: Run unit tests (fast, CPU-only)
        run: pytest tests/unit -v --timeout=120

      - name: Run pipeline smoke test (1k rows, 1 epoch)
        run: pytest tests/integration/test_training_smoke.py -v --timeout=300
        env:
          CUBLAS_WORKSPACE_CONFIG: ":16:8"
```

Gate the pipeline: unit tests MUST pass in < 2 minutes. The smoke test MUST complete in < 5 minutes on a 2-core runner. GPU integration tests MAY run only on merge to main, not on every PR.

## Common Mistakes

**Testing only the happy path.** Feature transformers break on NaN values, empty DataFrames, single-element Series, and out-of-range inputs. Property-based tests with Hypothesis surface these inputs automatically. Writing only example-based tests with clean data misses the bugs that appear on production data.

**Not seeding all random sources.** Seeding only `numpy.random.seed` while forgetting `torch.manual_seed` or `random.seed` leaves randomness in the test. The symptom is flaky tests that pass 90% of the time — expensive to diagnose. Use the `make_hermetic()` pattern as an `autouse` fixture.

**Running behavioral tests against a stale baseline model.** Behavioral tests (`test_dir_*`, `test_inv_*`) verify properties of the current model artifact. If the model is retrained, the baseline predictions change. Pin the model artifact version in the test fixture and update it intentionally with each retrain.

**Treating test timeout failures as infrastructure problems.** A smoke test that takes 20 minutes doesn't need a faster CI runner — it needs a smaller test dataset. The test data fixture MUST be small enough to run in < 5 minutes on commodity hardware. This forces fast feedback and prevents CI from becoming a bottleneck.

**Skipping the initial loss sanity check.** The ln(N) test catches label encoding bugs, wrong loss function arguments, and architecture bugs before a single gradient step. Skipping it means these bugs are discovered after hours of GPU training, not seconds.

## Related BEEs

- [BEE-30085 ML Data Validation and Pipeline Quality Gates](587) — validates data schema and statistical properties (complementary: data in, code here)
- [BEE-15001 The Testing Pyramid](340) — general testing pyramid principles that apply to the unit/integration/smoke test structure
- [BEE-30084 ML Experiment Tracking and Model Registry](586) — baseline model artifacts referenced in regression tests live in MLflow
- [BEE-30087 Online Learning and Continual Model Updates](589) — prequential evaluation shares the test-then-train discipline

## References

- Breck, E., Cai, S., Nielsen, E., Salib, M., & Sculley, D. (2017). The ML test score: A rubric for ML production readiness and technical debt reduction. IEEE Big Data 2017. https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/
- Ribeiro, M. T., Wu, T., Guestrin, C., & Singh, S. (2020). Beyond accuracy: Behavioral testing of NLP models with CheckList. ACL 2020 Best Paper. arXiv:2005.04118. https://aclanthology.org/2020.acl-main.442/
- Hypothesis documentation. https://hypothesis.readthedocs.io/
- PyTorch, Reproducibility. https://docs.pytorch.org/docs/stable/notes/randomness.html
- PyTorch, `torch.use_deterministic_algorithms`. https://docs.pytorch.org/docs/stable/generated/torch.use_deterministic_algorithms.html
- scikit-learn, `check_estimator`. https://scikit-learn.org/stable/modules/generated/sklearn.utils.estimator_checks.check_estimator.html
- DVC, Data Pipelines Guide. https://doc.dvc.org/start/data-pipelines/data-pipelines
- pytest documentation, `pytest.approx`. https://docs.pytest.org/en/stable/reference/reference.html
