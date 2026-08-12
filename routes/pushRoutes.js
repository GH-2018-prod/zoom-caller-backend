const express = require('express')
const router = express.Router()

const PushSubscription = require('../models/PushSubscription')
const { protect } = require('../middleware/usersMiddleware')

// Clave publica VAPID — el frontend la necesita para pedir la suscripcion
// al navegador. No es secreta (por eso no hace falta auth para pedirla).
router.get('/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY })
})

// Guarda (o actualiza) la suscripcion push del dispositivo actual, ligada
// al usuario autenticado.
router.post('/push/subscribe', protect, async (req, res) => {
  try {
    const { endpoint, keys } = req.body

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'Suscripción inválida' })
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { userId: req.user._id, endpoint, keys },
      { upsert: true, new: true, runValidators: true }
    )

    res.status(201).json({ message: 'Suscripción guardada' })
  } catch (error) {
    res.status(500).json({ message: 'Error guardando la suscripción' })
  }
})

// Borra la suscripcion de este dispositivo (el usuario desactivo las
// notificaciones desde la app).
router.post('/push/unsubscribe', protect, async (req, res) => {
  try {
    const { endpoint } = req.body
    if (!endpoint) return res.status(400).json({ message: 'Falta el endpoint' })

    await PushSubscription.deleteOne({ endpoint, userId: req.user._id })
    res.json({ message: 'Suscripción eliminada' })
  } catch (error) {
    res.status(500).json({ message: 'Error eliminando la suscripción' })
  }
})

module.exports = router
