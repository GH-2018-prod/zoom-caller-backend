const cron = require('node-cron')
const User = require('../models/User')
const Payment = require('../models/Payment')
const { sendPushToUser } = require('./pushService')

const daysMap = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

// Misma logica que client/src/helpers/timeStatus.js#getNextMeetingDate,
// portada al backend (no hay codigo compartido entre server y client).
const getNextMeetingDate = (day, time) => {
  const now = new Date()
  const targetDay = daysMap[day]
  const result = new Date(now)
  result.setHours(0, 0, 0, 0)

  const diff = targetDay - now.getDay()
  result.setDate(now.getDate() + (diff >= 0 ? diff : diff + 7))

  const [hours, minutes] = time.split(':').map(Number)
  result.setHours(hours, minutes, 0, 0)

  return result
}

// Avisa 30 min antes de cada clase. Corre cada 5 min y solo dispara
// cuando faltan entre 25 y 30 min — evita mandar el mismo aviso varias
// veces mientras dura la ventana (asume que el cron no se salta ticks).
const checkClassReminders = async () => {
  try {
    const students = await User.find({ role: 'student' })

    for (const student of students) {
      const schedule = student.details?.schedule || []

      for (const entry of schedule) {
        if (!entry.day || !entry.time) continue

        const meetingDate = getNextMeetingDate(entry.day, entry.time)
        const diffMin = Math.floor((meetingDate.getTime() - Date.now()) / 60000)

        if (diffMin >= 25 && diffMin < 30) {
          await sendPushToUser(student._id, {
            title: 'Tu clase empieza pronto',
            body: `Tu clase de las ${entry.time} arranca en ${diffMin} minutos.`,
          })
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

    for (const payment of payments) {
      const dueMidnight = new Date(payment.date).setHours(0, 0, 0, 0)
      const todayMidnight = new Date().setHours(0, 0, 0, 0)
      const daysLeft = Math.floor((dueMidnight - todayMidnight) / 86400000)

      if (daysLeft > DUE_SOON_DAYS) continue

      const body =
        daysLeft < 0
          ? 'Tu pago está vencido. Contactá al administrador para regularizarlo.'
          : `Tu pago vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'}.`

      await sendPushToUser(payment.studentId, { title: 'Recordatorio de pago', body })
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
