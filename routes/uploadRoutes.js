const express = require('express')
const upload = require('../config/multer.js')
const { auth } = require('../middleware/authMiddleware')
const Image = require('../models/Image')
const router = express.Router()

router.post('/upload', auth, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      console.error('🔥 MULTER / CLOUDINARY ERROR:', err)
      return res.status(500).json({
        message: err.message || 'Error subiendo imagen',
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No se envió ninguna imagen' })
    }

    try {
      const image = await Image.create({
        user: req.user.id,
        imageUrl: req.file.path,
        public_id: req.file.filename,
      });

      res.status(201).json(image);
    } catch (error) {
      console.error('🔥 ERROR GUARDANDO IMAGEN:', error)
      res.status(500).json({ message: 'Error guardando imagen' })
    }
  })
})

module.exports = router

