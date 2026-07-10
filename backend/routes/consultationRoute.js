import express from 'express';
import {
    createConsultation,
    listConsultations,
    getConsultationDetail,
    updateClinicalNote,
    overrideTriage,
    // New call-linked workflow
    createConsultationFromCall,
    uploadAudioChunk,
    finalizeConsultation,
    approveConsultation,
    getReport
} from '../controllers/consultationController.js';
import authDoctor from '../middlewares/authDoctor.js';
import upload from '../middlewares/multer.js';

const consultationRouter = express.Router();

// ── Existing routes (unchanged) ──────────────────────────────────────────────
consultationRouter.post('/create', upload.single('file'), authDoctor, createConsultation);
consultationRouter.get('/list', authDoctor, listConsultations);
consultationRouter.get('/:id', authDoctor, getConsultationDetail);
consultationRouter.put('/:id/note', authDoctor, updateClinicalNote);
consultationRouter.put('/:id/triage', authDoctor, overrideTriage);

// ── New call-linked workflow routes ──────────────────────────────────────────
// Create a consultation session when a call starts
consultationRouter.post('/from-call', authDoctor, createConsultationFromCall);

// Upload a 10s audio chunk with speaker tag
consultationRouter.post('/:id/audio-chunk', upload.single('audio'), authDoctor, uploadAudioChunk);

// Finalize transcript + run AI pipeline when call ends
consultationRouter.post('/:id/finalize', authDoctor, finalizeConsultation);

// Doctor approves → generate PDF → send in chat
consultationRouter.post('/:id/approve', authDoctor, approveConsultation);

// Get generated PDF report URL
consultationRouter.get('/:id/report', authDoctor, getReport);

export default consultationRouter;
