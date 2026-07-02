import messageModel from '../models/messageModel.js'
import appointmentModel from '../models/appointmentModel.js'

// Get chat history for an appointment
const getMessages = async (req, res) => {
    try {
        const { appointmentId } = req.params
        const { userId, docId } = req.body

        // Verify the requester is part of this appointment
        const appointment = await appointmentModel.findById(appointmentId)
        if (!appointment) {
            return res.json({ success: false, message: 'Appointment not found' })
        }

        const requesterId = userId || docId
        if (appointment.userId !== requesterId && appointment.docId !== requesterId) {
            return res.json({ success: false, message: 'Unauthorized access' })
        }

        const messages = await messageModel.find({ appointmentId }).sort({ createdAt: 1 })

        // Mark unread messages as read for the requester
        const senderTypeToMark = userId ? 'doctor' : 'user'
        await messageModel.updateMany(
            { appointmentId, senderType: senderTypeToMark, read: false },
            { read: true }
        )

        res.json({ success: true, messages })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Send a message (REST fallback — primary is via Socket.IO)
const sendMessage = async (req, res) => {
    try {
        const { appointmentId, message, userId, docId } = req.body

        // Determine sender
        const senderId = userId || docId
        const senderType = userId ? 'user' : 'doctor'

        if (!appointmentId || !message) {
            return res.json({ success: false, message: 'Missing required fields' })
        }

        // Verify appointment exists and sender is part of it
        const appointment = await appointmentModel.findById(appointmentId)
        if (!appointment) {
            return res.json({ success: false, message: 'Appointment not found' })
        }

        if (appointment.userId !== senderId && appointment.docId !== senderId) {
            return res.json({ success: false, message: 'Unauthorized access' })
        }

        const newMessage = new messageModel({
            appointmentId,
            senderId,
            senderType,
            message
        })

        await newMessage.save()

        res.json({ success: true, message: 'Message sent', data: newMessage })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Get unread message count for an appointment
const getUnreadCount = async (req, res) => {
    try {
        const { appointmentId } = req.params
        const { userId, docId } = req.body

        const senderTypeToCount = userId ? 'doctor' : 'user'

        const count = await messageModel.countDocuments({
            appointmentId,
            senderType: senderTypeToCount,
            read: false
        })

        res.json({ success: true, count })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { getMessages, sendMessage, getUnreadCount }
