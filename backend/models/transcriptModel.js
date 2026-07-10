import mongoose from "mongoose";

const transcriptSchema = new mongoose.Schema({
    consultationId: { type: String, required: true },
    rawText: { type: String, required: true },
    asrConfidence: { type: Number, default: 1.0 }
}, { timestamps: true });

const transcriptModel = mongoose.models.transcript || mongoose.model("transcript", transcriptSchema);

export default transcriptModel;
