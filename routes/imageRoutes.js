const express = require('express')
const Image = require('../models/Image')
const { auth } = require('../middleware/authMiddleware')
const cloudinary = require('cloudinary').v2

const router = express.Router()

// FETCH IMAGES
router.get('/images', auth, async (req, res) => {
  try {
    let query = {};

    const { userId } = req.query;

    // 👤 Si NO es admin → solo puede ver las suyas
    if (req.user.role !== 'admin') {
      query.user = req.user.id;
    }

    // 👑 Si es admin y viene userId → filtra por ese usuario
    if (req.user.role === 'admin' && userId) {
      query.user = userId;
    }

    const images = await Image.find(query)
      .populate('user', 'name email role')
      .sort({ createdAt: -1 });

    res.json(images);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo imágenes' });
  }
});

// DELETE
router.delete('/images/:id', auth, async (req, res) => {
  try {
    const image = await Image.findById(req.params.id)

    if (!image) {
      return res.status(404).json({ message: 'Imagen no encontrada' })
    }

    if (image.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ message: 'No autorizado' });
    }

    await cloudinary.uploader.destroy(image.public_id)
    await image.deleteOne()

    res.json({ message: 'Imagen eliminada', id: image._id })

  } catch (error) {
    console.log("ERROR REAL: ", error)
    res.status(500).json({ message: 'Error eliminando imagen en el backend route' })
  }
})

module.exports = router