const express = require('express')
const router = express.Router()
const {  getUsers, getMyStudents, updateUser, deleteUser, uploadAvatar } = require('../controllers/userController')
const { protect } = require('../middleware/usersMiddleware');
const { auth } = require('../middleware/authMiddleware');
const { adminOnly, teacherOrAdminOnly } = require('../middleware/roleMiddleware');
const upload = require('../config/multer.js')

router.get('/', protect, adminOnly, getUsers)
router.get('/my-students', protect, teacherOrAdminOnly, getMyStudents)
//router.get('/:id', protect, adminOnly, updateUser)
router.put('/edit/:id', protect, adminOnly, updateUser)
router.delete('/delete/:id', protect, adminOnly, deleteUser)

// Foto de perfil del usuario autenticado (cualquier rol) — usa el mismo
// pipeline de Cloudinary que /api/upload, pero se guarda en el usuario, no
// como un Image de la galeria (esos son solo comprobantes de pago).
router.post('/avatar', auth, (req, res) => {
  upload.single('avatar')(req, res, (err) => {
    if (err) {
      return res.status(500).json({ message: err.message || 'Error subiendo la foto' })
    }
    uploadAvatar(req, res)
  })
})

module.exports = router