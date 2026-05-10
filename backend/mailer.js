const nodemailer = require("nodemailer");

// ⚠️ сюда вставишь свой email
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "YOUR_EMAIL@gmail.com",
    pass: "YOUR_APP_PASSWORD"
  }
});

async function sendCode(email, code) {
  await transporter.sendMail({
    from: "Noble Messenger <YOUR_EMAIL@gmail.com>",
    to: email,
    subject: "Ваш код входа",
    text: `Ваш код: ${code}`
  });

  console.log("Code sent to:", email);
}

module.exports = { sendCode };