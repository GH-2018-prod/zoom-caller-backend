// testEmail.js
require('dotenv').config();
const { sendWelcomeEmail } = require('./utils/emailService');

async function probarEnvio() {
  try {
    await sendWelcomeEmail('caralvaanto@gmail.com', 'Usuario de Prueba');
    console.log('✅ Correo de prueba enviado correctamente.');
  } catch (err) {
    console.error('❌ Error al enviar correo de prueba:', err);
  }
}

probarEnvio();