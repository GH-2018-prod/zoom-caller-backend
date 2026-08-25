const mongoose = require('mongoose')

// Horarios disponibles para reprogramar clases — antes hardcodeados en
// fixedSlots.js, ahora los administra el admin desde el panel. Un
// documento por horario (day+time unico) en vez de un array en un solo
// documento, para poder agregar/borrar de a uno con rutas REST simples.
const rescheduleSlotSchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    time: { type: String, required: true },
  },
  { timestamps: true }
)

rescheduleSlotSchema.index({ day: 1, time: 1 }, { unique: true })

module.exports = mongoose.model('RescheduleSlot', rescheduleSlotSchema)
