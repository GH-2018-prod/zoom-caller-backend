const express = require('express');
const Image = require('../models/Image');
const { auth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/images', auth, async (req, res) => {
  try {
    const images = await Image.find({ user: req.user.id })
      .sort({ createdAt: -1 });

    res.json(images);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo imágenes' });
  }
});

module.exports = router;
