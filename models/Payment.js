const mongoose = require('mongoose')

// Un registro por estudiante = su estado de pago del ciclo actual (no un
// historial de transacciones todavia — eso queda para mas adelante). Por
// eso studentId es unico: se actualiza in-place en vez de acumular filas.
const paymentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    // Denormalizado para no tener que hacer join en cada consulta del
    // dashboard — mismo criterio que details.teacher/teacherId en User.
    studentName: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, default: 15000 },
    date: { type: Date, required: true, default: () => new Date('2026-08-13') },
    paid: { type: Boolean, default: false },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Payment', paymentSchema)
