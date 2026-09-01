const mongoose = require('mongoose')

// Un registro por (estudiante, dia+hora efectivos, semana) — el profesor lo
// marca a mano despues de dar (o no) la clase. Es la UNICA fuente de verdad
// para nomina del profesor, cuenta por pagar del admin, y asistencia/
// progreso del estudiante — antes esto se calculaba solo, asumiendo que
// "paso la hora" = "se dio la clase", pero eso no distinguia una clase real
// de una a la que el profesor o el estudiante no se conectaron.
const classAttendanceSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentName: { type: String, required: true, trim: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    teacherName: { type: String, required: true, trim: true },
    day: { type: String, required: true },
    time: { type: String, required: true },
    // Lunes de la semana (hora Costa Rica) a la que pertenece esta
    // ocurrencia — distingue "Martes 7am de esta semana" de la misma
    // plantilla la semana que viene.
    weekStart: { type: Date, required: true },
    status: { type: String, enum: ['attended', 'absent'], required: true },
  },
  { timestamps: true }
)

classAttendanceSchema.index({ studentId: 1, day: 1, time: 1, weekStart: 1 }, { unique: true })

module.exports = mongoose.model('ClassAttendance', classAttendanceSchema)
