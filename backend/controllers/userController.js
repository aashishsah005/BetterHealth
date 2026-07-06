import validator from 'validator'
import bcrypt from 'bcrypt'
import userModel from '../models/userModel.js'
import jwt from 'jsonwebtoken'
import { v2 as cloudinary } from 'cloudinary'
import appointmentModel from '../models/appointmentModel.js'
import doctorModel from '../models/doctorModel.js'
import razorpay from 'razorpay'
import otpModel from '../models/otpModel.js'
import transporter from '../config/nodemailer.js'
import { OAuth2Client } from 'google-auth-library'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// API to register user
const registerUser = async (req, res) => {

    try {
        const { name, email, password } = req.body
        if (!name || !email || !password) {
            return res.json({ success: false, message: 'Please fill all the details' })
        }

        // validating email format
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: 'Please enter a valid email' })
        }

        // validating strong password
        if (password.length < 8) {
            return res.json({ success: false, message: 'Password must be at least 8 characters long' })
        }

        // hashing strong password
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)
        const userData = {
            name,
            email,
            password: hashedPassword
        }

        const newUser = new userModel(userData)
        const user = await newUser.save()

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString()

        // Save OTP to database (upsert to handle existing OTPs)
        await otpModel.findOneAndUpdate(
            { email },
            { email, otp, createdAt: Date.now() },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        )

        // Send OTP via email (non-blocking)
        transporter.sendMail({
            from: process.env.SMTP_FROM || 'betterhealth@example.com',
            to: email,
            subject: 'BetterHealth Registration OTP',
            text: `Welcome to BetterHealth! Your OTP for registration is: ${otp}. It is valid for 2 minutes.`,
        }).then(() => {
            console.log(`[Development] OTP for ${email} is ${otp}`);
        }).catch((mailError) => {
            console.error("Failed to send OTP email:", mailError.message);
            console.log(`[Development - SMTP Failed] OTP for ${email} is ${otp}`);
        });

        res.json({ success: true, message: 'OTP sent to email', requireOTP: true })
    }
    catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to user login 
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body
        const user = await userModel.findOne({ email })
        if (!user) {
            return res.json({ success: false, message: 'User not found' })
        }
        const isMatch = await bcrypt.compare(password, user.password)
        if (isMatch) {
            // Generate a 6-digit OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString()

            // Save OTP to database (upsert to handle existing OTPs)
            await otpModel.findOneAndUpdate(
                { email },
                { email, otp, createdAt: Date.now() },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            )

            // Send OTP via email (non-blocking)
            transporter.sendMail({
                from: process.env.SMTP_FROM || 'betterhealth@example.com',
                to: email,
                subject: 'BetterHealth Login OTP',
                text: `Your OTP for login is: ${otp}. It is valid for 2 minutes.`,
            }).then(() => {
                console.log(`[Development] OTP for ${email} is ${otp}`);
            }).catch((mailError) => {
                console.error("Failed to send OTP email:", mailError.message);
                console.log(`[Development - SMTP Failed] OTP for ${email} is ${otp}`);
            });

            res.json({ success: true, message: 'OTP sent to email', requireOTP: true })
        } else {
            return res.json({ success: false, message: 'Invalid credentials' })
        }
    }
    catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to verify OTP for login
const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.json({ success: false, message: 'Email and OTP are required' });
        }

        const validOtp = await otpModel.findOne({ email, otp });
        if (!validOtp) {
            return res.json({ success: false, message: 'Invalid or expired OTP' });
        }

        // OTP is valid, find the user
        const user = await userModel.findOne({ email });
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        // Delete the used OTP
        await otpModel.deleteOne({ _id: validOtp._id });

        // Issue JWT token
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
        res.json({ success: true, token });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// API for Google Sign-In
const googleLogin = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.json({ success: false, message: 'Google token is required' });
        }

        // Verify Google token
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { email, name, picture } = payload;

        // Check if user already exists
        let user = await userModel.findOne({ email });
        
        if (!user) {
            // Create a new user if they don't exist
            // Since they use Google, they don't have a password. 
            // We set a random strong password for them so standard login won't work easily without resetting it.
            const salt = await bcrypt.genSalt(10);
            const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
            const hashedPassword = await bcrypt.hash(randomPassword, salt);

            const newUser = new userModel({
                name,
                email,
                password: hashedPassword,
                image: picture // Optionally save Google profile picture
            });
            user = await newUser.save();
        }

        // Issue JWT token
        const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
        res.json({ success: true, token: jwtToken });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// API to get user profile data
