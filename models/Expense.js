const mongoose = require('mongoose')

const expenseSchema = new mongoose.Schema(
  {
    tool: { type: String, required: true, trim: true },
    cost: { type: Number, required: true },
    date: { type: Date, required: true },
    // Silencia la alerta visual de vencido/por vencer para este gasto
    // puntual, sin borrarlo ni tocar su fecha.
    alertsDisabled: { type: Boolean, default: false },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Expense', expenseSchema)
