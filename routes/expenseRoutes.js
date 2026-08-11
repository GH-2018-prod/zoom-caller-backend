const express = require('express')
const router = express.Router()

const Expense = require('../models/Expense')
const { protect } = require('../middleware/usersMiddleware')
const { adminOnly } = require('../middleware/roleMiddleware')

// GET todos los gastos (solo admin — es informacion financiera del negocio)
router.get('/expenses', protect, adminOnly, async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ date: 1 })
    res.json(expenses)
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo gastos' })
  }
})

// CREAR gasto (solo admin)
router.post('/expenses', protect, adminOnly, async (req, res) => {
  try {
    const { tool, cost, date } = req.body

    if (!tool || cost === undefined || cost === '' || !date) {
      return res
        .status(400)
        .json({ message: 'Herramienta, costo y fecha son obligatorios' })
    }

    const expense = await Expense.create({
      tool: tool.trim(),
      cost: Number(cost),
      date,
    })

    res.status(201).json(expense)
  } catch (error) {
    res.status(500).json({ message: 'Error creando gasto' })
  }
})

// BORRAR gasto (solo admin)
router.delete('/expenses/:id', protect, adminOnly, async (req, res) => {
  try {
    const deleted = await Expense.findByIdAndDelete(req.params.id)
    if (!deleted) {
      return res.status(404).json({ message: 'Gasto no encontrado' })
    }
    res.json({ message: 'Gasto eliminado correctamente' })
  } catch (error) {
    res.status(500).json({ message: 'Error eliminando gasto' })
  }
})

module.exports = router
