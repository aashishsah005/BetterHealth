const transporter = {
  sendMail: async ({ from, to, subject, text, html }) => {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      throw new Error("BREVO_API_KEY is not defined in environment variables");
    }

    // Brevo requires a verified sender email. 
    // Your Brevo signup email is automatically verified.
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'aashishsah005@gmail.com';
    const senderName = process.env.BREVO_SENDER_NAME || 'BetterHealth';

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail
        },
        to: [
          {
            email: to
          }
        ],
        subject,
        textContent: text,
        htmlContent: html || `<p>${text}</p>`
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Brevo API error: ${response.status} - ${errText}`);
    }

    return await response.json();
  }
};

export default transporter;


/*

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

*/