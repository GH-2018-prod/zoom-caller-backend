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
app.use(cors())
// app.use(cors({
//   origin: 'http://localhost:3000', // Ajusta según tu frontend
//   credentials: true, // Si usas cookies, también activa esto
// }));
app.use(express.json())
app.use(morgan('dev'))

// Routes authentication
app.use('/api/auth', require('./routes/authRoutes'))
app.use('/api/users', require('./routes/usersRoute'))

//Upload Route
app.use('/api', require('./routes/uploadRoutes'))

//Images Route
app.use('/api', require('./routes/imageRoutes'));

//public directory
app.use(express.static(path.join(__dirname, 'public')))

//Public route 
app.use('*',(req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

app.get('/', (req, res) => {
  res.send('API funcionando 🚀')
});

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`))