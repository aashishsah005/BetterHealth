import mongoose from "mongoose";

const triageFlagSchema = new mongoose.Schema({
    consultationId: { type: String, required: true },
    urgencyLevel: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
    reasoning: { type: String, default: "" },
    guidelineSource: { type: String, default: "" },
    clinicianOverridden: { type: Boolean, default: false },
    clinicianOverrideValue: { type: String }
}, { timestamps: true });

const triageFlagModel = mongoose.models.triageFlag || mongoose.model("triageFlag", triageFlagSchema);

export default triageFlagModel;