const getProfile = async (req, res) => {
    try {
        const { userId } = req.body
        const userData = await userModel.findById(userId).select('-password')

        res.json({ success: true, userData })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to update profile
const updateProfile = async (req, res) => {
    try {
        const { userId, name, phone, address, gender, dob } = req.body
        const imageFile = req.file

        if (!name || !phone || !dob || !gender) {
            return res.json({ success: false, message: "Data Missing" })
        }

        await userModel.findByIdAndUpdate(userId, { name, phone, address, gender, dob })

        if (imageFile) {
            // upload image to cloudinary
            const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: "image" })
            const imageURL = imageUpload.secure_url

            await userModel.findByIdAndUpdate(userId, { image: imageURL })
        }

        res.json({ success: true, message: "Profile Updated" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to book appointment
const bookAppointment = async (req, res) => {
    try {
        const { docId, userId, slotDate, slotTime } = req.body
        const docData = await doctorModel.findById(docId).select('-password')

        if (!docData.available) {
            return res.json({ success: false, message: "Doctor Not Available" })
        }

        let slot_booked = docData.slot_booked

        if (slot_booked[slotDate]) {
            if (slot_booked[slotDate].includes(slotTime)) {
                return res.json({ success: false, message: "Slot Already Booked" })
            } else {
                slot_booked[slotDate].push(slotTime)
            }
        } else {
            slot_booked[slotDate] = []
            slot_booked[slotDate].push(slotTime)
        }

        const userData = await userModel.findById(userId).select('-password')

        // Convert Mongoose Doc to plain object to modify docData safely
        const docInfo = docData.toObject()
        delete docInfo.slot_booked

        const appointmentData = {
            docId,
            userId,
            slotDate,
            slotTime,
            userData,
            docData: docInfo,
            amount: docData.fees,
            date: Date.now()
        }

        const newAppointment = new appointmentModel(appointmentData)
        await newAppointment.save()

        // save new slots data in docData
        await doctorModel.findByIdAndUpdate(docId, { slot_booked })

        res.json({ success: true, message: "Appointment Booked Successfully" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to get user Appointments for frontend my-appointments page
const listAppointment = async (req, res) => {
    try {
        const { userId } = req.body
        const appointments = await appointmentModel.find({ userId })
        res.json({ success: true, appointments })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to cancel appointment
const cancelAppointment = async (req, res) => {
    try {
        const { appointmentId, userId } = req.body
        const appointmentData = await appointmentModel.findById(appointmentId)

        // verify appointment user
        if (!appointmentData) {
            return res.json({ success: false, message: "Appointment not found" })
        }
        if (appointmentData.userId !== userId) {
            return res.json({ success: false, message: "Unauthorized action" })
        }

        await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true })

        // remove slot from docData 
        const { docId, slotDate, slotTime } = appointmentData
        const docData = await doctorModel.findById(docId)
        let slot_booked = docData.slot_booked
        slot_booked[slotDate] = slot_booked[slotDate].filter(e => e !== slotTime)
        await doctorModel.findByIdAndUpdate(docId, { slot_booked })

        res.json({ success: true, message: "Appointment Cancelled Successfully" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const razorpayInstance = new razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
})

// API to make payment of appointment using razorpay
const paymentRazorpay = async (req, res) => {

    try {
        const { appointmentId } = req.body
        const appointmentData = await appointmentModel.findById(appointmentId)

        if (!appointmentId || appointmentData.cancelled) {
            return res.json({ success: false, message: "Appointment Cancelled or Data Missing" })
        }

        // creating options for razorpay payment
        const options = {
            amount: appointmentData.amount * 100,
            currency: process.env.CURRENCY,
            receipt: 'rxp_' + appointmentId,
        }

        // creation of an order
        const order = await razorpayInstance.orders.create(options)

        // sending response to frontend
        res.json({ success: true, order })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })

    }
}

// API to verify payment of razorpay
const verifyRazorpay = async (req, res) => {
    try {
        const { razorpay_order_id } = req.body
        const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id)

        if (orderInfo.status === 'paid') {
            await appointmentModel.findByIdAndUpdate(orderInfo.receipt.replace('rxp_', ''), { payment: true })
            res.json({ success: true, message: "Payment Successful" })
        } else {
            res.json({ success: false, message: "Payment Failed" })
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { registerUser, loginUser, verifyOTP, googleLogin, getProfile, updateProfile, bookAppointment, listAppointment, cancelAppointment, paymentRazorpay, verifyRazorpay }