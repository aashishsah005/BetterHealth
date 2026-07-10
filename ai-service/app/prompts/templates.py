INTENT_CLASSIFICATION_PROMPT = """
You are an expert clinical AI assistant. Your task is to analyze the dialogue transcript between a patient and a healthcare provider (or clinic staff) and classify the primary intent of the conversation.

Transcript:
\"\"\"
{transcript}
\"\"\"

Classify the conversation into exactly one of the following classes:
1. Medical Consultation: The patient is reporting symptoms, seeking medical advice, discussing active health issues, diagnoses, treatment plans, or undergoing a clinical assessment.
2. Administrative Conversation: Discussing billing, insurance, office hours, clinic policies, forms, or other administrative tasks.
3. Technical Support: Discussing audio/video issues, connection problems, app download, portal login, or other IT support issues.
4. Appointment Discussion: Rescheduling, scheduling a new appointment, canceling, or confirming appointment dates/times.
5. Prescription Renewal: Asking for a refill or renewal of an existing prescription without seeking new medical advice/assessment.
6. Follow-up Discussion: Scheduling follow-up timing, coordinating next steps for visits, or administrative follow-up.
7. General Conversation: Standard greetings, casual small talk, saying goodbye, or other non-medical social pleasantries.

Output the classification as a JSON object with the following keys:
- classification: Must be exactly one of the seven class names listed above.
- is_medical: A boolean value (true if classification is "Medical Consultation", false otherwise).
- explanation: A 1-2 sentence justification for the classification.
"""

SOAP_GENERATION_PROMPT = """
You are an expert clinical AI assistant. Your task is to analyze the doctor-patient dialogue transcript and generate a structured clinical SOAP note.

Transcript:
\"\"\"
{transcript}
\"\"\"

Please structure the clinical documentation into the standard SOAP format:
1. Subjective (S): Patient's chief complaint, history of present illness, symptoms reported, pain levels.
2. Objective (O): Vital signs, physical examination findings, lab values, or EKG findings mentioned in the conversation. If none are mentioned, state "None recorded".
3. Assessment (A): Diagnosis, differential diagnoses, or clinical assessment of the patient's condition.
4. Plan (P): Treatment plan, diagnostic tests ordered, medication adjustments, follow-up instructions.

CRITICAL INSTRUCTION: You must strictly prevent clinical hallucinations.
- Never invent symptoms, vital signs, physical exam findings, or treatments that are not explicitly stated in the transcript.
- Never infer diagnoses or diseases without direct evidence from the transcript.
- Every clinical statement you generate must be traceable directly to the provided transcript.
- If a section lacks evidence or information in the transcript, state "No evidence in transcript".

Output the SOAP note sections as a JSON object with the following keys:
- subjective
- objective
- assessment
- plan
"""

TRIAGE_CLASSIFICATION_PROMPT = """
You are an expert clinical triage safety officer. Your task is to review the patient's consultation transcript and evaluate the clinical urgency level based strictly on the provided clinical guideline.

Transcript:
\"\"\"
{transcript}
\"\"\"

Clinical Guideline:
\"\"\"
{guideline_text}
\"\"\"

Evaluate and classify the urgency level of this case based strictly on the symptoms and details present in the transcript.
CRITICAL INSTRUCTION: You must strictly prevent clinical hallucinations.
- Never invent symptoms, conditions, or severity levels not explicitly mentioned in the transcript.
- Never infer clinical urgency unsupported by the transcript.
- The guideline citation must be an exact text snippet or citation from the provided guideline that grounds this decision.

You must output a JSON object with the following fields:
- urgency: Must be one of "High", "Medium", or "Low"
- reasoning: A 1-2 sentence clinical justification explaining why this urgency level was chosen based on the symptoms.
- guideline_citation: The specific citation, title, or exact text snippet from the provided guideline that grounds this decision.

Ensure the urgency matches the guideline criteria exactly.
"""
