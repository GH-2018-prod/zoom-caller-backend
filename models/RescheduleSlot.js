const mongoose = require('mongoose')

// Horarios disponibles para reprogramar clases — antes hardcodeados en
// fixedSlots.js, ahora los administra el admin desde el panel. Un
// documento por horario (day+time unico) en vez de un array en un solo
// documento, para poder agregar/borrar de a uno con rutas REST simples.
const rescheduleSlotSchema = new mongoose.Schema(
  {
    // Cada horario disponible pertenece a UN profesor puntual (quien
    // efectivamente va a dar esa clase si alguien se reprograma ahi) — no
    // es un cupo generico. Distintos profesores si pueden compartir el
    // mismo dia+hora, cada uno con su propio slot.
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    teacherName: { type: String, required: true, trim: true },
    day: { type: String, required: true },
    time: { type: String, required: true },
  },
  { timestamps: true }
)

rescheduleSlotSchema.index({ teacherId: 1, day: 1, time: 1 }, { unique: true })

module.exports = mongoose.model('RescheduleSlot', rescheduleSlotSchema)
