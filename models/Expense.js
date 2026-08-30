const mongoose = require('mongoose')

const expenseSchema = new mongoose.Schema(
  {
    tool: { type: String, required: true, trim: true },
    cost: { type: Number, required: true },
    date: { type: Date, required: true },
    // Silencia la alerta visual de vencido/por vencer para este gasto
    // puntual, sin borrarlo ni tocar su fecha.
    alertsDisabled: { type: Boolean, default: false },
    // Los dos campos de abajo solo se usan en gastos de pago a profesor
    // generados automaticamente por el cron de nomina (ver
    // utils/teacherPayroll.js) — permiten reidentificar el registro de la
    // semana de ESE profesor para actualizarlo, sin depender de comparar
    // el texto libre de "tool".
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    weekStart: { type: Date },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Expense', expenseSchema)
