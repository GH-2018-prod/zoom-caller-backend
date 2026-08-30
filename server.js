const path = require('path')
const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
const morgan = require('morgan')
const cron = require('node-cron')
const connectDB = require('./config/db')
const { startReminderJobs } = require('./utils/reminders')
const { syncPayrollExpenses } = require('./utils/teacherPayroll')

//Config
dotenv.config()
connectDB()

//App
const app = express()

// Middleware
// ALLOWED_ORIGINS: lista separada por comas con el/los dominios del frontend
// (ej: "https://mi-academia.vercel.app,https://www.mi-academia.com").
// Si no está seteada, se permite cualquier origen (comportamiento anterior)
// para no romper despliegues existentes, pero queda avisado en el log.
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim())

if (allowedOrigins?.length) {
  app.use(cors({ origin: allowedOrigins }))
} else {
  console.warn(
    'ALLOWED_ORIGINS no está configurada: aceptando requests de cualquier origen. ' +
    'Configurala en el .env de producción con el dominio real del frontend.'
  )
  app.use(cors())
}
app.use(express.json())
app.use(morgan('dev'))

// Routes authentication
app.use('/api/auth', require('./routes/authRoutes'))
app.use('/api/users', require('./routes/usersRoute'))

//Upload Route
app.use('/api', require('./routes/uploadRoutes'))

//Images Route
app.use('/api', require('./routes/imageRoutes'));

//Links Route
app.use('/api', require('./routes/link'));

//Expenses Route
app.use('/api', require('./routes/expenseRoutes'))

//Payments Route
app.use('/api', require('./routes/paymentRoutes'))

//Push notifications Route
app.use('/api', require('./routes/pushRoutes'))

//Schedule changes Route (cancelar/reprogramar clases)
app.use('/api', require('./routes/scheduleChangeRoutes'))

//Payroll Route (pago semanal a profesores)
app.use('/api', require('./routes/payrollRoutes'))

startReminderJobs()

// Sincroniza el gasto de nomina de cada profesor cada 30 min, y una vez al
// arrancar para que no haya que esperar hasta el primer tick.
cron.schedule('*/30 * * * *', syncPayrollExpenses)
syncPayrollExpenses().catch((err) => console.error('Error sincronizando nomina:', err.message))

//public directory
app.use(express.static(path.join(__dirname, 'public')))

//Public route
app.use('*',(req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`))