const express = require('express')
const router = express.Router()

const ScheduleChange = require('../models/ScheduleChange')
const RescheduleSlot = require('../models/RescheduleSlot')
const User = require('../models/User')
const { protect } = require('../middleware/usersMiddleware')
const { teacherOrAdminOnly } = require('../middleware/roleMiddleware')
const { getNextMeetingDate } = require('../utils/scheduleTime')
const { sendPushToUser } = require('../utils/pushService')
const { findTeacherConflict } = require('../utils/teacherConflict')

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
    const { day, time, newDay, newTime, newTeacherId } = req.body
    if (!day || !time || !newDay || !newTime || !newTeacherId) {
      return res.status(400).json({ message: 'Faltan datos del horario' })
    }

    const scheduleEntry = req.user.details?.schedule?.find(
      (entry) => entry.day === day && entry.time === time
    )
    if (!scheduleEntry) {
      return res.status(404).json({ message: 'Ese horario no es parte de tu clase' })
    }

    const newTeacher = await User.findOne({ _id: newTeacherId, role: 'teacher' }).select('name')
    if (!newTeacher) {
      return res.status(404).json({ message: 'Profesor no encontrado' })
    }

    // Un horario es valido para reprogramar si ESE profesor lo dejo en su
    // lista fija, O si le quedo libre en su horario ORIGINAL porque un
    // estudiante suyo (o el mismo) cancelo/reprogramo justo esa clase esta
    // semana. La clase pasa a ser de ese profesor — no del original.
    const isFixed = await RescheduleSlot.exists({
      teacherId: newTeacherId,
      day: newDay,
      time: newTime,
    })
    const isFreed = await ScheduleChange.exists({
      action: { $in: ['cancelled', 'rescheduled'] },
      originalDay: newDay,
      originalTime: newTime,
      originalDate: { $gte: new Date() },
      teacherId: newTeacherId,
    })
    if (!isFixed && !isFreed) {
      return res.status(400).json({ message: 'Ese horario no esta disponible' })
    }

    // El slot de ESE profesor puede estar ocupado por otra reprogramacion
    // vigente — salvo que sea la propia (re-elegir el mismo horario para la
    // misma clase no cuenta como "ocupado por otro").
    const occupant = await ScheduleChange.findOne({
      action: 'rescheduled',
      newDay,
      newTime,
      newTeacherId,
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
    const originalTeacherId = scheduleEntry.teacherId || req.user.details?.teacherId || null

    const change = await ScheduleChange.findOneAndUpdate(
      { studentId: req.user._id, originalDay: day, originalTime: time },
      {
        studentId: req.user._id,
        studentName: req.user.name,
        teacherId: originalTeacherId,
        action: 'rescheduled',
        originalDay: day,
        originalTime: time,
        originalDate: meetingDate,
        newDay,
        newTime,
        newDate: newMeetingDate,
        newTeacherId,
        newTeacherName: newTeacher.name,
        teacherConfirmed: false,
      },
      { new: true, upsert: true, runValidators: true }
    )

    // Al profesor original se le avisa que perdio esa sesion puntual (si es
    // otro distinto del nuevo dueno del horario).
    if (originalTeacherId && originalTeacherId.toString() !== newTeacherId.toString()) {
      await sendPushToUser(originalTeacherId, {
        title: 'Clase reprogramada',
        body: `${req.user.name} movio su clase del ${day} ${time} a otro horario.`,
        tag: `schedule-reschedule-out-${change._id}`,
      })
    }
    await sendPushToUser(newTeacherId, {
      title: 'Nueva clase reprogramada',
      body: `${req.user.name} se unio a tu horario del ${newDay} a las ${newTime}.`,
      tag: `schedule-reschedule-in-${change._id}`,
    })

    res.json(change)
  } catch (error) {
    res.status(500).json({ message: 'Error reprogramando la clase' })
  }
})

