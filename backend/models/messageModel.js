import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    appointmentId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    senderType: { type: String, enum: ['user', 'doctor'], required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false }
}, { timestamps: true })

const messageModel = mongoose.models.message || mongoose.model("message", messageSchema)

export default messageModel
