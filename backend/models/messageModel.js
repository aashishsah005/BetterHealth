import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    appointmentId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    senderType: { type: String, enum: ['user', 'doctor', 'system'], required: true },
    message: { type: String, default: "" },
    fileUrl: { type: String },
    fileName: { type: String },
    type: { type: String, enum: ['text', 'file', 'call'], default: 'text' },
    callType: { type: String, enum: ['audio', 'video'] },
    callDuration: { type: Number }, // duration in seconds
    read: { type: Boolean, default: false }
}, { timestamps: true })

const messageModel = mongoose.models.message || mongoose.model("message", messageSchema)

export default messageModel

