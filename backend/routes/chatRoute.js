import express from 'express'
import { getMessages, sendMessage, getUnreadCount, uploadChatFile } from '../controllers/chatController.js'
import authUser from '../middlewares/authUser.js'
import authDoctor from '../middlewares/authDoctor.js'
import upload from '../middlewares/multer.js'

const chatRouter = express.Router()

// Patient routes
chatRouter.get('/messages/:appointmentId', authUser, getMessages)
chatRouter.post('/send', authUser, sendMessage)
chatRouter.get('/unread/:appointmentId', authUser, getUnreadCount)
chatRouter.post('/upload', upload.single('file'), authUser, uploadChatFile)

// Doctor routes (uses dtoken header)
chatRouter.get('/doctor/messages/:appointmentId', authDoctor, getMessages)
chatRouter.post('/doctor/send', authDoctor, sendMessage)
chatRouter.get('/doctor/unread/:appointmentId', authDoctor, getUnreadCount)
chatRouter.post('/doctor/upload', upload.single('file'), authDoctor, uploadChatFile)

export default chatRouter
