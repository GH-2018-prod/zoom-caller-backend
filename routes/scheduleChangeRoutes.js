const express = require('express')
const router = express.Router()

const ScheduleChange = require('../models/ScheduleChange')
const RescheduleSlot = require('../models/RescheduleSlot')
const User = require('../models/User')
const { protect } = require('../middleware/usersMiddleware')
const { teacherOrAdminOnly } = require('../middleware/roleMiddleware')
const { getNextMeetingDate } = require('../utils/scheduleTime')
const { sendPushToUser } = require('../utils/pushService')
const { getOccupancy, hasCapacity } = require('../utils/slotCapacity')
const { dayLabels } = require('../utils/dayLabels')
const { getWeekStart, computeWeeklyOccurrences } = require('../utils/weeklyOccurrences')
const { isTeacherLike } = require('../utils/roles')

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

// Cuantas clases propias se cancelaron esta semana — a diferencia de
// my-upcoming (que solo mira hacia adelante), esto cuenta lo que ya paso
// en la semana tambien, para alimentar la tarjeta de "Clases canceladas"
// del dashboard del estudiante.
router.get('/schedule-changes/my-cancelled-week', protect, async (req, res) => {
  try {
    const weekStart = getWeekStart()
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)

    const cancelledCount = await ScheduleChange.countDocuments({
      studentId: req.user._id,
      action: 'cancelled',
      originalDate: { $gte: weekStart, $lt: weekEnd },
    })

    res.json({ cancelledCount })
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo tus clases canceladas' })
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

    // Si esta clase se asigno a mano (admin/legacy) y nunca paso por el
    // selector de "Disponibles", no existe un RescheduleSlot para este
    // profesor+dia+hora — sin esto, el cupo que se libera al cancelar no
    // aparece en ningun lado. Se crea con capacidad 1 (era de un solo
    // estudiante) SOLO si todavia no existe uno — nunca pisa la capacidad
    // de un horario grupal que ya estuviera formalizado.
    if (scheduleEntry.teacherId && req.user.details?.level) {
      await RescheduleSlot.findOneAndUpdate(
        { teacherId: scheduleEntry.teacherId, day, time },
        {
          $setOnInsert: {
            teacherId: scheduleEntry.teacherId,
            teacherName: scheduleEntry.teacher || 'Profesor',
            day,
            time,
            capacity: 1,
            level: req.user.details.level,
          },
        },
        { upsert: true }
      )
    }

    if (change.teacherId) {
      await sendPushToUser(change.teacherId, {
        title: 'Clase cancelada',
        body: `${req.user.name} cancelo su clase del ${dayLabels[day]} a las ${time}.`,
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

    const newTeacher = await User.findOne({ _id: newTeacherId }).select('name role isTeacher')
    if (!newTeacher || !isTeacherLike(newTeacher)) {
      return res.status(404).json({ message: 'Profesor no encontrado' })
    }

    // Un horario es valido para reprogramar si ESE profesor lo dejo en su
    // lista fija (con cupo disponible) — la clase pasa a ser de ese
    // profesor, no del original. El RescheduleSlot ya no se borra al
    // ocuparse (ver choose-initial-slot), asi que la disponibilidad real
    // se calcula en vivo contra su capacidad, no contra su existencia.
    const targetSlot = await RescheduleSlot.findOne({
      teacherId: newTeacherId,
      day: newDay,
      time: newTime,
    }).select('level')
    if (!targetSlot) {
      return res.status(400).json({ message: 'Ese horario no esta disponible' })
    }

    // El link de Zoom es por nivel — un horario grupal solo puede tener
    // estudiantes del mismo nivel que el horario, si no cada uno
    // necesitaria un link distinto para la "misma" clase.
    if (targetSlot.level !== req.user.details?.level) {
      return res
        .status(400)
        .json({ message: `Ese horario es para nivel ${targetSlot.level}, tu nivel es ${req.user.details?.level || 'desconocido'}` })
    }

    // Se excluye al propio estudiante de la cuenta de ocupacion — si ya
    // estaba anotado justo ahi, re-elegir el mismo horario no debe
    // bloquearse a si mismo.
    const { hasRoom } = await hasCapacity(newTeacherId, newDay, newTime, req.user._id)
    if (!hasRoom) {
      return res.status(400).json({ message: 'Ese horario ya esta lleno' })
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

    // El horario ORIGINAL tambien queda con un cupo libre, no solo el
    // nuevo — si nunca existio un RescheduleSlot para ese profesor+dia+hora
    // (asignacion manual/legacy), se crea ahora con capacidad 1 para que
    // el cupo liberado aparezca en "Disponibles".
    if (originalTeacherId && req.user.details?.level) {
      await RescheduleSlot.findOneAndUpdate(
        { teacherId: originalTeacherId, day, time },
        {
          $setOnInsert: {
            teacherId: originalTeacherId,
            teacherName: scheduleEntry.teacher || 'Profesor',
            day,
            time,
            capacity: 1,
            level: req.user.details.level,
          },
        },
        { upsert: true }
      )
    }

    // Al profesor original se le avisa que perdio esa sesion puntual (si es
    // otro distinto del nuevo dueno del horario).
    if (originalTeacherId && originalTeacherId.toString() !== newTeacherId.toString()) {
      await sendPushToUser(originalTeacherId, {
        title: 'Clase reprogramada',
        body: `${req.user.name} movio su clase del ${dayLabels[day]} ${time} a otro horario.`,
        tag: `schedule-reschedule-out-${change._id}`,
      })
    }
    await sendPushToUser(newTeacherId, {
      title: 'Nueva clase reprogramada',
      body: `${req.user.name} se unio a tu horario del ${dayLabels[newDay]} a las ${newTime}.`,
      tag: `schedule-reschedule-in-${change._id}`,
    })

    res.json(change)
  } catch (error) {
    res.status(500).json({ message: 'Error reprogramando la clase' })
  }
})

// Un estudiante elige un horario permanente — SOLO de la lista fija de
// disponibilidad de un profesor, con cupo libre segun su capacidad. Si
// tiene una entrada en blanco (el admin lo creo sin asignarle dia/hora),
// la completa; si no tiene ninguna en blanco, agrega una clase mas (para
// el que quiere sumar otro horario). El RescheduleSlot NO se borra al
// ocuparse — sigue existiendo mientras tenga cupo (clases grupales
// aceptan mas de un estudiante en el mismo horario).
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

    const slot = await RescheduleSlot.findOne({ teacherId, day, time })
    if (!slot) {
      return res.status(400).json({ message: 'Ese horario ya no está disponible' })
    }

    // El link de Zoom es por nivel — un horario grupal solo puede tener
    // estudiantes del mismo nivel que el horario.
    if (slot.level !== req.user.details?.level) {
      return res.status(400).json({
        message: `Ese horario es para nivel ${slot.level}, tu nivel es ${req.user.details?.level || 'desconocido'}`,
      })
    }

    // Chequeo extra por si alguien mas tomo el ultimo cupo justo antes.
    const { hasRoom } = await hasCapacity(teacherId, day, time, req.user._id)
    if (!hasRoom) {
      return res.status(400).json({ message: 'Ese horario ya no tiene cupo disponible' })
    }

    const updatedSchedule = [...schedule]
    const newEntry = { day, time, teacherId, teacher: slot.teacherName }
    if (blankIndex === -1) {
      updatedSchedule.push(newEntry)
    } else {
      updatedSchedule[blankIndex] = { ...updatedSchedule[blankIndex], ...newEntry }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { 'details.schedule': updatedSchedule },
      { new: true, runValidators: true }
    ).select('-password')

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
// Cada slot vuelve con "occupancy" (cuantos estudiantes tiene esta semana)
// junto a su "capacity" — un cupo liberado por cancelacion reaparece solo
// aca (baja la ocupacion), sin necesitar una lista aparte de "liberados".
router.get('/schedule-changes/fixed-slots', protect, async (req, res) => {
  try {
    const filter = {}
    if (req.user.role === 'teacher') filter.teacherId = req.user._id
    // Un estudiante solo puede ocupar horarios de su propio nivel (el link
    // de Zoom es por nivel) — se filtra aca para que ni siquiera los vea
    // en el selector, no solo para bloquearlo al elegir uno. Admin/profesor
    // ven todos los niveles porque son quienes los administran.
    if (req.user.role === 'student' && req.user.details?.level) {
      filter.level = req.user.details.level
    }
    const slots = await RescheduleSlot.find(filter).sort({ day: 1, time: 1 })
    const { occurrences } = await computeWeeklyOccurrences()

    const withOccupancy = slots.map((slot) => {
      const teacherId = slot.teacherId.toString()
      const occupancy = occurrences.filter(
        (o) => o.teacherId === teacherId && o.day === slot.day && o.time === slot.time
      ).length
      return { ...slot.toObject(), occupancy }
    })

    res.json(withOccupancy)
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo horarios disponibles' })
  }
})

// Un profesor habilita sus propios horarios; el admin puede habilitar uno
// a nombre de cualquier profesor, con la capacidad que quiera (1 =
// privada, 2+ = grupal).
router.post('/schedule-changes/fixed-slots', protect, teacherOrAdminOnly, async (req, res) => {
  try {
    const { day, time, capacity, level } = req.body
    if (!day || !time || !level) {
      return res.status(400).json({ message: 'Dia, hora y nivel son obligatorios' })
    }
    if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1)) {
      return res.status(400).json({ message: 'La capacidad tiene que ser un numero entero de al menos 1' })
    }

    let teacherId = req.user.role === 'teacher' ? req.user._id.toString() : req.body.teacherId
    let teacherName = req.user.role === 'teacher' ? req.user.name : null

    if (!teacherId) {
      return res.status(400).json({ message: 'Selecciona un profesor' })
    }
    if (!teacherName) {
      const teacherUser = await User.findOne({ _id: teacherId }).select('name role isTeacher')
      if (!teacherUser || !isTeacherLike(teacherUser)) {
        return res.status(404).json({ message: 'Profesor no encontrado' })
      }
      teacherName = teacherUser.name
    }

    const slot = await RescheduleSlot.create({
      teacherId,
      teacherName,
      day,
      time,
      level,
      ...(capacity !== undefined && { capacity }),
    })
    res.status(201).json({ ...slot.toObject(), occupancy: 0 })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Ese horario ya esta disponible' })
    }
    res.status(500).json({ message: 'Error agregando el horario' })
  }
})

