const express = require('express')
const router = express.Router()

const User = require('../models/User')
const { protect } = require('../middleware/usersMiddleware')
const { adminOnly, teacherOrAdminOnly } = require('../middleware/roleMiddleware')
const { RATE_PER_CLASS, computeWeeklyClassCounts } = require('../utils/teacherPayroll')

// Clases dictadas y monto ganado esta semana, del profesor autenticado. Se
// calcula en vivo (no se lee del Expense guardado) para que no dependa de
// cuando corrio el cron por ultima vez.
router.get('/payroll/my-week', protect, teacherOrAdminOnly, async (req, res) => {
  try {
    const { countByTeacher } = await computeWeeklyClassCounts()
    const classCount = countByTeacher[req.user._id.toString()] || 0
    res.json({ classCount, amount: classCount * RATE_PER_CLASS, ratePerClass: RATE_PER_CLASS })
  } catch (error) {
    res.status(500).json({ message: 'Error calculando el pago de la semana' })
  }
})

// Lo mismo pero para TODOS los profesores — vista del admin.
router.get('/payroll/week', protect, adminOnly, async (req, res) => {
  try {
    const { countByTeacher } = await computeWeeklyClassCounts()
    const teacherIds = Object.keys(countByTeacher)
    const teachers = await User.find({ _id: { $in: teacherIds } }).select('name')
    const nameById = Object.fromEntries(teachers.map((t) => [t._id.toString(), t.name]))

    const rows = teacherIds.map((teacherId) => ({
      teacherId,
      teacherName: nameById[teacherId] || 'Profesor',
      classCount: countByTeacher[teacherId],
      amount: countByTeacher[teacherId] * RATE_PER_CLASS,
    }))

    res.json({ ratePerClass: RATE_PER_CLASS, rows })
  } catch (error) {
    res.status(500).json({ message: 'Error calculando el pago de la semana' })
  }
})

module.exports = router
