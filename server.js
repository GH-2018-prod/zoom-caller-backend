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
app.use(cors());
app.use(express.json())
app.use(morgan('dev'))

// Rutas
app.use('/api/auth', require('./routes/authRoutes'));

app.get('/', (req, res) => {
  res.send('API funcionando 🚀')
});

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`))
