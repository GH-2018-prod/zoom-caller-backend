if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const webpush = require('web-push')
const PushSubscription = require('../models/PushSubscription')

// Si falta alguna VAPID key, dejamos el push desactivado con un aviso en
// vez de tirar abajo TODO el servidor (login, usuarios, pagos, etc.) por
// una variable de entorno mal configurada — ya paso una vez.
const vapidConfigured =
  process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY

if (vapidConfigured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
} else {
  console.warn(
    '⚠ Notificaciones push desactivadas: faltan VAPID_SUBJECT/VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY en las variables de entorno.'
  )
}

// Manda un push a TODOS los dispositivos suscriptos de un usuario. Si un
// dispositivo ya no acepta el endpoint (410/404 — el usuario desinstalo la
// PWA o revoco el permiso), se borra esa suscripcion en vez de reintentar.
const sendPushToUser = async (userId, payload) => {
  if (!vapidConfigured) return

  const subscriptions = await PushSubscription.find({ userId })

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload)
        )
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id })
        } else {
          console.error('Error enviando push:', error.message)
        }
      }
    })
  )
}

module.exports = { sendPushToUser }
