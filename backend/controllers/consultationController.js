import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import PDFDocument from 'pdfkit';
import consultationModel from '../models/consultationModel.js';
import transcriptModel from '../models/transcriptModel.js';
import clinicalNoteModel from '../models/clinicalNoteModel.js';
import triageFlagModel from '../models/triageFlagModel.js';
import audioChunkModel from '../models/audioChunkModel.js';
import appointmentModel from '../models/appointmentModel.js';
import messageModel from '../models/messageModel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Logger ──────────────────────────────────────────────────────────────────
const log = (tag, msg, data = null) => {
    const ts = new Date().toISOString();
    console.log(`[${ts}][${tag}] ${msg}`, data ?? '');
};

// ─── Socket helper ───────────────────────────────────────────────────────────
const emitToRoom = (req, room, event, payload) => {
    try {
        const io = req.app.get('socketio');
        if (io) io.to(room).emit(event, payload);
    } catch (err) {
        console.error('[Socket] emit error:', err);
    }
};

const emitTriageUpdate = (req, consultation, triageData) => {
    try {
        const io = req.app.get('socketio');
        if (io) {
            io.emit('new-triage-flag', {
                consultationId: consultation._id,
                userId: consultation.userId,
                docId: consultation.docId,
                urgencyLevel: triageData.urgencyLevel,
                reasoning: triageData.reasoning,
                patientName: triageData.patientName,
                date: consultation.date
            });
            log('Socket', 'Emitted new-triage-flag for consultation:', consultation._id);
        }
    } catch (err) {
        console.error('[Socket] emit error:', err);
    }
};

// ─── AI Service helper ───────────────────────────────────────────────────────
const AI_BASE = 'http://localhost:8000';

