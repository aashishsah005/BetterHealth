import os
import json
import re
import google.generativeai as genai
from app.rag.guideline_retriever import GuidelineRetriever
from app.prompts.templates import SOAP_GENERATION_PROMPT, TRIAGE_CLASSIFICATION_PROMPT, INTENT_CLASSIFICATION_PROMPT

class Orchestrator:
    def __init__(self):
        self.retriever = GuidelineRetriever()
        self.api_key = os.getenv("GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)
            print("[Orchestrator] Gemini API client configured successfully.")
        else:
            print("[Orchestrator] WARNING: GEMINI_API_KEY is not set. Orchestrator will run in mock fallback mode.")

    def _parse_json_response(self, text: str) -> dict:
        try:
            return json.loads(text.strip())
        except Exception:
            pass
        
        # Try markdown code block
        match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except Exception:
                pass
                
        match_any = re.search(r"```\s*(.*?)\s*```", text, re.DOTALL)
        if match_any:
            try:
                return json.loads(match_any.group(1).strip())
            except Exception:
                pass
                
        curly = re.search(r"({.*})", text, re.DOTALL)
        if curly:
            try:
                return json.loads(curly.group(1).strip())
            except Exception:
                pass
                
        raise ValueError(f"Failed to parse JSON from: {text}")

    def process_transcript(self, transcript: str) -> dict:
        """
        Orchestrates the processing pipeline:
        1. Classify the dialogue intent (Medical Consultation, Administrative, etc.)
        2. If NOT Medical Consultation: skip clinical analysis.
        3. If Medical Consultation: run full RAG, SOAP note generation, and Triage classification.
        """
        # If API key is not set, run offline mock pipeline
        if not self.api_key:
            print("[Orchestrator] Running offline mock pipeline.")
            return self._run_mock_pipeline(transcript)

        try:
            model = genai.GenerativeModel("gemini-1.5-flash")

            # 1. Intent Detection
            intent_prompt = INTENT_CLASSIFICATION_PROMPT.format(transcript=transcript)
            print("[Orchestrator] Querying Gemini for intent classification...")
            intent_response = model.generate_content(
                intent_prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            intent_data = self._parse_json_response(intent_response.text)
            is_medical = intent_data.get("is_medical", True)
            classification = intent_data.get("classification", "Medical Consultation")
            print(f"[Orchestrator] Classification: {classification}, Is Medical: {is_medical}")

            if not is_medical:
                print("[Orchestrator] Non-medical intent detected. Skipping clinical pipeline.")
                return {
                    "transcript": transcript,
                    "is_medical": False,
                    "classification": classification,
                    "soap": {
                        "subjective": "No clinical assessment generated.",
                        "objective": "No clinical assessment generated.",
                        "assessment": "No clinical assessment generated.",
                        "plan": "No clinical assessment generated."
                    },
                    "triage": {
                        "urgency": "Low",
                        "reasoning": "The conversation does not contain sufficient medical information to perform a clinical evaluation.",
                        "guideline": "N/A"
                    }
                }

            # 2. RAG Guideline Retrieval
            guideline = self.retriever.retrieve(transcript)

            # 3. Generate SOAP Note
            soap_prompt = SOAP_GENERATION_PROMPT.format(transcript=transcript)
            print("[Orchestrator] Querying Gemini for structured SOAP note...")
            soap_response = model.generate_content(
                soap_prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            soap_data = self._parse_json_response(soap_response.text)
            print("[Orchestrator] SOAP note generated successfully.")

            # 4. Classify Triage Urgency grounded in Guideline
            triage_prompt = TRIAGE_CLASSIFICATION_PROMPT.format(
                transcript=transcript,
                guideline_text=guideline["text"]
            )
            print("[Orchestrator] Querying Gemini for clinical triage classification...")
            triage_response = model.generate_content(
                triage_prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            triage_data = self._parse_json_response(triage_response.text)
            print("[Orchestrator] Triage urgency classified successfully.")

            return {
                "transcript": transcript,
                "is_medical": True,
                "classification": classification,
                "soap": {
                    "subjective": soap_data.get("subjective", ""),
                    "objective": soap_data.get("objective", ""),
                    "assessment": soap_data.get("assessment", ""),
                    "plan": soap_data.get("plan", "")
                },
                "triage": {
                    "urgency": triage_data.get("urgency", "Low"),
                    "reasoning": triage_data.get("reasoning", ""),
                    "guideline": triage_data.get("guideline_citation", guideline["source"])
                }
            }

        except Exception as e:
            print(f"[Orchestrator] Gemini API orchestration failed: {e}. Falling back to mock pipeline.")
            return self._run_mock_pipeline(transcript)

    def _run_mock_pipeline(self, transcript: str) -> dict:
        """
        Mock fallback response generator that simulates Gemini LLM structured outputs.
        """
        lower_transcript = transcript.lower()

        # Offline Mock Classification based on transcript content keywords
        is_medical = False
        classification = "General Conversation"

        # Check for medical keywords
        if "chest" in lower_transcript or "pain" in lower_transcript or "fever" in lower_transcript or "cough" in lower_transcript or "temperature" in lower_transcript or "throat" in lower_transcript:
            is_medical = True
            classification = "Medical Consultation"
        elif "schedule" in lower_transcript or "appointment" in lower_transcript or "reschedule" in lower_transcript or "cancel" in lower_transcript:
            classification = "Appointment Discussion"
        elif "refill" in lower_transcript or "renew" in lower_transcript or "prescription" in lower_transcript:
            classification = "Prescription Renewal"
        elif "billing" in lower_transcript or "insurance" in lower_transcript or "pay" in lower_transcript:
            classification = "Administrative Conversation"
        elif "hear" in lower_transcript or "connection" in lower_transcript or "mic" in lower_transcript:
            classification = "Technical Support"
        elif "follow up" in lower_transcript or "followup" in lower_transcript:
            classification = "Follow-up Discussion"

        print(f"[Orchestrator Mock] Classified as: {classification}, Is Medical: {is_medical}")

        if not is_medical:
            return {
                "transcript": transcript,
                "is_medical": False,
                "classification": classification,
                "soap": {
                    "subjective": "No clinical assessment generated.",
                    "objective": "No clinical assessment generated.",
                    "assessment": "No clinical assessment generated.",
                    "plan": "No clinical assessment generated."
                },
                "triage": {
                    "urgency": "Low",
                    "reasoning": "The conversation does not contain sufficient medical information to perform a clinical evaluation.",
                    "guideline": "N/A"
                }
            }

        # Otherwise it is a Medical Consultation: return realistic medical data
        guideline = self.retriever.retrieve(transcript)
        
        is_cardiac = "chest" in lower_transcript or "pain" in lower_transcript
        is_fever = "fever" in lower_transcript or "temperature" in lower_transcript
        
        if is_cardiac:
            soap = {
                "subjective": "Patient reports sudden onset of 'crushing' substernal chest pain 45 minutes ago. Pain is radiating to left arm. Associated symptoms include diaphoresis and shortness of breath. Pain rating is 8/10.",
                "objective": "Vitals: BP 148/92, HR 104, O2 Sat 94% on RA. Physical: Patient is diaphoretic, anxious, and in acute distress. Heart sounds tachycardic but regular, no murmurs.",
                "assessment": "Acute Coronary Syndrome (ACS) - STEMI vs NSTEMI. Rule out myocardial infarction.",
                "plan": "Immediate 12-lead EKG. Draw serial Troponins, CBC, BMP. Administer Aspirin 324mg chewable, Nitroglycerin 0.4mg SL. STAT Cardiology consult."
            }
            triage = {
                "urgency": "High",
                "reasoning": "Patient presents with crushing chest pain radiating to left arm, shortness of breath, and diaphoresis. These match indicators for Acute Coronary Syndrome (ACS).",
                "guideline": f"Grounded in: {guideline['title']} - {guideline['source']}"
            }
        elif is_fever:
            soap = {
                "subjective": "Patient presents with dry cough for four days and a fever of 101.3°F developing last night. Reports mild shortness of breath on exertion.",
                "objective": "Vitals: Temp 101.1°F, BP 122/80, HR 88, SpO2 97% on room air. Lungs: Mild crackles in right lower lobe, throat shows mild erythema.",
                "assessment": "Acute Bronchitis vs early Community-Acquired Pneumonia.",
                "plan": "Rapid PCR testing for COVID-19/Influenza. Administer Acetaminophen 500mg as needed for fever. Albuterol inhaler 2 puffs q6h PRN for cough. Review laboratory results."
            }
            triage = {
                "urgency": "Medium",
                "reasoning": "Patient reports persistent fever of 101.3°F and new mild dyspnea on exertion. Requires clinical evaluation for bronchitis or early pneumonia.",
                "guideline": f"Grounded in: {guideline['title']} - {guideline['source']}"
            }
        else:
            soap = {
                "subjective": "Patient presents for routine follow-up. Reports feeling well with no active complaints.",
                "objective": "Vitals: BP 120/80, HR 72, Temp 98.6°F, SpO2 99% on RA. Physical exam is normal.",
                "assessment": "General wellness visit. Controlled blood pressure.",
                "plan": "Continue current diet and exercise regimen. Follow up in 6 months."
            }
            triage = {
                "urgency": "Low",
                "reasoning": "Patient presents for a standard checkup with normal vital signs and no active symptoms.",
                "guideline": "Grounded in: Clinic Standard Protocols"
            }

        return {
            "transcript": transcript,
            "is_medical": True,
            "classification": classification,
            "soap": soap,
            "triage": triage
        }
