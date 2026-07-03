# BetterHealth 🏥

BetterHealth is a comprehensive Doctor Appointment Booking Application that connects patients with healthcare professionals. It features a beautifully designed patient-facing interface, a dedicated admin panel for managing the platform, and secure authentication methods including Google OAuth and OTP-based verification.

## 🌟 Key Features

### 🧑‍⚕️ For Patients
- **Easy Appointment Booking**: Browse doctors by specialty and book appointments seamlessly.
- **Secure Authentication**: Traditional Email/Password login, highly secure **Google Sign-In**, and **OTP-based Two-Factor Authentication**.
- **User Dashboard**: Manage your profile, view upcoming appointments, and cancel bookings.
- **Real-time Chat/Calls**: Integrated Socket.IO support for real-time communication.
- **Payment Integration**: Secure online payments via Razorpay.

### 🛡️ For Administrators
- **Doctor Management**: Add, update, and manage doctor profiles and specialties.
- **Global Dashboard**: View platform analytics, manage appointments, and oversee user activity.
- **Automated Cleanups**: Midnight cron-jobs automatically clear out completed and cancelled appointments.

## 💻 Tech Stack

- **Frontend**: React.js, Vite, TailwindCSS, React Router
- **Backend**: Node.js, Express.js, Socket.IO
- **Database**: MongoDB (Mongoose)
- **Authentication**: JWT (JSON Web Tokens), Google Auth Library, `@react-oauth/google`
- **Email/OTP**: Nodemailer (SMTP)
- **Payments**: Razorpay
- **Image Storage**: Cloudinary

## 📁 Project Structure

The project is structured as a full-stack monorepo containing three main directories:

- `/frontend` - The patient-facing React application.
- `/admin` - The administrator-facing React application.
- `/backend` - The Node/Express API serving both frontends.

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone <your-repository-url>
cd BetterHealth
```

### 2. Environment Variables setup
You will need to create `.env` files in all three directories (`frontend`, `admin`, `backend`). 

**Backend (`backend/.env`):**
```env
PORT=4000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
CLOUDINARY_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_SECRET_KEY=your_cloudinary_secret_key
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
CURRENCY=INR

# Email Configuration (For OTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="BetterHealth <your_email@gmail.com>"

# Google OAuth Config
GOOGLE_CLIENT_ID=your_google_client_id
```

**Frontend (`frontend/.env`):**
```env
VITE_BACKEND_URL=http://localhost:4000
VITE_RAZORPAY_KEY_ID=your_razorpay_key
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

### 3. Installation & Running

You will need to run the development servers for the backend, frontend, and admin panel simultaneously.

**Terminal 1: Backend**
```bash
cd backend
npm install
npm run dev
```

**Terminal 2: Frontend (Patient App)**
```bash
cd frontend
npm install
npm run dev
```

**Terminal 3: Admin Panel**
```bash
cd admin
npm install
npm run dev
```

## 🔒 Google Sign-In Setup Notes
To ensure Google Sign-In works properly on your local environment:
1. Ensure your Client ID does **not** have surrounding quotes in the `.env` file.
2. Ensure you have added `http://localhost:5173` to the **Authorized JavaScript origins** in your Google Cloud Console.
3. Access the frontend app using `http://localhost:5173` rather than a local network IP address.

---
*Built with ❤️ for Better Healthcare*
