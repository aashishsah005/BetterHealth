import mongoose from 'mongoose';
import 'dotenv/config';
import appointmentModel from './models/appointmentModel.js';
import userModel from './models/userModel.js';

const testUser = async () => {
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/betterhealth`);
        const appt = await appointmentModel.findOne({ "userData.name": "Aashish Sah" });
        console.log("Appointment userData:", appt.userData);
        
        const user = await userModel.findOne({ name: "Aashish Sah" });
        console.log("User dob:", user?.dob);
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

testUser();
