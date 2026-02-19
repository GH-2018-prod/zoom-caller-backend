const express = require('express');
const Image = require('../models/Image');
const { auth } = require('../middleware/authMiddleware');
const cloudinary = require('cloudinary').v2

const router = express.Router();

router.get('/images', auth, async (req, res) => {
  try {
    const images = await Image.find({ user: req.user.id })
      .sort({ createdAt: -1 });

    res.json(images);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo imágenes' });
  }
})

// DELETE
router.delete('/images/:id', auth, async (req, res) => {
  try {
    console.log("id recibido: ", req.params.id)
    const image = await Image.findById(req.params.id);

    if (!image) {
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }
    console.log("imagen encontrada: ", image)

    if (image.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'No autorizado' });
    }

    await cloudinary.uploader.destroy(image.public_id);
    await image.deleteOne();

    res.json({ message: 'Imagen eliminada', id: image._id });

  } catch (error) {
    console.log("ERROR REAL: ", error)
    res.status(500).json({ message: 'Error eliminando imagen en el backend route' });
  }
})

module.exports = router;