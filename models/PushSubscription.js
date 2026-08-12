const mongoose = require('mongoose')

// Un usuario puede tener varias suscripciones (un dispositivo/navegador
// cada una). "endpoint" es unico por dispositivo, lo entrega el navegador.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema)
