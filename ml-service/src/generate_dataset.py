import numpy as np
import pandas as pd


RANDOM_SEED = 42
N_ROWS = 3000


evidence_types = [
    "Screenshot",
    "Email",
    "Log File",
    "IP Address",
    "Device Information",
    "File",
    "URL",
    "Message",
    "Timestamp/Event",
    "Other",
]

case_types = [
    "Unauthorized Account Access",
    "Phishing",
    "Cyberbullying",
    "Data Theft",
    "Suspicious Activity",
    "Device Misuse",
    "Online Fraud",
    "Other",
]

sources = [
    "Auth Server",
    "Email Gateway",
    "Endpoint",
    "Network Sensor",
    "Cloud Storage",
    "Threat Intelligence",
    "User Report",
    "System Scheduler",
]

tag_options = [
    "login",
    "auth-failure",
    "external-ip",
    "phishing",
    "malware",
    "deleted-files",
    "data-transfer",
    "device",
    "timestamp",
    "scheduled-backup",
    "system-update",
    "routine",
]

relevant_description_templates = [
    "Unusual login attempt followed by suspicious access",
    "Evidence of a possible data transfer outside approved hours",
    "Deleted files were recovered around an unauthorized activity",
    "Repeated authentication failure associated with unknown access",
    "Malware warning linked to a suspicious network event",
    "User reported an unexpected account activity and external request",
]

routine_description_templates = [
    "Scheduled backup completed without any reported issue",
    "Routine system update was recorded by endpoint monitoring",
    "Normal user login observed during the approved work period",
    "Documented configuration check from a standard maintenance window",
    "Automated network scan completed as configured",
    "Routine email activity with no confirmed security exception",
]

evidence_type_weights = {
    "Log File": 5,
    "IP Address": 6,
    "Device Information": 4,
    "Email": 3,
    "URL": 4,
    "Screenshot": 2,
    "Message": 3,
    "File": 5,
    "Timestamp/Event": 3,
    "Other": 1,
}

case_type_weights = {
    "Unauthorized Account Access": 7,
    "Phishing": 7,
    "Cyberbullying": 3,
    "Data Theft": 8,
    "Suspicious Activity": 8,
    "Device Misuse": 5,
    "Online Fraud": 6,
    "Other": 2,
}


def main():
    rng = np.random.default_rng(RANDOM_SEED)

    evidence_type = rng.choice(evidence_types, size=N_ROWS)
    case_type = rng.choice(case_types, size=N_ROWS)
    source = rng.choice(sources, size=N_ROWS)
    hour_of_day = rng.integers(0, 24, size=N_ROWS)

    latent_relevance = rng.beta(2.2, 2.0, size=N_ROWS)

    ip_is_suspicious = (
        rng.random(N_ROWS)
        < (0.18 + 0.55 * latent_relevance)
    ).astype(int)

    shared_ip_count = np.array([
        int(rng.binomial(5, 0.12 + 0.34 * latent_relevance[i]))
        for i in range(N_ROWS)
    ])
    shared_device_count = np.array([
        int(rng.binomial(4, 0.10 + 0.30 * latent_relevance[i]))
        for i in range(N_ROWS)
    ])
    has_file_attachment = (
        rng.random(N_ROWS)
        < (0.25 + 0.45 * latent_relevance)
    ).astype(int)

    tag_count = np.empty(N_ROWS, dtype=int)
    tags = []
    relevant_text_indicator = np.zeros(N_ROWS, dtype=int)

    descriptions = []
    for i in range(N_ROWS):
        high_signal_mix = 0.15 + 0.75 * latent_relevance[i]
        is_relevant_description = rng.random() < high_signal_mix
        relevant_text_indicator[i] = int(is_relevant_description)

        if is_relevant_description:
            descriptions.append(rng.choice(relevant_description_templates))
        else:
            descriptions.append(rng.choice(routine_description_templates))

        relevant_tags = [
            "login",
            "auth-failure",
            "external-ip",
            "phishing",
            "malware",
            "deleted-files",
            "data-transfer",
        ]
        routine_tags = [
            "timestamp",
            "scheduled-backup",
            "system-update",
            "routine",
            "device",
        ]

        count = int(rng.integers(1, 5))
        selected_tags = []
        for _ in range(count):
            if rng.random() < high_signal_mix:
                candidate_pool = relevant_tags
            else:
                candidate_pool = routine_tags
            selected_tags.append(str(rng.choice(candidate_pool)))

        unique_tags = list(dict.fromkeys(selected_tags))
        tag_count[i] = len(unique_tags)
        tags.append(", ".join(unique_tags))

    hours_from_incident = np.abs(
        rng.normal(
            loc=72 - 55 * latent_relevance,
            scale=18 + 20 * (1 - latent_relevance),
            size=N_ROWS,
        )
    )
    hours_from_incident = np.round(np.clip(hours_from_incident, 0, 168), 1)

    hidden_score = (
        10 * ip_is_suspicious
        + 3.2 * shared_ip_count
        + 2.4 * shared_device_count
        + 7 * has_file_attachment
        + 1.8 * tag_count
        + 6 * (1 - hours_from_incident / 168)
        + 5 * relevant_text_indicator
        + np.array([evidence_type_weights[value] for value in evidence_type])
        + np.array([case_type_weights[value] for value in case_type])
        +         rng.normal(0, 7.5, size=N_ROWS)
    )

    medium_threshold = float(np.quantile(hidden_score, 0.35))
    high_threshold = float(np.quantile(hidden_score, 0.75))

    relevance_label = np.where(
        hidden_score >= high_threshold,
        "High",
        np.where(hidden_score >= medium_threshold, "Medium", "Low"),
    )

    borderline_width = 3.5
    borderline = (
        (np.abs(hidden_score - medium_threshold) <= borderline_width)
        | (np.abs(hidden_score - high_threshold) <= borderline_width)
    )
    borderline_indices = np.flatnonzero(borderline)
    flipped_count = int(rng.binomial(len(borderline_indices), 0.08))
    flip_indices = rng.choice(
        borderline_indices,
        size=flipped_count,
        replace=False,
    ) if flipped_count > 0 else np.array([], dtype=int)

    for i in flip_indices:
        if relevance_label[i] == "High":
            relevance_label[i] = "Medium"
        elif relevance_label[i] == "Medium":
            relevance_label[i] = (
                "Low" if rng.random() < 0.5 else "High"
            )
        else:
            relevance_label[i] = "Medium"

    dataset = pd.DataFrame({
        "evidence_type": evidence_type,
        "case_type": case_type,
        "source": source,
        "description": descriptions,
        "tags": tags,
        "hour_of_day": hour_of_day,
        "hours_from_incident": hours_from_incident,
        "ip_is_suspicious": ip_is_suspicious,
        "shared_ip_count": shared_ip_count,
        "shared_device_count": shared_device_count,
        "has_file_attachment": has_file_attachment,
        "tag_count": tag_count,
        "relevance_label": relevance_label,
    })

    dataset.to_csv("ml-service/data/evidence_dataset.csv", index=False)

    print(
        "Wrote "
        f"{len(dataset)} rows to ml-service/data/evidence_dataset.csv "
        f"with seed {RANDOM_SEED}"
    )


if __name__ == "__main__":
    main()
