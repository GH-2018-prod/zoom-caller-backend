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
    // Cuantos estudiantes caben en este horario a la vez — 1 = clase
    // privada, 2+ = grupal. El slot ya NO se borra al ocuparse (ver
    // scheduleChangeRoutes.js#choose-initial-slot): la disponibilidad real
    // se calcula en vivo comparando esto contra la ocupacion actual (ver
    // utils/slotCapacity.js), asi un cupo liberado por cancelacion
    // reaparece solo, sin necesitar una lista aparte de "liberados".
    capacity: { type: Number, default: 2, min: 1 },
    // Mismo nivel que Link.key (A1, B1, C1, etc.) — el link de Zoom es por
    // nivel, asi que todos los que comparten un horario grupal tienen que
    // ser del mismo nivel (si no, quedan en la misma "clase" pero cada uno
    // necesitaria un link distinto). Un estudiante solo puede elegir
    // horarios de su propio nivel — ver choose-initial-slot/reschedule.
    level: { type: String, required: true, uppercase: true, trim: true },
  },
  { timestamps: true }
)

rescheduleSlotSchema.index({ teacherId: 1, day: 1, time: 1 }, { unique: true })

module.exports = mongoose.model('RescheduleSlot', rescheduleSlotSchema)
