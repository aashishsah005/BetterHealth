import express from 'express'
import { getMessages, sendMessage, getUnreadCount } from '../controllers/chatController.js'
import authUser from '../middlewares/authUser.js'
import authDoctor from '../middlewares/authDoctor.js'

const chatRouter = express.Router()

// Patient routes
chatRouter.get('/messages/:appointmentId', authUser, getMessages)
chatRouter.post('/send', authUser, sendMessage)
chatRouter.get('/unread/:appointmentId', authUser, getUnreadCount)

// Doctor routes (uses dtoken header)
chatRouter.get('/doctor/messages/:appointmentId', authDoctor, getMessages)
chatRouter.post('/doctor/send', authDoctor, sendMessage)
chatRouter.get('/doctor/unread/:appointmentId', authDoctor, getUnreadCount)

export default chatRouter
