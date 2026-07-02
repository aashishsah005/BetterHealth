import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import 'dotenv/config'
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'
import adminRouter from './routes/adminRoute.js'
import doctorRouter from './routes/doctorRoute.js'
import userRouter from './routes/userRoute.js'
import chatRouter from './routes/chatRoute.js'
import messageModel from './models/messageModel.js'
import appointmentModel from './models/appointmentModel.js'

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

// Middleware
app.use(express.json())
app.use(cors())

// api endpoints
app.use('/api/admin', adminRouter)
app.use('/api/doctor', doctorRouter)
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

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id)

    // Register user/doctor identity
    socket.on('register', ({ odId, role }) => {
        if (odId) {
            onlineUsers.set(odId, { socketId: socket.id, role })
            console.log(`Registered ${role}: ${odId} -> ${socket.id}`)
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

    // ─── Call Signaling ─────────────────────────────────────────────────────────

    // Initiate a call
    socket.on('call-user', ({ appointmentId, callerId, callerName, callerImage, callerType, callType }) => {
        // Broadcast call to the room (the other party will pick it up)
        socket.to(appointmentId).emit('incoming-call', {
            appointmentId,
            callerId,
            callerName,
            callerImage,
            callerType,
            callType
        })
    })

    // Accept a call
    socket.on('call-accepted', ({ appointmentId, accepterId, accepterName }) => {
        socket.to(appointmentId).emit('call-accepted', {
            appointmentId,
            accepterId,
            accepterName
        })
    })

    // Reject a call
    socket.on('call-rejected', ({ appointmentId, rejecterId }) => {
        socket.to(appointmentId).emit('call-rejected', {
            appointmentId,
            rejecterId
        })
    })

    // End a call
    socket.on('call-ended', ({ appointmentId, enderId }) => {
        socket.to(appointmentId).emit('call-ended', {
            appointmentId,
            enderId
        })
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
    socket.on('disconnect', () => {
        // Remove from online users
        for (const [odId, data] of onlineUsers.entries()) {
            if (data.socketId === socket.id) {
                onlineUsers.delete(odId)
                console.log(`Unregistered: ${odId}`)
                break
            }
        }
        console.log('Socket disconnected:', socket.id)
    })
})

// ─── Start Server ──────────────────────────────────────────────────────────────

server.listen(port, () => console.log("Server Running", port))