//  require('dotenv').config();
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

console.log("RESEND_API_KEY:", process.env.RESEND_API_KEY ? "✔️ cargada" : "❌ no definida");



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

/**
 * Enviar correo con link para restablecer contraseña
 * @param {string} to - Email del destinatario
 * @param {string} name - Nombre del usuario
 * @param {string} resetLink - Link con el token de reseteo
 */
const sendPasswordResetEmail = async (to, name, resetLink) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Zoom Caller <onboarding@resend.dev>',
      to,
      subject: 'Restablecer tu contraseña',
      html: `
        <div style="font-family: Arial; text-align: center;">
          <h2>Hola, ${name}</h2>
          <p>Recibimos una solicitud para restablecer tu contraseña.</p>
          <p>
            <a href="${resetLink}" style="display:inline-block;padding:10px 20px;background:#2563EB;color:#fff;text-decoration:none;border-radius:6px;">
              Restablecer contraseña
            </a>
          </p>
          <p>Este link expira en 1 hora. Si no pediste este cambio, podés ignorar este correo.</p>
          <br />
          <small>© ${new Date().getFullYear()} Zoom Caller</small>
        </div>
      `,
    });

    if (error) throw error;
    console.log(`✅ Correo de reseteo enviado a ${to}`, data);
  } catch (err) {
    console.error(`❌ Error al enviar correo de reseteo a ${to}:`, err);
    throw err;
  }
};

module.exports = { sendWelcomeEmail, sendPasswordResetEmail };
