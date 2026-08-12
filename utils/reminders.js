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

// Los horarios de clase se cargan en hora de Costa Rica (UTC-6, sin
// horario de verano), pero el servidor (Railway) corre en UTC. Sin esto,
// "07:00" se interpretaba como 07:00 UTC = 1am en Costa Rica, y el
// recordatorio terminaba saltandose a la semana siguiente.
const COSTA_RICA_OFFSET_HOURS = 6

// Misma logica que client/src/helpers/timeStatus.js#getNextMeetingDate,
// portada al backend (no hay codigo compartido entre server y client) y
// ajustada para calcular siempre en hora de Costa Rica, sin importar la
// zona horaria del proceso.
const getNextMeetingDate = (day, time) => {
  // Corremos los componentes UTC para que representen la hora de pared de
  // Costa Rica, calculamos ahi, y al final volvemos a UTC real.
  const nowCR = new Date(Date.now() - COSTA_RICA_OFFSET_HOURS * 60 * 60 * 1000)
  const targetDay = daysMap[day]

  const result = new Date(nowCR)
  result.setUTCHours(0, 0, 0, 0)

  const diff = targetDay - nowCR.getUTCDay()
  result.setUTCDate(nowCR.getUTCDate() + (diff >= 0 ? diff : diff + 7))

  const [hours, minutes] = time.split(':').map(Number)
  result.setUTCHours(hours, minutes, 0, 0)

  return new Date(result.getTime() + COSTA_RICA_OFFSET_HOURS * 60 * 60 * 1000)
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
