const User = require('../models/User')
const ScheduleChange = require('../models/ScheduleChange')
const { COSTA_RICA_OFFSET_HOURS } = require('./scheduleTime')

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
// instante real UTC.
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
// getNextMeetingDate (que salta a la semana que viene si el dia ya paso
// esta semana), esta puede devolver una fecha ya pasada.
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

// Todas las ocurrencias efectivas de una semana (una por cada entrada de
// horario de cada estudiante), con el profesor YA resuelto — propio, o el
// nuevo si esa clase se reprogramo hacia el horario de otro profesor — y la
// fecha/hora real de esa ocurrencia. Las canceladas quedan afuera.
const computeWeeklyOccurrences = async (referenceDate = new Date()) => {
  const weekStart = getWeekStart(referenceDate)
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  const students = await User.find({ role: 'student' }).select('details.schedule name')
  const changes = await ScheduleChange.find({
    originalDate: { $gte: weekStart, $lt: weekEnd },
  })

  const teacherIds = new Set()
  const occurrences = []

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

      let day = entry.day
      let time = entry.time
      let teacherId = entry.teacherId
      let occurrenceDate = getOccurrenceInWeek(entry.day, entry.time, weekStart)

      if (change?.action === 'rescheduled') {
        day = change.newDay
        time = change.newTime
        teacherId = change.newTeacherId?.toString()
        occurrenceDate = new Date(change.newDate)
      }

      if (!teacherId) continue
      teacherId = teacherId.toString()

      teacherIds.add(teacherId)
      occurrences.push({
        studentId: student._id.toString(),
        studentName: student.name,
        teacherId,
        day,
        time,
        occurrenceDate,
        weekStart,
      })
    }
  }

  const teachers = await User.find({ _id: { $in: [...teacherIds] } }).select('name')
  const nameById = Object.fromEntries(teachers.map((t) => [t._id.toString(), t.name]))
  occurrences.forEach((o) => {
    o.teacherName = nameById[o.teacherId] || 'Profesor'
  })

  return { weekStart, occurrences }
}

module.exports = {
  getWeekStart,
  getOccurrenceInWeek,
  formatWeekLabel,
  computeWeeklyOccurrences,
}