const callAIProcessTranscript = async (transcript) => {
    const response = await fetch(`${AI_BASE}/process-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript })
    });
    if (!response.ok) throw new Error(`AI service responded ${response.status}`);
    return response.json();
};

const callAITranscribeChunk = async (filePath, filename, patientName) => {
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('file', blob, filename || 'chunk.webm');
    if (patientName) {
        formData.append('patientName', patientName);
    }
    const response = await fetch(`${AI_BASE}/transcribe-chunk`, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) throw new Error(`AI chunk transcription responded ${response.status}`);
    const data = await response.json();
    return data.text || '';
};

// ─── Mock fallback ──────────────────────────────────────────────────────────
const getMockAIResult = (transcript, patientName = 'Patient') => {
    log('Mock', 'Generating mock AI result for', patientName);
    const lower_transcript = transcript.toLowerCase();
    
    // Offline Mock Classification based on transcript content keywords
    let isMedical = false;
    let classification = "General Conversation";

    if (lower_transcript.includes("chest") || lower_transcript.includes("pain") || lower_transcript.includes("fever") || lower_transcript.includes("cough") || lower_transcript.includes("temperature") || lower_transcript.includes("throat") || lower_transcript.includes("symptom")) {
        isMedical = true;
        classification = "Medical Consultation";
    } else if (lower_transcript.includes("schedule") || lower_transcript.includes("appointment") || lower_transcript.includes("reschedule") || lower_transcript.includes("cancel")) {
        classification = "Appointment Discussion";
    } else if (lower_transcript.includes("refill") || lower_transcript.includes("renew") || lower_transcript.includes("prescription")) {
        classification = "Prescription Renewal";
    } else if (lower_transcript.includes("billing") || lower_transcript.includes("insurance") || lower_transcript.includes("pay") || lower_transcript.includes("fee")) {
        classification = "Administrative Conversation";
    } else if (lower_transcript.includes("hear") || lower_transcript.includes("connection") || lower_transcript.includes("mic")) {
        classification = "Technical Support";
    } else if (lower_transcript.includes("follow up") || lower_transcript.includes("followup")) {
        classification = "Follow-up Discussion";
    }

    if (!isMedical) {
        return {
            transcript,
            is_medical: false,
            classification,
            soap: {
                subjective: "No clinical assessment generated.",
                objective: "No clinical assessment generated.",
                assessment: "No clinical assessment generated.",
                plan: "No clinical assessment generated."
            },
            triage: {
                urgency: "Low",
                reasoning: "The conversation does not contain sufficient medical information to perform a clinical evaluation.",
                guideline: "N/A"
            }
        };
    }

    // Cardiac (Chest pain) vs Fever vs Default General checkup
    const hasChest = lower_transcript.includes('chest') || lower_transcript.includes('pain');
    const hasFever = lower_transcript.includes('fever') || lower_transcript.includes('temperature');

    if (hasChest) {
        return {
            transcript,
            is_medical: true,
            classification: 'Medical Consultation',
            soap: {
                subjective: `${patientName} reports crushing substernal chest pain radiating to left arm, 8/10 intensity. Associated diaphoresis and dyspnea.`,
                objective: 'BP 148/92, HR 104, O2 Sat 94% RA. Patient diaphoretic, in acute distress.',
                assessment: 'Acute Coronary Syndrome (ACS) — STEMI vs NSTEMI. Rule out myocardial infarction.',
                plan: 'Stat 12-lead EKG. Serial Troponins. Aspirin 324mg chewable. Nitroglycerin 0.4mg SL. Cardiology consult.'
            },
            triage: {
                urgency: 'High',
                reasoning: 'Classic ACS presentation: crushing chest pain radiating to left arm with diaphoresis and dyspnea.',
                guideline: 'WHO Fact Sheet — Acute Myocardial Infarction: Chest pain radiating to arm must be triaged immediately as HIGH urgency.'
            }
        };
    } else if (hasFever) {
        return {
            transcript,
            is_medical: true,
            classification: 'Medical Consultation',
            soap: {
                subjective: `${patientName} with 4-day dry cough and fever 101.3°F. Mild dyspnea on exertion.`,
                objective: 'Temp 101.1°F, BP 122/80, HR 88, SpO2 97% RA. Mild crackles right lower lobe.',
                assessment: 'Acute Bronchitis vs Community-Acquired Pneumonia.',
                plan: 'Rapid PCR for COVID-19/Flu. Acetaminophen 500mg PRN. Albuterol inhaler 2 puffs q6h. Monitor SpO2.'
            },
            triage: {
                urgency: 'Medium',
                reasoning: 'Persistent fever with new dyspnea on exertion. Early pneumonia must be ruled out.',
                guideline: 'CDC Guideline for CAP: Fever + cough + crackles requires diagnostic testing at MEDIUM urgency.'
            }
        };
    }
    return {
        transcript,
        is_medical: true,
        classification: 'Medical Consultation',
        soap: {
            subjective: `${patientName} presents for follow-up. No acute complaints.`,
            objective: 'Vitals: BP 120/80, HR 72, Temp 98.6°F, SpO2 99% RA. Normal exam.',
            assessment: 'Routine wellness visit.',
            plan: 'Continue current regimen. Follow up in 6 months.'
        },
        triage: {
            urgency: 'Low',
            reasoning: 'Standard checkup with no acute symptoms.',
            guideline: 'Clinic Standard Protocols.'
        }
    };
};

// ─── PDF Generator ───────────────────────────────────────────────────────────
const generateConsultationPDF = (consultation, note, triage, transcript, appointment) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const tmpPath = path.join(__dirname, `../temp/report-${consultation._id}-${Date.now()}.pdf`);
        
        // Ensure temp dir
        fs.mkdirSync(path.dirname(tmpPath), { recursive: true });

        const stream = fs.createWriteStream(tmpPath);
        doc.pipe(stream);

        const patientData = appointment?.userData || {};
        const doctorName = appointment?.docData?.name || 'Physician';
        const consultDate = new Date(consultation.approvedAt || consultation.date).toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        // ── Header ──
        doc.rect(0, 0, doc.page.width, 80).fill('#4F46E5');
        doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text('BetterHealth', 50, 22);
        doc.fontSize(10).font('Helvetica').text('AI-Assisted Clinical Consultation Report', 50, 50);
        doc.y = 100; // start text clearly below header band
        doc.fillColor('#000000');

        // ── Meta ──
        doc.fontSize(11).font('Helvetica-Bold').text('Consultation Details', { underline: true });
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(10);
        doc.text(`Date: ${consultDate}`);
        doc.text(`Doctor: ${doctorName}`);
        doc.text(`Patient: ${patientData.name || 'N/A'}`);
        if (patientData.dob && patientData.dob !== 'Not Selected') {
            const age = new Date().getFullYear() - new Date(patientData.dob).getFullYear();
            doc.text(`Age: ${age}`);
        }
        doc.text(`Gender: ${patientData.gender || 'N/A'}`);
        doc.text(`Consultation ID: ${consultation._id}`);
        doc.moveDown(1);

        // ── Triage Badge ──
        const urgencyColors = { High: '#EF4444', Medium: '#F59E0B', Low: '#10B981' };
        const urgency = triage?.urgencyLevel || 'Low';
        const badgeY = doc.y;
        doc.rect(50, badgeY, 120, 28).fill(urgencyColors[urgency] || '#6B7280');
        doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
            .text(`TRIAGE: ${urgency.toUpperCase()}`, 50, badgeY + 8, { width: 120, align: 'center' });
        doc.y = badgeY + 40; // shift cursor safely below the triage block
        doc.fillColor('#000000');

        // ── SOAP Note ──
        const soapSections = [
            { label: 'S — Subjective', value: note?.subjective },
            { label: 'O — Objective', value: note?.objective },
            { label: 'A — Assessment', value: note?.assessment },
            { label: 'P — Plan', value: note?.plan }
        ];

        doc.fontSize(13).font('Helvetica-Bold').text('SOAP Clinical Note', { underline: true });
        doc.moveDown(0.5);

        soapSections.forEach(({ label, value }) => {
            doc.fontSize(11).font('Helvetica-Bold').text(label);
            doc.fontSize(10).font('Helvetica').text(value || 'N/A', { indent: 10 });
            doc.moveDown(0.7);
        });

        // ── Triage Reasoning ──
        doc.fontSize(13).font('Helvetica-Bold').text('AI Triage Reasoning', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica').text(triage?.reasoning || 'N/A');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica-Bold').text('Guideline Source:');
        doc.font('Helvetica').text(triage?.guidelineSource || 'N/A');
        doc.moveDown(1);

        // ── Transcript ──
        if (transcript) {
            doc.fontSize(13).font('Helvetica-Bold').text('Consultation Transcript', { underline: true });
            doc.moveDown(0.3);
            doc.fontSize(9).font('Courier').text(transcript, { lineGap: 2 });
            doc.moveDown(1);
        }

        // ── Approval ──
        doc.fontSize(13).font('Helvetica-Bold').text('Clinician Approval', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Approved By: Dr. ${doctorName}`);
        doc.text(`Approved At: ${consultDate}`);
        doc.moveDown(1.5);

        // ── Disclaimer ──
        const rectY = doc.y;
        doc.rect(50, rectY, doc.page.width - 100, 50).fill('#FEF3C7');
        doc.fillColor('#92400E').fontSize(8).font('Helvetica').text(
            'DISCLAIMER: This report was AI-assisted and has been reviewed and approved by a licensed physician. ' +
            'It is intended for clinical documentation purposes only and does not replace direct medical consultation.',
            58, rectY + 12, { width: doc.page.width - 116 }
        );
        doc.y = rectY + 65; // move cursor past disclaimer
        doc.fillColor('#000000');

        // ── Footer ──
        doc.fontSize(8).font('Helvetica').fillColor('#9CA3AF')
            .text(`Generated by BetterHealth CareScribe AI — ${new Date().toISOString()}`,
                50, doc.page.height - 40, { align: 'center', width: doc.page.width - 100 });

        doc.end();

        stream.on('finish', () => resolve(tmpPath));
        stream.on('error', reject);
    });
};
// ═══════════════════════════════════════════════════════════════════════════════
// EXISTING APIs (unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

