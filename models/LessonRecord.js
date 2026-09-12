const mongoose = require('mongoose')

// Un registro de "biblioteca" por leccion: fecha, tema, y el link (Drive u
// otro) que subio un profesor o admin — visible para todos los
// estudiantes de ESE nivel (mismo criterio de "clase" que ya usa Link.key
// para el link de Zoom por nivel).
const lessonRecordSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    topic: { type: String, required: true, trim: true },
    link: { type: String, required: true, trim: true },
    level: { type: String, required: true, uppercase: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Denormalizado para no tener que hacer join en cada consulta — mismo
    // criterio que Payment.js#studentName.
    createdByName: { type: String, required: true, trim: true },
  },
  { timestamps: true }
)

lessonRecordSchema.index({ level: 1, date: -1 })

module.exports = mongoose.model('LessonRecord', lessonRecordSchema)
