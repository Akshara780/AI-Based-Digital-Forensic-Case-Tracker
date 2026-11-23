import json
from pathlib import Path

import joblib
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    precision_recall_fscore_support,
    precision_score,
    recall_score,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


RANDOM_STATE = 42
LABEL_ORDER = ["High", "Medium", "Low"]
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATASET_PATH = PROJECT_ROOT / "ml-service" / "data" / "evidence_dataset.csv"
MODELS_DIR = PROJECT_ROOT / "ml-service" / "models"
METRICS_PATH = MODELS_DIR / "metrics.json"
MODEL_PATH = MODELS_DIR / "relevance_model.joblib"


def make_preprocessor():
    """Build preprocessing separately for categorical, text, numeric, and pass-through columns."""
    categorical_columns = ["evidence_type", "case_type", "source"]
    numeric_columns = [
        "hour_of_day",
        "hours_from_incident",
        "shared_ip_count",
        "shared_device_count",
        "tag_count",
    ]
    passthrough_columns = ["ip_is_suspicious", "has_file_attachment"]

    return ColumnTransformer(
        transformers=[
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore"),
                categorical_columns,
            ),
            (
                "description_text",
                TfidfVectorizer(max_features=200),
                "description",
            ),
            (
                "tags_text",
                TfidfVectorizer(max_features=50),
                "tags",
            ),
            (
                "numeric",
                StandardScaler(),
                numeric_columns,
            ),
            (
                "passthrough",
                "passthrough",
                passthrough_columns,
            ),
        ]
    )


