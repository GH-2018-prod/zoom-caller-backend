const express = require('express')
const router = express.Router()

const ClassAttendance = require('../models/ClassAttendance')
const { protect } = require('../middleware/usersMiddleware')
const { computeWeeklyOccurrences } = require('../utils/weeklyOccurrences')

// Clases de esta semana que ya pasaron y todavia no fueron marcadas por el
// profesor autenticado — es su "lista de pendientes" para confirmar
// asistencia. Solo la semana actual por ahora (si se necesita ponerse al
// dia de semanas anteriores, habria que ampliar el rango).
router.get('/attendance/pending', protect, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ message: 'Solo un profesor tiene clases para marcar' })
    }

    const { weekStart, occurrences } = await computeWeeklyOccurrences()
    const now = new Date()
    const teacherId = req.user._id.toString()

    const relevant = occurrences.filter(
      (o) => o.teacherId === teacherId && o.occurrenceDate <= now
    )

    const existing = await ClassAttendance.find({ weekStart, teacherId: req.user._id }).select(
      'studentId day time'
    )
    const markedKeys = new Set(
      existing.map((e) => `${e.studentId.toString()}__${e.day}__${e.time}`)
    )

    const pending = relevant.filter(
      (o) => !markedKeys.has(`${o.studentId}__${o.day}__${o.time}`)
    )

    res.json({ weekStart, pending })
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo clases por marcar' })
  }
})

// El profesor marca una clase puntual de esta semana como dictada o no.
// Esta confirmacion es la UNICA fuente de verdad para nomina, pago del
// admin, y asistencia/progreso del estudiante.
router.post('/attendance/mark', protect, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ message: 'Solo un profesor puede marcar asistencia' })
    }

    const { studentId, day, time, status } = req.body
    if (!studentId || !day || !time || !['attended', 'absent'].includes(status)) {
      return res.status(400).json({ message: 'Faltan datos o el estado no es valido' })
    }

    const { weekStart, occurrences } = await computeWeeklyOccurrences()
    const occurrence = occurrences.find(
      (o) => o.studentId === studentId && o.day === day && o.time === time
    )

    if (!occurrence) {
      return res.status(404).json({ message: 'Esa clase no existe esta semana' })
    }
    if (occurrence.teacherId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Esa clase no es tuya' })
    }
    if (occurrence.occurrenceDate > new Date()) {
      return res.status(400).json({ message: 'Todavía no pasó la hora de esa clase' })
    }

    const record = await ClassAttendance.findOneAndUpdate(
      { studentId, day, time, weekStart },
      {
        studentId,
        studentName: occurrence.studentName,
        teacherId: occurrence.teacherId,
        teacherName: occurrence.teacherName,
        day,
        time,
        weekStart,
        status,
      },
      { upsert: true, new: true, runValidators: true }
    )

    res.json(record)
  } catch (error) {
    res.status(500).json({ message: 'Error marcando la asistencia' })
  }
})

// Asistencia y progreso acumulado del estudiante autenticado — de aca sale
// el porcentaje del circulo de progreso en su dashboard.
router.get('/attendance/my-progress', protect, async (req, res) => {
  try {
    const records = await ClassAttendance.find({ studentId: req.user._id })
    const attended = records.filter((r) => r.status === 'attended').length
    const absent = records.filter((r) => r.status === 'absent').length
    const total = attended + absent
    const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : 0

    res.json({ attended, absent, total, attendanceRate })
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo tu progreso' })
  }
})

module.exports = router
