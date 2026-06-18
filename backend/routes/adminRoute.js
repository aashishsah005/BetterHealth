import express from 'express'
import { addDoctor, loginAdmin, allDoctors, allAppointments, appointmentCancel, adminDashboard } from '../controllers/adminController.js'
import upload from '../middlewares/multer.js'
import authAdmin from '../middlewares/authAdmin.js'
import { changeAvailability } from '../controllers/doctorController.js'

const adminRouter=express.Router()

adminRouter.post('/add-doctor',authAdmin,upload.single('image'),addDoctor)
adminRouter.post('/login',loginAdmin)
adminRouter.post('/all-doctors',authAdmin,allDoctors)
adminRouter.post('/change-availability',authAdmin,changeAvailability)
adminRouter.get('/all-appointments',authAdmin,allAppointments)
adminRouter.post('/cancel-appointment',authAdmin,appointmentCancel)
adminRouter.get('/admin-dashboard',authAdmin,adminDashboard)

export default adminRouter