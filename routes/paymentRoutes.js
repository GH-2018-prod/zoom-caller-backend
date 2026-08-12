const express = require('express')
const router = express.Router()

const Payment = require('../models/Payment')
const { protect } = require('../middleware/usersMiddleware')
const { adminOnly } = require('../middleware/roleMiddleware')

// GET estado de pago de todos los estudiantes (solo admin)
router.get('/payments', protect, adminOnly, async (req, res) => {
  try {
    const payments = await Payment.find()
    res.json(payments)
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo pagos' })
  }
})

// Estado de pago del estudiante autenticado (cualquier usuario, pero solo
// puede ver el propio — nunca el de otro). Usado para bloquear el acceso
// a la llamada si "paid" es false.
router.get('/payments/my-status', protect, async (req, res) => {
  try {
    const payment = await Payment.findOne({ studentId: req.user._id })
    res.json({ paid: payment?.paid ?? false })
  } catch (error) {
    res.status(500).json({ message: 'Error verificando estado de pago' })
  }
})

// CREAR O ACTUALIZAR el estado de pago de un estudiante puntual (solo
// admin). Un registro por estudiante — se hace upsert en vez de acumular
// filas, ver Payment.js.
router.put('/payments/:studentId', protect, adminOnly, async (req, res) => {
  try {
    const { studentId } = req.params
    const { studentName, amount, date, paid } = req.body

    if (!studentName || amount === undefined || amount === '' || !date) {
      return res
        .status(400)
        .json({ message: 'Estudiante, monto y fecha son obligatorios' })
    }

    const payment = await Payment.findOneAndUpdate(
      { studentId },
      { studentId, studentName, amount: Number(amount), date, paid: Boolean(paid) },
      { new: true, upsert: true, runValidators: true }
    )

    res.json(payment)
  } catch (error) {
    res.status(500).json({ message: 'Error guardando el pago' })
  }
})

// BORRAR el registro de pago de un estudiante (solo admin)
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
