import mongoose from "mongoose";

const consultationSchema = new mongoose.Schema({
    docId: { type: String, required: true },
    userId: { type: String, required: true }, // patient id (links to userModel)
    appointmentId: { type: String }, // optional linked appointment
    date: { type: Date, default: Date.now },
    audioUrl: { type: String },
    reportUrl: { type: String },          // Cloudinary URL of generated PDF
    approvedBy: { type: String },          // docId of approving doctor
    approvedAt: { type: Date },
    callStartedAt: { type: Date },         // when the call began
    status: { 
        type: String, 
        enum: ['IN_CALL', 'Recording', 'Processing', 'Pending Review', 'Completed', 'Rejected'], 
        default: 'Processing' 
    },
    isMedical: { type: Boolean, default: true },
    classification: { type: String, default: 'Medical Consultation' }
}, { timestamps: true });

const consultationModel = mongoose.models.consultation || mongoose.model("consultation", consultationSchema);

export default consultationModel;

