import dns from 'dns'
dns.setDefaultResultOrder('ipv4first')

import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import adminRouter from './routes/adminRoute.js'
import doctorRouter from './routes/doctorRoute.js'
import userRouter from './routes/userRoute.js'
import chatRouter from './routes/chatRoute.js'
import consultationRouter from './routes/consultationRoute.js'
import messageModel from './models/messageModel.js'
import appointmentModel from './models/appointmentModel.js'
import consultationModel from './models/consultationModel.js'
import audioChunkModel from './models/audioChunkModel.js'
import { finalizeConsultationById } from './controllers/consultationController.js'

// app config
const app = express()
const port = process.env.PORT || 4000

// Create HTTP server for Socket.IO
const server = http.createServer(app)

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
})

connectDB()
connectCloudinary()

// Share Socket.IO with express handlers
app.set('socketio', io)

// Middleware
app.use(express.json())
app.use(cors())
app.use('/reports', express.static(path.join(__dirname, 'public/reports')))

// api endpoints
app.use('/api/admin', adminRouter)
app.use('/api/doctor', doctorRouter)
app.use('/api/doctor/consultations', consultationRouter)
app.use('/api/user', userRouter)
app.use('/api/chat', chatRouter)

// we can see added doctors at
// localhost:4000/api/admin/add-doctor

app.get('/', (req, res) => {
    res.send('API working Clearly')
})

// ─── Midnight Cleanup Scheduler ────────────────────────────────────────────────
const deleteClosedAppointments = async () => {
    try {
        const result = await appointmentModel.deleteMany({
            $or: [
                { cancelled: true },
                { isCompleted: true }
            ]
        });
        console.log(`[Midnight Cleanup] Deleted ${result.deletedCount} completed/cancelled appointments.`);
    } catch (error) {
        console.error('[Midnight Cleanup] Error deleting closed appointments:', error);
    }
};

