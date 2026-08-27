const cron = require('node-cron')
const User = require('../models/User')
const Payment = require('../models/Payment')
const { sendPushToUser } = require('./pushService')
const { COSTA_RICA_OFFSET_HOURS, getNextMeetingDate } = require('./scheduleTime')

// Avisa 30 min antes de cada clase. Corre cada 5 min y solo dispara
// cuando faltan entre 25 y 30 min — evita mandar el mismo aviso varias
// veces mientras dura la ventana (asume que el cron no se salta ticks).
// Tambien le avisa al profesor de esa clase — no solo al estudiante —
// pero una sola vez por profesor+horario aunque tenga varios estudiantes
// en el mismo grupo, para no duplicarle el aviso.
const checkClassReminders = async () => {
  try {
    const students = await User.find({ role: 'student' })
    const notifiedTeacherSlots = new Set()

    for (const student of students) {
      const schedule = student.details?.schedule || []

      for (const entry of schedule) {
        if (!entry.day || !entry.time) continue

        const meetingDate = getNextMeetingDate(entry.day, entry.time)
        const diffMin = Math.floor((meetingDate.getTime() - Date.now()) / 60000)

        if (diffMin >= 25 && diffMin < 30) {
          // Tag = mismo horario semanal (dia + hora). Si el servicio de
          // push reintenta el mismo envio, la notificacion se reemplaza en
          // vez de apilarse — ver client/src/sw.js.
          const tag = `class-${entry.day}-${entry.time}`

          await sendPushToUser(student._id, {
            title: 'Tu clase empieza pronto',
            body: `Tu clase de las ${entry.time} arranca en ${diffMin} minutos.`,
            tag,
          })

          // El profesor es por horario (entry.teacherId); el campo viejo
          // student.details.teacherId solo queda como respaldo para
          // estudiantes que todavia no se migraron al modelo nuevo.
          const teacherId = entry.teacherId || student.details?.teacherId
          if (teacherId) {
            const slotKey = `${teacherId}-${entry.day}-${entry.time}`
            if (!notifiedTeacherSlots.has(slotKey)) {
              notifiedTeacherSlots.add(slotKey)
              await sendPushToUser(teacherId, {
                title: 'Tu clase empieza pronto',
                body: `Tu clase de las ${entry.time} arranca en ${diffMin} minutos.`,
                tag,
              })
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error revisando recordatorios de clase:', error.message)
  }
}

// Avisa de pagos vencidos o por vencer (7 dias o menos). Corre una vez
// por dia — el aviso se repite mientras el pago siga sin marcarse "paid".
const DUE_SOON_DAYS = 7
const checkPaymentReminders = async () => {
  try {
    const payments = await Payment.find({ paid: false })

    // Mismo ajuste que en getNextMeetingDate: "hoy" se calcula en hora de
    // Costa Rica, no en la zona horaria del servidor.
    const nowCR = new Date(Date.now() - COSTA_RICA_OFFSET_HOURS * 60 * 60 * 1000)
    const todayMidnight = new Date(nowCR).setUTCHours(0, 0, 0, 0)

    for (const payment of payments) {
      const dueCR = new Date(
        new Date(payment.date).getTime() - COSTA_RICA_OFFSET_HOURS * 60 * 60 * 1000
      )
      const dueMidnight = new Date(dueCR).setUTCHours(0, 0, 0, 0)
      const daysLeft = Math.floor((dueMidnight - todayMidnight) / 86400000)

      if (daysLeft > DUE_SOON_DAYS) continue

      const body =
        daysLeft < 0
          ? 'Tu pago está vencido. Contactá al administrador para regularizarlo.'
          : `Tu pago vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'}.`

      await sendPushToUser(payment.studentId, {
        title: 'Recordatorio de pago',
        body,
        tag: `payment-${payment._id}`,
      })
    }
  } catch (error) {
    console.error('Error revisando recordatorios de pago:', error.message)
  }
}

const startReminderJobs = () => {
  cron.schedule('*/5 * * * *', checkClassReminders)
  cron.schedule('0 9 * * *', checkPaymentReminders)
  console.log('⏰ Cron de recordatorios (clases y pagos) iniciado')
}

module.exports = { startReminderJobs, checkClassReminders, checkPaymentReminders }