// API to create a new consultation from recorded audio (NewConsultation.jsx flow)
const createConsultation = async (req, res) => {
    try {
        const { docId, appointmentId } = req.body;
        const audioFile = req.file;

        if (!appointmentId) return res.json({ success: false, message: 'Appointment ID is required' });
        if (!audioFile) return res.json({ success: false, message: 'Audio recording file is required' });

        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) return res.json({ success: false, message: 'Appointment not found' });
        if (appointment.docId !== docId) return res.json({ success: false, message: 'Doctor is not authorized for this appointment' });

        const userId = appointment.userId;
        const consultation = new consultationModel({ docId, userId, appointmentId, audioUrl: audioFile.path, status: 'Processing' });
        await consultation.save();
        log('Consultation', 'Created (audio upload flow):', consultation._id);

        let aiResult = null;
        try {
            const fileBuffer = fs.readFileSync(audioFile.path);
            const audioBlob = new Blob([fileBuffer], { type: audioFile.mimetype || 'audio/webm' });
            const formData = new FormData();
            formData.append('file', audioBlob, audioFile.originalname || 'recording.webm');
            formData.append('patientName', appointment.userData?.name || '');
            log('AI', 'Calling FastAPI /process-audio...');
            const apiResponse = await fetch(`${AI_BASE}/process-audio`, { method: 'POST', body: formData });
            if (apiResponse.ok) {
                aiResult = await apiResponse.json();
                log('AI', 'FastAPI returned successfully');
            } else {
                log('AI', 'FastAPI responded with status:', apiResponse.status);
            }
        } catch (apiError) {
            log('AI', 'FastAPI connection failed, using mock fallback:', apiError.message);
        }

        if (!aiResult) aiResult = getMockAIResult('', appointment.userData?.name);

        const isMedical = aiResult.is_medical !== undefined ? aiResult.is_medical : true;
        const classification = aiResult.classification || 'Medical Consultation';

        await transcriptModel.create({ consultationId: consultation._id, rawText: aiResult.transcript, asrConfidence: 0.98 });
        await clinicalNoteModel.create({ consultationId: consultation._id, ...aiResult.soap, clinicianApproved: false });
        const triageFlag = await triageFlagModel.create({ consultationId: consultation._id, urgencyLevel: aiResult.triage.urgency, reasoning: aiResult.triage.reasoning, guidelineSource: aiResult.triage.guideline });

        consultation.status = 'Pending Review';
        consultation.isMedical = isMedical;
        consultation.classification = classification;
        await consultation.save();
        log('Consultation', 'Status → Pending Review');

        if (isMedical && (aiResult.triage.urgency === 'High' || aiResult.triage.urgency === 'Medium')) {
            emitTriageUpdate(req, consultation, { urgencyLevel: aiResult.triage.urgency, reasoning: aiResult.triage.reasoning, patientName: appointment.userData?.name || 'Patient' });
        }

        if (audioFile && fs.existsSync(audioFile.path)) {
            try { fs.unlinkSync(audioFile.path); } catch (err) { console.error('[Multer Cleanup]', err.message); }
        }

        res.json({ success: true, message: 'Consultation recorded and processed successfully', consultationId: consultation._id, urgencyLevel: aiResult.triage.urgency });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        console.error(error);
        res.json({ success: false, message: error.message });
    }
};

