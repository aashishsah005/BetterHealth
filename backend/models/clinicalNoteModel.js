import mongoose from "mongoose";

const clinicalNoteSchema = new mongoose.Schema({
    consultationId: { type: String, required: true },
    subjective: { type: String, default: "" },
    objective: { type: String, default: "" },
    assessment: { type: String, default: "" },
    plan: { type: String, default: "" },
    clinicianApproved: { type: Boolean, default: false },
    approvedBy: { type: String },   // docId
    approvedAt: { type: Date }
}, { timestamps: true });

const clinicalNoteModel = mongoose.models.clinicalNote || mongoose.model("clinicalNote", clinicalNoteSchema);

export default clinicalNoteModel;

