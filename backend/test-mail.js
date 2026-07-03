import 'dotenv/config';
import transporter from './config/nodemailer.js';

async function testMail() {
    try {
        await transporter.verify();
        console.log("Mail connection successful!");
    } catch (e) {
        console.error("Mail connection failed:", e);
    }
}
testMail();
