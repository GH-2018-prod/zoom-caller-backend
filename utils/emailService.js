 require('dotenv').config();

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Enviar correo de bienvenida con Resend
 * @param {string} to - Email del destinatario
 * @param {string} name - Nombre del usuario
 */
const sendWelcomeEmail = async (to, name) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Zoom Caller <onboarding@resend.dev>', // 👉 puedes usar un dominio verificado o "onresend.com"
      to,
      subject: '🎉 ¡Bienvenido a Zoom Caller!',
      html: `
        <div style="font-family: Arial; text-align: center;">
          <h2>¡Hola, ${name}!</h2>
          <p>Gracias por registrarte en nuestra plataforma 🎓</p>
          <p>Esperamos que disfrutes de todas las funciones.</p>
          <br />
          <small>© ${new Date().getFullYear()} Zoom Caller</small>
        </div>
      `,
    });

    if (error) throw error;
    console.log(`✅ Correo enviado a ${to}`, data);
  } catch (err) {
    console.error(`❌ Error al enviar correo a ${to}:`, err);
  }
};

module.exports = { sendWelcomeEmail };
