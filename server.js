const path = require('path')
const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
const morgan = require('morgan')
const connectDB = require('./config/db')

//Config
dotenv.config()
connectDB()
console.log('ENV CHECK → EMAIL_HOST:', process.env.EMAIL_HOST);
console.log('ENV CHECK → EMAIL_PORT:', process.env.EMAIL_PORT);
console.log('ENV CHECK → EMAIL_USER:', process.env.EMAIL_USER);

//App
const app = express()

// Middleware
app.use(cors());
// app.use(cors({
//   origin: 'http://localhost:3000', // Ajusta según tu frontend
//   credentials: true, // Si usas cookies, también activa esto
// }));
app.use(express.json())
app.use(morgan('dev'))

//public directory
app.use(express.static( 'public' ))

// Routes authentication
app.use('/api/auth', require('./routes/authRoutes'));

app.use('/api/users', require('./routes/usersRoute'))

//Public route
app.use('*',(req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

app.get('/', (req, res) => {
  res.send('API funcionando 🚀')
});

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`))