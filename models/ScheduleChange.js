const mongoose = require('mongoose')

// Una excepcion puntual sobre el horario recurrente semanal de un
// estudiante (details.schedule en User) — no modifica la plantilla fija,
// solo "pisa" la proxima ocurrencia de un dia+hora dado. Por eso hay un
// solo registro activo por (studentId, originalDay, originalTime): al
// cancelar/reprogramar de nuevo el mismo horario se hace upsert sobre el
// mismo documento en vez de acumular historial.
const scheduleChangeSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Denormalizados para no tener que hacer join en cada consulta del
    // dashboard del profesor — mismo criterio que Payment.js#studentName.
    studentName: { type: String, required: true, trim: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, enum: ['cancelled', 'rescheduled'], required: true },
    originalDay: { type: String, required: true },
    originalTime: { type: String, required: true },
    originalDate: { type: Date, required: true },
    newDay: { type: String },
    newTime: { type: String },
    newDate: { type: Date },
    // Solo aplica a cancelaciones — el profesor no aprueba ni bloquea la
    // cancelacion (ya es efectiva), esto es un acuse de recibo.
    teacherConfirmed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

module.exports = mongoose.model('ScheduleChange', scheduleChangeSchema)
