import mongoose from 'mongoose';
import 'dotenv/config';
import doctorModel from './models/doctorModel.js';
import appointmentModel from './models/appointmentModel.js';

const getDoctorId = async () => {
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/betterhealth`);
        const doc = await doctorModel.findOne({ email: 'richard@betterhealth.com' });
        console.log(`Dr. Richard James ID: ${doc._id}`);

        const appt = await appointmentModel.findOne({ "userData.name": "Aashish Sah" });
        console.log(`Appointment details for Aashish Sah:`);
        console.log(`- docId in appointment: ${appt.docId}`);
        console.log(`- docData in appointment:`, appt.docData);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

getDoctorId();
