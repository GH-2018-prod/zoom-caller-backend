const express = require('express')
const router = express.Router()

const ScheduleChange = require('../models/ScheduleChange')
const { protect } = require('../middleware/usersMiddleware')
const { teacherOrAdminOnly } = require('../middleware/roleMiddleware')
const { getNextMeetingDate } = require('../utils/scheduleTime')
const { isFixedSlot } = require('../utils/fixedSlots')
const { sendPushToUser } = require('../utils/pushService')

const CANCELLATION_WINDOW_MS = 60 * 60 * 1000

// Cambios futuros del estudiante autenticado — una vez que la fecha
// original pasa, dejan de aparecer aca (la excepcion "expira" sola, la
// proxima ocurrencia de ese dia+hora vuelve a la plantilla normal).
router.get('/schedule-changes/my-upcoming', protect, async (req, res) => {
  try {
    const changes = await ScheduleChange.find({
      studentId: req.user._id,
      originalDate: { $gte: new Date() },
    })
    res.json(changes)
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo cambios de horario' })
  }
})

router.post('/schedule-changes/cancel', protect, async (req, res) => {
  try {
    const { day, time } = req.body
    if (!day || !time) {
      return res.status(400).json({ message: 'Dia y hora son obligatorios' })
    }

    const scheduleEntry = req.user.details?.schedule?.find(
      (entry) => entry.day === day && entry.time === time
    )
    if (!scheduleEntry) {
      return res.status(404).json({ message: 'Ese horario no es parte de tu clase' })
    }

    const meetingDate = getNextMeetingDate(day, time)
    if (meetingDate.getTime() - Date.now() < CANCELLATION_WINDOW_MS) {
      return res
        .status(400)
        .json({ message: 'Ya no se puede cancelar: falta menos de una hora para la clase' })
    }

    const change = await ScheduleChange.findOneAndUpdate(
      { studentId: req.user._id, originalDay: day, originalTime: time },
      {
        studentId: req.user._id,
        studentName: req.user.name,
        teacherId: req.user.details?.teacherId || null,
        action: 'cancelled',
        originalDay: day,
        originalTime: time,
        originalDate: meetingDate,
        newDay: undefined,
        newTime: undefined,
        newDate: undefined,
        teacherConfirmed: false,
      },
      { new: true, upsert: true, runValidators: true }
    )

    if (change.teacherId) {
      await sendPushToUser(change.teacherId, {
        title: 'Clase cancelada',
        body: `${req.user.name} cancelo su clase del ${day} a las ${time}.`,
        tag: `schedule-cancel-${change._id}`,
      })
    }

    res.json(change)
  } catch (error) {
    res.status(500).json({ message: 'Error cancelando la clase' })
  }
})

router.post('/schedule-changes/reschedule', protect, async (req, res) => {
  try {
    const { day, time, newDay, newTime } = req.body
    if (!day || !time || !newDay || !newTime) {
      return res.status(400).json({ message: 'Faltan datos del horario' })
    }

    const scheduleEntry = req.user.details?.schedule?.find(
      (entry) => entry.day === day && entry.time === time
    )
    if (!scheduleEntry) {
      return res.status(404).json({ message: 'Ese horario no es parte de tu clase' })
    }

    if (!isFixedSlot(newDay, newTime)) {
      return res.status(400).json({ message: 'Ese horario no esta disponible' })
    }

    const meetingDate = getNextMeetingDate(day, time)
    if (meetingDate.getTime() - Date.now() < CANCELLATION_WINDOW_MS) {
      return res
        .status(400)
        .json({ message: 'Ya no se puede reprogramar: falta menos de una hora para la clase' })
    }

    const newMeetingDate = getNextMeetingDate(newDay, newTime)

    const change = await ScheduleChange.findOneAndUpdate(
      { studentId: req.user._id, originalDay: day, originalTime: time },
      {
        studentId: req.user._id,
        studentName: req.user.name,
        teacherId: req.user.details?.teacherId || null,
        action: 'rescheduled',
        originalDay: day,
        originalTime: time,
        originalDate: meetingDate,
        newDay,
        newTime,
        newDate: newMeetingDate,
        teacherConfirmed: false,
      },
      { new: true, upsert: true, runValidators: true }
    )

    if (change.teacherId) {
      await sendPushToUser(change.teacherId, {
        title: 'Clase reprogramada',
        body: `${req.user.name} movio su clase del ${day} ${time} a ${newDay} ${newTime}.`,
        tag: `schedule-reschedule-${change._id}`,
      })
    }

    res.json(change)
  } catch (error) {
    res.status(500).json({ message: 'Error reprogramando la clase' })
  }
})

// Cancelaciones de los estudiantes del profesor autenticado que todavia no
// confirmo (acuse de recibo — no bloquea nada, la cancelacion ya es
// efectiva desde que el estudiante la hizo).
router.get(
  '/schedule-changes/pending-confirmations',
  protect,
  teacherOrAdminOnly,
  async (req, res) => {
    try {
      const changes = await ScheduleChange.find({
        teacherId: req.user._id,
        action: 'cancelled',
        teacherConfirmed: false,
      }).sort({ originalDate: 1 })
      res.json(changes)
    } catch (error) {
      res.status(500).json({ message: 'Error obteniendo cancelaciones pendientes' })
    }
  }
)

router.put(
  '/schedule-changes/:id/confirm',
  protect,
  teacherOrAdminOnly,
  async (req, res) => {
    try {
      const change = await ScheduleChange.findOne({
        _id: req.params.id,
        teacherId: req.user._id,
      })
      if (!change) {
        return res.status(404).json({ message: 'Cancelacion no encontrada' })
      }

      change.teacherConfirmed = true
      await change.save()
      res.json(change)
    } catch (error) {
      res.status(500).json({ message: 'Error confirmando la cancelacion' })
    }
  }
)

module.exports = router
