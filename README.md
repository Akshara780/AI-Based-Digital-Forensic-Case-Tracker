# AI-Based Digital Forensic Case Tracker

A web application that helps digital forensic investigators organise cases and evidence, and get automated suggestions about how pieces of evidence may be linked. It combines rule-based reasoning with an optional machine-learning estimate. This is a student prototype: every automated result is a suggestion that an investigator must check against the original evidence.

## What works today

**Case and evidence management**
- Investigator sign-in with roles (Investigator, Admin, Viewer)
- Create cases, add evidence with metadata (source, IP address, device, time, tags) and optional file attachments
- Case timeline, investigator notes and a printable case report

**Rule-based analysis (runs in the browser, always on)**
- Evidence linking: scores how closely two evidence items match (shared IP address, device, time, tags, source)
- Warning-sign checks that apply simple rules across a case
- Questions checked about a piece of evidence, with plain-language answers
- Consistency checks between evidence items
- Priority suggestions that the investigator must confirm before the case priority changes
- Map of possible links between evidence items

**Machine-learning estimate (optional, runs locally)**
- A Python service estimates whether an evidence item is likely important, possibly important or likely less important to the case, with the system's own confidence
- The website works fully without it. If the service is off, the estimate card is simply hidden
- Every screen explains results in plain language, with a "How was this calculated?" section

## Important limitations

- **The machine-learning model was trained on synthetic (made-up) data**, not on real cases. On a held-out test set of 600 synthetic records it reached about 67% accuracy (Logistic Regression), compared with about 40% for a model that always guesses the most common class. These numbers describe synthetic data only. Performance on real forensic evidence is unknown.
- Some of the model's inputs are approximations. For example, the "repeated IP address" input comes from a simple rule, not from a threat-intelligence lookup.
- The estimate has no login check yet, so the ML service is meant to run locally for demonstration. It is not deployed publicly.
- Evidence files are not scanned, hashed or analysed. Only the metadata entered by the investigator is used.
- Deleting an evidence record does not delete its uploaded file from storage.
- Nothing here is proof of wrongdoing or a legal conclusion.

## Tech stack

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: Supabase (authentication, PostgreSQL database, file storage)
- Rule-based analysis: TypeScript modules in `src/ai`
- Machine learning: Python, scikit-learn, pandas, FastAPI in `ml-service`

## Run the web app

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in your own Supabase project values
3. Start the app: `npm run dev`

The database setup is in `supabase/schema.sql`. The storage bucket `evidence-files` must also be created in Supabase.

## Run the machine-learning service (optional)

1. In `ml-service`, create a Python virtual environment and install `requirements.txt`
2. Start the service from the project root: `python -m uvicorn api:app --app-dir ml-service/src --host 127.0.0.1 --port 8000`
3. In `.env`, set `VITE_ML_API_URL=http://127.0.0.1:8000` and restart `npm run dev`

To rebuild the dataset and retrain the model, run `ml-service/src/generate_dataset.py` and then `ml-service/src/train_model.py`.

## Project status

Working prototype. Planned, not implemented: training on real labelled data collected from investigator feedback, authentication for the ML service and public hosting of it, and analysis of evidence file contents.