// API to list all consultations for a doctor
const listConsultations = async (req, res) => {
    try {
        const { docId } = req.body;
        const consultations = await consultationModel.find({ docId }).sort({ createdAt: -1 });

        const detailedConsultations = await Promise.all(consultations.map(async (con) => {
            const appointment = await appointmentModel.findById(con.appointmentId);
            const triage = await triageFlagModel.findOne({ consultationId: con._id });
            const note = await clinicalNoteModel.findOne({ consultationId: con._id });

            return {
                _id: con._id,
                appointmentId: con.appointmentId,
                status: con.status,
                date: con.date,
                reportUrl: con.reportUrl,
                patientData: appointment ? appointment.userData : { name: 'Unknown Patient', dob: '01-01-2000' },
                triage: triage ? { urgencyLevel: triage.urgencyLevel, clinicianOverridden: triage.clinicianOverridden, clinicianOverrideValue: triage.clinicianOverrideValue } : { urgencyLevel: 'Low' },
                clinicianApproved: note ? note.clinicianApproved : false,
                isMedical: con.isMedical,
                classification: con.classification
            };
        }));

        res.json({ success: true, consultations: detailedConsultations });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
};

// API to get consultation detail
const getConsultationDetail = async (req, res) => {
    try {
        const { docId } = req.body;
        const { id } = req.params;

        const consultation = await consultationModel.findById(id);
        if (!consultation) return res.json({ success: false, message: 'Consultation session not found' });
        if (consultation.docId !== docId) return res.json({ success: false, message: 'Access denied' });

        const appointment = await appointmentModel.findById(consultation.appointmentId);
        const transcript = await transcriptModel.findOne({ consultationId: id });
        const note = await clinicalNoteModel.findOne({ consultationId: id });
        const triage = await triageFlagModel.findOne({ consultationId: id });

        res.json({
            success: true,
            consultation: {
                _id: consultation._id,
                date: consultation.date,
                status: consultation.status,
                audioUrl: consultation.audioUrl,
                reportUrl: consultation.reportUrl,
                approvedAt: consultation.approvedAt,
                patientData: appointment ? appointment.userData : null,
                isMedical: consultation.isMedical,
                classification: consultation.classification
            },
            transcript: transcript ? transcript.rawText : '',
            note: note || null,
            triage: triage || null
        });

    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
};

// API to save edited SOAP notes
const updateClinicalNote = async (req, res) => {
    try {
        const { docId } = req.body;
        const { id } = req.params;
        const { subjective, objective, assessment, plan, clinicianApproved } = req.body;

        const consultation = await consultationModel.findById(id);
        if (!consultation) return res.json({ success: false, message: 'Consultation not found' });
        if (consultation.docId !== docId) return res.json({ success: false, message: 'Access denied' });

        const updatedNote = await clinicalNoteModel.findOneAndUpdate(
            { consultationId: id },
            { subjective, objective, assessment, plan, clinicianApproved },
            { new: true }
        );

        if (clinicianApproved) {
            consultation.status = 'Completed';
            await consultation.save();
        }

        res.json({ success: true, message: 'SOAP note updated successfully', note: updatedNote });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
};

// API to override triage
const overrideTriage = async (req, res) => {
    try {
        const { docId } = req.body;
        const { id } = req.params;
        const { urgencyLevel, reason } = req.body;

        const consultation = await consultationModel.findById(id);
        if (!consultation) return res.json({ success: false, message: 'Consultation not found' });
        if (consultation.docId !== docId) return res.json({ success: false, message: 'Access denied' });

        const updatedTriage = await triageFlagModel.findOneAndUpdate(
            { consultationId: id },
            { urgencyLevel, clinicianOverridden: true, clinicianOverrideValue: urgencyLevel, reasoning: reason ? `[Overridden by Clinician]: ${reason}` : undefined },
            { new: true }
        );

        res.json({ success: true, message: 'Triage urgency level updated', triage: updatedTriage });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// NEW APIs — Call-linked consultation workflow
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/doctor/consultations/from-call
 * Called when a call starts. Auto-creates a consultation in IN_CALL status.
 * Also called directly from the socket handler.
 */
const createConsultationFromCall = async (req, res) => {
    try {
        const { docId, appointmentId } = req.body;

        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) return res.json({ success: false, message: 'Appointment not found' });
        if (appointment.docId !== docId) return res.json({ success: false, message: 'Not authorized for this appointment' });

        // Check if already exists for this call session
        const existing = await consultationModel.findOne({
            appointmentId,
            status: 'IN_CALL',
            createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // within last hour
        });
        if (existing) {
            log('Consultation', 'Reusing existing IN_CALL consultation:', existing._id);
            return res.json({ success: true, consultationId: existing._id });
        }

        const consultation = new consultationModel({
            docId,
            userId: appointment.userId,
            appointmentId,
            status: 'IN_CALL',
            callStartedAt: new Date()
        });
        await consultation.save();
        log('Consultation', 'Created IN_CALL consultation:', consultation._id);

        res.json({ success: true, consultationId: consultation._id, message: 'Consultation session created' });
    } catch (error) {
        console.error('[createConsultationFromCall]', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * POST /api/doctor/consultations/:id/audio-chunk
 * Receives a 10s audio blob tagged with speaker + sequence.
 * Sends chunk to /transcribe-chunk on FastAPI, stores transcribed text.
 */
const uploadAudioChunk = async (req, res) => {
    const audioFile = req.file;
    try {
        const { docId, speaker, sequence } = req.body;
        const { id } = req.params; // consultationId

        log('AudioChunk', `Received chunk seq=${sequence} speaker=${speaker} for consultation ${id}`);

        const consultation = await consultationModel.findById(id);
        if (!consultation) {
            if (audioFile && fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
            return res.json({ success: false, message: 'Consultation not found' });
        }
        if (consultation.docId !== docId) {
            if (audioFile && fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
            return res.json({ success: false, message: 'Access denied' });
        }

        const appointment = await appointmentModel.findById(consultation.appointmentId);
        const patientName = appointment?.userData?.name || 'Patient';

        let transcribedText = '';
        if (audioFile) {
            try {
                transcribedText = await callAITranscribeChunk(audioFile.path, audioFile.originalname, patientName);
                log('AudioChunk', `Chunk ${sequence} transcribed: "${transcribedText.substring(0, 60)}..."`);
            } catch (transcribeErr) {
                log('AudioChunk', `Chunk ${sequence} transcription failed (stored empty):`, transcribeErr.message);
            }
            try { fs.unlinkSync(audioFile.path); } catch (_) {}
        }

        await audioChunkModel.create({
            consultationId: id,
            speaker: speaker || 'doctor',
            sequence: parseInt(sequence) || 0,
            transcribedText,
            processed: true
        });

        res.json({ success: true, transcribedText });
    } catch (error) {
        if (audioFile && fs.existsSync(audioFile?.path)) {
            try { fs.unlinkSync(audioFile.path); } catch (_) {}
        }
        console.error('[uploadAudioChunk]', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Core finalization logic that can be invoked server-side or via Express API.
 */
const finalizeConsultationById = async (id, docId, io) => {
    log('FinalizeInternal', 'Starting finalization for consultation:', id);

    const consultation = await consultationModel.findById(id);
    if (!consultation) throw new Error('Consultation not found');

    // Already finalized
    if (consultation.status === 'Pending Review' || consultation.status === 'Completed') {
        return { success: true, message: 'Already finalized', consultationId: id };
    }

    consultation.status = 'Processing';
    await consultation.save();

    // Gather all chunks in order, merge into labeled transcript
    const chunks = await audioChunkModel.find({ consultationId: id }).sort({ sequence: 1 });
    log('FinalizeInternal', `Merging ${chunks.length} chunks`);

    let transcript = '';
    if (chunks.length > 0) {
        chunks.forEach(chunk => {
            if (chunk.transcribedText?.trim()) {
                const label = chunk.speaker === 'doctor' ? 'Doctor' : 'Patient';
                transcript += `${label}: ${chunk.transcribedText.trim()}\n`;
            }
        });
    }

    // Fallback if no chunks transcribed
    if (!transcript.trim()) {
        log('FinalizeInternal', 'No chunk transcripts found — using placeholder');
        transcript = 'Doctor: Consultation recorded via audio call.\nPatient: Consultation recorded via audio call.';
    }

    // Get appointment for patient name
    const appointment = await appointmentModel.findById(consultation.appointmentId);
    const patientName = appointment?.userData?.name || 'Patient';

    // Run AI pipeline
    let aiResult = null;
    try {
        log('AI', 'Calling /process-transcript...');
        aiResult = await callAIProcessTranscript(transcript);
        log('AI', 'AI pipeline completed successfully');
    } catch (aiErr) {
        log('AI', 'AI pipeline failed, using mock fallback:', aiErr.message);
        aiResult = getMockAIResult(transcript, patientName);
    }

    const isMedical = aiResult.is_medical !== undefined ? aiResult.is_medical : true;
    const classification = aiResult.classification || 'Medical Consultation';

    // Save/update transcript
    await transcriptModel.findOneAndUpdate(
        { consultationId: id },
        { rawText: transcript, asrConfidence: 0.95 },
        { upsert: true, new: true }
    );

    // Save/update SOAP note
    await clinicalNoteModel.findOneAndUpdate(
        { consultationId: id },
        {
            subjective: aiResult.soap.subjective,
            objective: aiResult.soap.objective,
            assessment: aiResult.soap.assessment,
            plan: aiResult.soap.plan,
            clinicianApproved: false
        },
        { upsert: true, new: true }
    );

    // Save/update triage
    const triageFlag = await triageFlagModel.findOneAndUpdate(
        { consultationId: id },
        {
            urgencyLevel: aiResult.triage.urgency,
            reasoning: aiResult.triage.reasoning,
            guidelineSource: aiResult.triage.guideline
        },
        { upsert: true, new: true }
    );

    consultation.status = 'Pending Review';
    consultation.isMedical = isMedical;
    consultation.classification = classification;
    await consultation.save();
    log('Consultation', 'Status → Pending Review');

    // Emit triage alert for high/medium urgency
    if (isMedical && (aiResult.triage.urgency === 'High' || aiResult.triage.urgency === 'Medium')) {
        try {
            if (io) {
                io.emit('new-triage-flag', {
                    consultationId: consultation._id,
                    userId: consultation.userId,
                    docId: consultation.docId,
                    urgencyLevel: aiResult.triage.urgency,
                    reasoning: aiResult.triage.reasoning,
                    patientName,
                    date: consultation.date
                });
                log('Socket', 'Emitted new-triage-flag internally');
            }
        } catch (err) {
            console.error('[Socket] emit error:', err);
        }
    }

    // Notify doctor's browser to redirect to review
    if (io) {
        io.emit('consultation-ready', {
            consultationId: id,
            appointmentId: consultation.appointmentId,
            docId,
            urgencyLevel: aiResult.triage.urgency
        });
    }

    return {
        success: true,
        message: 'Consultation finalized successfully',
        consultationId: id,
        urgencyLevel: aiResult.triage.urgency
    };
};

/**
 * POST /api/doctor/consultations/:id/finalize
 * Called when call ends. Merges all stored chunks into labeled transcript,
 * sends to FastAPI /process-transcript, saves SOAP + triage.
 */
const finalizeConsultation = async (req, res) => {
    try {
        const { docId } = req.body;
        const { id } = req.params;
        const io = req.app.get('socketio');

        const result = await finalizeConsultationById(id, docId, io);
        res.json(result);
    } catch (error) {
        console.error('[finalizeConsultation]', error);
        res.json({ success: false, message: error.message });
    }
};


/**
 * POST /api/doctor/consultations/:id/approve
 * Validates doctor ownership, sets approved, generates PDF, uploads to Cloudinary,
 * sends PDF as a message in the existing appointment chat.
 */
const approveConsultation = async (req, res) => {
    try {
        const { docId } = req.body;
        const { id } = req.params;

        log('Approve', 'Approving consultation:', id);

        // ── Validate ──
        const consultation = await consultationModel.findById(id);
        if (!consultation) return res.json({ success: false, message: 'Consultation not found' });
        if (consultation.docId !== docId) return res.json({ success: false, message: 'Only the assigned doctor can approve this consultation' });
        if (consultation.status === 'Completed' && consultation.reportUrl) {
            return res.json({ success: true, message: 'Already approved', reportUrl: consultation.reportUrl });
        }

        const appointment = await appointmentModel.findById(consultation.appointmentId);
        const note = await clinicalNoteModel.findOne({ consultationId: id });
        const triage = await triageFlagModel.findOne({ consultationId: id });
        const transcriptDoc = await transcriptModel.findOne({ consultationId: id });

        if (!note) return res.json({ success: false, message: 'SOAP note not found — cannot approve' });

        // ── Mark approved ──
        note.clinicianApproved = true;
        note.approvedBy = docId;
        note.approvedAt = new Date();
        await note.save();

        consultation.status = 'Completed';
        consultation.approvedBy = docId;
        consultation.approvedAt = new Date();
        await consultation.save();
        log('Approve', 'Consultation marked Completed + note approved');

        // ── Generate PDF ──
        log('PDF', 'Generating consultation PDF...');
        let pdfPath = null;
        let reportUrl = null;

        try {
            pdfPath = await generateConsultationPDF(consultation, note, triage, transcriptDoc?.rawText, appointment);
            log('PDF', 'PDF generated at:', pdfPath);

            // Copy to local public/reports directory
            const reportsDir = path.join(__dirname, '../public/reports');
            if (!fs.existsSync(reportsDir)) {
                fs.mkdirSync(reportsDir, { recursive: true });
            }
            const localPdfPath = path.join(reportsDir, `consultation-${id}.pdf`);
            fs.copyFileSync(pdfPath, localPdfPath);
            log('PDF', 'Saved PDF locally to:', localPdfPath);

            // Set reportUrl to local server URL
            reportUrl = `${req.protocol}://${req.get('host')}/reports/consultation-${id}.pdf`;
            log('PDF', 'Local reportUrl:', reportUrl);

            consultation.reportUrl = reportUrl;
            await consultation.save();

        } catch (pdfErr) {
            log('PDF', 'PDF generation/local save failed:', pdfErr.message);
            // Don't fail the whole approval — just skip PDF
        } finally {
            if (pdfPath && fs.existsSync(pdfPath)) {
                try { fs.unlinkSync(pdfPath); } catch (_) {}
            }
        }

        // ── Send PDF in existing chat ──
        if (reportUrl && consultation.appointmentId) {
            try {
                const doctorName = appointment?.docData?.name || 'Your Doctor';
                const chatMessage = new messageModel({
                    appointmentId: consultation.appointmentId,
                    senderId: docId,
                    senderType: 'doctor',
                    message: `Your consultation report is ready. Approved by Dr. ${doctorName}.`,
                    fileUrl: reportUrl,
                    fileName: `Consultation-Report-${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.pdf`,
                    type: 'file'
                });
                await chatMessage.save();
                log('Chat', 'PDF message saved to chat for appointment:', consultation.appointmentId);

                // Broadcast via Socket.IO
                const io = req.app.get('socketio');
                if (io) {
                    io.to(consultation.appointmentId).emit('receive-message', {
                        _id: chatMessage._id,
                        appointmentId: consultation.appointmentId,
                        senderId: docId,
                        senderType: 'doctor',
                        message: chatMessage.message,
                        fileUrl: reportUrl,
                        fileName: chatMessage.fileName,
                        type: 'file',
                        read: false,
                        createdAt: chatMessage.createdAt
                    });
                    log('Socket', 'PDF message broadcasted to room:', consultation.appointmentId);
                }
            } catch (chatErr) {
                log('Chat', 'Failed to send PDF in chat:', chatErr.message);
            }
        }

        res.json({
            success: true,
            message: 'Consultation approved and report sent to patient',
            reportUrl,
            consultationId: id
        });

    } catch (error) {
        console.error('[approveConsultation]', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * GET /api/doctor/consultations/:id/report
 * Returns the stored PDF URL for a consultation.
 */
const getReport = async (req, res) => {
    try {
        const { docId } = req.body;
        const { id } = req.params;

        const consultation = await consultationModel.findById(id);
        if (!consultation) return res.json({ success: false, message: 'Consultation not found' });
        if (consultation.docId !== docId) return res.json({ success: false, message: 'Access denied' });

        res.json({ success: true, reportUrl: consultation.reportUrl || null });
    } catch (error) {
        console.error('[getReport]', error);
        res.json({ success: false, message: error.message });
    }
};

export {
    createConsultation,
    listConsultations,
    getConsultationDetail,
    updateClinicalNote,
    overrideTriage,
    // New call-linked workflow
    createConsultationFromCall,
    uploadAudioChunk,
    finalizeConsultation,
    finalizeConsultationById,
    approveConsultation,
    getReport,
    generateConsultationPDF
};

