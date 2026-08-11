const mongoose = require('mongoose')

const paymentSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Denormalizado para no tener que hacer join en cada consulta del
    // dashboard — mismo criterio que details.teacher/teacherId en User.
    studentName: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Payment', paymentSchema)
