const express = require('express')
const router = express.Router()

const ScheduleChange = require('../models/ScheduleChange')
const RescheduleSlot = require('../models/RescheduleSlot')
const { protect } = require('../middleware/usersMiddleware')
const { adminOnly, teacherOrAdminOnly } = require('../middleware/roleMiddleware')
const { getNextMeetingDate } = require('../utils/scheduleTime')
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
        // El profesor es por horario — si esa entrada todavia no tiene el
        // suyo (estudiantes de antes de este cambio), se usa el viejo
        // details.teacherId como respaldo.
        teacherId: scheduleEntry.teacherId || req.user.details?.teacherId || null,
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

    // Un horario es valido para reprogramar si esta en la lista fija del
    // admin, O si quedo libre en su horario ORIGINAL porque otro (o el
    // mismo) estudiante cancelo o reprogramo justo esa clase esta semana.
    const isFixed = await RescheduleSlot.exists({ day: newDay, time: newTime })
    const isFreed = await ScheduleChange.exists({
      action: { $in: ['cancelled', 'rescheduled'] },
      originalDay: newDay,
      originalTime: newTime,
      originalDate: { $gte: new Date() },
    })
    if (!isFixed && !isFreed) {
      return res.status(400).json({ message: 'Ese horario no esta disponible' })
    }

    // El slot puede estar ocupado por otra reprogramacion vigente — salvo
    // que sea la propia (re-elegir el mismo horario para la misma clase no
    // cuenta como "ocupado por otro").
    const occupant = await ScheduleChange.findOne({
      action: 'rescheduled',
      newDay,
      newTime,
      originalDate: { $gte: new Date() },
    })
    const isOwnOccupant =
      occupant &&
      occupant.studentId.toString() === req.user._id.toString() &&
      occupant.originalDay === day &&
      occupant.originalTime === time
    if (occupant && !isOwnOccupant) {
      return res.status(400).json({ message: 'Ese horario ya esta ocupado por otro estudiante' })
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
        teacherId: scheduleEntry.teacherId || req.user.details?.teacherId || null,
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

// Todos los cambios vigentes (cancelados Y reprogramados, confirmados o
// no) de los estudiantes relevantes — admin ve todos, profesor solo los
// suyos. A diferencia de pending-confirmations, esto alimenta la vista
// agrupada por dia (TeacherCallCard) para que el horario del profe/admin
// refleje lo que el estudiante ya cambio, no solo lo pendiente de
// confirmar.
router.get(
  '/schedule-changes/students-upcoming',
  protect,
  teacherOrAdminOnly,
  async (req, res) => {
    try {
      const filter = { originalDate: { $gte: new Date() } }
      if (req.user.role === 'teacher') {
        filter.teacherId = req.user._id
      }
      const changes = await ScheduleChange.find(filter)
      res.json(changes)
    } catch (error) {
      res.status(500).json({ message: 'Error obteniendo cambios de horario' })
    }
  }
)

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

// Horarios disponibles para reprogramar — cualquier usuario autenticado
// los puede ver (los necesita el selector de reprogramar), solo el admin
// los administra.
router.get('/schedule-changes/fixed-slots', protect, async (req, res) => {
  try {
    const slots = await RescheduleSlot.find().sort({ day: 1, time: 1 })
    res.json(slots)
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo horarios disponibles' })
  }
})

// Horarios de la lista de fixed-slots que YA estan ocupados por una
// reprogramacion vigente de otro estudiante — el frontend los saca del
// selector para no permitir un choque. Se calcula en vivo, asi que un
// horario reaparece solo al cancelarse la reprogramacion que lo ocupaba
// (o al pasar su fecha, como cualquier ScheduleChange).
router.get('/schedule-changes/occupied-slots', protect, async (req, res) => {
  try {
    const changes = await ScheduleChange.find({
      action: 'rescheduled',
      originalDate: { $gte: new Date() },
    }).select('newDay newTime')
    res.json(changes.map((c) => ({ day: c.newDay, time: c.newTime })))
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo horarios ocupados' })
  }
})

// Horarios que quedaron libres esta semana en su horario ORIGINAL —
// porque alguien cancelo esa clase, o porque la reprogramo a otro
// horario (el original tambien queda vacio, no solo el nuevo). Se suman
// al pool de horarios disponibles para reprogramar (fixed-slots), sin
// importar si el que reprograma es el mismo estudiante o cualquier otro.
router.get('/schedule-changes/freed-slots', protect, async (req, res) => {
  try {
    const changes = await ScheduleChange.find({
      action: { $in: ['cancelled', 'rescheduled'] },
      originalDate: { $gte: new Date() },
    }).select('originalDay originalTime')
    res.json(changes.map((c) => ({ day: c.originalDay, time: c.originalTime })))
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo horarios liberados' })
  }
})

router.post('/schedule-changes/fixed-slots', protect, adminOnly, async (req, res) => {
  try {
    const { day, time } = req.body
    if (!day || !time) {
      return res.status(400).json({ message: 'Dia y hora son obligatorios' })
    }

    const slot = await RescheduleSlot.create({ day, time })
    res.status(201).json(slot)
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Ese horario ya esta disponible' })
    }
    res.status(500).json({ message: 'Error agregando el horario' })
  }
})

router.delete('/schedule-changes/fixed-slots/:id', protect, adminOnly, async (req, res) => {
  try {
    const deleted = await RescheduleSlot.findByIdAndDelete(req.params.id)
    if (!deleted) {
      return res.status(404).json({ message: 'Horario no encontrado' })
    }
    res.json({ message: 'Horario eliminado' })
  } catch (error) {
    res.status(500).json({ message: 'Error eliminando el horario' })
  }
})

module.exports = router
