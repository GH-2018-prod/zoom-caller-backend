const User = require('../models/User')
const ScheduleChange = require('../models/ScheduleChange')
const Expense = require('../models/Expense')
const { COSTA_RICA_OFFSET_HOURS } = require('./scheduleTime')

// Cuanto se le paga a un profesor por cada clase dictada. Fijo por ahora
// para todos los profesores — si mas adelante se necesita una tarifa
// distinta por profesor, este valor pasa a ser un campo en su cuenta.
const RATE_PER_CLASS = 7

const daysMap = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

// Lunes de la semana actual (hora Costa Rica) a medianoche, devuelto como
// instante real UTC — igual que getNextMeetingDate, pero anclado al lunes
// de la semana en vez de al proximo dia+hora que toque.
const getWeekStart = (referenceDate = new Date()) => {
  const nowCR = new Date(referenceDate.getTime() - COSTA_RICA_OFFSET_HOURS * 60 * 60 * 1000)
  const todayDow = nowCR.getUTCDay()
  const mondayOffset = todayDow === 0 ? -6 : 1 - todayDow

  const monday = new Date(nowCR)
  monday.setUTCHours(0, 0, 0, 0)
  monday.setUTCDate(nowCR.getUTCDate() + mondayOffset)

  return new Date(monday.getTime() + COSTA_RICA_OFFSET_HOURS * 60 * 60 * 1000)
}

// Fecha real de la ocurrencia de "day+time" DENTRO de la semana que
// contiene a weekStart (lunes a domingo) — a diferencia de
// getNextMeetingDate (que busca la PROXIMA ocurrencia y salta a la semana
// que viene si el dia ya paso esta semana), esta puede devolver una fecha
// ya pasada, que es justo lo que hace falta para saber si una clase de
// esta semana ya se dicto.
const getOccurrenceInWeek = (day, time, weekStart) => {
  const weekStartCR = new Date(weekStart.getTime() - COSTA_RICA_OFFSET_HOURS * 60 * 60 * 1000)
  const distFromMonday = (daysMap[day] + 6) % 7 // Monday=0 ... Sunday=6

  const result = new Date(weekStartCR)
  result.setUTCDate(weekStartCR.getUTCDate() + distFromMonday)

  const [hours, minutes] = time.split(':').map(Number)
  result.setUTCHours(hours, minutes, 0, 0)

  return new Date(result.getTime() + COSTA_RICA_OFFSET_HOURS * 60 * 60 * 1000)
}

const formatWeekLabel = (weekStart) => {
  const weekStartCR = new Date(weekStart.getTime() - COSTA_RICA_OFFSET_HOURS * 60 * 60 * 1000)
  const dd = String(weekStartCR.getUTCDate()).padStart(2, '0')
  const mm = String(weekStartCR.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

// Cuenta, para la semana actual, cuantas clases ya dictadas (hora de
// inicio ya pasada) le corresponden a cada profesor — respetando
// cancelaciones (no cuentan) y reprogramaciones hacia otro profesor (pasan
// a contarle al profesor NUEVO, no al original). Es la misma logica que
// getEffectiveSchedule/students-upcoming en el cliente, pero orientada a
// "ya paso" en vez de "es la proxima".
const computeWeeklyClassCounts = async (referenceDate = new Date()) => {
  const now = referenceDate
  const weekStart = getWeekStart(now)
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  const students = await User.find({ role: 'student' }).select('details.schedule name')
  const changes = await ScheduleChange.find({
    originalDate: { $gte: weekStart, $lt: weekEnd },
  })

  const countByTeacher = {}

  for (const student of students) {
    const schedule = student.details?.schedule || []

    for (const entry of schedule) {
      if (!entry.day || !entry.time) continue

      const change = changes.find(
        (c) =>
          c.studentId.toString() === student._id.toString() &&
          c.originalDay === entry.day &&
          c.originalTime === entry.time
      )

      if (change?.action === 'cancelled') continue

      let effectiveTeacherId
      let occurrenceDate

      if (change?.action === 'rescheduled') {
        effectiveTeacherId = change.newTeacherId?.toString()
        occurrenceDate = new Date(change.newDate)
      } else {
        effectiveTeacherId = entry.teacherId
        occurrenceDate = getOccurrenceInWeek(entry.day, entry.time, weekStart)
      }

      if (!effectiveTeacherId) continue
      if (occurrenceDate > now) continue

      countByTeacher[effectiveTeacherId] = (countByTeacher[effectiveTeacherId] || 0) + 1
    }
  }

  return { weekStart, countByTeacher }
}

// Recalcula (no acumula — siempre a partir de cero) el gasto de nomina de
// cada profesor para la semana actual y lo deja sincronizado en Expense.
// Idempotente: correrlo varias veces seguidas da el mismo resultado,
// porque el monto sale de contar clases ya dictadas, no de sumar sobre lo
// que ya habia.
const syncPayrollExpenses = async () => {
  const { weekStart, countByTeacher } = await computeWeeklyClassCounts()
  const teacherIds = Object.keys(countByTeacher)
  if (!teacherIds.length) return

  const teachers = await User.find({ _id: { $in: teacherIds } }).select('name')
  const nameById = Object.fromEntries(teachers.map((t) => [t._id.toString(), t.name]))
  const weekLabel = formatWeekLabel(weekStart)

  for (const [teacherId, count] of Object.entries(countByTeacher)) {
    const teacherName = nameById[teacherId] || 'Profesor'
    await Expense.findOneAndUpdate(
      { teacherId, weekStart },
      {
        teacherId,
        weekStart,
        tool: `Pago ${teacherName} · semana del ${weekLabel}`,
        cost: count * RATE_PER_CLASS,
        date: weekStart,
      },
      { upsert: true, new: true }
    )
  }
}

module.exports = {
  RATE_PER_CLASS,
  getWeekStart,
  computeWeeklyClassCounts,
  syncPayrollExpenses,
}
