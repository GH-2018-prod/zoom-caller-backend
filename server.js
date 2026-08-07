const path = require('path')
const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
const morgan = require('morgan')
const connectDB = require('./config/db')

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

//public directory
app.use(express.static(path.join(__dirname, 'public')))

//Public route
app.use('*',(req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`))