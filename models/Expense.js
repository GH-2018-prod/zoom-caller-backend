const mongoose = require('mongoose')

const expenseSchema = new mongoose.Schema(
  {
    tool: { type: String, required: true, trim: true },
    cost: { type: Number, required: true },
    date: { type: Date, required: true },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Expense', expenseSchema)