def build_pipelines(preprocessor):
    """Create the three complete pipelines: baseline, logistic regression, and random forest."""
    return {
        "Baseline": Pipeline(
            steps=[
                ("preprocessing", preprocessor),
                ("classifier", DummyClassifier(strategy="most_frequent")),
            ]
        ),
        "LogisticRegression": Pipeline(
            steps=[
                ("preprocessing", make_preprocessor()),
                (
                    "classifier",
                    LogisticRegression(max_iter=1000, random_state=RANDOM_STATE),
                ),
            ]
        ),
        "RandomForest": Pipeline(
            steps=[
                ("preprocessing", make_preprocessor()),
                (
                    "classifier",
                    RandomForestClassifier(
                        n_estimators=200,
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
    }


def evaluate_on_test_set(pipeline, x_test, y_test):
    """Predict once on the test set and calculate all required test metrics."""
    predictions = pipeline.predict(x_test)

    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test,
        predictions,
        labels=LABEL_ORDER,
        zero_division=0,
    )

    per_class = {}
    for index, label in enumerate(LABEL_ORDER):
        per_class[label] = {
            "precision": float(precision[index]),
            "recall": float(recall[index]),
            "f1": float(f1[index]),
        }

    matrix = confusion_matrix(
        y_test,
        predictions,
        labels=LABEL_ORDER,
    )

    return {
        "accuracy": float(accuracy_score(y_test, predictions)),
        "macro_precision": float(
            precision_score(
                y_test,
                predictions,
                labels=LABEL_ORDER,
                average="macro",
                zero_division=0,
            )
        ),
        "macro_recall": float(
            recall_score(
                y_test,
                predictions,
                labels=LABEL_ORDER,
                average="macro",
                zero_division=0,
            )
        ),
        "macro_f1": float(
            f1_score(
                y_test,
                predictions,
                labels=LABEL_ORDER,
                average="macro",
                zero_division=0,
            )
        ),
        "per_class": per_class,
        "confusion_matrix": matrix.tolist(),
    }


def print_matrix(title, matrix, prediction_column_labels):
    """Print a readable confusion matrix with row and column labels."""
    print(f"\n{title}")
    header = "Actual \\ Predicted".ljust(20) + "".join(
        label.rjust(12) for label in prediction_column_labels
    )
    print(header)
    for actual_label, row in zip(LABEL_ORDER, matrix):
        print(actual_label.ljust(20) + "".join(str(value).rjust(12) for value in row))


def main():
    # Load data and keep the label as the target variable.
    dataset = pd.read_csv(DATASET_PATH)
    x = dataset.drop(columns=["relevance_label"])
    y = dataset["relevance_label"]

    # Split once with stratification so every class is represented fairly.
    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.20,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    pipelines = build_pipelines(make_preprocessor())
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

    # Cross-validation uses training data only and produces no test-set results.
    cv_results = {}
    for model_name, pipeline in pipelines.items():
        scores = cross_validate(
            pipeline,
            x_train,
            y_train,
            cv=cv,
            scoring="f1_macro",
        )["test_score"]
        cv_results[model_name] = {
            "mean_macro_f1": float(scores.mean()),
            "std_macro_f1": float(scores.std()),
        }

    # Selection compares only Logistic Regression and Random Forest CV results.
    candidate_names = ["LogisticRegression", "RandomForest"]
    chosen_name = max(
        candidate_names,
        key=lambda name: cv_results[name]["mean_macro_f1"],
    )

    # Fit each pipeline on the complete training set.
    # The test set is evaluated only after model selection is finished.
    test_results = {}
    for model_name, pipeline in pipelines.items():
        pipeline.fit(x_train, y_train)
        test_results[model_name] = evaluate_on_test_set(
            pipeline,
            x_test,
            y_test,
        )

    chosen_pipeline = pipelines[chosen_name]

    # Persist both the model and every metric actually calculated in this run.
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(chosen_pipeline, MODEL_PATH)

    metrics = {
        "label_order": LABEL_ORDER,
        "dataset_size": int(len(dataset)),
        "train_size": int(len(x_train)),
        "test_size": int(len(x_test)),
        "cross_validation": cv_results,
        "test_results": test_results,
        "chosen_model": chosen_name,
        "scikit_learn_version": sklearn.__version__,
    }

    with METRICS_PATH.open("w", encoding="utf-8") as metrics_file:
        json.dump(metrics, metrics_file, indent=2)

    # Print the cross-validation comparison.
    print("Cross-validation results (training set only)")
    print(
        "Model".ljust(22)
        + "Mean macro F1".rjust(16)
        + "Std macro F1".rjust(16)
    )
    for model_name, result in cv_results.items():
        print(
            model_name.ljust(22)
            + f"{result['mean_macro_f1']:.6f}".rjust(16)
            + f"{result['std_macro_f1']:.6f}".rjust(16)
        )

    # Print test metrics in a compact comparison table.
    print("\nTest-set comparison")
    print(
        "Model".ljust(22)
        + "Accuracy".rjust(12)
        + "Macro Precision".rjust(18)
        + "Macro Recall".rjust(16)
        + "Macro F1".rjust(14)
    )
    for model_name, result in test_results.items():
        print(
            model_name.ljust(22)
            + f"{result['accuracy']:.6f}".rjust(12)
            + f"{result['macro_precision']:.6f}".rjust(18)
            + f"{result['macro_recall']:.6f}".rjust(16)
            + f"{result['macro_f1']:.6f}".rjust(14)
        )

    print(f"\nChosen model: {chosen_name}")

    # Print per-class metrics and each confusion matrix for all models.
    for model_name, result in test_results.items():
        print(f"\nPer-class metrics - {model_name}")
        print(
            "Class".ljust(12)
            + "Precision".rjust(12)
            + "Recall".rjust(12)
            + "F1".rjust(12)
        )
        for label in LABEL_ORDER:
            metrics_for_label = result["per_class"][label]
            print(
                label.ljust(12)
                + f"{metrics_for_label['precision']:.6f}".rjust(12)
                + f"{metrics_for_label['recall']:.6f}".rjust(12)
                + f"{metrics_for_label['f1']:.6f}".rjust(12)
            )
        print_matrix(
            f"Confusion matrix - {model_name}",
            result["confusion_matrix"],
            LABEL_ORDER,
        )

    print(f"\nSaved chosen model to: {MODEL_PATH}")
    print(f"Saved metrics to: {METRICS_PATH}")


if __name__ == "__main__":
    main()
