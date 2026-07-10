import mongoose from "mongoose";

// Stores each 10-second audio chunk from a call consultation
const audioChunkSchema = new mongoose.Schema({
    consultationId: { type: String, required: true, index: true },
    speaker: { type: String, enum: ['doctor', 'patient'], required: true },
    sequence: { type: Number, required: true },     // ordering index (0, 1, 2 ...)
    transcribedText: { type: String, default: '' }, // text after ASR processing
    processed: { type: Boolean, default: false }
}, { timestamps: true });

const audioChunkModel = mongoose.models.audioChunk || mongoose.model("audioChunk", audioChunkSchema);

export default audioChunkModel;