// Sube o baja la capacidad de un horario ya existente — no se puede bajar
// por debajo de cuantos estudiantes ya estan anotados ahi esta semana.
router.put(
  '/schedule-changes/fixed-slots/:id/capacity',
  protect,
  teacherOrAdminOnly,
  async (req, res) => {
    try {
      const { capacity } = req.body
      if (!Number.isInteger(capacity) || capacity < 1) {
        return res.status(400).json({ message: 'La capacidad tiene que ser un numero entero de al menos 1' })
      }

      const slot = await RescheduleSlot.findById(req.params.id)
      if (!slot) {
        return res.status(404).json({ message: 'Horario no encontrado' })
      }
      if (req.user.role === 'teacher' && slot.teacherId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'No podes editar el horario de otro profesor' })
      }

      const occupancy = await getOccupancy(slot.teacherId, slot.day, slot.time)
      if (capacity < occupancy) {
        return res.status(400).json({
          message: `No podes bajar la capacidad por debajo de los ${occupancy} estudiantes que ya estan anotados ahi`,
        })
      }

      slot.capacity = capacity
      await slot.save()
      res.json({ ...slot.toObject(), occupancy })
    } catch (error) {
      res.status(500).json({ message: 'Error actualizando la capacidad' })
    }
  }
)

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
