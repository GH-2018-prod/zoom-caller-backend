const User = require('../models/User')
const Expense = require('../models/Expense')
const ClassAttendance = require('../models/ClassAttendance')
const { getWeekStart, formatWeekLabel } = require('./weeklyOccurrences')

// Cuanto se le paga a un profesor por cada clase dictada. Fijo por ahora
// para todos los profesores — si mas adelante se necesita una tarifa
// distinta por profesor, este valor pasa a ser un campo en su cuenta.
const RATE_PER_CLASS = 7

// Cuenta, para la semana actual, cuantas clases CONFIRMADAS como dictadas
// (el profesor las marco a mano, no se infieren del reloj) le corresponden
// a cada profesor. Esta cuenta es la fuente de verdad para nomina, pago del
// admin y asistencia/progreso del estudiante.
const computeWeeklyClassCounts = async (referenceDate = new Date()) => {
  const weekStart = getWeekStart(referenceDate)
  const records = await ClassAttendance.find({ weekStart, status: 'attended' })

  const countByTeacher = {}
  records.forEach((r) => {
    const key = r.teacherId.toString()
    countByTeacher[key] = (countByTeacher[key] || 0) + 1
  })

  return { weekStart, countByTeacher }
}

// Recalcula (no acumula — siempre a partir de cero) el gasto de nomina de
// cada profesor para la semana actual y lo deja sincronizado en Expense.
// Idempotente: correrlo varias veces seguidas da el mismo resultado, porque
// el monto sale de contar asistencias confirmadas, no de sumar sobre lo que
// ya habia.
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
