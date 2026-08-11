const express = require('express')
const router = express.Router()

const Payment = require('../models/Payment')
const { protect } = require('../middleware/usersMiddleware')
const { adminOnly } = require('../middleware/roleMiddleware')

// GET todos los pagos (solo admin — es informacion financiera del negocio)
router.get('/payments', protect, adminOnly, async (req, res) => {
  try {
    const payments = await Payment.find().sort({ date: -1 })
    res.json(payments)
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo pagos' })
  }
})

// CREAR pago (solo admin)
router.post('/payments', protect, adminOnly, async (req, res) => {
  try {
    const { studentId, studentName, amount, date } = req.body

    if (!studentId || !studentName || amount === undefined || amount === '' || !date) {
      return res
        .status(400)
        .json({ message: 'Estudiante, monto y fecha son obligatorios' })
    }

    const payment = await Payment.create({
      studentId,
      studentName,
      amount: Number(amount),
      date,
    })

    res.status(201).json(payment)
  } catch (error) {
    res.status(500).json({ message: 'Error creando pago' })
  }
})

// Estado de pago del MES ACTUAL para el usuario autenticado (no admin-only
// — cualquier usuario puede consultar su propio estado, nunca el de otro).
// Usado para bloquear el acceso a la llamada si no hay pago vigente.
router.get('/payments/my-status', protect, async (req, res) => {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const payment = await Payment.findOne({
      studentId: req.user._id,
      date: { $gte: startOfMonth, $lt: startOfNextMonth },
    })

    res.json({ paid: Boolean(payment) })
  } catch (error) {
    res.status(500).json({ message: 'Error verificando estado de pago' })
  }
})

// BORRAR pago (solo admin)
router.delete('/payments/:id', protect, adminOnly, async (req, res) => {
  try {
    const deleted = await Payment.findByIdAndDelete(req.params.id)
    if (!deleted) {
      return res.status(404).json({ message: 'Pago no encontrado' })
    }
    res.json({ message: 'Pago eliminado correctamente' })
  } catch (error) {
    res.status(500).json({ message: 'Error eliminando pago' })
  }
})

module.exports = router