// Un estudiante sin horario asignado (el admin lo creo con una entrada en
// blanco) elige su propio horario permanente — SOLO de la lista fija de
// disponibilidad de un profesor, nunca de "liberados", porque esos son
// libres solo por esta semana y la que viene volverian a chocar con la
// clase real de otro estudiante. Al confirmarse, deja de ser "disponible"
// (se borra el RescheduleSlot) porque ya es una clase real, no un cupo.
router.post('/schedule-changes/choose-initial-slot', protect, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Solo un estudiante puede elegir su horario' })
    }

    const { day, time, teacherId } = req.body
    if (!day || !time || !teacherId) {
      return res.status(400).json({ message: 'Faltan datos del horario' })
    }

    const schedule = req.user.details?.schedule || []
    const blankIndex = schedule.findIndex((entry) => !entry.day || !entry.time)
    if (blankIndex === -1) {
      return res.status(400).json({ message: 'No tenés horarios pendientes de asignar' })
    }

    const slot = await RescheduleSlot.findOne({ teacherId, day, time })
    if (!slot) {
      return res.status(400).json({ message: 'Ese horario ya no está disponible' })
    }

    // Chequeo extra por si alguien mas tomo ese mismo horario justo antes.
    const conflict = await findTeacherConflict(teacherId, day, time)
    if (conflict) {
      return res
        .status(400)
        .json({ message: `Ese horario ya no está disponible (ocupado por ${conflict.name})` })
    }

    const updatedSchedule = [...schedule]
    updatedSchedule[blankIndex] = {
      ...updatedSchedule[blankIndex],
      day,
      time,
      teacherId,
      teacher: slot.teacherName,
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { 'details.schedule': updatedSchedule },
      { new: true, runValidators: true }
    ).select('-password')

    // Ya no es disponibilidad libre — es una clase real ocupando ese lugar.
    await RescheduleSlot.deleteOne({ _id: slot._id })

    res.json(updatedUser)
  } catch (error) {
    res.status(500).json({ message: 'Error asignando el horario' })
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
        // Incluye tanto lo suyo de siempre como lo que le llego reasignado
        // por reprogramacion de otro profesor.
        filter.$or = [{ teacherId: req.user._id }, { newTeacherId: req.user._id }]
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

// Horarios disponibles para reprogramar — cada uno pertenece a un profesor.
// Un profesor solo ve los suyos (no puede ver los de otros profesores); el
// admin y los estudiantes ven todos (el estudiante los necesita para el
// selector de reprogramar, y tiene que poder elegir cualquier profesor).
router.get('/schedule-changes/fixed-slots', protect, async (req, res) => {
  try {
    const filter = req.user.role === 'teacher' ? { teacherId: req.user._id } : {}
    const slots = await RescheduleSlot.find(filter).sort({ day: 1, time: 1 })
    res.json(slots)
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo horarios disponibles' })
  }
})

// Horarios que YA estan ocupados por una reprogramacion vigente de otro
// estudiante — el frontend los saca del selector para no permitir un
// choque. El profesor dueno del horario importa: dos profesores distintos
// pueden compartir el mismo dia+hora sin chocar entre si.
router.get('/schedule-changes/occupied-slots', protect, async (req, res) => {
  try {
    const changes = await ScheduleChange.find({
      action: 'rescheduled',
      originalDate: { $gte: new Date() },
    }).select('newDay newTime newTeacherId')
    res.json(
      changes.map((c) => ({
        day: c.newDay,
        time: c.newTime,
        teacherId: c.newTeacherId?.toString() || null,
      }))
    )
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo horarios ocupados' })
  }
})

// Horarios que quedaron libres esta semana en su horario ORIGINAL — porque
// alguien cancelo esa clase, o porque la reprogramo a otro horario (el
// original tambien queda vacio, no solo el nuevo). Cada uno queda libre
// para el profesor que la dictaba, no para cualquiera — se suman al pool
// de ESE profesor (fixed-slots). Un profesor solo ve los suyos; admin y
// estudiantes ven todos.
router.get('/schedule-changes/freed-slots', protect, async (req, res) => {
  try {
    const filter = {
      action: { $in: ['cancelled', 'rescheduled'] },
      originalDate: { $gte: new Date() },
    }
    if (req.user.role === 'teacher') {
      filter.teacherId = req.user._id
    }
    const changes = await ScheduleChange.find(filter)
      .select('originalDay originalTime teacherId')
      .populate('teacherId', 'name')
    res.json(
      changes
        .filter((c) => c.teacherId)
        .map((c) => ({
          day: c.originalDay,
          time: c.originalTime,
          teacherId: c.teacherId._id.toString(),
          teacherName: c.teacherId.name,
        }))
    )
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo horarios liberados' })
  }
})

// Un profesor habilita sus propios horarios; el admin puede habilitar uno
// a nombre de cualquier profesor. Ninguno de los dos puede dejar un
// horario donde ese profesor ya tiene una clase (no puede estar "libre" y
// "ocupado" al mismo tiempo).
router.post('/schedule-changes/fixed-slots', protect, teacherOrAdminOnly, async (req, res) => {
  try {
    const { day, time } = req.body
    if (!day || !time) {
      return res.status(400).json({ message: 'Dia y hora son obligatorios' })
    }

    let teacherId = req.user.role === 'teacher' ? req.user._id.toString() : req.body.teacherId
    let teacherName = req.user.role === 'teacher' ? req.user.name : null

    if (!teacherId) {
      return res.status(400).json({ message: 'Selecciona un profesor' })
    }
    if (!teacherName) {
      const teacherUser = await User.findOne({ _id: teacherId, role: 'teacher' }).select('name')
      if (!teacherUser) {
        return res.status(404).json({ message: 'Profesor no encontrado' })
      }
      teacherName = teacherUser.name
    }

    const conflict = await findTeacherConflict(teacherId, day, time)
    if (conflict) {
      return res.status(400).json({
        message: `${teacherName} ya tiene clase el ${day} a las ${time} (con ${conflict.name})`,
      })
    }

    const slot = await RescheduleSlot.create({ teacherId, teacherName, day, time })
    res.status(201).json(slot)
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Ese horario ya esta disponible' })
    }
    res.status(500).json({ message: 'Error agregando el horario' })
  }
})

router.delete(
  '/schedule-changes/fixed-slots/:id',
  protect,
  teacherOrAdminOnly,
  async (req, res) => {
    try {
      const slot = await RescheduleSlot.findById(req.params.id)
      if (!slot) {
        return res.status(404).json({ message: 'Horario no encontrado' })
      }
      if (req.user.role === 'teacher' && slot.teacherId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'No podes borrar el horario de otro profesor' })
      }
      await slot.deleteOne()
      res.json({ message: 'Horario eliminado' })
    } catch (error) {
      res.status(500).json({ message: 'Error eliminando el horario' })
    }
  }
)

module.exports = router
