require('dotenv').config();
const nodemailer = require('nodemailer');

// 1) Configura el transporter con SMTP de Gmail
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,            // smtp.gmail.com
  port: Number(process.env.EMAIL_PORT),    // 587
  secure: false,                           // usa TLS
  auth: {
    user: process.env.EMAIL_USER,          // tuCuenta@gmail.com
    pass: process.env.EMAIL_PASS,          // contraseña de app de Google
  },
  tls: {
    rejectUnauthorized: false,  // ← AÑADE ESTO
  },
});

// 2) Verifica conexión (opcional, al iniciar la app)
transporter.verify()
  .then(() => console.log('✅ SMTP Gmail listo para enviar'))
  .catch(err => console.error('❌ Error SMTP Gmail:', err));

// 3) Función concreta para enviar email de bienvenida
async function sendWelcomeEmail(to, nombre) {
  const mailOptions = {
    from: `"Tu App" <${process.env.EMAIL_USER}>`,
    to,                                      // email del nuevo usuario
    subject: '¡Bienvenido a Tu App!',
    html: `
      <div style="font-family: sans-serif; line-height: 1.5;">
        <h2>Hola ${nombre},</h2>
        <p>¡Gracias por registrarte en nuestra plataforma!</p>
        <p>Para iniciar sesión, haz clic aquí:
          <a href="https://tuapp.com/login">Iniciar Sesión</a>
        </p>
        <hr/>
        <p style="font-size: 0.8em; color: #666;">
          Si no creaste esta cuenta, ignora este correo.
        </p>
      </div>
    `,
  };

  // 4) Envía el correo y retorna la promesa
  return transporter.sendMail(mailOptions);
}

module.exports = { sendWelcomeEmail };