const scheduleMidnightCleanup = () => {
    const now = new Date();
    const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0, 0, 0, 0
    );
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    console.log(`[Scheduler] Midnight cleanup scheduled in ${(msUntilMidnight / 1000 / 60 / 60).toFixed(2)} hours.`);

    setTimeout(async () => {
        await deleteClosedAppointments();
        // Repeat every 24 hours
        setInterval(deleteClosedAppointments, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
};

// Start the midnight scheduler
scheduleMidnightCleanup();

// Test endpoint for immediate cleanup triggering
app.post('/api/admin/cleanup-test', async (req, res) => {
    try {
        const result = await appointmentModel.deleteMany({
            $or: [
                { cancelled: true },
                { isCompleted: true }
            ]
        });
        res.json({ success: true, message: `Cleanup triggered. Deleted ${result.deletedCount} appointments.` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// ─── Socket.IO Event Handling ──────────────────────────────────────────────────

// Track online users: { odId: socketId }
const onlineUsers = new Map()

// Track active calls per appointment: { appointmentId -> { callType, startTime, callerId, callerName } }
const activeCalls = new Map()

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id)

    // Register user/doctor identity
    socket.on('register', ({ odId, role }) => {
        if (odId) {
            onlineUsers.set(odId, { socketId: socket.id, role })
            console.log(`Registered ${role}: ${odId} -> ${socket.id}`)
            // Broadcast active online users list
            io.emit('online-users', Array.from(onlineUsers.keys()))
        }
    })

    // Join an appointment chat room
    socket.on('join-room', ({ appointmentId }) => {
        socket.join(appointmentId)
        console.log(`Socket ${socket.id} joined room: ${appointmentId}`)
    })

    // Leave an appointment chat room
    socket.on('leave-room', ({ appointmentId }) => {
        socket.leave(appointmentId)
        console.log(`Socket ${socket.id} left room: ${appointmentId}`)
    })

    // Handle sending a message
    socket.on('send-message', async ({ appointmentId, senderId, senderType, message }) => {
        try {
            // Save message to database
            const newMessage = new messageModel({
                appointmentId,
                senderId,
                senderType,
                message
            })
            await newMessage.save()

            // Broadcast to the room (including sender for confirmation)
            io.to(appointmentId).emit('receive-message', {
                _id: newMessage._id,
                appointmentId,
                senderId,
                senderType,
                message,
                read: false,
                createdAt: newMessage.createdAt
            })
        } catch (error) {
            console.log('Socket send-message error:', error)
            socket.emit('message-error', { error: 'Failed to send message' })
        }
    })

    // Typing indicator
    socket.on('typing', ({ appointmentId, senderId, senderType }) => {
        socket.to(appointmentId).emit('user-typing', { senderId, senderType })
    })

    socket.on('stop-typing', ({ appointmentId, senderId, senderType }) => {
        socket.to(appointmentId).emit('user-stop-typing', { senderId, senderType })
    })

    // ─── Call Signaling Helpers & Handlers ─────────────────────────────────────

    const handleCallEndedInternal = async (appointmentId, enderId) => {
        const callData = activeCalls.get(appointmentId)
        if (!callData) return

        activeCalls.delete(appointmentId)
        console.log(`[Socket] Ending active call for appt ${appointmentId} initiated by ${enderId}`)

        // Broadcast to direct recipient + room
        try {
            const appointment = await appointmentModel.findById(appointmentId)
            if (appointment) {
                const recipientId = appointment.docId === enderId ? appointment.userId : appointment.docId
                const recipientData = onlineUsers.get(recipientId)
                if (recipientData && recipientData.socketId) {
                    io.to(recipientData.socketId).emit('call-ended', {
                        appointmentId,
                        enderId
                    })
                }
            }
        } catch (err) {
            console.error('[Socket cleanup] error notifying recipient:', err.message)
        }

        io.to(appointmentId).emit('call-ended', {
            appointmentId,
            enderId
        })

        // Build human-readable call summary
        const callType = callData.callType || 'video'
        const durationSec = callData.startTime
            ? Math.round((Date.now() - callData.startTime) / 1000)
            : 0
        const mins = Math.floor(durationSec / 60)
        const secs = durationSec % 60
        const durationStr = durationSec > 0
            ? `${mins > 0 ? `${mins}m ` : ''}${secs}s`
            : 'ended'
        const callLabel = callType === 'video' ? 'Video call' : 'Audio call'
        const logMessage = `${callLabel} • ${durationStr}`
        const senderType = callData.senderType || 'doctor'

        try {
            const callLog = new messageModel({
                appointmentId,
                senderId: enderId || 'system',
                senderType,
                message: logMessage,
                type: 'call',
                callType,
                callDuration: durationSec
            })
            await callLog.save()

            // Broadcast call log to both parties in the room
            io.to(appointmentId).emit('receive-message', {
                _id: callLog._id,
                appointmentId,
                senderId: enderId || 'system',
                senderType,
                message: logMessage,
                type: 'call',
                callType,
                callDuration: durationSec,
                createdAt: callLog.createdAt
            })
            console.log(`[Socket] Call log saved for appt ${appointmentId}: "${logMessage}"`)
        } catch (err) {
            console.error('[Socket] Failed to save call log:', err)
        }

        // Trigger AI finalization of any active IN_CALL consultation for this appointment
        try {
            const activeConsultation = await consultationModel.findOne({
                appointmentId,
                status: 'IN_CALL'
            })
            if (activeConsultation) {
                console.log(`[Socket] Found active consultation ${activeConsultation._id} on call end. Finalizing...`)
                // Run finalization asynchronously so socket callback returns immediately
                finalizeConsultationById(activeConsultation._id.toString(), activeConsultation.docId, io)
                    .then(res => console.log(`[Socket] Asynchronous finalization complete for consultation ${activeConsultation._id}:`, res))
                    .catch(err => console.error(`[Socket] Asynchronous finalization failed for consultation ${activeConsultation._id}:`, err.message))
            }
        } catch (err) {
            console.error('[Socket] Finalization trigger failed on call end:', err.message)
        }
    }

    // Initiate a call — auto-create a consultation session
    socket.on('call-user', async ({ appointmentId, callerId, callerPeerId, callerName, callerImage, callerType, callType }) => {
        console.log(`[Socket] call-user received for appt ${appointmentId}. Peer: ${callerPeerId}`)

        // Track this call start time and type
        activeCalls.set(appointmentId, {
            callType: callType || 'video',
            startTime: Date.now(),
            callerId,
            callerName,
            senderType: callerType === 'doctor' ? 'doctor' : 'user'
        })

        // Auto-create a consultation in IN_CALL status (only doctor initiates)
        let consultationId = null
        if (callerType === 'doctor' && callerId && appointmentId) {
            try {
                const appointment = await appointmentModel.findById(appointmentId)
                if (appointment && appointment.docId === callerId) {
                    // Check for recent active session
                    const existing = await consultationModel.findOne({
                        appointmentId,
                        status: 'IN_CALL',
                        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
                    })

                    if (existing) {
                        consultationId = existing._id.toString()
                        console.log(`[Socket] Reusing existing consultation: ${consultationId}`)
                    } else {
                        const newConsultation = new consultationModel({
                            docId: callerId,
                            userId: appointment.userId,
                            appointmentId,
                            status: 'IN_CALL',
                            callStartedAt: new Date()
                        })
                        await newConsultation.save()
                        consultationId = newConsultation._id.toString()
                        console.log(`[Socket] Auto-created consultation: ${consultationId}`)
                    }

                    // Notify the caller socket directly to prevent race conditions
                    socket.emit('consultation-created', {
                        consultationId,
                        appointmentId
                    })

                    // Notify the room
                    io.to(appointmentId).emit('consultation-created', {
                        consultationId,
                        appointmentId
                    })
                }
            } catch (err) {
                console.error('[Socket] Failed to auto-create consultation:', err.message)
            }
        }

        // Direct delivery + room broadcast to make sure the event is received
        try {
            const appointment = await appointmentModel.findById(appointmentId)
            if (appointment) {
                const recipientId = callerType === 'doctor' ? appointment.userId : appointment.docId
                const recipientData = onlineUsers.get(recipientId)
                if (recipientData && recipientData.socketId) {
                    io.to(recipientData.socketId).emit('incoming-call', {
                        appointmentId,
                        callerId,
                        callerPeerId,
                        callerName,
                        callerImage,
                        callerType,
                        callType
                    })
                    console.log(`[Socket] Sent incoming-call directly to recipient ${recipientId}`)
                }
            }
        } catch (err) {
            console.error('[Socket] call-user lookup error:', err.message)
        }

        // Broadcast call to the room
        socket.to(appointmentId).emit('incoming-call', {
            appointmentId,
            callerId,
            callerPeerId,
            callerName,
            callerImage,
            callerType,
            callType
        })
    })

    // Accept a call
    socket.on('call-accepted', async ({ appointmentId, accepterId, accepterPeerId, accepterName }) => {
        console.log(`[Socket] call-accepted received for appt ${appointmentId}. Peer: ${accepterPeerId}`)
        
        // Auto-create a consultation in IN_CALL status (if doctor accepted and not already created)
        let consultationId = null
        try {
            const appointment = await appointmentModel.findById(appointmentId)
            if (appointment) {
                if (appointment.docId === accepterId) {
                    const existing = await consultationModel.findOne({
                        appointmentId,
                        status: 'IN_CALL',
                        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
                    })

                    if (existing) {
                        consultationId = existing._id.toString()
                        console.log(`[Socket] call-accepted: Reusing existing consultation: ${consultationId}`)
                    } else {
                        const newConsultation = new consultationModel({
                            docId: appointment.docId,
                            userId: appointment.userId,
                            appointmentId,
                            status: 'IN_CALL',
                            callStartedAt: new Date()
                        })
                        await newConsultation.save()
                        consultationId = newConsultation._id.toString()
                        console.log(`[Socket] call-accepted: Auto-created consultation: ${consultationId}`)
                    }

                    // Notify accepter socket directly
                    socket.emit('consultation-created', {
                        consultationId,
                        appointmentId
                    })

                    // Notify the room
                    io.to(appointmentId).emit('consultation-created', {
                        consultationId,
                        appointmentId
                    })
                }
            }
        } catch (err) {
            console.error('[Socket] call-accepted auto-create consultation failed:', err.message)
        }

        // Direct delivery + room broadcast
        try {
            const appointment = await appointmentModel.findById(appointmentId)
            if (appointment) {
                const recipientId = appointment.docId === accepterId ? appointment.userId : appointment.docId
                const recipientData = onlineUsers.get(recipientId)
                if (recipientData && recipientData.socketId) {
                    io.to(recipientData.socketId).emit('call-accepted', {
                        appointmentId,
                        accepterId,
                        accepterPeerId,
                        accepterName
                    })
                    console.log(`[Socket] Sent call-accepted directly to recipient ${recipientId}`)
                }
            }
        } catch (err) {
            console.error('[Socket] call-accepted lookup error:', err.message)
        }

        socket.to(appointmentId).emit('call-accepted', {
            appointmentId,
            accepterId,
            accepterPeerId,
            accepterName
        })
    })

    // Reject a call
    socket.on('call-rejected', async ({ appointmentId, rejecterId }) => {
        // Direct delivery + room broadcast
        try {
            const appointment = await appointmentModel.findById(appointmentId)
            if (appointment) {
                const recipientId = appointment.docId === rejecterId ? appointment.userId : appointment.docId
                const recipientData = onlineUsers.get(recipientId)
                if (recipientData && recipientData.socketId) {
                    io.to(recipientData.socketId).emit('call-rejected', {
                        appointmentId,
                        rejecterId
                    })
                }
            }
        } catch (err) {
            console.error('[Socket] call-rejected lookup error:', err.message)
        }

        socket.to(appointmentId).emit('call-rejected', {
            appointmentId,
            rejecterId
        })
    })

    // End a call
    socket.on('call-ended', async ({ appointmentId, enderId }) => {
        await handleCallEndedInternal(appointmentId, enderId)
    })

    // WebRTC signaling
    socket.on('webrtc-offer', ({ appointmentId, offer }) => {
        socket.to(appointmentId).emit('webrtc-offer', { offer })
    })

    socket.on('webrtc-answer', ({ appointmentId, answer }) => {
        socket.to(appointmentId).emit('webrtc-answer', { answer })
    })

    socket.on('webrtc-ice-candidate', ({ appointmentId, candidate }) => {
        socket.to(appointmentId).emit('webrtc-ice-candidate', { candidate })
    })

    // Handle disconnect
    socket.on('disconnect', async () => {
        let disconnectedId = null
        for (const [odId, data] of onlineUsers.entries()) {
            if (data.socketId === socket.id) {
                disconnectedId = odId
                onlineUsers.delete(odId)
                console.log(`Unregistered: ${odId}`)
                break
            }
        }

        if (disconnectedId) {
            // Broadcast updated online list
            io.emit('online-users', Array.from(onlineUsers.keys()))

            // Clean up active calls involving this user
            for (const [appointmentId, callData] of activeCalls.entries()) {
                if (callData.callerId === disconnectedId) {
                    await handleCallEndedInternal(appointmentId, disconnectedId)
                } else {
                    try {
                        const appointment = await appointmentModel.findById(appointmentId)
                        if (appointment && (appointment.userId === disconnectedId || appointment.docId === disconnectedId)) {
                            await handleCallEndedInternal(appointmentId, disconnectedId)
                        }
                    } catch (err) {
                        console.error('[Socket disconnect] activeCall lookup error:', err.message)
                    }
                }
            }
        }
        console.log('Socket disconnected:', socket.id)
    })
})

// ─── Start Server ──────────────────────────────────────────────────────────────

server.listen(port, () => console.log("Server Running", port))