const express = require('express')
const router = express.Router()

const LessonRecord = require('../models/LessonRecord')
const { protect } = require('../middleware/usersMiddleware')
const { teacherOrAdminOnly } = require('../middleware/roleMiddleware')

// Historial de lecciones. El estudiante ve solo las de su propio nivel
// (su "clase"); profesor y admin ven todas, ya que son quienes las
// administran.
router.get('/lesson-records', protect, async (req, res) => {
  try {
    if (req.user.role === 'student') {
      // Sin nivel asignado todavia = sin clase, no hay nada de esta
      // "biblioteca" que le corresponda ver. Sin este chequeo, el filtro
      // {level: undefined} lo ignora Mongoose y termina devolviendo TODO.
      if (!req.user.details?.level) return res.json([])
    }

    const filter = req.user.role === 'student' ? { level: req.user.details.level } : {}
    const records = await LessonRecord.find(filter).sort({ date: -1 })
    res.json(records)
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo el historial de lecciones' })
  }
})

router.post('/lesson-records', protect, teacherOrAdminOnly, async (req, res) => {
  try {
    const { date, topic, link, level } = req.body
    if (!date || !topic || !link || !level) {
      return res.status(400).json({ message: 'Fecha, tema, link y nivel son obligatorios' })
    }

    const record = await LessonRecord.create({
      date,
      topic: topic.trim(),
      link: link.trim(),
      level: level.trim(),
      createdBy: req.user._id,
      createdByName: req.user.name,
    })

    res.status(201).json(record)
  } catch (error) {
    res.status(500).json({ message: 'Error guardando la lección' })
  }
})

module.exports = router
