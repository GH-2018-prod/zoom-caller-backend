const express = require('express')
const router = express.Router()

const User = require('../models/User')
const { protect } = require('../middleware/usersMiddleware')
const { adminOnly, teacherOrAdminOnly } = require('../middleware/roleMiddleware')
const { RATE_PER_CLASS, computeWeeklyClassCounts } = require('../utils/teacherPayroll')
const {
  computeWeeklyOccurrences,
  computeWeeklyCancelledCounts,
} = require('../utils/weeklyOccurrences')

// Clases dictadas (confirmadas por el profesor) y monto ganado esta
// semana, mas el total de clases programadas para la semana completa —
// este ultimo incluye las que le llegaron por reprogramacion de otro
// profesor, y resta las canceladas, pero no requiere que ya hayan
// ocurrido (a diferencia de "dictadas", que solo cuenta lo confirmado).
router.get('/payroll/my-week', protect, teacherOrAdminOnly, async (req, res) => {
  try {
    const teacherId = req.user._id.toString()

    const { countByTeacher } = await computeWeeklyClassCounts()
    const classCount = countByTeacher[teacherId] || 0

    const { occurrences } = await computeWeeklyOccurrences()
    const totalScheduled = occurrences.filter((o) => o.teacherId === teacherId).length

    const { countByTeacher: cancelledByTeacher } = await computeWeeklyCancelledCounts()
    const cancelledCount = cancelledByTeacher[teacherId] || 0

    res.json({
      classCount,
      totalScheduled,
      cancelledCount,
      amount: classCount * RATE_PER_CLASS,
      ratePerClass: RATE_PER_CLASS,
    })
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

    const { countByTeacher: cancelledByTeacher, total: cancelledTotal } =
      await computeWeeklyCancelledCounts()

    const rows = teacherIds.map((teacherId) => ({
      teacherId,
      teacherName: nameById[teacherId] || 'Profesor',
      classCount: countByTeacher[teacherId],
      cancelledCount: cancelledByTeacher[teacherId] || 0,
      amount: countByTeacher[teacherId] * RATE_PER_CLASS,
    }))

    res.json({ ratePerClass: RATE_PER_CLASS, rows, cancelledTotal })
  } catch (error) {
    res.status(500).json({ message: 'Error calculando el pago de la semana' })
  }
})

module.exports = router
