const transporter = {
  sendMail: async ({ from, to, subject, text, html }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not defined in environment variables");
    }

    // For Resend free tier onboarding, if you haven't verified a domain, 
    // you must send FROM 'onboarding@resend.dev'.
    const sender = process.env.RESEND_FROM || 'onboarding@resend.dev';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: sender,
        to: Array.isArray(to) ? to : [to],
        subject,
        text,
        html: html || `<p>${text}</p>`
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Resend API error: ${response.status} - ${errText}`);
    }

    return await response.json();
  }
};

export default transporter;
