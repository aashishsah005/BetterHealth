import os
import re

class GuidelineRetriever:
    def __init__(self):
        # Path to guidelines directory
        self.guidelines_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
            "data", "guidelines"
        )
        print(f"[GuidelineRetriever] Guidelines directory set to: {self.guidelines_dir}")

    def retrieve(self, transcript: str) -> dict:
        """
        Scans all text guidelines in data/guidelines and returns the most relevant one
        based on keyword frequency match in the transcript.
        """
        # Ensure guidelines directory exists
        if not os.path.exists(self.guidelines_dir):
            print(f"[GuidelineRetriever] Guidelines directory not found: {self.guidelines_dir}. Creating mock data.")
            os.makedirs(self.guidelines_dir, exist_ok=True)
            self._create_default_guidelines()

        guideline_files = [f for f in os.listdir(self.guidelines_dir) if f.endswith('.txt')]
        if not guideline_files:
            print("[GuidelineRetriever] No guidelines files found.")
            return {
                "title": "Default Guidelines",
                "text": "Monitor vitals, ask patient to describe pain level and duration, keep patient hydrated, refer to physician.",
                "source": "General Medical Standard Operating Procedure"
            }

        scores = {}
        contents = {}

        # Keyword mapping for RAG matching
        keyword_map = {
            "pediatric_fever.txt": ["fever", "child", "infant", "pediatric", "immunization", "teething", "crying", "temp", "lethargy", "rectal"],
            "adult_chest_pain.txt": ["chest", "pain", "radiat", "arm", "myocardial", "stemi", "nstem", "cardiac", "ekg", "angina", "coronary", "substernal", "diaphoresis"],
            "hypertension_crisis.txt": ["blood pressure", "hypertension", "systolic", "diastolic", "sbp", "dbp", "crisis", "emergency", "headache", "organ damage", "180", "120"]
        }

        # Basic scanning
        for filename in guideline_files:
            file_path = os.path.join(self.guidelines_dir, filename)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    text = f.read()
                    contents[filename] = text
                    
                    # Compute score based on matching keywords
                    score = 0
                    lower_transcript = transcript.lower()
                    
                    # Custom keywords for file if defined, otherwise use text keywords
                    keywords = keyword_map.get(filename, [])
                    if not keywords:
                        # Fallback: scan words from the filename itself
                        keywords = re.findall(r'\w+', filename.lower().replace('.txt', ''))
                        
                    for kw in keywords:
                        # Count matches in transcript
                        matches = len(re.findall(re.escape(kw), lower_transcript))
                        score += matches * 2 # weight keyword matches
                    
                    # General text match
                    for word in re.findall(r'\w+', text.lower()):
                        if len(word) > 4 and word in lower_transcript:
                            score += 1
                            
                    scores[filename] = score
            except Exception as e:
                print(f"[GuidelineRetriever] Error reading file {filename}: {e}")

        # Get highest scoring guideline
        if not scores or max(scores.values()) == 0:
            # Default to chest pain or fever if no matches
            best_match = "adult_chest_pain.txt" if "chest" in transcript.lower() else (guideline_files[0] if guideline_files else None)
        else:
            best_match = max(scores, key=scores.get)

        print(f"[GuidelineRetriever] Matched guideline: {best_match} (Scores: {scores})")

        if not best_match:
            return {
                "title": "Default Medical Practice",
                "text": "General triage rules: Check vitals, SpO2, and obtain pain scales.",
                "source": "Clinic Standard Protocols"
            }

        full_text = contents.get(best_match, "")
        
        # Extract title and source headers
        title = "Clinical Guidance Document"
        source = "Medical Guidelines"
        
        title_match = re.search(r"Guideline Title:\s*(.*)", full_text)
        if title_match:
            title = title_match.group(1).strip()
            
        source_match = re.search(r"Source Citation:\s*(.*)", full_text)
        if source_match:
            source = source_match.group(1).strip()

        return {
            "title": title,
            "text": full_text,
            "source": source,
            "file": best_match
        }

    def _create_default_guidelines(self):
        """Creates guidelines if they are missing."""
        # This acts as a recovery if data files got deleted
        default_data = {
            "pediatric_fever.txt": (
                "Guideline Title: CDC Pediatric Fever Triage Criteria\n"
                "Source Citation: CDC Clinical Guidance for Infant and Pediatric Fever Management (2024)\n"
                "Key Criteria:\n"
                "1. Infants under 3 months (90 days) with a rectal temperature of 100.4°F (38°C) or higher must be triaged as HIGH urgency. They require immediate medical evaluation, septic workup, and monitoring due to the risk of serious bacterial infections (SBI).\n"
                "2. Children aged 3 to 36 months with a temperature of 102.2°F (39°C) or higher should be triaged as MEDIUM urgency. They require clinical evaluation to identify the source of infection, monitor hydration, and review immunization history.\n"
                "3. Children presenting with fever accompanied by lethargy, inconsolable crying, toxic appearance, petechial rash, or stiff neck must be triaged as HIGH urgency regardless of age.\n"
                "4. Simple viral fevers with temperature under 101.5°F (38.6°C) in fully immunized children who are active and hydrated are triaged as LOW urgency. Provide symptomatic care instructions (hydration, Acetaminophen/Ibuprofen)."
            ),
            "adult_chest_pain.txt": (
                "Guideline Title: AHA/ACC Chest Pain Evaluation Protocol\n"
                "Source Citation: American Heart Association (AHA) and American College of Cardiology (ACC) Guidelines for the Evaluation and Diagnosis of Chest Pain (2021)\n"
                "Key Criteria:\n"
                "1. Any adult patient presenting with acute, pressure-like, crushing, or squeezing substernal chest pain lasting more than 10 minutes must be triaged immediately as HIGH urgency.\n"
                "2. High-risk symptoms including pain radiating to the left arm, neck, jaw, back, or epigastrium, associated with diaphoresis, dyspnea, nausea, vomiting, syncope, or lightheadedness are classified as HIGH urgency.\n"
                "3. Patients with known coronary artery disease (CAD) presenting with chest pain that is atypical but different from stable angina, or pain not relieved by nitroglycerin, are triaged as HIGH urgency.\n"
                "4. Non-cardiac chest pain (e.g., musculoskeletal chest wall tenderness on palpation, stabbing pain worse with deep inspiration/pleuritic) without associated cardiac risk factors or systemic symptoms is triaged as LOW to MEDIUM urgency depending on age and vital signs.\n"
                "5. Immediate management includes obtaining a 12-lead EKG within 10 minutes of arrival, giving Aspirin 324mg (chewable), and checking cardiac troponins."
            ),
            "hypertension_crisis.txt": (
                "Guideline Title: ACC/AHA Hypertensive Crisis Management Guidelines\n"
                "Source Citation: ACC/AHA Hypertension Clinical Practice Guidelines (2017)\n"
                "Key Criteria:\n"
                "1. Hypertensive Crisis is defined as a Systolic Blood Pressure (SBP) greater than 180 mmHg and/or Diastolic Blood Pressure (DBP) greater than 120 mmHg.\n"
                "2. Hypertensive Emergency: SBP > 180 or DBP > 120 accompanied by target organ damage (e.g., chest pain, dyspnea, neurological deficits, headache, visual changes, hematuria). This is classified as HIGH urgency. Requires immediate ICU admission and controlled reduction of blood pressure.\n"
                "3. Hypertensive Urgency: SBP > 180 or DBP > 120 without evidence of acute target organ damage. This is classified as MEDIUM urgency. Requires adjustments to oral anti-hypertensive medications and close outpatient follow-up within 24-48 hours.\n"
                "4. Elevated blood pressure (SBP 120-129 and DBP < 80) or Stage 1 Hypertension (SBP 130-139 or DBP 80-89) without acute symptoms is classified as LOW urgency. Requires lifestyle modifications and outpatient clinic follow-up."
            )
        }
        for name, content in default_data.items():
            file_path = os.path.join(self.guidelines_dir, name)
            try:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
            except Exception as e:
                print(f"[GuidelineRetriever] Error writing default guideline {name}: {e}")
